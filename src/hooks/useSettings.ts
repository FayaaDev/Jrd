import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { getApiErrorMessage, portfolioQueryKey, saveSettings } from '../api/portfolio';
import { useAdminSession } from './useAdminSession';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

interface UseSettingsMeta {
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  errorMessage?: string;
}

export function useSettings(): [Settings, (s: Settings) => void, UseSettingsMeta] {
  const queryClient = useQueryClient();
  const { token, isUnlocked } = useAdminSession();
  const portfolioQuery = usePortfolioSnapshot();
  const settings = portfolioQuery.data?.settings ?? SettingsSchema.parse({});

  const mutation = useMutation({
    mutationFn: (next: Settings) => saveSettings(next, token),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(portfolioQueryKey, snapshot);
    },
    onError: (error) => {
      window.alert(getApiErrorMessage(error, 'Unable to update settings.'));
    },
  });

  const setSettings = useCallback((next: Settings) => {
    mutation.mutate(next);
  }, [mutation]);

  return [
    settings,
    setSettings,
    {
      canEdit: isUnlocked,
      isLoading: portfolioQuery.isPending,
      isSaving: mutation.isPending,
      errorMessage: portfolioQuery.error
        ? getApiErrorMessage(portfolioQuery.error, 'Unable to load settings.')
        : undefined,
    },
  ];
}
