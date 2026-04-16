/**
 * symbolVerifier.js
 * Verifies extracted holding symbols against real price providers.
 */

const ALPACA_MARKETS = new Set(['XNAS', 'XNYS', 'ARCX', 'BATS', 'IEXG', 'XASX']);
const SAHMK_MARKETS = new Set(['XSAU']);
const CMC_MARKETS = new Set(['CRYPTO', 'CRYPTOCURRENCY']);

const TIMEOUT_MS = 10_000;

function makeAbortSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, clearTimer: () => clearTimeout(timer) };
}

function getProvider(market) {
  const m = (market ?? '').toUpperCase();
  if (ALPACA_MARKETS.has(m)) return 'alpaca';
  if (SAHMK_MARKETS.has(m)) return 'sahmk';
  if (CMC_MARKETS.has(m)) return 'coinmarketcap';
  return 'unknown';
}

async function verifyAlpaca(pairs, result) {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    for (const { symbol } of pairs) {
      result.set(symbol.toUpperCase(), { verified: null });
    }
    return;
  }

  const symbols = pairs.map((p) => p.symbol.toUpperCase());
  const { signal, clearTimer } = makeAbortSignal();

  try {
    const url = `https://data.alpaca.markets/v2/stocks/bars/latest?symbols=${encodeURIComponent(symbols.join(','))}&feed=iex`;
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
      signal,
    });
    clearTimer();

    if (!response.ok) {
      for (const sym of symbols) {
        result.set(sym, { verified: null });
      }
      return;
    }

    const data = await response.json();
    const bars = data.bars ?? {};

    for (const sym of symbols) {
      result.set(sym, { verified: sym in bars });
    }
  } catch {
    clearTimer();
    for (const sym of symbols) {
      result.set(sym, { verified: null });
    }
  }
}

async function verifySahmk(pairs, result) {
  const apiKey = process.env.SAHMK_API_KEY;
  const baseUrl = process.env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1';

  if (!apiKey) {
    for (const { symbol } of pairs) {
      result.set(symbol.toUpperCase(), { verified: null });
    }
    return;
  }

  for (const { symbol } of pairs) {
    const sym = symbol.toUpperCase();
    const { signal, clearTimer } = makeAbortSignal();

    try {
      const url = `${baseUrl}/quote/${encodeURIComponent(symbol)}/`;
      const response = await fetch(url, {
        headers: { 'X-API-Key': apiKey },
        signal,
      });
      clearTimer();

      if (!response.ok) {
        result.set(sym, { verified: false });
        continue;
      }

      const data = await response.json();
      const suggestedName = data.nameEn ?? data.name ?? undefined;
      result.set(sym, { verified: true, suggestedName });
    } catch {
      clearTimer();
      result.set(sym, { verified: false });
    }
  }
}

async function verifyCoinMarketCap(pairs, result) {
  const apiKey = process.env.X_CMC_PRO_API_KEY ?? process.env['X-CMC_PRO_API_KEY'];

  if (!apiKey) {
    for (const { symbol } of pairs) {
      result.set(symbol.toUpperCase(), { verified: null });
    }
    return;
  }

  const symbols = pairs.map((p) => p.symbol.toUpperCase());
  const { signal, clearTimer } = makeAbortSignal();

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols.join(','))}&convert=USD`;
    const response = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      signal,
    });
    clearTimer();

    if (!response.ok) {
      for (const sym of symbols) {
        result.set(sym, { verified: null });
      }
      return;
    }

    const data = await response.json();
    const cmcData = data.data ?? {};

    for (const sym of symbols) {
      if (sym in cmcData) {
        result.set(sym, { verified: true, suggestedName: cmcData[sym].name });
      } else {
        result.set(sym, { verified: false });
      }
    }
  } catch {
    clearTimer();
    for (const sym of symbols) {
      result.set(sym, { verified: null });
    }
  }
}

/**
 * @param {Array<{ symbol: string, market: string }>} pairs
 * @returns {Promise<Map<string, { verified: boolean|null, suggestedName?: string }>>}
 */
export async function verifySymbols(pairs) {
  const result = new Map();

  const alpacaPairs = [];
  const sahmkPairs = [];
  const cmcPairs = [];
  const unknownPairs = [];

  for (const pair of pairs) {
    const provider = getProvider(pair.market);
    if (provider === 'alpaca') alpacaPairs.push(pair);
    else if (provider === 'sahmk') sahmkPairs.push(pair);
    else if (provider === 'coinmarketcap') cmcPairs.push(pair);
    else unknownPairs.push(pair);
  }

  // Unknown markets — cannot verify
  for (const { symbol } of unknownPairs) {
    result.set(symbol.toUpperCase(), { verified: null });
  }

  await Promise.allSettled([
    alpacaPairs.length > 0 ? verifyAlpaca(alpacaPairs, result) : Promise.resolve(),
    sahmkPairs.length > 0 ? verifySahmk(sahmkPairs, result) : Promise.resolve(),
    cmcPairs.length > 0 ? verifyCoinMarketCap(cmcPairs, result) : Promise.resolve(),
  ]);

  return result;
}
