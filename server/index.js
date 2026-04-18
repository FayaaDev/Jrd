import './env.js';
import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { toNodeHandler } from 'better-auth/node';
import {
  FxRateQuerySchema,
  HoldingInputSchema,
  HoldingUpdateSchema,
  ImportPayloadSchema,
  PdfImportConfirmSchema,
  PortfolioSnapshotSchema,
  SettingsSchema,
  WatchItemInputSchema,
} from './schemas.js';
import {
  closeStore,
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
  archiveLedgerByUserId,
} from './store.js';
import { auth, getSessionFromRequest, initAuthSchema, isAdminSession } from './auth.js';
import { runPdfImportPipeline } from './pdfImport.js';
import { verifySymbols } from './symbolVerifier.js';
import { VALID_MICS, resolveMarket } from './marketResolver.js';
import { clearPriceSnapshot, getPriceSnapshot, invalidatePriceSnapshot } from './quoteHub.js';
import {
  MANUAL_REFRESH_RATE_LIMIT_MAX,
  MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS,
} from './config.js';

const PORT = Number(process.env.PORT ?? 5050);
const SAHMK_BASE_URL = process.env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1';
const CMC_API_KEY = process.env.X_CMC_PRO_API_KEY ?? process.env['X-CMC_PRO_API_KEY'];
const SAR_USD_PEG = 3.75;

const app = express();
app.disable('x-powered-by');
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '1mb' }));

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, status, message) {
  res.status(status).json({ message });
}

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createRateLimiter({ windowMs, max, message, key = (req) => req.ip }) {
  const buckets = new Map();

  return (req, res, next) => {
    const bucketKey = key(req) ?? 'global';
    const now = Date.now();
    const current = buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      res.setHeader('retry-after', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return sendError(res, 429, message);
    }

    current.count += 1;
    next();
  };
}

const limitManualRefreshes = createRateLimiter({
  windowMs: MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS,
  max: MANUAL_REFRESH_RATE_LIMIT_MAX,
  message: 'Too many manual refresh requests. Please wait before trying again.',
  key: (req) => req.auth?.user?.id ?? req.ip,
});

async function requireSession(req, res, next) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return sendError(res, 401, 'Sign in is required for this action.');
    }

    req.auth = session;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return sendError(res, 401, 'Sign in is required for this action.');
    }

    if (!isAdminSession(session)) {
      return sendError(res, 403, 'Admin access is required for this action.');
    }

    req.auth = session;
    next();
  } catch (error) {
    next(error);
  }
}

function assertActiveLedger(ledger) {
  if (ledger.status === 'archived') {
    throw createHttpError(423, 'This portfolio has been archived. Please contact an admin to restore it.');
  }
}

async function getEditableMyLedger(userId) {
  const ledger = await getLedgerByUserId(userId, { createIfMissing: true });
  assertActiveLedger(ledger);
  return ledger;
}

async function withAdminOwner(userId, ledger) {
  const owner = await getUserById(userId);

  if (!owner) {
    throw createHttpError(404, 'User not found.');
  }

  return {
    ...ledger,
    owner,
  };
}

function parseStatusFilter(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'active' || value === 'archived') {
    return value;
  }

  throw createHttpError(400, 'status must be either active or archived.');
}

function parseSearchQuery(value) {
  return typeof value === 'string' ? value : '';
}

