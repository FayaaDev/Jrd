import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  AdminSessionSchema,
  FxRateQuerySchema,
  HoldingInputSchema,
  HoldingUpdateSchema,
  ImportPayloadSchema,
  PortfolioSnapshotSchema,
  SettingsSchema,
  WatchItemInputSchema,
} from './schemas.js';
import {
  closeStore,
  getPortfolioSnapshot,
  initStore,
  resetPortfolioSnapshot,
  updatePortfolioSnapshot,
} from './store.js';

try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error;
  }
}

const PORT = Number(process.env.PORT ?? 5050);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SAHMK_BASE_URL = process.env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1';
const CMC_API_KEY = process.env.X_CMC_PRO_API_KEY ?? process.env['X-CMC_PRO_API_KEY'];
const SAR_USD_PEG = 3.75;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!ADMIN_TOKEN) {
  throw new Error('ADMIN_TOKEN is required');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function sendError(res, status, message) {
  res.status(status).json({ message });
}

function getBearerToken(req) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

function requireAdmin(req, res, next) {
  const token = getBearerToken(req);

  if (!token || token !== ADMIN_TOKEN) {
    return sendError(res, 401, 'Admin access is required for this action.');
  }

  next();
}

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

app.post('/api/admin/session', (req, res) => {
  const parsed = AdminSessionSchema.safeParse(req.body ?? {});

  if (!parsed.success || parsed.data.token !== ADMIN_TOKEN) {
    return sendError(res, 401, 'Invalid admin token.');
  }

  res.status(204).end();
});

app.get('/api/portfolio', async (_req, res, next) => {
  try {
    res.json(await getPortfolioSnapshot());
  } catch (error) {
    next(error);
  }
});

app.get('/api/portfolio/holdings', async (_req, res, next) => {
  try {
    const snapshot = await getPortfolioSnapshot();
    res.json(snapshot.holdings);
  } catch (error) {
    next(error);
  }
});

app.get('/api/portfolio/settings', async (_req, res, next) => {
  try {
    const snapshot = await getPortfolioSnapshot();
    res.json(snapshot.settings);
  } catch (error) {
    next(error);
  }
});

app.get('/api/portfolio/watchlist', async (_req, res, next) => {
  try {
    const snapshot = await getPortfolioSnapshot();
    res.json(snapshot.watchlist);
  } catch (error) {
    next(error);
  }
});

app.get('/api/portfolio/export', async (_req, res, next) => {
  try {
    const snapshot = await getPortfolioSnapshot();
    res.type('application/json').send(`${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    next(error);
  }
});

app.put('/api/portfolio/settings', requireAdmin, async (req, res, next) => {
  const parsed = SettingsSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid settings payload.');
  }

  try {
    const snapshot = await updatePortfolioSnapshot((current) => ({
      ...current,
      settings: parsed.data,
    }));
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post('/api/portfolio/holdings', requireAdmin, async (req, res, next) => {
  const parsed = HoldingInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding payload.');
  }

  try {
    const snapshot = await updatePortfolioSnapshot((current) => {
      const now = new Date().toISOString();

      return {
        ...current,
        holdings: [
          ...current.holdings,
          {
            ...parsed.data,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });

    res.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portfolio/holdings/:id', requireAdmin, async (req, res, next) => {
  const parsed = HoldingUpdateSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid holding update payload.');
  }

  try {
    let updated = false;

    const snapshot = await updatePortfolioSnapshot((current) => ({
      ...current,
      holdings: current.holdings.map((holding) => {
        if (holding.id !== req.params.id) {
          return holding;
        }

        updated = true;
        return {
          ...holding,
          ...parsed.data,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    if (!updated) {
      return sendError(res, 404, 'Holding not found.');
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/portfolio/holdings/:id', requireAdmin, async (req, res, next) => {
  try {
    let removed = false;

    const snapshot = await updatePortfolioSnapshot((current) => {
      const holdings = current.holdings.filter((holding) => {
        const keep = holding.id !== req.params.id;
        if (!keep) removed = true;
        return keep;
      });

      return { ...current, holdings };
    });

    if (!removed) {
      return sendError(res, 404, 'Holding not found.');
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post('/api/portfolio/watchlist', requireAdmin, async (req, res, next) => {
  const parsed = WatchItemInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid watchlist payload.');
  }

  try {
    let duplicateSymbol = false;

    const snapshot = await updatePortfolioSnapshot((current) => {
      duplicateSymbol = current.watchlist.some((item) => item.symbol === parsed.data.symbol);
      if (duplicateSymbol) return current;

      return {
        ...current,
        watchlist: [
          ...current.watchlist,
          {
            ...parsed.data,
            id: randomUUID(),
            addedAt: new Date().toISOString(),
          },
        ],
      };
    });

    if (duplicateSymbol) {
      return sendError(res, 409, `${parsed.data.symbol} is already in the watchlist.`);
    }

    res.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/portfolio/watchlist/:id', requireAdmin, async (req, res, next) => {
  try {
    let removed = false;

    const snapshot = await updatePortfolioSnapshot((current) => {
      const watchlist = current.watchlist.filter((item) => {
        const keep = item.id !== req.params.id;
        if (!keep) removed = true;
        return keep;
      });

      return { ...current, watchlist };
    });

    if (!removed) {
      return sendError(res, 404, 'Watchlist item not found.');
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post('/api/portfolio/import', requireAdmin, async (req, res, next) => {
  const parsed = ImportPayloadSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? 'Import payload is required.');
  }

  try {
    const snapshot = PortfolioSnapshotSchema.parse(JSON.parse(parsed.data.json));
    const saved = await updatePortfolioSnapshot(() => snapshot);
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

app.post('/api/portfolio/reset', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await resetPortfolioSnapshot());
  } catch (error) {
    next(error);
  }
});

app.use('/api/alpaca', async (req, res, next) => {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return sendError(res, 503, 'Alpaca credentials are not configured on the server.');
  }

  try {
    await proxyGetRequest(req, res, {
      prefix: /^\/api\/alpaca/,
      baseUrl: 'https://data.alpaca.markets',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/sahmk', async (req, res, next) => {
  if (!process.env.SAHMK_API_KEY) {
    return sendError(res, 503, 'Sahmk credentials are not configured on the server.');
  }

  try {
    await proxyGetRequest(req, res, {
      prefix: /^\/api\/sahmk/,
      baseUrl: SAHMK_BASE_URL,
      headers: {
        'X-API-Key': process.env.SAHMK_API_KEY,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/coinmarketcap', async (req, res, next) => {
  if (!CMC_API_KEY) {
    return sendError(res, 503, 'CoinMarketCap credentials are not configured on the server.');
  }

  try {
    await proxyGetRequest(req, res, {
      prefix: /^\/api\/coinmarketcap/,
      baseUrl: 'https://pro-api.coinmarketcap.com',
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/fx/rate', async (req, res, next) => {
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

  try {
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
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  sendError(res, 404, 'Not found.');
});

app.use((error, _req, res, _next) => {
  if (error?.name === 'ZodError') {
    return sendError(res, 400, error.issues?.[0]?.message ?? 'Invalid request payload.');
  }

  console.error('[server] unexpected error', error);
  sendError(res, 500, error instanceof Error ? error.message : 'Internal server error.');
});

const server = await initStore().then(
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
