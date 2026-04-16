import { useQueries } from '@tanstack/react-query';
import type { Settings } from '../schemas/settings';
import { getFxProvider } from '../api/fx';

export type FxLookup = (from: string, to: string) => number | undefined;

export function useFxRates(
  pairs: Array<[from: string, to: string]>,
  settings: Settings
): FxLookup {
  // Deduplicate pairs
  const uniquePairs = Array.from(
    new Map(pairs.map((p) => [`${p[0]}:${p[1]}`, p])).values()
  );
  const refreshMs = settings.refreshIntervalSec * 1000;

  const provider = getFxProvider(settings.fxProvider);

  const results = useQueries({
    queries: uniquePairs.map(([from, to]) => ({
      queryKey: ['fx', settings.fxProvider, from, to] as const,
      queryFn: async () => {
        const rate = await provider.getRate(from, to);
        return rate;
      },
      staleTime: refreshMs,
      refetchInterval: refreshMs,
      refetchIntervalInBackground: true,
      gcTime: 60 * 60 * 1000,
    })),
  });

  const rateMap = new Map<string, number>();
  uniquePairs.forEach(([from, to], i) => {
    const data = results[i]?.data;
    if (data != null) {
      rateMap.set(`${from}:${to}`, data);
    }
  });

  return (from: string, to: string): number | undefined => {
    if (from === to) return 1;
    return rateMap.get(`${from}:${to}`);
  };
}
