import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { verifyAdminToken } from '../api/portfolio';
import {
  AdminSessionContext,
  TOKEN_STORAGE_KEY,
  getStoredAdminToken,
  type AdminSessionContextValue,
} from './adminSession';

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [isChecking, setIsChecking] = useState(() => getStoredAdminToken() !== null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    verifyAdminToken(token)
      .catch(() => {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        if (!cancelled) {
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const unlock = useCallback(async (nextToken: string) => {
    await verifyAdminToken(nextToken);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setIsChecking(false);
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setIsChecking(false);
  }, []);

  const value = useMemo<AdminSessionContextValue>(() => ({
    token,
    isUnlocked: Boolean(token),
    isChecking,
    unlock,
    lock,
  }), [isChecking, lock, token, unlock]);

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
