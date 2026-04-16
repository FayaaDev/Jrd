import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Holding } from '../schemas/holding';
import {
  createHolding,
  editHolding,
  getApiErrorMessage,
  type PortfolioSnapshot,
  portfolioQueryKey,
  removeHolding,
} from '../api/portfolio';
import { useAdminSession } from './useAdminSession';
import { usePortfolioSnapshot } from './usePortfolioSnapshot';

type AddHoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;

export function useHoldings() {
  const queryClient = useQueryClient();
  const { token, isUnlocked } = useAdminSession();
  const portfolioQuery = usePortfolioSnapshot();

  const syncHoldings = useCallback((snapshot: PortfolioSnapshot) => {
    queryClient.setQueryData(portfolioQueryKey, snapshot);
    void queryClient.invalidateQueries({ queryKey: ['price'] });
  }, [queryClient]);

  const reportMutationError = useCallback((error: unknown) => {
    window.alert(getApiErrorMessage(error, 'Unable to update the shared portfolio.'));
  }, []);

  const addMutation = useMutation({
    mutationFn: (input: AddHoldingInput) => createHolding(input, token),
    onSuccess: syncHoldings,
    onError: reportMutationError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Holding, 'id' | 'createdAt'>> }) =>
      editHolding(id, updates, token),
    onSuccess: syncHoldings,
    onError: reportMutationError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeHolding(id, token),
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
    canEdit: isUnlocked,
    isLoading: portfolioQuery.isPending,
    errorMessage: portfolioQuery.error
      ? getApiErrorMessage(portfolioQuery.error, 'Unable to load holdings.')
      : undefined,
    isSaving: addMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
