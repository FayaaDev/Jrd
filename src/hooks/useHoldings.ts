import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Holding } from '../schemas/holding';
import { loadHoldings, saveHoldings } from '../lib/storage';
import { nanoid } from '../lib/id';

type AddHoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings());
  const queryClient = useQueryClient();

  const addHolding = useCallback(
    (input: AddHoldingInput) => {
      const now = new Date().toISOString();
      const holding: Holding = {
        ...input,
        id: nanoid(),
        createdAt: now,
        updatedAt: now,
      };
      setHoldings((prev) => {
        const next = [...prev, holding];
        saveHoldings(next);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['price'] });
    },
    [queryClient]
  );

  const updateHolding = useCallback(
    (id: string, updates: Partial<Omit<Holding, 'id' | 'createdAt'>>) => {
      setHoldings((prev) => {
        const next = prev.map((h) =>
          h.id === id
            ? { ...h, ...updates, updatedAt: new Date().toISOString() }
            : h
        );
        saveHoldings(next);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['price'] });
    },
    [queryClient]
  );

  const deleteHolding = useCallback(
    (id: string) => {
      setHoldings((prev) => {
        const next = prev.filter((h) => h.id !== id);
        saveHoldings(next);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['price'] });
    },
    [queryClient]
  );

  return { holdings, addHolding, updateHolding, deleteHolding };
}
