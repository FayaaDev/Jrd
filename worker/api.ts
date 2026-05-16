import process from 'node:process'
import { Buffer } from 'node:buffer'
import { configureDatabaseUrl } from '../server/db.js'
import {
  FxRateQuerySchema,
  HoldingInputSchema,
  HoldingUpdateSchema,
  ImportPayloadSchema,
  PdfImportConfirmSchema,
  PortfolioSnapshotSchema,
  SettingsSchema,
  WatchItemInputSchema,
} from '../server/schemas.js'
import {
  archiveLedgerByUserId,
  createBlankLedgerForUser,
  deleteLedgerByUserId,
  getAdminDashboardStats,
  getLedgerByUserId,
  getUserById,
  initStore,
  listPortfolios,
  listUsers,
  replaceLedgerByUserId,
  resetLedgerByUserId,
  restoreLedgerByUserId,
  updateLedgerByUserId,
} from '../server/store.js'
import { runPdfImportPipeline } from '../server/pdfImport.js'
import { verifySymbols } from '../server/symbolVerifier.js'
import { VALID_MICS, resolveMarket } from '../server/marketResolver.js'
import { clearPriceSnapshot, getPriceSnapshot, invalidatePriceSnapshot } from '../server/quoteHub.js'
import {
  MANUAL_REFRESH_RATE_LIMIT_MAX,
  MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS,
} from '../server/config.js'

const ALLOWED_ORIGINS = [
  'fayafolio://',
  'http://localhost:8081',
  'http://192.168.0.235:8081',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://jrd.fayaa92.sa',
]

const ENV_KEYS = [
  'APP_ENV',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_API_KEY',
  'BETTER_AUTH_API_URL',
  'BETTER_AUTH_KV_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ALPACA_KEY_ID',
  'ALPACA_SECRET_KEY',
  'SAHMK_API_KEY',
  'SAHMK_BASE_URL',
  'X_CMC_PRO_API_KEY',
  'X-CMC_PRO_API_KEY',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
]

const SAR_USD_PEG = 3.75
const MAX_PDF_BYTES = 20 * 1024 * 1024

type RuntimeEnv = Env & Record<string, unknown> & {
  HYPERDRIVE?: Hyperdrive
  LEGACY_API_ORIGIN?: string
}

type AuthModule = typeof import('../server/auth.js')
type AuthSession = Awaited<ReturnType<AuthModule['auth']['api']['getSession']>>
type RouteContext = {
  request: Request
  env: RuntimeEnv
  url: URL
}

let authModulePromise: Promise<AuthModule> | null = null
let initPromise: Promise<void> | null = null

function syncProcessEnv(env: RuntimeEnv) {
  if (env.HYPERDRIVE?.connectionString) {
    configureDatabaseUrl(env.HYPERDRIVE.connectionString)
  }

  for (const key of ENV_KEYS) {
    const value = env[key]
    if (typeof value === 'string') {
      process.env[key] = value
    }
  }
}

function getAuthModule() {
  authModulePromise ??= import('../server/auth.js')
  return authModulePromise
}

async function ensureInitialized(env: RuntimeEnv) {
  syncProcessEnv(env)

  if (!initPromise) {
    initPromise = (async () => {
      const { initAuthSchema } = await getAuthModule()
      await initAuthSchema()
      await initStore()
    })().catch((error) => {
      initPromise = null
      throw error
    })
  }

  await initPromise
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  })
}

function sendError(status: number, message: string) {
  return json({ message }, { status })
}

function withCors(request: Request, response: Response) {
  const origin = request.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-credentials', 'true')
  headers.append('vary', 'origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function corsPreflight(request: Request) {
  const origin = request.headers.get('origin')
  const headers = new Headers({
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, cookie, x-requested-with',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '86400',
  })

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('vary', 'origin')
  }

  return new Response(null, { status: 204, headers })
}

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function getRequestIp(request: Request) {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'global'
}

