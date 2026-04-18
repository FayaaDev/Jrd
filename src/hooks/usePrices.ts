import { useQuery } from '@tanstack/react-query';
import type { Settings } from '../schemas/settings';
import type { PriceQuote } from '../api/types';
import type { Holding } from '../schemas/holding';
import { buildPriceLookupKey, fetchPriceSnapshot } from '../api/prices';

function getClientRefreshIntervalMs(refreshMs: number) {
  return Math.min(refreshMs, Math.max(5_000, Math.floor(refreshMs / 3)));
}

export function usePrices(
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market' | 'assetType'>[],
  settings: Settings
): Record<string, PriceQuote | undefined> {
  const refreshMs = settings.refreshIntervalSec * 1000;
  const query = useQuery({
    queryKey: ['price', 'snapshot'] as const,
    queryFn: fetchPriceSnapshot,
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

  return Object.fromEntries(
    symbols.map((symbol) => [symbol, quotesBySymbol.get(symbol)])
  );
}
