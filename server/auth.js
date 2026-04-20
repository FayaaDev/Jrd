import './env.js';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { pool } from './db.js';
import { createBlankLedgerForUser } from './store.js';

const DEFAULT_AUTH_URL = 'http://127.0.0.1:5173';
const DEFAULT_AUTH_SECRET = 'better-auth-secret-12345678901234567890';

const socialProviders =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          prompt: 'select_account',
        },
      }
    : {};

export const auth = betterAuth({
  appName: 'Fayafolio',
  baseURL: process.env.BETTER_AUTH_URL ?? DEFAULT_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
  database: pool,
  socialProviders,
  plugins: [
    dash({
      // Required for Better Auth Dashboard integration.
      apiKey: process.env.BETTER_AUTH_API_KEY,
      // Only set these when explicitly configured; passing `undefined` overrides
      // the plugin defaults and breaks JWT verification.
      ...(process.env.BETTER_AUTH_API_URL ? { apiUrl: process.env.BETTER_AUTH_API_URL } : {}),
      ...(process.env.BETTER_AUTH_KV_URL ? { kvUrl: process.env.BETTER_AUTH_KV_URL } : {}),
    }),
  ],
  user: {
    additionalFields: {
      role: {
        type: ['user', 'admin'],
        required: false,
        defaultValue: 'user',
        input: false,
      },
    },
  },
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createBlankLedgerForUser(user.id);
        },
      },
    },
  },
  telemetry: {
    enabled: false,
  },
});

export async function initAuthSchema() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

export async function getSessionFromRequest(req) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
}

export function isAdminSession(session) {
  return session?.user?.role === 'admin';
}