function createRateLimiter({
  windowMs,
  max,
  message,
  key,
}: {
  windowMs: number
  max: number
  message: string
  key: (request: Request, session: AuthSession) => string | null | undefined
}) {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return (request: Request, session: AuthSession) => {
    const bucketKey = key(request, session) ?? 'global'
    const now = Date.now()
    const current = buckets.get(bucketKey)

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
      return null
    }

    if (current.count >= max) {
      return new Response(JSON.stringify({ message }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'retry-after': String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))),
        },
      })
    }

    current.count += 1
    return null
  }
}

const limitManualRefreshes = createRateLimiter({
  windowMs: MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS,
  max: MANUAL_REFRESH_RATE_LIMIT_MAX,
  message: 'Too many manual refresh requests. Please wait before trying again.',
  key: (request, session) => session?.user?.id ?? getRequestIp(request),
})

async function readJson(request: Request) {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

async function requireSession(request: Request) {
  const { auth } = await getAuthModule()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    throw createHttpError(401, 'Sign in is required for this action.')
  }

  return session
}

async function requireAdmin(request: Request) {
  const session = await requireSession(request)
  const { isAdminSession } = await getAuthModule()

  if (!isAdminSession(session)) {
    throw createHttpError(403, 'Admin access is required for this action.')
  }

  return session
}

function assertActiveLedger(ledger: { status: string }) {
  if (ledger.status === 'archived') {
    throw createHttpError(423, 'This portfolio has been archived. Please contact an admin to restore it.')
  }
}

async function getEditableMyLedger(userId: string) {
  const ledger = await getLedgerByUserId(userId, { createIfMissing: true })
  assertActiveLedger(ledger)
  return ledger
}

async function withAdminOwner(userId: string, ledger: unknown) {
  const owner = await getUserById(userId)

  if (!owner) {
    throw createHttpError(404, 'User not found.')
  }

  return {
    ...(ledger as Record<string, unknown>),
    owner,
  }
}

function parseStatusFilter(value: string | null) {
  if (value === null) {
    return undefined
  }

  if (value === 'active' || value === 'archived') {
    return value
  }

  throw createHttpError(400, 'status must be either active or archived.')
}

function parseSearchQuery(value: string | null) {
  return typeof value === 'string' ? value : ''
}

async function addHoldingToLedger(userId: string, input: Record<string, unknown>, { createIfMissing = false } = {}) {
  return updateLedgerByUserId(
    userId,
    (current: { holdings: unknown[] }) => {
      const now = new Date().toISOString()

      return {
        ...current,
        holdings: [
          ...current.holdings,
          {
            ...input,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          },
        ],
      }
    },
    { createIfMissing },
  )
}

