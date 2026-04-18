import type { PriceProvider } from './types';
import type { Holding } from '../schemas/holding';
import { alpacaPricesProvider } from './providers/alpacaPrices';
import { coinMarketCapPricesProvider } from './providers/coinMarketCapPrices';
import { sahmkPricesProvider } from './providers/sahmkPrices';
import { apiPath } from './base';
import { z } from 'zod';

export type MarketPriceProvider = 'alpaca' | 'coinmarketcap' | 'sahmk' | 'snapshot';

const PriceQuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  currency: z.string(),
  asOf: z.string(),
  provider: z.string(),
});

const PriceSnapshotSchema = z.object({
  updatedAt: z.string().optional(),
  refreshIntervalSec: z.number().int().positive(),
  errors: z.record(z.string(), z.string()),
  quotes: z.record(z.string(), PriceQuoteSchema),
});

export type PriceSnapshot = z.infer<typeof PriceSnapshotSchema>;

/**
 * US exchanges supported by Alpaca IEX feed.
 * Holdings with these markets route to Alpaca.
 */
const ALPACA_MARKETS = new Set([
  'XNAS', // NASDAQ
  'XNYS', // NYSE
  'XASX', // ASX (US-listed)
  'ARCX', // NYSE Arca
  'BATS', // CBOE BZX
  'IEXG', // IEX
]);

const SAHMK_MARKETS = new Set([
  'XSAU',
]);

const CRYPTO_MARKETS = new Set([
  'CRYPTO',
  'CRYPTOCURRENCY',
]);

export function getPriceProvider(name: Exclude<MarketPriceProvider, 'snapshot'>): PriceProvider {
  switch (name) {
    case 'alpaca':
      return alpacaPricesProvider;
    case 'coinmarketcap':
      return coinMarketCapPricesProvider;
    case 'sahmk':
      return sahmkPricesProvider;
  }
}

export function getProviderForMarket(market: string): MarketPriceProvider {
  const normalizedMarket = market.toUpperCase();

  if (ALPACA_MARKETS.has(normalizedMarket)) return 'alpaca';
  if (CRYPTO_MARKETS.has(normalizedMarket)) return 'coinmarketcap';
  if (SAHMK_MARKETS.has(normalizedMarket)) return 'sahmk';
  return 'snapshot';
}

export function getProviderForHolding(holding: Pick<Holding, 'assetType' | 'market'>): MarketPriceProvider {
  if (holding.assetType === 'crypto') {
    return 'coinmarketcap';
  }

  return getProviderForMarket(holding.market);
}

export function routeBySymbol(
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market' | 'assetType'>[],
): { alpaca: string[]; coinmarketcap: string[]; sahmk: string[]; snapshot: string[] } {
  const holdingBySymbol = new Map<string, Pick<Holding, 'assetType' | 'market'>>(
    holdings.map((h) => [h.symbol, { assetType: h.assetType, market: h.market }]),
  );

  const alpaca: string[] = [];
  const coinmarketcap: string[] = [];
  const sahmk: string[] = [];
  const snapshot: string[] = [];

  for (const sym of symbols) {
    const holding = holdingBySymbol.get(sym);
    const provider = holding ? getProviderForHolding(holding) : 'snapshot';

    if (provider === 'alpaca') {
      alpaca.push(sym);
      continue;
    }

    if (provider === 'coinmarketcap') {
      coinmarketcap.push(sym);
      continue;
    }

    if (provider === 'sahmk') {
      sahmk.push(sym);
      continue;
    }

    snapshot.push(sym);
  }

  return { alpaca, coinmarketcap, sahmk, snapshot };
}

export function buildPriceLookupKey(holding: Pick<Holding, 'symbol' | 'market' | 'assetType'>): string {
  return `${holding.symbol.toUpperCase()}|${holding.market.toUpperCase()}|${holding.assetType}`;
}

async function parseResponseError(response: Response): Promise<Error> {
  try {
    const json = await response.json();
    if (typeof json?.message === 'string' && json.message) {
      return new Error(json.message);
    }
  } catch {
    // Ignore malformed error bodies and fall back to status text.
  }

  return new Error(response.statusText || `HTTP ${response.status}`);
}

export async function fetchPriceSnapshot(): Promise<PriceSnapshot> {
  const response = await fetch(apiPath('/prices/snapshot'));
  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return PriceSnapshotSchema.parse(await response.json());
}

export async function refreshPriceSnapshot(): Promise<PriceSnapshot> {
  const response = await fetch(apiPath('/prices/refresh'), { method: 'POST' });
  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return PriceSnapshotSchema.parse(await response.json());
}
