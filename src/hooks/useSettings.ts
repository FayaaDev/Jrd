import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { getApiErrorMessage, type PortfolioScope, ME_PORTFOLIO_SCOPE, portfolioQueryKey, saveSettings } from '../api/portfolio';
import { priceSnapshotQueryKey } from '../api/prices';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

interface UseSettingsMeta {
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  errorMessage?: string;
}

export function useSettings(scope: PortfolioScope = ME_PORTFOLIO_SCOPE): [Settings, (settings: Settings) => void, UseSettingsMeta] {
  const queryClient = useQueryClient();
  const portfolioQuery = usePortfolioSnapshot(scope);
  const settings = portfolioQuery.data?.settings ?? SettingsSchema.parse({});

  const mutation = useMutation({
    mutationFn: (next: Settings) => saveSettings(next, scope),
    onSuccess: (ledger) => {
      queryClient.setQueryData(portfolioQueryKey(scope), ledger);
      void queryClient.invalidateQueries({ queryKey: priceSnapshotQueryKey(scope) });
    },
    onError: (error) => {
      window.alert(
        getApiErrorMessage(
          error,
          scope.kind === 'me' ? 'Unable to update settings.' : 'Unable to update settings for this portfolio.',
        ),
      );
    },
  });

  const setSettings = useCallback((next: Settings) => {
    mutation.mutate(next);
  }, [mutation]);

  return [
    settings,
    setSettings,
    {
      canEdit: scope.kind === 'admin' || portfolioQuery.data?.status === 'active',
      isLoading: portfolioQuery.isPending,
      isSaving: mutation.isPending,
      errorMessage: portfolioQuery.error
        ? getApiErrorMessage(
            portfolioQuery.error,
            scope.kind === 'me' ? 'Unable to load settings.' : 'Unable to load settings for this portfolio.',
          )
        : undefined,
    },
  ];
}
