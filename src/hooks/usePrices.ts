import { useQueries } from '@tanstack/react-query';
import type { Settings } from '../schemas/settings';
import type { PriceQuote } from '../api/types';
import type { Holding } from '../schemas/holding';
import { getPriceProvider, getProviderForHolding } from '../api/prices';

export function usePrices(
  symbols: string[],
  holdings: Pick<Holding, 'symbol' | 'market' | 'assetType'>[],
  settings: Settings
): Record<string, PriceQuote | undefined> {
  const holdingBySymbol = new Map<string, Pick<Holding, 'assetType' | 'market'>>(
    holdings.map((holding) => [holding.symbol, { assetType: holding.assetType, market: holding.market }])
  );
  const refreshMs = settings.refreshIntervalSec * 1000;

  const results = useQueries({
    queries: symbols.map((symbol) => {
      const holding = holdingBySymbol.get(symbol);
      const providerName = holding ? getProviderForHolding(holding) : 'snapshot';
      const enabled = providerName !== 'snapshot';

      return {
        queryKey: ['price', settings.priceProvider, holding?.market ?? 'unknown', symbol] as const,
        enabled,
        queryFn: async () => {
          if (!holding || providerName === 'snapshot') return null;

          const provider = getPriceProvider(providerName);
          const quotes = await provider.getQuotes([symbol]);
          return quotes[0] ?? null;
        },
        staleTime: refreshMs,
        refetchInterval: enabled ? refreshMs : false,
        refetchIntervalInBackground: true,
        gcTime: 5 * 60 * 1000,
        retry: 1,
      };
    }),
  });

  return Object.fromEntries(
    symbols.map((symbol, i) => [symbol, results[i]?.data ?? undefined])
  );
}
