import type { PriceProvider } from './types';
import type { Holding } from '../schemas/holding';
import { alpacaPricesProvider } from './providers/alpacaPrices';
import { sahmkPricesProvider } from './providers/sahmkPrices';

export type MarketPriceProvider = 'alpaca' | 'sahmk' | 'snapshot';

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

export function getPriceProvider(name: Exclude<MarketPriceProvider, 'snapshot'>): PriceProvider {
  switch (name) {
    case 'alpaca':
      return alpacaPricesProvider;
    case 'sahmk':
      return sahmkPricesProvider;
  }
}

export function getProviderForMarket(market: string): MarketPriceProvider {
  if (ALPACA_MARKETS.has(market)) return 'alpaca';
  if (SAHMK_MARKETS.has(market)) return 'sahmk';
  return 'snapshot';
}

export function routeBySymbol(
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market'>[],
): { alpaca: string[]; sahmk: string[]; snapshot: string[] } {
  const marketBySymbol = new Map<string, string>(
    holdings.map((h) => [h.symbol, h.market]),
  );

  const alpaca: string[] = [];
  const sahmk: string[] = [];
  const snapshot: string[] = [];

  for (const sym of symbols) {
    const market = marketBySymbol.get(sym);
    const provider = market !== undefined ? getProviderForMarket(market) : 'snapshot';

    if (provider === 'alpaca') {
      alpaca.push(sym);
      continue;
    }

    if (provider === 'sahmk') {
      sahmk.push(sym);
      continue;
    }

    snapshot.push(sym);
  }

  return { alpaca, sahmk, snapshot };
}
