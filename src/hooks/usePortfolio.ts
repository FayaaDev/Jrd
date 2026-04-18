import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { useFxRates } from './useFxRates';
import { usePrices } from './usePrices';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';
import { derivePortfolio, deriveRow, type HoldingRow, type PortfolioSummary } from '../lib/metrics';
import { refreshPriceSnapshot, priceSnapshotQueryKey } from '../api/prices';
import { getApiErrorMessage, ME_PORTFOLIO_SCOPE, type PortfolioScope } from '../api/portfolio';
import { SettingsSchema, type Settings } from '../schemas/settings';

export function usePortfolio(
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): {
  rows: HoldingRow[];
  summary: PortfolioSummary;
  settings: Settings;
  isArchived: boolean;
  isFetching: boolean;
  isLoading: boolean;
  lastUpdated: string | undefined;
  errorMessage?: string;
  priceErrorMessage?: string;
  quoteErrors: Record<string, string>;
  lastAttemptedAt: string | undefined;
  canRefreshMarkets: boolean;
  refresh: () => void;
} {
  const sessionQuery = authClient.useSession();
  const portfolioQuery = usePortfolioSnapshot(scope);
  const settings = portfolioQuery.data?.settings ?? SettingsSchema.parse({});
  const holdings = portfolioQuery.data?.holdings ?? [];
  const queryClient = useQueryClient();
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | undefined>();

  const symbols = [...new Set(holdings.map((holding) => holding.symbol))];

  const marketPriceCurrency: Record<string, string> = {
    XNAS: 'USD',
    XNYS: 'USD',
    ARCX: 'USD',
    BATS: 'USD',
    IEXG: 'USD',
    XASX: 'AUD',
    XSAU: 'SAR',
    CRYPTO: 'USD',
  };

  const fxPairsMap = new Map<string, [string, string]>();
  for (const holding of holdings) {
    const base = settings.baseCurrency;
    if (holding.costCurrency !== base) {
      fxPairsMap.set(`${holding.costCurrency}:${base}`, [holding.costCurrency, base]);
    }
    if (holding.quoteCurrency !== base) {
      fxPairsMap.set(`${holding.quoteCurrency}:${base}`, [holding.quoteCurrency, base]);
    }

    const providerCurrency = marketPriceCurrency[holding.market.toUpperCase()];
    if (providerCurrency && providerCurrency !== base) {
      fxPairsMap.set(`${providerCurrency}:${base}`, [providerCurrency, base]);
    }
  }

  const fxPairs = Array.from(fxPairsMap.values());
  const prices = usePrices(scope, symbols, holdings, settings);
  const fxLookup = useFxRates(fxPairs, settings);
  const lastUpdated = prices.snapshot?.lastSuccessfulAt ?? prices.snapshot?.updatedAt;

  const rows = holdings.map((holding) =>
    deriveRow(holding, prices.prices[holding.symbol], fxLookup, settings.baseCurrency),
  );

  const summary = derivePortfolio(rows);

  const refresh = () => {
    void refreshPriceSnapshot(scope)
      .then((snapshot) => {
        setRefreshErrorMessage(undefined);
        queryClient.setQueryData(priceSnapshotQueryKey(scope), snapshot);
      })
      .catch((error) => {
        setRefreshErrorMessage(getApiErrorMessage(error, 'Unable to refresh live quotes.'));
      });
  };

  return {
    rows,
    summary,
    settings,
    isArchived: portfolioQuery.data?.status === 'archived',
    isFetching: prices.isFetching,
    isLoading: portfolioQuery.isPending,
    lastUpdated,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(
          portfolioQuery.error,
          scope.kind === 'me' ? 'Unable to load your portfolio.' : 'Unable to load this portfolio.',
        )
      : undefined,
    priceErrorMessage: refreshErrorMessage ?? prices.errorMessage,
    quoteErrors: prices.snapshot?.errors ?? {},
    lastAttemptedAt: prices.snapshot?.lastAttemptedAt,
    canRefreshMarkets: Boolean(sessionQuery.data),
    refresh,
  };
}
