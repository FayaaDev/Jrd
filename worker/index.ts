import { Client } from 'pg'
import { handleApiRequest } from './api'

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  })
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
        status: 'worker-api-ready',
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
      return handleApiRequest(request, runtimeEnv)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