async function addHoldingToLedger(userId, input, { createIfMissing = false } = {}) {
  return updateLedgerByUserId(
    userId,
    (current) => {
      const now = new Date().toISOString();

      return {
        ...current,
        holdings: [
          ...current.holdings,
          {
            ...input,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    },
    { createIfMissing }
  );
}

async function updateHoldingInLedger(userId, holdingId, updates, { createIfMissing = false } = {}) {
  let updated = false;

  const ledger = await updateLedgerByUserId(
    userId,
    (current) => ({
      ...current,
      holdings: current.holdings.map((holding) => {
        if (holding.id !== holdingId) {
          return holding;
        }

        updated = true;
        return {
          ...holding,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }),
    }),
    { createIfMissing }
  );

  if (!updated) {
    throw createHttpError(404, 'Holding not found.');
  }

  return ledger;
}

async function removeHoldingFromLedger(userId, holdingId, { createIfMissing = false } = {}) {
  let removed = false;

  const ledger = await updateLedgerByUserId(
    userId,
    (current) => ({
      ...current,
      holdings: current.holdings.filter((holding) => {
        const keep = holding.id !== holdingId;
        if (!keep) {
          removed = true;
        }
        return keep;
      }),
    }),
    { createIfMissing }
  );

  if (!removed) {
    throw createHttpError(404, 'Holding not found.');
  }

  return ledger;
}

async function addWatchItemToLedger(userId, input, { createIfMissing = false } = {}) {
  let duplicateSymbol = false;

  const ledger = await updateLedgerByUserId(
    userId,
    (current) => {
      duplicateSymbol = current.watchlist.some((item) => item.symbol === input.symbol);
      if (duplicateSymbol) {
        return current;
      }

      return {
        ...current,
        watchlist: [
          ...current.watchlist,
          {
            ...input,
            id: randomUUID(),
            addedAt: new Date().toISOString(),
          },
        ],
      };
    },
    { createIfMissing }
  );

  if (duplicateSymbol) {
    throw createHttpError(409, `${input.symbol} is already in the watchlist.`);
  }

  return ledger;
}

async function removeWatchItemFromLedger(userId, watchItemId, { createIfMissing = false } = {}) {
  let removed = false;

  const ledger = await updateLedgerByUserId(
    userId,
    (current) => ({
      ...current,
      watchlist: current.watchlist.filter((item) => {
        const keep = item.id !== watchItemId;
        if (!keep) {
          removed = true;
        }
        return keep;
      }),
    }),
    { createIfMissing }
  );

  if (!removed) {
    throw createHttpError(404, 'Watchlist item not found.');
  }

  return ledger;
}

async function confirmPdfImportForUser(userId, holdings, mergeStrategy, { createIfMissing = false } = {}) {
  const resolvedMarkets = await Promise.all(
    holdings.map((holding) =>
      resolveMarket({
        symbol: holding.symbol,
        assetType: holding.assetType,
        rawMarket: holding.market,
      })
    )
  );

  const holdingsToImport = holdings.map((holding, index) => ({
    ...holding,
    market: resolvedMarkets[index].mic ?? holding.market,
  }));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  const ledger = await updateLedgerByUserId(
    userId,
    (current) => {
      const now = new Date().toISOString();
      const existingByKey = new Map(
        current.holdings.map((holding) => [
          `${holding.symbol.toUpperCase()}:${holding.market.toUpperCase()}`,
          holding,
        ])
      );

      const nextHoldings = [...current.holdings];

      for (const incoming of holdingsToImport) {
        const key = `${incoming.symbol.toUpperCase()}:${incoming.market.toUpperCase()}`;
        const existing = existingByKey.get(key);

        if (existing && mergeStrategy === 'add_new') {
          skipped += 1;
          continue;
        }

        if (existing && mergeStrategy === 'update_existing') {
          const index = nextHoldings.findIndex((holding) => holding.id === existing.id);
          if (index !== -1) {
            nextHoldings[index] = {
              ...nextHoldings[index],
              ...incoming,
              updatedAt: now,
            };
            updated += 1;
          } else {
            nextHoldings.push({
              ...incoming,
              id: randomUUID(),
              createdAt: now,
              updatedAt: now,
            });
            added += 1;
          }
          continue;
        }

        nextHoldings.push({
          ...incoming,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        });
        added += 1;
      }

      return {
        ...current,
        holdings: nextHoldings,
      };
    },
    { createIfMissing }
  );

  return {
    ledger,
    summary: { added, updated, skipped },
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
});

function buildProxyUrl(base, strippedPathWithQuery) {
  const [pathPart, queryPart] = strippedPathWithQuery.split('?');
  const url = new URL(base);
  const basePath = url.pathname.replace(/\/+$/, '');
  const requestPath = (pathPart ?? '').replace(/^\/+/, '');

  url.pathname = `${basePath}/${requestPath}`.replace(/\/+/g, '/');
  url.search = queryPart ? `?${queryPart}` : '';

  return url;
}

async function sendUpstreamResponse(response, res) {
  const contentType = response.headers.get('content-type');
  const cacheControl = response.headers.get('cache-control');

  if (contentType) {
    res.setHeader('content-type', contentType);
  }

  if (cacheControl) {
    res.setHeader('cache-control', cacheControl);
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.status(response.status).send(body);
}

async function proxyGetRequest(req, res, options) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed.');
  }

  const url = buildProxyUrl(options.baseUrl, req.originalUrl.replace(options.prefix, ''));
  const response = await fetch(url, {
    headers: options.headers,
  });

  await sendUpstreamResponse(response, res);
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/pdf-import/valid-markets', (_req, res) => {
  res.json({ markets: VALID_MICS });
});

app.get('/api/me/portfolio', requireSession, route(async (req, res) => {
  res.json(await getLedgerByUserId(req.auth.user.id, { createIfMissing: true }));
}));

app.get('/api/me/portfolio/holdings', requireSession, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  res.json(ledger.holdings);
}));

