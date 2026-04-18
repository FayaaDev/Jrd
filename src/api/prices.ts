import { z } from 'zod';
import type { Holding } from '../schemas/holding';
import type { PriceProvider } from './types';
import { apiPath } from './base';
import { authedFetch } from './http';
import { type PortfolioScope, ME_PORTFOLIO_SCOPE } from './portfolio';
import { alpacaPricesProvider } from './providers/alpacaPrices';
import { coinMarketCapPricesProvider } from './providers/coinMarketCapPrices';
import { sahmkPricesProvider } from './providers/sahmkPrices';

export type MarketPriceProvider = 'alpaca' | 'coinmarketcap' | 'sahmk' | 'snapshot';

const MessageSchema = z.object({
  message: z.string(),
});

const PriceQuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  currency: z.string(),
  asOf: z.string(),
  provider: z.string(),
});

const PriceSnapshotSchema = z.object({
  updatedAt: z.string().optional(),
  lastSuccessfulAt: z.string().optional(),
  lastAttemptedAt: z.string().optional(),
  isRefreshing: z.boolean(),
  refreshIntervalSec: z.number().int().positive(),
  errors: z.record(z.string(), z.string()),
  quotes: z.record(z.string(), PriceQuoteSchema),
});

export type PriceSnapshot = z.infer<typeof PriceSnapshotSchema>;

const ALPACA_MARKETS = new Set(['XNAS', 'XNYS', 'XASX', 'ARCX', 'BATS', 'IEXG']);
const SAHMK_MARKETS = new Set(['XSAU']);
const CRYPTO_MARKETS = new Set(['CRYPTO', 'CRYPTOCURRENCY']);

function buildPricePath(scope: PortfolioScope, action: 'snapshot' | 'refresh') {
  return scope.kind === 'me'
    ? `/me/prices/${action}`
    : `/admin/portfolios/${scope.userId}/prices/${action}`;
}

export function priceSnapshotQueryKey(scope: PortfolioScope = ME_PORTFOLIO_SCOPE) {
  return scope.kind === 'me'
    ? (['prices', 'snapshot', 'me'] as const)
    : (['prices', 'snapshot', 'admin', scope.userId] as const);
}

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
    holdings.map((holding) => [holding.symbol, { assetType: holding.assetType, market: holding.market }]),
  );

  const alpaca: string[] = [];
  const coinmarketcap: string[] = [];
  const sahmk: string[] = [];
  const snapshot: string[] = [];

  for (const symbol of symbols) {
    const holding = holdingBySymbol.get(symbol);
    const provider = holding ? getProviderForHolding(holding) : 'snapshot';

    if (provider === 'alpaca') {
      alpaca.push(symbol);
      continue;
    }

    if (provider === 'coinmarketcap') {
      coinmarketcap.push(symbol);
      continue;
    }

    if (provider === 'sahmk') {
      sahmk.push(symbol);
      continue;
    }

    snapshot.push(symbol);
  }

  return { alpaca, coinmarketcap, sahmk, snapshot };
}

export function buildPriceLookupKey(holding: Pick<Holding, 'symbol' | 'market' | 'assetType'>): string {
  return `${holding.symbol.toUpperCase()}|${holding.market.toUpperCase()}|${holding.assetType}`;
}

async function parseResponseError(response: Response): Promise<Error> {
  try {
    const json = await response.json();
    const parsed = MessageSchema.safeParse(json);
    if (parsed.success) {
      return new Error(parsed.data.message);
    }
  } catch {
    // Ignore malformed error bodies and fall back to status text.
  }

  return new Error(response.statusText || `HTTP ${response.status}`);
}

export async function fetchPriceSnapshot(scope: PortfolioScope = ME_PORTFOLIO_SCOPE): Promise<PriceSnapshot> {
  const response = await authedFetch(apiPath(buildPricePath(scope, 'snapshot')));
  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return PriceSnapshotSchema.parse(await response.json());
}

export async function refreshPriceSnapshot(scope: PortfolioScope = ME_PORTFOLIO_SCOPE): Promise<PriceSnapshot> {
  const response = await authedFetch(apiPath(buildPricePath(scope, 'refresh')), {
    method: 'POST',
  });
  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return PriceSnapshotSchema.parse(await response.json());
}
