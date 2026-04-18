import { useQueryClient } from '@tanstack/react-query';
import { usePrices } from './usePrices';
import { useFxRates } from './useFxRates';
import { deriveRow, derivePortfolio } from '../lib/metrics';
import type { HoldingRow, PortfolioSummary } from '../lib/metrics';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { getApiErrorMessage } from '../api/portfolio';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';
import { refreshPriceSnapshot } from '../api/prices';

export function usePortfolio(): {
  rows: HoldingRow[];
  summary: PortfolioSummary;
  settings: Settings;
  isFetching: boolean;
  isLoading: boolean;
  lastUpdated: string | undefined;
  errorMessage?: string;
  refresh: () => void;
} {
  const portfolioQuery = usePortfolioSnapshot();
  const settings = portfolioQuery.data?.settings ?? SettingsSchema.parse({});
  const holdings = portfolioQuery.data?.holdings ?? [];
  const queryClient = useQueryClient();

  const symbols = [...new Set(holdings.map((h) => h.symbol))];

  // Price providers return a specific currency per market that may differ from
  // h.quoteCurrency (e.g. Alpaca always returns USD regardless of what the LLM
  // stored as quoteCurrency). We pre-fetch that pair so deriveRow never gets NaN.
  const MARKET_PRICE_CURRENCY: Record<string, string> = {
    XNAS: 'USD', XNYS: 'USD', ARCX: 'USD', BATS: 'USD', IEXG: 'USD', XASX: 'AUD',
    XSAU: 'SAR',
    CRYPTO: 'USD',
  };

  const fxPairsMap = new Map<string, [string, string]>();
  for (const h of holdings) {
    const base = settings.baseCurrency;
    if (h.costCurrency !== base) {
      fxPairsMap.set(`${h.costCurrency}:${base}`, [h.costCurrency, base]);
    }
    if (h.quoteCurrency !== base) {
      fxPairsMap.set(`${h.quoteCurrency}:${base}`, [h.quoteCurrency, base]);
    }
    // Also pre-fetch the currency the price provider will actually return
    const providerCurrency = MARKET_PRICE_CURRENCY[h.market.toUpperCase()];
    if (providerCurrency && providerCurrency !== base) {
      fxPairsMap.set(`${providerCurrency}:${base}`, [providerCurrency, base]);
    }
  }
  const fxPairs = Array.from(fxPairsMap.values());

  const prices = usePrices(symbols, holdings, settings);
  const fxLookup = useFxRates(fxPairs, settings);

  const priceQueryState = queryClient.getQueryState(['price', 'snapshot']);
  const isFetching = priceQueryState?.fetchStatus === 'fetching';
  const lastUpdated =
    typeof priceQueryState?.data === 'object' &&
    priceQueryState.data != null &&
    'updatedAt' in priceQueryState.data &&
    typeof priceQueryState.data.updatedAt === 'string'
      ? priceQueryState.data.updatedAt
      : undefined;

  const rows = holdings.map((h) =>
    deriveRow(h, prices[h.symbol], fxLookup, settings.baseCurrency)
  );

  const summary = derivePortfolio(rows);

  const refresh = () => {
    void refreshPriceSnapshot()
      .then((snapshot) => {
        queryClient.setQueryData(['price', 'snapshot'], snapshot);
      })
      .catch(() => {
        // Keep the existing snapshot if a manual refresh fails.
      });
  };

  return {
    rows,
    summary,
    settings,
    isFetching,
    isLoading: portfolioQuery.isPending,
    lastUpdated,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(portfolioQuery.error, 'Unable to load the shared portfolio.')
      : undefined,
    refresh,
  };
}
