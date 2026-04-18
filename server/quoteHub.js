import { getLedgerByUserId } from './store.js';

const ALPACA_MARKETS = new Set(['XNAS', 'XNYS', 'XASX', 'ARCX', 'BATS', 'IEXG']);
const SAHMK_MARKETS = new Set(['XSAU']);
const CRYPTO_MARKETS = new Set(['CRYPTO', 'CRYPTOCURRENCY']);
const FETCH_TIMEOUT_MS = 10_000;
const MIN_FORCE_REFRESH_GAP_MS = 5_000;

const quoteStateByUserId = new Map();

function createQuoteState() {
  return {
    quoteCache: new Map(),
    lastRefreshStartedAt: 0,
    lastAttemptedAt: 0,
    lastSuccessfulAt: 0,
    lastRefreshIntervalMs: 60_000,
    lastErrors: {},
    lastTrackedKeys: [],
    refreshPromise: null,
  };
}

function getQuoteState(userId) {
  let state = quoteStateByUserId.get(userId);

  if (!state) {
    state = createQuoteState();
    quoteStateByUserId.set(userId, state);
  }

  return state;
}

export function invalidatePriceSnapshot(userId) {
  if (!userId) {
    for (const state of quoteStateByUserId.values()) {
      state.lastAttemptedAt = 0;
      state.lastSuccessfulAt = 0;
    }
    return;
  }

  const state = getQuoteState(userId);
  state.lastAttemptedAt = 0;
  state.lastSuccessfulAt = 0;
}

export function clearPriceSnapshot(userId) {
  if (!userId) {
    quoteStateByUserId.clear();
    return;
  }

  quoteStateByUserId.delete(userId);
}

export function __resetQuoteHubStateForTests() {
  quoteStateByUserId.clear();
}

function buildInstrumentKey({ symbol, market, assetType }) {
  return `${symbol.toUpperCase()}|${market.toUpperCase()}|${assetType}`;
}

function getProviderForInstrument(instrument) {
  if (instrument.assetType === 'crypto') return 'coinmarketcap';

  const market = instrument.market.toUpperCase();
  if (ALPACA_MARKETS.has(market)) return 'alpaca';
  if (CRYPTO_MARKETS.has(market)) return 'coinmarketcap';
  if (SAHMK_MARKETS.has(market)) return 'sahmk';
  return 'snapshot';
}

function inferWatchlistInstrument(item) {
  const symbol = item.symbol.toUpperCase();

  return {
    symbol,
    market: item.quoteCurrency === 'SAR' && /^\d+$/.test(symbol) ? 'XSAU' : 'XNAS',
    assetType: 'stock',
  };
}

function buildTrackedInstruments(snapshot) {
  const instruments = new Map();

  for (const holding of snapshot.holdings) {
    const instrument = {
      symbol: holding.symbol.toUpperCase(),
      market: holding.market.toUpperCase(),
      assetType: holding.assetType,
    };

    if (getProviderForInstrument(instrument) === 'snapshot') {
      continue;
    }

    instruments.set(buildInstrumentKey(instrument), instrument);
  }

  for (const item of snapshot.watchlist) {
    const instrument = inferWatchlistInstrument(item);
    if (getProviderForInstrument(instrument) === 'snapshot') {
      continue;
    }

    instruments.set(buildInstrumentKey(instrument), instrument);
  }

  return [...instruments.values()];
}

function createAbortHandle() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

