import { useQueryClient } from '@tanstack/react-query';
import { useHoldings } from './useHoldings';
import { useSettings } from './useSettings';
import { usePrices } from './usePrices';
import { useFxRates } from './useFxRates';
import { deriveRow, derivePortfolio } from '../lib/metrics';
import type { HoldingRow, PortfolioSummary } from '../lib/metrics';
import type { Settings } from '../schemas/settings';

export function usePortfolio(): {
  rows: HoldingRow[];
  summary: PortfolioSummary;
  settings: Settings;
  isFetching: boolean;
  lastUpdated: string | undefined;
  refresh: () => void;
} {
  const [settings] = useSettings();
  const { holdings } = useHoldings();
  const queryClient = useQueryClient();

  const symbols = [...new Set(holdings.map((h) => h.symbol))];

  // Build FX pairs needed: costCurrency -> base and quoteCurrency -> base
  const fxPairsMap = new Map<string, [string, string]>();
  for (const h of holdings) {
    const base = settings.baseCurrency;
    if (h.costCurrency !== base) {
      fxPairsMap.set(`${h.costCurrency}:${base}`, [h.costCurrency, base]);
    }
    if (h.quoteCurrency !== base) {
      fxPairsMap.set(`${h.quoteCurrency}:${base}`, [h.quoteCurrency, base]);
    }
  }
  const fxPairs = Array.from(fxPairsMap.values());

  const prices = usePrices(symbols, holdings, settings);
  const fxLookup = useFxRates(fxPairs, settings);

  // Determine if any price query is currently fetching
  const cache = queryClient.getQueryCache();
  const isFetching = cache
    .getAll()
    .some(
      (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === 'price' &&
        q.state.fetchStatus === 'fetching'
    );

  // Find most recent price update timestamp
  let lastTimestamp: number | undefined;
  for (const symbol of symbols) {
    const q = cache.find({ queryKey: ['price', settings.priceProvider, symbol] });
    if (q?.state.dataUpdatedAt) {
      const t = q.state.dataUpdatedAt;
      if (lastTimestamp === undefined || t > lastTimestamp) {
        lastTimestamp = t;
      }
    }
  }

  // Format as ISO string for fmtAge
  const lastUpdated =
    lastTimestamp != null ? new Date(lastTimestamp).toISOString() : undefined;

  const rows = holdings.map((h) =>
    deriveRow(h, prices[h.symbol], fxLookup, settings.baseCurrency)
  );

  const summary = derivePortfolio(rows);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['price'] });
  };

  return { rows, summary, settings, isFetching, lastUpdated, refresh };
}
