import { z } from 'zod';
import { HoldingSchema, type Holding } from '../schemas/holding';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { WatchItemSchema, type WatchItem } from '../schemas/watchlist';
import { apiPath } from './base';

export const portfolioQueryKey = ['portfolio'] as const;

export const PortfolioSnapshotSchema = z.object({
  holdings: z.array(HoldingSchema),
  settings: SettingsSchema,
  watchlist: z.array(WatchItemSchema),
});

const MessageSchema = z.object({
  message: z.string(),
});

const FxRateResponseSchema = z.object({
  rate: z.number(),
});

export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type HoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;
export type HoldingUpdate = Partial<HoldingInput>;
export type WatchItemInput = Pick<WatchItem, 'symbol' | 'quoteCurrency'> & { name?: string };

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
  const response = await fetch(apiPath(path), init);
  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return response;
}

function buildJsonRequest(method: string, body: unknown, token?: string | null): RequestInit {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return {
    method,
    headers,
    body: JSON.stringify(body),
  };
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function fetchPortfolio(): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio');
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function verifyAdminToken(token: string): Promise<void> {
  await request('/admin/session', buildJsonRequest('POST', { token }));
}

export async function saveSettings(settings: Settings, token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio/settings', buildJsonRequest('PUT', settings, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function createHolding(input: HoldingInput, token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio/holdings', buildJsonRequest('POST', input, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function editHolding(id: string, updates: HoldingUpdate, token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request(`/portfolio/holdings/${id}`, buildJsonRequest('PATCH', updates, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function removeHolding(id: string, token?: string | null): Promise<PortfolioSnapshot> {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await request(`/portfolio/holdings/${id}`, {
    method: 'DELETE',
    headers,
  });
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function createWatchItem(input: WatchItemInput, token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio/watchlist', buildJsonRequest('POST', input, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function removeWatchItem(id: string, token?: string | null): Promise<PortfolioSnapshot> {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await request(`/portfolio/watchlist/${id}`, {
    method: 'DELETE',
    headers,
  });
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function exportPortfolio(): Promise<string> {
  const response = await request('/portfolio/export');
  return response.text();
}

export async function importPortfolio(json: string, token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio/import', buildJsonRequest('POST', { json }, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function resetPortfolio(token?: string | null): Promise<PortfolioSnapshot> {
  const response = await request('/portfolio/reset', buildJsonRequest('POST', {}, token));
  return PortfolioSnapshotSchema.parse(await response.json());
}

export async function fetchFxRate(from: string, to: string): Promise<number> {
  const response = await request(`/fx/rate?from=${from}&to=${to}`);
  const json = await response.json();
  return FxRateResponseSchema.parse(json).rate;
}
