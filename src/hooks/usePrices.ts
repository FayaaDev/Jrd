import { useQuery } from '@tanstack/react-query';
import type { Holding } from '../schemas/holding';
import type { Settings } from '../schemas/settings';
import type { PriceQuote } from '../api/types';
import { fetchPriceSnapshot, buildPriceLookupKey, priceSnapshotQueryKey, type PriceSnapshot } from '../api/prices';
import type { PortfolioScope } from '../api/portfolio';

function getClientRefreshIntervalMs(refreshMs: number) {
  return Math.min(refreshMs, Math.max(5_000, Math.floor(refreshMs / 3)));
}

interface UsePricesResult {
  prices: Record<string, PriceQuote | undefined>;
  snapshot: PriceSnapshot | undefined;
  isFetching: boolean;
  errorMessage?: string;
}

export function usePrices(
  scope: PortfolioScope,
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market' | 'assetType'>[],
  settings: Settings,
): UsePricesResult {
  const refreshMs = settings.refreshIntervalSec * 1000;
  const query = useQuery({
    queryKey: priceSnapshotQueryKey(scope),
    queryFn: () => fetchPriceSnapshot(scope),
    staleTime: getClientRefreshIntervalMs(refreshMs),
    refetchInterval: getClientRefreshIntervalMs(refreshMs),
    refetchIntervalInBackground: true,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const quotes = query.data?.quotes ?? {};
  const quotesBySymbol = new Map<string, PriceQuote>();

  for (const holding of holdings) {
    const quote = quotes[buildPriceLookupKey(holding)];
    if (quote) {
      quotesBySymbol.set(holding.symbol, quote);
    }
  }

  return {
    prices: Object.fromEntries(symbols.map((symbol) => [symbol, quotesBySymbol.get(symbol)])),
    snapshot: query.data,
    isFetching: query.fetchStatus === 'fetching',
    errorMessage: query.error instanceof Error ? query.error.message : undefined,
  };
}
