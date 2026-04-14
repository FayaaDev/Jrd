import { useState, useCallback } from 'react';
import type { WatchItem } from '../schemas/watchlist';
import { loadWatchlist, saveWatchlist } from '../lib/storage';
import { nanoid } from '../lib/id';

type AddWatchItemInput = Pick<WatchItem, 'symbol' | 'quoteCurrency'> & { name?: string };

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>(() => loadWatchlist());

  const addWatchItem = useCallback((input: AddWatchItemInput) => {
    const item: WatchItem = {
      id: nanoid(),
      symbol: input.symbol,
      quoteCurrency: input.quoteCurrency,
      name: input.name,
      addedAt: new Date().toISOString(),
    };
    setWatchlist((prev) => {
      const next = [...prev, item];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const removeWatchItem = useCallback((symbol: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((w) => w.symbol !== symbol);
      saveWatchlist(next);
      return next;
    });
  }, []);

  return { watchlist, addWatchItem, removeWatchItem };
}