async function updateHoldingInLedger(
  userId: string,
  holdingId: string,
  updates: Record<string, unknown>,
  { createIfMissing = false } = {},
) {
  let updated = false

  const ledger = await updateLedgerByUserId(
    userId,
    (current: { holdings: Array<Record<string, unknown>> }) => ({
      ...current,
      holdings: current.holdings.map((holding) => {
        if (holding.id !== holdingId) {
          return holding
        }

        updated = true
        return {
          ...holding,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      }),
    }),
    { createIfMissing },
  )

  if (!updated) {
    throw createHttpError(404, 'Holding not found.')
  }

  return ledger
}

async function removeHoldingFromLedger(userId: string, holdingId: string, { createIfMissing = false } = {}) {
  let removed = false

  const ledger = await updateLedgerByUserId(
    userId,
    (current: { holdings: Array<Record<string, unknown>> }) => ({
      ...current,
      holdings: current.holdings.filter((holding) => {
        const keep = holding.id !== holdingId
        if (!keep) {
          removed = true
        }
        return keep
      }),
    }),
    { createIfMissing },
  )

  if (!removed) {
    throw createHttpError(404, 'Holding not found.')
  }

  return ledger
}

async function addWatchItemToLedger(userId: string, input: Record<string, unknown>, { createIfMissing = false } = {}) {
  let duplicateSymbol = false

  const ledger = await updateLedgerByUserId(
    userId,
    (current: { watchlist: Array<Record<string, unknown>> }) => {
      duplicateSymbol = current.watchlist.some((item) => item.symbol === input.symbol)
      if (duplicateSymbol) {
        return current
      }

      return {
        ...current,
        watchlist: [
          ...current.watchlist,
          {
            ...input,
            id: crypto.randomUUID(),
            addedAt: new Date().toISOString(),
          },
        ],
      }
    },
    { createIfMissing },
  )

  if (duplicateSymbol) {
    throw createHttpError(409, `${input.symbol} is already in the watchlist.`)
  }

  return ledger
}

async function removeWatchItemFromLedger(userId: string, watchItemId: string, { createIfMissing = false } = {}) {
  let removed = false

  const ledger = await updateLedgerByUserId(
    userId,
    (current: { watchlist: Array<Record<string, unknown>> }) => ({
      ...current,
      watchlist: current.watchlist.filter((item) => {
        const keep = item.id !== watchItemId
        if (!keep) {
          removed = true
        }
        return keep
      }),
    }),
    { createIfMissing },
  )

  if (!removed) {
    throw createHttpError(404, 'Watchlist item not found.')
  }

  return ledger
}

async function confirmPdfImportForUser(
  userId: string,
  holdings: Array<Record<string, unknown>>,
  mergeStrategy: 'add_new' | 'update_existing' | 'add_all',
  { createIfMissing = false } = {},
) {
  const resolvedMarkets = await Promise.all(
    holdings.map((holding) =>
      resolveMarket({
        symbol: String(holding.symbol ?? ''),
        assetType: String(holding.assetType ?? ''),
        rawMarket: String(holding.market ?? ''),
      }),
    ),
  )

  const holdingsToImport = holdings.map((holding, index) => ({
    ...holding,
    market: resolvedMarkets[index].mic ?? holding.market,
  }))

  let added = 0
  let updated = 0
  let skipped = 0

  const ledger = await updateLedgerByUserId(
    userId,
    (current: { holdings: Array<Record<string, unknown>> }) => {
      const now = new Date().toISOString()
      const existingByKey = new Map(
        current.holdings.map((holding) => [
          `${String(holding.symbol).toUpperCase()}:${String(holding.market).toUpperCase()}`,
          holding,
        ]),
      )

      const nextHoldings = [...current.holdings]

      for (const incoming of holdingsToImport) {
        const key = `${String(incoming.symbol).toUpperCase()}:${String(incoming.market).toUpperCase()}`
        const existing = existingByKey.get(key)

        if (existing && mergeStrategy === 'add_new') {
          skipped += 1
          continue
        }

        if (existing && mergeStrategy === 'update_existing') {
          const index = nextHoldings.findIndex((holding) => holding.id === existing.id)
          if (index !== -1) {
            nextHoldings[index] = {
              ...nextHoldings[index],
              ...incoming,
              updatedAt: now,
            }
            updated += 1
          } else {
            nextHoldings.push({
              ...incoming,
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
            })
            added += 1
          }
          continue
        }

        nextHoldings.push({
          ...incoming,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        added += 1
      }

      return {
        ...current,
        holdings: nextHoldings,
      }
    },
    { createIfMissing },
  )

  return {
    ledger,
    summary: { added, updated, skipped },
  }
}

function matchPath(pathname: string, pattern: string) {
  const pathParts = pathname.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)

  if (pathParts.length !== patternParts.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index]
    const pathPart = pathParts[index]

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart)
      continue
    }

    if (patternPart !== pathPart) {
      return null
    }
  }

  return params
}

function buildProxyUrl(base: string, strippedPathWithQuery: string) {
  const [pathPart, queryPart] = strippedPathWithQuery.split('?')
  const url = new URL(base)
  const basePath = url.pathname.replace(/\/+$/, '')
  const requestPath = (pathPart ?? '').replace(/^\/+/, '')

  url.pathname = `${basePath}/${requestPath}`.replace(/\/+/g, '/')
  url.search = queryPart ? `?${queryPart}` : ''

  return url
}