function normalizeErrorMessage(error, fallback) {
  if (error instanceof Error && error.name === 'AbortError') {
    return `${fallback} timed out.`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function fetchAlpacaQuotes(instruments) {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    return { quotes: new Map(), error: 'Alpaca credentials are not configured on the server.' };
  }

  const symbols = [...new Set(instruments.map((instrument) => instrument.symbol))];
  if (symbols.length === 0) return { quotes: new Map() };

  const abortHandle = createAbortHandle();

  try {
    const url = `https://data.alpaca.markets/v2/stocks/bars/latest?symbols=${encodeURIComponent(symbols.join(','))}&feed=iex`;
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
      signal: abortHandle.signal,
    });
    abortHandle.clear();

    if (!response.ok) {
      return { quotes: new Map(), error: `[alpaca] HTTP ${response.status}: ${response.statusText}` };
    }

    const json = await response.json();
    const bars = json?.bars ?? {};
    const quotes = new Map();

    for (const instrument of instruments) {
      const bar = bars[instrument.symbol];
      if (!bar || typeof bar.c !== 'number' || typeof bar.t !== 'string') {
        continue;
      }

      quotes.set(buildInstrumentKey(instrument), {
        symbol: instrument.symbol,
        price: bar.c,
        currency: 'USD',
        asOf: bar.t,
        provider: 'alpaca',
      });
    }

    return { quotes };
  } catch (error) {
    abortHandle.clear();
    return { quotes: new Map(), error: normalizeErrorMessage(error, 'Alpaca request failed.') };
  }
}

