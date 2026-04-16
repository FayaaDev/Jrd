import { createContext } from 'react';

export interface AdminSessionContextValue {
  token: string | null;
  isUnlocked: boolean;
  isChecking: boolean;
  unlock: (token: string) => Promise<void>;
  lock: () => void;
}

export const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export const TOKEN_STORAGE_KEY = 'fayafolio:admin-token';

export function getStoredAdminToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}