async function proxyGetRequest(
  request: Request,
  url: URL,
  options: { prefix: RegExp; baseUrl: string; headers: HeadersInit },
) {
  if (request.method !== 'GET') {
    return sendError(405, 'Method not allowed.')
  }

  const targetUrl = buildProxyUrl(options.baseUrl, url.pathname.replace(options.prefix, '') + url.search)
  const response = await fetch(targetUrl, { headers: options.headers })
  const headers = new Headers()
  const contentType = response.headers.get('content-type')
  const cacheControl = response.headers.get('cache-control')

  if (contentType) headers.set('content-type', contentType)
  if (cacheControl) headers.set('cache-control', cacheControl)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function proxyLegacyApi(request: Request, origin: string) {
  const sourceUrl = new URL(request.url)
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, origin)
  const proxied = new Request(targetUrl, request)

  return fetch(proxied)
}

async function routeApi({ request, env, url }: RouteContext) {
  const pathname = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return corsPreflight(request)
  }

  if (pathname === '/api/pdf-import/valid-markets' && method === 'GET') {
    return json({ markets: VALID_MICS })
  }

  if (pathname.startsWith('/api/auth')) {
    await ensureInitialized(env)
    const { auth } = await getAuthModule()
    return auth.handler(request)
  }

  await ensureInitialized(env)

  if (pathname === '/api/me/portfolio' && method === 'GET') {
    const session = await requireSession(request)
    return json(await getLedgerByUserId(session.user.id, { createIfMissing: true }))
  }

  if (pathname === '/api/me/portfolio/holdings' && method === 'GET') {
    const session = await requireSession(request)
    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    return json(ledger.holdings)
  }

  if (pathname === '/api/me/portfolio/settings' && method === 'GET') {
    const session = await requireSession(request)
    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    return json(ledger.settings)
  }

  if (pathname === '/api/me/portfolio/watchlist' && method === 'GET') {
    const session = await requireSession(request)
    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    return json(ledger.watchlist)
  }

  if (pathname === '/api/me/portfolio/export' && method === 'GET') {
    const session = await requireSession(request)
    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    const snapshot = PortfolioSnapshotSchema.parse({
      holdings: ledger.holdings,
      settings: ledger.settings,
      watchlist: ledger.watchlist,
    })

    return new Response(`${JSON.stringify(snapshot, null, 2)}\n`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  if (pathname === '/api/me/portfolio/settings' && method === 'PUT') {
    const session = await requireSession(request)
    const parsed = SettingsSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid settings payload.')
    }

    await getEditableMyLedger(session.user.id)
    const ledger = await updateLedgerByUserId(
      session.user.id,
      (current: Record<string, unknown>) => ({
        ...current,
        settings: parsed.data,
      }),
      { createIfMissing: true },
    )

    invalidatePriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (pathname === '/api/me/portfolio/holdings' && method === 'POST') {
    const session = await requireSession(request)
    const parsed = HoldingInputSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid holding payload.')
    }

    await getEditableMyLedger(session.user.id)
    const ledger = await addHoldingToLedger(session.user.id, parsed.data, { createIfMissing: true })
    invalidatePriceSnapshot(session.user.id)
    return json(ledger, { status: 201 })
  }

  let params = matchPath(pathname, '/api/me/portfolio/holdings/:id')
  if (params && method === 'PATCH') {
    const session = await requireSession(request)
    const parsed = HoldingUpdateSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid holding update payload.')
    }

    await getEditableMyLedger(session.user.id)
    const ledger = await updateHoldingInLedger(session.user.id, params.id, parsed.data, { createIfMissing: true })
    invalidatePriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (params && method === 'DELETE') {
    const session = await requireSession(request)
    await getEditableMyLedger(session.user.id)
    const ledger = await removeHoldingFromLedger(session.user.id, params.id, { createIfMissing: true })
    invalidatePriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (pathname === '/api/me/portfolio/watchlist' && method === 'POST') {
    const session = await requireSession(request)
    const parsed = WatchItemInputSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid watchlist payload.')
    }

    await getEditableMyLedger(session.user.id)
    const ledger = await addWatchItemToLedger(session.user.id, parsed.data, { createIfMissing: true })
    invalidatePriceSnapshot(session.user.id)
    return json(ledger, { status: 201 })
  }

  params = matchPath(pathname, '/api/me/portfolio/watchlist/:id')
  if (params && method === 'DELETE') {
    const session = await requireSession(request)
    await getEditableMyLedger(session.user.id)
    const ledger = await removeWatchItemFromLedger(session.user.id, params.id, { createIfMissing: true })
    invalidatePriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (pathname === '/api/me/portfolio/import' && method === 'POST') {
    const session = await requireSession(request)
    const parsed = ImportPayloadSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, 'Import payload is required.')
    }

    await getEditableMyLedger(session.user.id)

    let snapshot
    try {
      snapshot = PortfolioSnapshotSchema.parse(JSON.parse(parsed.data.json))
    } catch {
      return sendError(400, 'Imported file is not valid portfolio JSON.')
    }

    const ledger = await replaceLedgerByUserId(session.user.id, snapshot, { createIfMissing: true })
    clearPriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (pathname === '/api/me/portfolio/reset' && method === 'POST') {
    const session = await requireSession(request)
    await getEditableMyLedger(session.user.id)
    const ledger = await resetLedgerByUserId(session.user.id, { createIfMissing: true })
    clearPriceSnapshot(session.user.id)
    return json(ledger)
  }

  if (pathname === '/api/me/prices/snapshot' && method === 'GET') {
    const session = await requireSession(request)
    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    assertActiveLedger(ledger)
    return json(await getPriceSnapshot({ userId: session.user.id }))
  }

  if (pathname === '/api/me/prices/refresh' && method === 'POST') {
    const session = await requireSession(request)
    const rateLimitResponse = limitManualRefreshes(request, session)
    if (rateLimitResponse) return rateLimitResponse

    const ledger = await getLedgerByUserId(session.user.id, { createIfMissing: true })
    assertActiveLedger(ledger)
    return json(await getPriceSnapshot({ userId: session.user.id, force: true }))
  }

  if (pathname === '/api/me/portfolio/import/pdf' && method === 'POST') {
    const session = await requireSession(request)
    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return sendError(400, 'No PDF file was uploaded.')
    }

    if (file.type && file.type !== 'application/pdf') {
      return sendError(400, 'Only PDF files are accepted.')
    }

    if (file.size > MAX_PDF_BYTES) {
      return sendError(400, 'File size must not exceed 20 MB.')
    }

    await getEditableMyLedger(session.user.id)
    const result = await runPdfImportPipeline(Buffer.from(await file.arrayBuffer()))
    return json(result)
  }

  if (pathname === '/api/me/portfolio/import/pdf/verify-symbols' && method === 'POST') {
    const session = await requireSession(request)
    const { symbols } = ((await readJson(request)) ?? {}) as { symbols?: unknown }

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return sendError(400, 'symbols must be a non-empty array of { symbol, market } pairs.')
    }

    if (symbols.length > 200) {
      return sendError(400, 'symbols array must not exceed 200 entries.')
    }

    if (symbols.some((entry) => typeof entry?.symbol !== 'string' || typeof entry?.market !== 'string')) {
      return sendError(400, 'Each entry in symbols must have string symbol and market fields.')
    }

    await getEditableMyLedger(session.user.id)
    const verificationMap = await verifySymbols(symbols)
    const results = symbols.map(({ symbol, market }) => {
      const key = symbol.toUpperCase()
      const result = verificationMap.get(key) ?? { verified: null }
      return { symbol, market, verified: result.verified, suggestedName: result.suggestedName }
    })

    return json({ results })
  }

  if (pathname === '/api/me/portfolio/import/pdf/confirm' && method === 'POST') {
    const session = await requireSession(request)
    const parsed = PdfImportConfirmSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid import confirm payload.')
    }

    await getEditableMyLedger(session.user.id)
    const result = await confirmPdfImportForUser(
      session.user.id,
      parsed.data.holdings,
      parsed.data.mergeStrategy,
      { createIfMissing: true },
    )

    invalidatePriceSnapshot(session.user.id)
    return json(result)
  }

  if (pathname === '/api/admin/summary' && method === 'GET') {
    await requireAdmin(request)
    return json(await getAdminDashboardStats())
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    await requireAdmin(request)
    return json(await listUsers({ search: parseSearchQuery(url.searchParams.get('q')) }))
  }

  params = matchPath(pathname, '/api/admin/users/:userId')
  if (params && method === 'GET') {
    await requireAdmin(request)
    const user = await getUserById(params.userId)

    if (!user) {
      return sendError(404, 'User not found.')
    }

    return json(user)
  }

  if (pathname === '/api/admin/portfolios' && method === 'GET') {
    await requireAdmin(request)
    const status = parseStatusFilter(url.searchParams.get('status'))
    const search = parseSearchQuery(url.searchParams.get('q'))
    return json(await listPortfolios({ search, status }))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId')
  if (params && method === 'GET') {
    await requireAdmin(request)
    const ledger = await getLedgerByUserId(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/create')
  if (params && method === 'POST') {
    await requireAdmin(request)
    const owner = await getUserById(params.userId)

    if (!owner) {
      return sendError(404, 'User not found.')
    }

    const ledger = await createBlankLedgerForUser(params.userId, { overwrite: true })
    clearPriceSnapshot(params.userId)
    return json({
      ...ledger,
      owner,
    })
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/archive')
  if (params && method === 'POST') {
    const session = await requireAdmin(request)
    const ledger = await archiveLedgerByUserId(params.userId, session.user.id)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/restore')
  if (params && method === 'POST') {
    await requireAdmin(request)
    const ledger = await restoreLedgerByUserId(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId')
  if (params && method === 'DELETE') {
    await requireAdmin(request)
    const deleted = await deleteLedgerByUserId(params.userId)

    if (!deleted) {
      return sendError(404, 'Ledger not found.')
    }

    clearPriceSnapshot(params.userId)
    return new Response(null, { status: 204 })
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/export')
  if (params && method === 'GET') {
    await requireAdmin(request)
    const ledger = await getLedgerByUserId(params.userId)
    const snapshot = PortfolioSnapshotSchema.parse({
      holdings: ledger.holdings,
      settings: ledger.settings,
      watchlist: ledger.watchlist,
    })

    return new Response(`${JSON.stringify(snapshot, null, 2)}\n`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/settings')
  if (params && method === 'PUT') {
    await requireAdmin(request)
    const parsed = SettingsSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid settings payload.')
    }

    const ledger = await updateLedgerByUserId(params.userId, (current: Record<string, unknown>) => ({
      ...current,
      settings: parsed.data,
    }))

    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/holdings')
  if (params && method === 'POST') {
    await requireAdmin(request)
    const parsed = HoldingInputSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid holding payload.')
    }

    const ledger = await addHoldingToLedger(params.userId, parsed.data)
    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger), { status: 201 })
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/holdings/:id')
  if (params && method === 'PATCH') {
    await requireAdmin(request)
    const parsed = HoldingUpdateSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid holding update payload.')
    }

    const ledger = await updateHoldingInLedger(params.userId, params.id, parsed.data)
    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  if (params && method === 'DELETE') {
    await requireAdmin(request)
    const ledger = await removeHoldingFromLedger(params.userId, params.id)
    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/watchlist')
  if (params && method === 'POST') {
    await requireAdmin(request)
    const parsed = WatchItemInputSchema.safeParse((await readJson(request)) ?? {})

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'Invalid watchlist payload.')
    }

    const ledger = await addWatchItemToLedger(params.userId, parsed.data)
    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger), { status: 201 })
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/watchlist/:id')
  if (params && method === 'DELETE') {
    await requireAdmin(request)
    const ledger = await removeWatchItemFromLedger(params.userId, params.id)
    invalidatePriceSnapshot(params.userId)
    return json(await withAdminOwner(params.userId, ledger))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/prices/snapshot')
  if (params && method === 'GET') {
    await requireAdmin(request)
    return json(await getPriceSnapshot({ userId: params.userId }))
  }

  params = matchPath(pathname, '/api/admin/portfolios/:userId/prices/refresh')
  if (params && method === 'POST') {
    const session = await requireAdmin(request)
    const rateLimitResponse = limitManualRefreshes(request, session)
    if (rateLimitResponse) return rateLimitResponse
    return json(await getPriceSnapshot({ userId: params.userId, force: true }))
  }

  if (pathname.startsWith('/api/alpaca')) {
    if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
      return sendError(503, 'Alpaca credentials are not configured on the server.')
    }

    return proxyGetRequest(request, url, {
      prefix: /^\/api\/alpaca/,
      baseUrl: 'https://data.alpaca.markets',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      },
    })
  }

  if (pathname.startsWith('/api/sahmk')) {
    if (!process.env.SAHMK_API_KEY) {
      return sendError(503, 'Sahmk credentials are not configured on the server.')
    }

    return proxyGetRequest(request, url, {
      prefix: /^\/api\/sahmk/,
      baseUrl: process.env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1',
      headers: {
        'X-API-Key': process.env.SAHMK_API_KEY,
      },
    })
  }

  if (pathname.startsWith('/api/coinmarketcap')) {
    const apiKey = process.env.X_CMC_PRO_API_KEY ?? process.env['X-CMC_PRO_API_KEY']
    if (!apiKey) {
      return sendError(503, 'CoinMarketCap credentials are not configured on the server.')
    }

    return proxyGetRequest(request, url, {
      prefix: /^\/api\/coinmarketcap/,
      baseUrl: 'https://pro-api.coinmarketcap.com',
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': apiKey,
      },
    })
  }

  if (pathname === '/api/fx/rate' && method === 'GET') {
    const parsed = FxRateQuerySchema.safeParse({
      from: url.searchParams.get('from')?.toUpperCase(),
      to: url.searchParams.get('to')?.toUpperCase(),
    })

    if (!parsed.success) {
      return sendError(400, parsed.error.issues[0]?.message ?? 'FX pair is required.')
    }

    const { from, to } = parsed.data

    if (from === to) {
      return json({ rate: 1 })
    }

    if (from === 'USD' && to === 'SAR') {
      return json({ rate: SAR_USD_PEG })
    }

    if (from === 'SAR' && to === 'USD') {
      return json({ rate: 1 / SAR_USD_PEG })
    }

    const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
    if (!response.ok) {
      return sendError(502, `FX provider returned HTTP ${response.status}.`)
    }

    const payload = await response.json()
    const rate = payload?.rates?.[to]

    if (typeof rate !== 'number') {
      return sendError(502, `FX provider did not return a rate for ${to}.`)
    }

    return json({ rate })
  }

  if (env.LEGACY_API_ORIGIN) {
    return proxyLegacyApi(request, env.LEGACY_API_ORIGIN)
  }

  return sendError(404, 'Not found.')
}

function handleRouteError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'ZodError') {
    const issues = 'issues' in error && Array.isArray(error.issues) ? error.issues : []
    return sendError(400, issues[0]?.message ?? 'Invalid request payload.')
  }

  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : 'Request failed.'
    return sendError(error.status, message)
  }

  console.error(JSON.stringify({ message: 'worker api route failed', error: String(error) }))
  return sendError(500, error instanceof Error ? error.message : 'Internal server error.')
}

export async function handleApiRequest(request: Request, env: RuntimeEnv) {
  syncProcessEnv(env)

  try {
    const response = await routeApi({ request, env, url: new URL(request.url) })
    return withCors(request, response)
  } catch (error) {
    return withCors(request, handleRouteError(error))
  }
}