async function fetchCoinMarketCapQuotes(instruments) {
  const apiKey = process.env.X_CMC_PRO_API_KEY ?? process.env['X-CMC_PRO_API_KEY'];

  if (!apiKey) {
    return { quotes: new Map(), error: 'CoinMarketCap credentials are not configured on the server.' };
  }

  const symbols = [...new Set(instruments.map((instrument) => instrument.symbol))];
  if (symbols.length === 0) return { quotes: new Map() };

  const abortHandle = createAbortHandle();

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols.join(','))}&convert=USD`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': apiKey,
      },
      signal: abortHandle.signal,
    });
    abortHandle.clear();

    if (!response.ok) {
      return { quotes: new Map(), error: `[coinmarketcap] HTTP ${response.status}: ${response.statusText}` };
    }

    const json = await response.json();
    const data = json?.data ?? {};
    const statusTimestamp = typeof json?.status?.timestamp === 'string' ? json.status.timestamp : new Date().toISOString();
    const quotes = new Map();

    for (const instrument of instruments) {
      const entry = data[instrument.symbol];
      const asset = Array.isArray(entry) ? entry[0] : entry;
      const usdQuote = asset?.quote?.USD;

      if (!asset || !usdQuote || typeof usdQuote.price !== 'number') {
        continue;
      }

      quotes.set(buildInstrumentKey(instrument), {
        symbol: instrument.symbol,
        price: usdQuote.price,
        currency: 'USD',
        asOf: typeof usdQuote.last_updated === 'string' ? usdQuote.last_updated : statusTimestamp,
        provider: 'coinmarketcap',
      });
    }

    return { quotes };
  } catch (error) {
    abortHandle.clear();
    return { quotes: new Map(), error: normalizeErrorMessage(error, 'CoinMarketCap request failed.') };
  }
}

async function fetchSahmkQuotes(instruments) {
  const apiKey = process.env.SAHMK_API_KEY;
  const baseUrl = process.env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1';

  if (!apiKey) {
    return { quotes: new Map(), error: 'Sahmk credentials are not configured on the server.' };
  }

  const quotes = new Map();
  const failures = [];

  await Promise.all(
    instruments.map(async (instrument) => {
      const abortHandle = createAbortHandle();

      try {
        const response = await fetch(`${baseUrl}/quote/${encodeURIComponent(instrument.symbol)}/`, {
          headers: { 'X-API-Key': apiKey },
          signal: abortHandle.signal,
        });
        abortHandle.clear();

        if (!response.ok) {
          failures.push(`${instrument.symbol}: HTTP ${response.status}`);
          return;
        }

        const json = await response.json();
        if (typeof json?.price !== 'number' || typeof json?.updated_at !== 'string') {
          failures.push(`${instrument.symbol}: invalid response`);
          return;
        }

        quotes.set(buildInstrumentKey(instrument), {
          symbol: instrument.symbol,
          price: json.price,
          currency: 'SAR',
          asOf: json.updated_at,
          provider: 'sahmk',
        });
      } catch (error) {
        abortHandle.clear();
        failures.push(`${instrument.symbol}: ${normalizeErrorMessage(error, 'request failed')}`);
      }
    })
  );

  const error = failures.length > 0 ? failures.join('; ') : undefined;
  return { quotes, error };
}

function buildSnapshot(state) {
  return {
    updatedAt: state.lastSuccessfulAt ? new Date(state.lastSuccessfulAt).toISOString() : undefined,
    lastSuccessfulAt: state.lastSuccessfulAt ? new Date(state.lastSuccessfulAt).toISOString() : undefined,
    lastAttemptedAt: state.lastAttemptedAt ? new Date(state.lastAttemptedAt).toISOString() : undefined,
    isRefreshing: Boolean(state.refreshPromise),
    refreshIntervalSec: Math.floor(state.lastRefreshIntervalMs / 1000),
    errors: state.lastErrors,
    quotes: Object.fromEntries(
      state.lastTrackedKeys.flatMap((key) => {
        const quote = state.quoteCache.get(key);
        return quote ? [[key, quote]] : [];
      })
    ),
  };
}

async function refreshQuotes(userId, state) {
  const ledger = await getLedgerByUserId(userId);
  const refreshIntervalSec = ledger.settings.refreshIntervalSec;
  const refreshIntervalMs = refreshIntervalSec * 1000;
  const instruments = buildTrackedInstruments(ledger);
  const trackedKeys = instruments.map((instrument) => buildInstrumentKey(instrument));
  const refreshStartedAt = Date.now();

  state.lastAttemptedAt = refreshStartedAt;
  state.lastRefreshIntervalMs = refreshIntervalMs;
  state.lastTrackedKeys = trackedKeys;

  const providerGroups = {
    alpaca: [],
    coinmarketcap: [],
    sahmk: [],
  };

  for (const instrument of instruments) {
    const provider = getProviderForInstrument(instrument);
    if (provider === 'alpaca' || provider === 'coinmarketcap' || provider === 'sahmk') {
      providerGroups[provider].push(instrument);
    }
  }

  const providerTasks = [
    ['alpaca', providerGroups.alpaca],
    ['coinmarketcap', providerGroups.coinmarketcap],
    ['sahmk', providerGroups.sahmk],
  ].filter(([, groupedInstruments]) => groupedInstruments.length > 0);

  const settled = await Promise.allSettled(
    providerTasks.map(async ([provider, groupedInstruments]) => {
      if (provider === 'alpaca') {
        return [provider, await fetchAlpacaQuotes(groupedInstruments)];
      }

      if (provider === 'coinmarketcap') {
        return [provider, await fetchCoinMarketCapQuotes(groupedInstruments)];
      }

      return [provider, await fetchSahmkQuotes(groupedInstruments)];
    })
  );

  const nextErrors = {};
  let receivedLiveQuotes = 0;

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      continue;
    }

    const [provider, payload] = result.value;
    if (payload.error) {
      nextErrors[provider] = payload.error;
    }

    for (const [key, quote] of payload.quotes.entries()) {
      state.quoteCache.set(key, quote);
      receivedLiveQuotes += 1;
    }
  }

  for (const key of [...state.quoteCache.keys()]) {
    if (!trackedKeys.includes(key)) {
      state.quoteCache.delete(key);
    }
  }

  state.lastErrors = nextErrors;

  if (trackedKeys.length === 0 || receivedLiveQuotes > 0) {
    state.lastSuccessfulAt = Date.now();
  }

  return buildSnapshot(state);
}

export async function getPriceSnapshot({ userId, force = false } = {}) {
  if (!userId) {
    throw new Error('userId is required to resolve price snapshots.');
  }

  const state = getQuoteState(userId);
  const now = Date.now();
  const lastRefreshAt = Math.max(state.lastSuccessfulAt, state.lastAttemptedAt);
  const isStale = !lastRefreshAt || now - lastRefreshAt >= state.lastRefreshIntervalMs;
  const shouldForceRefresh =
    force && (!state.lastRefreshStartedAt || now - state.lastRefreshStartedAt >= MIN_FORCE_REFRESH_GAP_MS);

  if (!isStale && !shouldForceRefresh) {
    return buildSnapshot(state);
  }

  if (!state.refreshPromise) {
    state.lastRefreshStartedAt = now;
    state.refreshPromise = refreshQuotes(userId, state).finally(() => {
      state.refreshPromise = null;
    });
  }

  return state.refreshPromise;
}