app.get('/api/me/portfolio/settings', requireSession, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  res.json(ledger.settings);
}));

app.get('/api/me/portfolio/watchlist', requireSession, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  res.json(ledger.watchlist);
}));

app.get('/api/me/portfolio/export', requireSession, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  const snapshot = PortfolioSnapshotSchema.parse({
    holdings: ledger.holdings,
    settings: ledger.settings,
    watchlist: ledger.watchlist,
  });

  res.type('application/json').send(`${JSON.stringify(snapshot, null, 2)}\n`);
}));

app.put('/api/me/portfolio/settings', requireSession, route(async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid settings payload.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const ledger = await updateLedgerByUserId(
    req.auth.user.id,
    (current) => ({
      ...current,
      settings: parsed.data,
    }),
    { createIfMissing: true }
  );

  invalidatePriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.post('/api/me/portfolio/holdings', requireSession, route(async (req, res) => {
  const parsed = HoldingInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding payload.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const ledger = await addHoldingToLedger(req.auth.user.id, parsed.data, { createIfMissing: true });
  invalidatePriceSnapshot(req.auth.user.id);
  res.status(201).json(ledger);
}));

app.patch('/api/me/portfolio/holdings/:id', requireSession, route(async (req, res) => {
  const parsed = HoldingUpdateSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding update payload.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const ledger = await updateHoldingInLedger(req.auth.user.id, req.params.id, parsed.data, {
    createIfMissing: true,
  });

  invalidatePriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.delete('/api/me/portfolio/holdings/:id', requireSession, route(async (req, res) => {
  await getEditableMyLedger(req.auth.user.id);
  const ledger = await removeHoldingFromLedger(req.auth.user.id, req.params.id, {
    createIfMissing: true,
  });

  invalidatePriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.post('/api/me/portfolio/watchlist', requireSession, route(async (req, res) => {
  const parsed = WatchItemInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid watchlist payload.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const ledger = await addWatchItemToLedger(req.auth.user.id, parsed.data, { createIfMissing: true });
  invalidatePriceSnapshot(req.auth.user.id);
  res.status(201).json(ledger);
}));

app.delete('/api/me/portfolio/watchlist/:id', requireSession, route(async (req, res) => {
  await getEditableMyLedger(req.auth.user.id);
  const ledger = await removeWatchItemFromLedger(req.auth.user.id, req.params.id, {
    createIfMissing: true,
  });

  invalidatePriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.post('/api/me/portfolio/import', requireSession, route(async (req, res) => {
  const parsed = ImportPayloadSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Import payload is required.');
  }

  await getEditableMyLedger(req.auth.user.id);

  let snapshot;
  try {
    snapshot = PortfolioSnapshotSchema.parse(JSON.parse(parsed.data.json));
  } catch {
    return sendError(res, 400, 'Imported file is not valid portfolio JSON.');
  }

  const ledger = await replaceLedgerByUserId(req.auth.user.id, snapshot, { createIfMissing: true });
  clearPriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.post('/api/me/portfolio/reset', requireSession, route(async (req, res) => {
  await getEditableMyLedger(req.auth.user.id);
  const ledger = await resetLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  clearPriceSnapshot(req.auth.user.id);
  res.json(ledger);
}));

app.get('/api/me/prices/snapshot', requireSession, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  assertActiveLedger(ledger);
  res.json(await getPriceSnapshot({ userId: req.auth.user.id }));
}));

app.post('/api/me/prices/refresh', requireSession, limitManualRefreshes, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.auth.user.id, { createIfMissing: true });
  assertActiveLedger(ledger);
  res.json(await getPriceSnapshot({ userId: req.auth.user.id, force: true }));
}));

app.post('/api/me/portfolio/import/pdf', requireSession, upload.single('file'), route(async (req, res) => {
  if (!req.file) {
    return sendError(res, 400, 'No PDF file was uploaded.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const result = await runPdfImportPipeline(req.file.buffer);
  res.json(result);
}));

app.post('/api/me/portfolio/import/pdf/verify-symbols', requireSession, route(async (req, res) => {
  const { symbols } = req.body ?? {};

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return sendError(res, 400, 'symbols must be a non-empty array of { symbol, market } pairs.');
  }
  if (symbols.length > 200) {
    return sendError(res, 400, 'symbols array must not exceed 200 entries.');
  }
  if (symbols.some((entry) => typeof entry?.symbol !== 'string' || typeof entry?.market !== 'string')) {
    return sendError(res, 400, 'Each entry in symbols must have string symbol and market fields.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const verificationMap = await verifySymbols(symbols);
  const results = symbols.map(({ symbol, market }) => {
    const key = symbol.toUpperCase();
    const result = verificationMap.get(key) ?? { verified: null };
    return { symbol, market, verified: result.verified, suggestedName: result.suggestedName };
  });

  res.json({ results });
}));

app.post('/api/me/portfolio/import/pdf/confirm', requireSession, route(async (req, res) => {
  const parsed = PdfImportConfirmSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid import confirm payload.');
  }

  await getEditableMyLedger(req.auth.user.id);
  const result = await confirmPdfImportForUser(
    req.auth.user.id,
    parsed.data.holdings,
    parsed.data.mergeStrategy,
    { createIfMissing: true }
  );

  invalidatePriceSnapshot(req.auth.user.id);
  res.json(result);
}));

app.get('/api/admin/summary', requireAdmin, route(async (_req, res) => {
  res.json(await getAdminDashboardStats());
}));

app.get('/api/admin/users', requireAdmin, route(async (req, res) => {
  res.json(await listUsers({ search: parseSearchQuery(req.query.q) }));
}));

app.get('/api/admin/users/:userId', requireAdmin, route(async (req, res) => {
  const user = await getUserById(req.params.userId);

  if (!user) {
    return sendError(res, 404, 'User not found.');
  }

  res.json(user);
}));

app.get('/api/admin/portfolios', requireAdmin, route(async (req, res) => {
  const status = parseStatusFilter(req.query.status);
  const search = parseSearchQuery(req.query.q);
  res.json(await listPortfolios({ search, status }));
}));

app.get('/api/admin/portfolios/:userId', requireAdmin, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.post('/api/admin/portfolios/:userId/create', requireAdmin, route(async (req, res) => {
  const owner = await getUserById(req.params.userId);

  if (!owner) {
    return sendError(res, 404, 'User not found.');
  }

  const ledger = await createBlankLedgerForUser(req.params.userId, { overwrite: true });
  clearPriceSnapshot(req.params.userId);
  res.json({
    ...ledger,
    owner,
  });
}));

app.post('/api/admin/portfolios/:userId/archive', requireAdmin, route(async (req, res) => {
  const ledger = await archiveLedgerByUserId(req.params.userId, req.auth.user.id);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.post('/api/admin/portfolios/:userId/restore', requireAdmin, route(async (req, res) => {
  const ledger = await restoreLedgerByUserId(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.delete('/api/admin/portfolios/:userId', requireAdmin, route(async (req, res) => {
  const deleted = await deleteLedgerByUserId(req.params.userId);

  if (!deleted) {
    return sendError(res, 404, 'Ledger not found.');
  }

  clearPriceSnapshot(req.params.userId);
  res.status(204).end();
}));

app.get('/api/admin/portfolios/:userId/export', requireAdmin, route(async (req, res) => {
  const ledger = await getLedgerByUserId(req.params.userId);
  const snapshot = PortfolioSnapshotSchema.parse({
    holdings: ledger.holdings,
    settings: ledger.settings,
    watchlist: ledger.watchlist,
  });

  res.type('application/json').send(`${JSON.stringify(snapshot, null, 2)}\n`);
}));

app.put('/api/admin/portfolios/:userId/settings', requireAdmin, route(async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid settings payload.');
  }

  const ledger = await updateLedgerByUserId(req.params.userId, (current) => ({
    ...current,
    settings: parsed.data,
  }));

  invalidatePriceSnapshot(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.post('/api/admin/portfolios/:userId/holdings', requireAdmin, route(async (req, res) => {
  const parsed = HoldingInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding payload.');
  }

  const ledger = await addHoldingToLedger(req.params.userId, parsed.data);
  invalidatePriceSnapshot(req.params.userId);
  res.status(201).json(await withAdminOwner(req.params.userId, ledger));
}));

app.patch('/api/admin/portfolios/:userId/holdings/:id', requireAdmin, route(async (req, res) => {
  const parsed = HoldingUpdateSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding update payload.');
  }

  const ledger = await updateHoldingInLedger(req.params.userId, req.params.id, parsed.data);
  invalidatePriceSnapshot(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.delete('/api/admin/portfolios/:userId/holdings/:id', requireAdmin, route(async (req, res) => {
  const ledger = await removeHoldingFromLedger(req.params.userId, req.params.id);
  invalidatePriceSnapshot(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.post('/api/admin/portfolios/:userId/watchlist', requireAdmin, route(async (req, res) => {
  const parsed = WatchItemInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid watchlist payload.');
  }

  const ledger = await addWatchItemToLedger(req.params.userId, parsed.data);
  invalidatePriceSnapshot(req.params.userId);
  res.status(201).json(await withAdminOwner(req.params.userId, ledger));
}));

app.delete('/api/admin/portfolios/:userId/watchlist/:id', requireAdmin, route(async (req, res) => {
  const ledger = await removeWatchItemFromLedger(req.params.userId, req.params.id);
  invalidatePriceSnapshot(req.params.userId);
  res.json(await withAdminOwner(req.params.userId, ledger));
}));

app.get('/api/admin/portfolios/:userId/prices/snapshot', requireAdmin, route(async (req, res) => {
  res.json(await getPriceSnapshot({ userId: req.params.userId }));
}));

app.post('/api/admin/portfolios/:userId/prices/refresh', requireAdmin, limitManualRefreshes, route(async (req, res) => {
  res.json(await getPriceSnapshot({ userId: req.params.userId, force: true }));
}));

app.use('/api/alpaca', route(async (req, res) => {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return sendError(res, 503, 'Alpaca credentials are not configured on the server.');
  }

  await proxyGetRequest(req, res, {
    prefix: /^\/api\/alpaca/,
    baseUrl: 'https://data.alpaca.markets',
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
    },
  });
}));

app.use('/api/sahmk', route(async (req, res) => {
  if (!process.env.SAHMK_API_KEY) {
    return sendError(res, 503, 'Sahmk credentials are not configured on the server.');
  }

  await proxyGetRequest(req, res, {
    prefix: /^\/api\/sahmk/,
    baseUrl: SAHMK_BASE_URL,
    headers: {
      'X-API-Key': process.env.SAHMK_API_KEY,
    },
  });
}));

app.use('/api/coinmarketcap', route(async (req, res) => {
  if (!CMC_API_KEY) {
    return sendError(res, 503, 'CoinMarketCap credentials are not configured on the server.');
  }

  await proxyGetRequest(req, res, {
    prefix: /^\/api\/coinmarketcap/,
    baseUrl: 'https://pro-api.coinmarketcap.com',
    headers: {
      Accept: 'application/json',
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
    },
  });
}));

app.get('/api/fx/rate', route(async (req, res) => {
  const parsed = FxRateQuerySchema.safeParse({
    from: typeof req.query.from === 'string' ? req.query.from.toUpperCase() : req.query.from,
    to: typeof req.query.to === 'string' ? req.query.to.toUpperCase() : req.query.to,
  });

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'FX pair is required.');
  }

  const { from, to } = parsed.data;

  if (from === to) {
    return res.json({ rate: 1 });
  }

  if (from === 'USD' && to === 'SAR') {
    return res.json({ rate: SAR_USD_PEG });
  }

  if (from === 'SAR' && to === 'USD') {
    return res.json({ rate: 1 / SAR_USD_PEG });
  }

  const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!response.ok) {
    return sendError(res, 502, `FX provider returned HTTP ${response.status}.`);
  }

  const json = await response.json();
  const rate = json?.rates?.[to];

  if (typeof rate !== 'number') {
    return sendError(res, 502, `FX provider did not return a rate for ${to}.`);
  }

  res.json({ rate });
}));

app.use((_req, res) => {
  sendError(res, 404, 'Not found.');
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError || error?.message === 'Only PDF files are accepted.') {
    return sendError(res, 400, error.message);
  }

  next(error);
});

app.use((error, _req, res, _next) => {
  if (error?.name === 'ZodError') {
    return sendError(res, 400, error.issues?.[0]?.message ?? 'Invalid request payload.');
  }

  if (typeof error?.status === 'number') {
    return sendError(res, error.status, error.message ?? 'Request failed.');
  }

  console.error('[server] unexpected error', error);
  sendError(res, 500, error instanceof Error ? error.message : 'Internal server error.');
});

const server = await initAuthSchema()
  .then(() => initStore())
  .then(
    () =>
      app.listen(PORT, () => {
        console.log(`[server] Fayafolio API listening on port ${PORT}`);
      })
  );

async function shutdown() {
  await closeStore();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
