/**
 * marketResolver.js
 * Resolves a holding's market to a valid MIC code via synonym mapping,
 * symbol-shape inference, and Alpaca asset lookup (in that order).
 */

const ALPACA_EXCHANGE_TO_MIC = {
  NASDAQ: 'XNAS',
  NYSE: 'XNYS',
  ARCA: 'ARCX',
  BATS: 'BATS',
  IEX: 'IEXG',
  AMEX: 'XASE',
  // OTC → unsupported
};

// Yahoo Finance exchangeName → MIC
const YAHOO_EXCHANGE_TO_MIC = {
  NASDAQ: 'XNAS',
  NMS: 'XNAS',    // NASDAQ Global Select
  NGM: 'XNAS',    // NASDAQ Global Market
  NCM: 'XNAS',    // NASDAQ Capital Market
  NYSE: 'XNYS',
  NYQ: 'XNYS',
  NYSEARCA: 'ARCX',
  PCX: 'ARCX',
  BATS: 'BATS',
  IEX: 'IEXG',
  ASX: 'XASX',
  SAU: 'XSAU',
  TDW: 'XSAU',    // Tadawul
};

const SYNONYM_MAP = {
  TADAWUL: 'XSAU',
  'SAUDI EXCHANGE': 'XSAU',
  SAUDI: 'XSAU',
  KSA: 'XSAU',
  SAU: 'XSAU',
  SA: 'XSAU',
  XSAU: 'XSAU',
  NASDAQ: 'XNAS',
  XNAS: 'XNAS',
  NYSE: 'XNYS',
  XNYS: 'XNYS',
  ARCA: 'ARCX',
  'NYSE ARCA': 'ARCX',
  NYSEARCA: 'ARCX',
  ARCX: 'ARCX',
  CBOE: 'BATS',
  BZX: 'BATS',
  BATS: 'BATS',
  IEX: 'IEXG',
  IEXG: 'IEXG',
  ASX: 'XASX',
  XASX: 'XASX',
  CRYPTO: 'CRYPTO',
  CRYPTOCURRENCY: 'CRYPTO',
  BITCOIN: 'CRYPTO',
  MM: 'MONEYMARKET',
  'MONEY MARKET': 'MONEYMARKET',
  'MONEY-MARKET': 'MONEYMARKET',
  MONEYMARKET: 'MONEYMARKET',
};

export const VALID_MICS = [
  'XSAU',
  'XNAS',
  'XNYS',
  'ARCX',
  'BATS',
  'IEXG',
  'XASX',
  'CRYPTO',
  'MONEYMARKET',
];

const VALID_MIC_SET = new Set(VALID_MICS);

// In-memory Alpaca asset cache (1h TTL)
const alpacaCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

// Only try Alpaca for plausible equity tickers (skip numerics — they're handled by shape inference)
const EQUITY_TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Normalize a raw market string to a valid MIC, or return null if unrecognised.
 */
export function normalizeMarketString(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (VALID_MIC_SET.has(upper)) return upper;
  return SYNONYM_MAP[upper] ?? null;
}

/**
 * Infer market from symbol shape or assetType (conservative, no default-to-XNAS guessing).
 */
export function inferFromSymbolShape({ symbol, assetType }) {
  if (assetType === 'crypto') return 'CRYPTO';
  if (/^\d{4}$/.test(symbol)) return 'XSAU';
  return null;
}

/**
 * Look up an equity ticker via Alpaca GET /v2/assets/:symbol and return its MIC.
 * Returns null on any error, missing creds, or unsupported exchange.
 */
export async function resolveViaAlpaca(symbol) {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) return null;

  const symUpper = symbol.toUpperCase();

  const cached = alpacaCache.get(symUpper);
  if (cached && cached.expiresAt > Date.now()) return cached.mic;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `https://paper-api.alpaca.markets/v2/assets/${encodeURIComponent(symUpper)}`,
      {
        headers: {
          'APCA-API-KEY-ID': keyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!response.ok) {
      alpacaCache.set(symUpper, { mic: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const data = await response.json();
    const mic = ALPACA_EXCHANGE_TO_MIC[data.exchange] ?? null;
    alpacaCache.set(symUpper, { mic, expiresAt: Date.now() + CACHE_TTL_MS });
    return mic;
  } catch {
    clearTimeout(timer);
    alpacaCache.set(symUpper, { mic: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}

/**
 * Look up a ticker via Yahoo Finance and return its MIC.
 * Returns null on any error or unmapped exchange.
 */
export async function resolveViaYahoo(symbol) {
  const symUpper = symbol.toUpperCase();

  const cached = alpacaCache.get(`yahoo:${symUpper}`);
  if (cached && cached.expiresAt > Date.now()) return cached.mic;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symUpper)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      alpacaCache.set(`yahoo:${symUpper}`, { mic: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const data = await response.json();
    const exchangeName = data?.chart?.result?.[0]?.meta?.exchangeName ?? null;
    const mic = exchangeName ? (YAHOO_EXCHANGE_TO_MIC[exchangeName] ?? null) : null;
    alpacaCache.set(`yahoo:${symUpper}`, { mic, expiresAt: Date.now() + CACHE_TTL_MS });
    return mic;
  } catch {
    clearTimeout(timer);
    alpacaCache.set(`yahoo:${symUpper}`, { mic: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}

/**
 * Resolve the market for a holding.
 *
 * Steps:
 *   1. Normalize LLM output (synonym map / exact MIC match)
 *   2. Infer from symbol shape / assetType
 *   3. Alpaca GET /v2/assets/:symbol (equity tickers only, cached 1h)
 *   4. Yahoo Finance chart API (web-search fallback, cached 1h)
 *
 * @param {{ symbol: string, assetType: string, rawMarket: string }} param
 * @returns {Promise<{ mic: string|null, source: 'llm'|'synonym'|'shape'|'alpaca'|'yahoo'|'unknown' }>}
 */
export async function resolveMarket({ symbol, assetType, rawMarket }) {
  // Step 1: normalize
  const fromNormalize = normalizeMarketString(rawMarket);
  if (fromNormalize) {
    const rawUpper = (rawMarket ?? '').trim().toUpperCase();
    const source = VALID_MIC_SET.has(rawUpper) ? 'llm' : 'synonym';
    return { mic: fromNormalize, source };
  }

  // Step 2: shape inference
  const fromShape = inferFromSymbolShape({ symbol, assetType });
  if (fromShape) return { mic: fromShape, source: 'shape' };

  // Steps 3 & 4: API lookups (only for plausible equity tickers)
  const symUpper = (symbol ?? '').toUpperCase();
  if (EQUITY_TICKER_RE.test(symUpper)) {
    const fromAlpaca = await resolveViaAlpaca(symUpper);
    if (fromAlpaca) return { mic: fromAlpaca, source: 'alpaca' };

    const fromYahoo = await resolveViaYahoo(symUpper);
    if (fromYahoo) return { mic: fromYahoo, source: 'yahoo' };
  }

  return { mic: null, source: 'unknown' };
}
