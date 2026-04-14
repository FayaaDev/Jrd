import { z } from 'zod';
import { HoldingSchema, type Holding } from '../schemas/holding';
import { SettingsSchema, type Settings } from '../schemas/settings';
import { WatchItemSchema, type WatchItem } from '../schemas/watchlist';

const KEYS = {
  holdings: 'fayafolio:holdings',
  settings: 'fayafolio:settings',
  watchlist: 'fayafolio:watchlist',
  seedVersion: 'fayafolio:seed-version',
} as const;

// ─── Holdings ────────────────────────────────────────────────────────────────

export function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(KEYS.holdings);
    if (!raw) return [];
    const parsed = z.array(HoldingSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[storage] holdings parse failed, resetting:', parsed.error.message);
      return [];
    }
    return parsed.data;
  } catch (e) {
    console.warn('[storage] loadHoldings error:', e);
    return [];
  }
}

export function saveHoldings(h: Holding[]): void {
  localStorage.setItem(KEYS.holdings, JSON.stringify(h));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEYS.settings);
    if (!raw) return SettingsSchema.parse({});
    const parsed = SettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[storage] settings parse failed, resetting:', parsed.error.message);
      return SettingsSchema.parse({});
    }
    return parsed.data;
  } catch (e) {
    console.warn('[storage] loadSettings error:', e);
    return SettingsSchema.parse({});
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export function loadWatchlist(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEYS.watchlist);
    if (!raw) return [];
    const parsed = z.array(WatchItemSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[storage] watchlist parse failed, resetting:', parsed.error.message);
      return [];
    }
    return parsed.data;
  } catch (e) {
    console.warn('[storage] loadWatchlist error:', e);
    return [];
  }
}

export function saveWatchlist(w: WatchItem[]): void {
  localStorage.setItem(KEYS.watchlist, JSON.stringify(w));
}

// ─── Bulk ────────────────────────────────────────────────────────────────────

export function resetAll(): void {
  localStorage.removeItem(KEYS.holdings);
  localStorage.removeItem(KEYS.settings);
  localStorage.removeItem(KEYS.watchlist);
}

export function exportAll(): string {
  return JSON.stringify({
    holdings: loadHoldings(),
    settings: loadSettings(),
    watchlist: loadWatchlist(),
  });
}

const ExportSchema = z.object({
  holdings: z.array(HoldingSchema),
  settings: SettingsSchema,
  watchlist: z.array(WatchItemSchema),
});

export function importAll(json: string): void {
  // Will throw on invalid JSON or schema mismatch
  const obj = JSON.parse(json); // throws SyntaxError on bad JSON
  const parsed = ExportSchema.parse(obj); // throws ZodError on invalid shape
  saveHoldings(parsed.holdings);
  saveSettings(parsed.settings);
  saveWatchlist(parsed.watchlist);
}

export function getSeedVersion(): string | null {
  return localStorage.getItem(KEYS.seedVersion);
}

export function setSeedVersion(version: string): void {
  localStorage.setItem(KEYS.seedVersion, version);
}
