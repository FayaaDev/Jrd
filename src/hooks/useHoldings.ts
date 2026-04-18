import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Holding } from '../schemas/holding';
import {
  createHolding,
  editHolding,
  getApiErrorMessage,
  type PortfolioLedger,
  type PortfolioScope,
  ME_PORTFOLIO_SCOPE,
  portfolioQueryKey,
  removeHolding,
} from '../api/portfolio';
import { priceSnapshotQueryKey } from '../api/prices';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

type AddHoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;

export function useHoldings(scope: PortfolioScope = ME_PORTFOLIO_SCOPE) {
  const queryClient = useQueryClient();
  const portfolioQuery = usePortfolioSnapshot(scope);

  const syncHoldings = useCallback(
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
        scope.kind === 'me' ? 'Unable to update your portfolio.' : 'Unable to update this portfolio.',
      ),
    );
  }, [scope.kind]);

  const addMutation = useMutation({
    mutationFn: (input: AddHoldingInput) => createHolding(input, scope),
    onSuccess: syncHoldings,
    onError: reportMutationError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Holding, 'id' | 'createdAt'>> }) =>
      editHolding(id, updates, scope),
    onSuccess: syncHoldings,
    onError: reportMutationError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeHolding(id, scope),
    onSuccess: syncHoldings,
    onError: reportMutationError,
  });

  const addHolding = useCallback((input: AddHoldingInput) => {
    addMutation.mutate(input);
  }, [addMutation]);

  const updateHolding = useCallback((id: string, updates: Partial<Omit<Holding, 'id' | 'createdAt'>>) => {
    updateMutation.mutate({ id, updates });
  }, [updateMutation]);

  const deleteHolding = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  return {
    holdings: portfolioQuery.data?.holdings ?? [],
    addHolding,
    updateHolding,
    deleteHolding,
    canEdit: scope.kind === 'admin' || portfolioQuery.data?.status === 'active',
    isLoading: portfolioQuery.isPending,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(
          portfolioQuery.error,
          scope.kind === 'me' ? 'Unable to load holdings.' : 'Unable to load holdings for this portfolio.',
        )
      : undefined,
    isSaving: addMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
