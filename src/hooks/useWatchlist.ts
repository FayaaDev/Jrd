import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WatchItem } from '../schemas/watchlist';
import {
  createWatchItem,
  getApiErrorMessage,
  type PortfolioSnapshot,
  portfolioQueryKey,
  removeWatchItem as removeWatchItemRequest,
} from '../api/portfolio';
import { useAdminSession } from './useAdminSession';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

type AddWatchItemInput = Pick<WatchItem, 'symbol' | 'quoteCurrency'> & { name?: string };

export function useWatchlist() {
  const queryClient = useQueryClient();
  const { token, isUnlocked } = useAdminSession();
  const portfolioQuery = usePortfolioSnapshot();

  const syncWatchlist = useCallback((snapshot: PortfolioSnapshot) => {
    queryClient.setQueryData(portfolioQueryKey, snapshot);
    void queryClient.invalidateQueries({ queryKey: ['price'] });
  }, [queryClient]);

  const reportMutationError = useCallback((error: unknown) => {
    window.alert(getApiErrorMessage(error, 'Unable to update the watchlist.'));
  }, []);

  const addMutation = useMutation({
    mutationFn: (input: AddWatchItemInput) => createWatchItem(input, token),
    onSuccess: syncWatchlist,
    onError: reportMutationError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeWatchItemRequest(id, token),
    onSuccess: syncWatchlist,
    onError: reportMutationError,
  });

  const addWatchItem = useCallback((input: AddWatchItemInput) => {
    addMutation.mutate(input);
  }, [addMutation]);

  const removeWatchItem = useCallback((symbol: string) => {
    const item = portfolioQuery.data?.watchlist.find((entry) => entry.symbol === symbol);
    if (!item) return;
    removeMutation.mutate(item.id);
  }, [portfolioQuery.data?.watchlist, removeMutation]);

  return {
    watchlist: portfolioQuery.data?.watchlist ?? [],
    addWatchItem,
    removeWatchItem,
    canEdit: isUnlocked,
    isLoading: portfolioQuery.isPending,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(portfolioQuery.error, 'Unable to load the watchlist.')
      : undefined,
    isSaving: addMutation.isPending || removeMutation.isPending,
  };
}
