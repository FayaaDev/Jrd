import { createAuthClient } from 'better-auth/react';

export type AppRole = 'user' | 'admin';

export interface AuthSession {
  user: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    role?: AppRole;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_BASE_URL,
  sessionOptions: {
    refetchOnWindowFocus: true,
  },
});

export function getSessionRole(session: unknown): AppRole {
  if (typeof session === 'object' && session !== null && 'user' in session) {
    const role = (session as { user?: { role?: unknown } }).user?.role;
    return role === 'admin' ? 'admin' : 'user';
  }

  return 'user';
}

export function isAdminSession(session: unknown) {
  return getSessionRole(session) === 'admin';
}
