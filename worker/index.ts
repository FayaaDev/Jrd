import { Client } from 'pg'

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  })
}

async function proxyLegacyApi(request: Request, origin: string) {
  const sourceUrl = new URL(request.url)
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, origin)
  const proxied = new Request(targetUrl, request)

  return fetch(proxied)
}

export default {
  async fetch(request, env) {
    const runtimeEnv = env as Env & { HYPERDRIVE?: Hyperdrive; LEGACY_API_ORIGIN?: string }
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return json({ status: 'ok', runtime: 'cloudflare-worker' })
    }

    if (url.pathname === '/api/deployment-status') {
      return json({
        status: 'worker-shell-ready',
        apiRuntime: runtimeEnv.HYPERDRIVE ? 'hyperdrive-configured' : 'pending-hyperdrive',
        legacyApiProxy: Boolean(runtimeEnv.LEGACY_API_ORIGIN),
      })
    }

    if (url.pathname === '/api/db-health') {
      const db = new Client({ connectionString: runtimeEnv.HYPERDRIVE.connectionString })

      try {
        await db.connect()
        const result = await db.query(`
          select
            (select count(*)::int from "user") as users,
            (select count(*)::int from portfolio_ledgers) as portfolio_ledgers
        `)
        return json({ status: 'ok', counts: result.rows[0] })
      } catch (error) {
        console.error(JSON.stringify({ message: 'db health check failed', error: String(error) }))
        return json({ status: 'error', message: 'Database health check failed.' }, { status: 500 })
      } finally {
        await db.end().catch(() => undefined)
      }
    }

    if (url.pathname.startsWith('/api/')) {
      if (runtimeEnv.LEGACY_API_ORIGIN) {
        return proxyLegacyApi(request, runtimeEnv.LEGACY_API_ORIGIN)
      }

      return json(
        {
          message:
            'Cloudflare API runtime is not connected yet. Configure managed Postgres + Hyperdrive, then port the Express API routes.',
        },
        { status: 503 },
      )
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
