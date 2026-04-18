import { z } from 'zod';
import { HoldingSchema, type Holding } from '../schemas/holding';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { WatchItemSchema, type WatchItem } from '../schemas/watchlist';
import { apiPath } from './base';
import { authedFetch } from './http';

export const PortfolioStatusSchema = z.enum(['active', 'archived']);

export const PortfolioScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('me') }),
  z.object({ kind: z.literal('admin'), userId: z.string().min(1) }),
]);

const MessageSchema = z.object({
  message: z.string(),
});

const OwnerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PortfolioLedgerSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  status: PortfolioStatusSchema,
  holdings: z.array(HoldingSchema),
  settings: SettingsSchema,
  watchlist: z.array(WatchItemSchema),
  archivedAt: z.string().nullable().optional(),
  archivedByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: OwnerSchema.optional(),
});

export const AdminSummarySchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeLedgers: z.number().int().nonnegative(),
  archivedLedgers: z.number().int().nonnegative(),
  missingLedgers: z.number().int().nonnegative(),
});

export const AdminUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  createdAt: z.string(),
  updatedAt: z.string(),
  hasLedger: z.boolean(),
  ledgerStatus: PortfolioStatusSchema.nullable(),
});

export const AdminPortfolioSummarySchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  userCreatedAt: z.string(),
  ledgerId: z.string().nullable(),
  status: PortfolioStatusSchema.nullable(),
  updatedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  hasLedger: z.boolean(),
  holdingsCount: z.number().int().nonnegative(),
  watchlistCount: z.number().int().nonnegative(),
});

export type PortfolioScope = z.infer<typeof PortfolioScopeSchema>;
export type PortfolioLedger = z.infer<typeof PortfolioLedgerSchema>;
export type AdminSummary = z.infer<typeof AdminSummarySchema>;
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type AdminPortfolioSummary = z.infer<typeof AdminPortfolioSummarySchema>;
export type HoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;
export type HoldingUpdate = Partial<HoldingInput>;
export type WatchItemInput = Pick<WatchItem, 'symbol' | 'quoteCurrency'> & { name?: string };

export const ME_PORTFOLIO_SCOPE = { kind: 'me' } as const satisfies PortfolioScope;

export function portfolioQueryKey(scope: PortfolioScope = ME_PORTFOLIO_SCOPE) {
  return scope.kind === 'me'
    ? (['me', 'portfolio'] as const)
    : (['admin', 'portfolio', scope.userId] as const);
}

function buildPortfolioPath(scope: PortfolioScope, suffix = '') {
  return scope.kind === 'me'
    ? `/me/portfolio${suffix}`
    : `/admin/portfolios/${scope.userId}${suffix}`;
}

async function parseResponseError(response: Response): Promise<Error> {
  try {
    const json = await response.json();
    const parsed = MessageSchema.safeParse(json);
    if (parsed.success) {
      return new Error(parsed.data.message);
    }
  } catch {
    // Ignore malformed error bodies and fall back to the status text.
  }

  return new Error(response.statusText || `HTTP ${response.status}`);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await authedFetch(apiPath(path), init)
  if (!response.ok) {
    throw await parseResponseError(response)
  }

  return response
}

function buildJsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function fetchPortfolio(scope: PortfolioScope = ME_PORTFOLIO_SCOPE): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function saveSettings(
  settings: Settings,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, '/settings'), buildJsonRequest('PUT', settings));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function createHolding(
  input: HoldingInput,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, '/holdings'), buildJsonRequest('POST', input));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function editHolding(
  id: string,
  updates: HoldingUpdate,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, `/holdings/${id}`), buildJsonRequest('PATCH', updates));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function removeHolding(
  id: string,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, `/holdings/${id}`), {
    method: 'DELETE',
  });
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function createWatchItem(
  input: WatchItemInput,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, '/watchlist'), buildJsonRequest('POST', input));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function removeWatchItem(
  id: string,
  scope: PortfolioScope = ME_PORTFOLIO_SCOPE,
): Promise<PortfolioLedger> {
  const response = await request(buildPortfolioPath(scope, `/watchlist/${id}`), {
    method: 'DELETE',
  });
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function exportPortfolio(): Promise<string> {
  const response = await request('/me/portfolio/export');
  return response.text();
}

export async function exportAdminPortfolio(userId: string): Promise<string> {
  const response = await request(`/admin/portfolios/${userId}/export`);
  return response.text();
}

export async function importPortfolio(json: string): Promise<PortfolioLedger> {
  const response = await request('/me/portfolio/import', buildJsonRequest('POST', { json }));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function resetPortfolio(): Promise<PortfolioLedger> {
  const response = await request('/me/portfolio/reset', buildJsonRequest('POST', {}));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const response = await request('/admin/summary');
  return AdminSummarySchema.parse(await response.json());
}

export async function fetchAdminUsers(search = ''): Promise<AdminUser[]> {
  const response = await request(`/admin/users?q=${encodeURIComponent(search)}`);
  return z.array(AdminUserSchema).parse(await response.json());
}

export async function fetchAdminUser(userId: string): Promise<AdminUser> {
  const response = await request(`/admin/users/${userId}`);
  return AdminUserSchema.parse(await response.json());
}

export async function fetchAdminPortfolios(options?: {
  q?: string;
  status?: 'active' | 'archived';
}): Promise<AdminPortfolioSummary[]> {
  const searchParams = new URLSearchParams();
  if (options?.q) {
    searchParams.set('q', options.q);
  }
  if (options?.status) {
    searchParams.set('status', options.status);
  }

  const suffix = searchParams.toString();
  const response = await request(`/admin/portfolios${suffix ? `?${suffix}` : ''}`);
  return z.array(AdminPortfolioSummarySchema).parse(await response.json());
}

export async function createOrRecreateAdminLedger(userId: string): Promise<PortfolioLedger> {
  const response = await request(`/admin/portfolios/${userId}/create`, buildJsonRequest('POST', {}));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function archiveAdminLedger(userId: string): Promise<PortfolioLedger> {
  const response = await request(`/admin/portfolios/${userId}/archive`, buildJsonRequest('POST', {}));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function restoreAdminLedger(userId: string): Promise<PortfolioLedger> {
  const response = await request(`/admin/portfolios/${userId}/restore`, buildJsonRequest('POST', {}));
  return PortfolioLedgerSchema.parse(await response.json());
}

export async function deleteAdminLedger(userId: string): Promise<void> {
  await request(`/admin/portfolios/${userId}`, {
    method: 'DELETE',
  });
}

export async function fetchFxRate(from: string, to: string): Promise<number> {
  const response = await request(`/fx/rate?from=${from}&to=${to}`);
  const json = await response.json();
  return z.object({ rate: z.number() }).parse(json).rate;
}
