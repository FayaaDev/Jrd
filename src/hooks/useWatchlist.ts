import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WatchItem } from '../schemas/watchlist';
import {
  createWatchItem,
  getApiErrorMessage,
  type PortfolioLedger,
  type PortfolioScope,
  ME_PORTFOLIO_SCOPE,
  portfolioQueryKey,
  removeWatchItem as removeWatchItemRequest,
} from '../api/portfolio';
import { priceSnapshotQueryKey } from '../api/prices';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

type AddWatchItemInput = Pick<WatchItem, 'symbol' | 'quoteCurrency'> & { name?: string };

export function useWatchlist(scope: PortfolioScope = ME_PORTFOLIO_SCOPE) {
  const queryClient = useQueryClient();
  const portfolioQuery = usePortfolioSnapshot(scope);

  const syncWatchlist = useCallback(
    (ledger: PortfolioLedger) => {
      queryClient.setQueryData(portfolioQueryKey(scope), ledger);
      void queryClient.invalidateQueries({ queryKey: priceSnapshotQueryKey(scope) });
    },
    [queryClient, scope],
  );

  const reportMutationError = useCallback((error: unknown) => {
    window.alert(
      getApiErrorMessage(
        error,
        scope.kind === 'me' ? 'Unable to update your watchlist.' : 'Unable to update this watchlist.',
      ),
    );
  }, [scope.kind]);

  const addMutation = useMutation({
    mutationFn: (input: AddWatchItemInput) => createWatchItem(input, scope),
    onSuccess: syncWatchlist,
    onError: reportMutationError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeWatchItemRequest(id, scope),
    onSuccess: syncWatchlist,
    onError: reportMutationError,
  });

  const addWatchItem = useCallback((input: AddWatchItemInput) => {
    addMutation.mutate(input);
  }, [addMutation]);

  const removeWatchItem = useCallback((symbol: string) => {
    const item = portfolioQuery.data?.watchlist.find((entry) => entry.symbol === symbol);
    if (!item) {
      return;
    }

    removeMutation.mutate(item.id);
  }, [portfolioQuery.data?.watchlist, removeMutation]);

  return {
    watchlist: portfolioQuery.data?.watchlist ?? [],
    addWatchItem,
    removeWatchItem,
    canEdit: scope.kind === 'admin' || portfolioQuery.data?.status === 'active',
    isLoading: portfolioQuery.isPending,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(
          portfolioQuery.error,
          scope.kind === 'me' ? 'Unable to load your watchlist.' : 'Unable to load this watchlist.',
        )
      : undefined,
    isSaving: addMutation.isPending || removeMutation.isPending,
  };
}
