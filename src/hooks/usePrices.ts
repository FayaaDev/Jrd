import { useQueries } from '@tanstack/react-query';
import type { Settings } from '../schemas/settings';
import type { PriceQuote } from '../api/types';
import type { Holding } from '../schemas/holding';
import { getPriceProvider, getProviderForMarket } from '../api/prices';

export function usePrices(
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market'>[],
  settings: Settings
): Record<string, PriceQuote | undefined> {
  const marketBySymbol = new Map<string, string>(holdings.map((holding) => [holding.symbol, holding.market]));

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['price', settings.priceProvider, marketBySymbol.get(symbol) ?? 'unknown', symbol] as const,
      queryFn: async () => {
        const market = marketBySymbol.get(symbol);
        if (!market) return null;

        const providerName = getProviderForMarket(market);
        if (providerName === 'snapshot') return null;

        const provider = getPriceProvider(providerName);
        const quotes = await provider.getQuotes([symbol]);
        return quotes[0] ?? null;
      },
      staleTime: settings.refreshIntervalSec * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  return Object.fromEntries(
    symbols.map((symbol, i) => [symbol, results[i]?.data ?? undefined])
  );
}
