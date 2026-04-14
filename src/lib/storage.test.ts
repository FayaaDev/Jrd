import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadHoldings,
  saveHoldings,
  loadSettings,
  saveSettings,
  loadWatchlist,
  saveWatchlist,
  resetAll,
  exportAll,
  importAll,
} from './storage';
import type { Holding } from '../schemas/holding';
import type { Settings } from '../schemas/settings';
import type { WatchItem } from '../schemas/watchlist';
import { ensureSeedPortfolio } from './seed';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHolding(id = 'h1'): Holding {
  return {
    id,
    symbol: 'AAPL',
    assetType: 'stock',
    market: 'XNAS',
    quantity: 10,
    avgCost: 150,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    baseCurrency: 'SAR',
    priceProvider: 'auto',
    fxProvider: 'frankfurter',
    refreshIntervalSec: 60,
    theme: 'dark',
    ...overrides,
  };
}

function makeWatchItem(id = 'w1'): WatchItem {
  return {
    id,
    symbol: 'TSLA',
    quoteCurrency: 'USD',
    addedAt: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

describe('holdings', () => {
  it('1. saveHoldings / loadHoldings round-trip', () => {
    const items = [makeHolding('h1'), makeHolding('h2')];
    saveHoldings(items);
    const loaded = loadHoldings();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('h1');
    expect(loaded[1].symbol).toBe('AAPL');
  });

  it('2. corrupt localStorage data → returns empty array, no throw', () => {
    localStorage.setItem('fayafolio:holdings', '{ not valid json !!!');
    expect(() => loadHoldings()).not.toThrow();
    expect(loadHoldings()).toEqual([]);
  });

  it('2b. invalid schema data → returns empty array, no throw', () => {
    localStorage.setItem('fayafolio:holdings', JSON.stringify([{ id: 123, bad: true }]));
    expect(() => loadHoldings()).not.toThrow();
    expect(loadHoldings()).toEqual([]);
  });

  it('loadHoldings returns empty array when nothing stored', () => {
    expect(loadHoldings()).toEqual([]);
  });
});

describe('settings', () => {
  it('saveSettings / loadSettings round-trip', () => {
    const s = makeSettings({ baseCurrency: 'USD', theme: 'dark' });
    saveSettings(s);
    const loaded = loadSettings();
    expect(loaded.baseCurrency).toBe('USD');
    expect(loaded.theme).toBe('dark');
  });

  it('returns defaults when nothing stored', () => {
    const s = loadSettings();
    expect(s.baseCurrency).toBe('SAR');
    expect(s.priceProvider).toBe('auto');
  });

  it('corrupt settings → returns defaults, no throw', () => {
    localStorage.setItem('fayafolio:settings', 'CORRUPT');
    expect(() => loadSettings()).not.toThrow();
    const s = loadSettings();
    expect(s.baseCurrency).toBe('SAR');
  });
});

describe('watchlist', () => {
  it('saveWatchlist / loadWatchlist round-trip', () => {
    const items = [makeWatchItem('w1'), makeWatchItem('w2')];
    saveWatchlist(items);
    const loaded = loadWatchlist();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('w1');
  });

  it('corrupt watchlist → returns empty array, no throw', () => {
    localStorage.setItem('fayafolio:watchlist', 'BAD_JSON');
    expect(() => loadWatchlist()).not.toThrow();
    expect(loadWatchlist()).toEqual([]);
  });
});

describe('exportAll / importAll', () => {
  it('3. exportAll / importAll round-trip', () => {
    saveHoldings([makeHolding('export-h1')]);
    saveSettings(makeSettings({ theme: 'light' }));
    saveWatchlist([makeWatchItem('export-w1')]);

    const json = exportAll();

    // Clear and re-import
    resetAll();
    expect(loadHoldings()).toEqual([]);

    importAll(json);

    expect(loadHoldings()[0].id).toBe('export-h1');
    expect(loadSettings().theme).toBe('light');
    expect(loadWatchlist()[0].id).toBe('export-w1');
  });

  it('4. importAll with invalid JSON → throws SyntaxError', () => {
    expect(() => importAll('{ not valid json')).toThrow();
  });

  it('importAll with valid JSON but invalid schema → throws ZodError', () => {
    const bad = JSON.stringify({ holdings: 'not-an-array', settings: {}, watchlist: [] });
    expect(() => importAll(bad)).toThrow();
  });
});

describe('resetAll', () => {
  it('clears all keys from localStorage', () => {
    saveHoldings([makeHolding()]);
    saveSettings(makeSettings());
    saveWatchlist([makeWatchItem()]);

    resetAll();

    expect(loadHoldings()).toEqual([]);
    expect(loadSettings().baseCurrency).toBe('SAR'); // default
    expect(loadWatchlist()).toEqual([]);
  });
});

describe('ensureSeedPortfolio', () => {
  it('seeds holdings once when storage is empty', () => {
    ensureSeedPortfolio();

    const holdings = loadHoldings();
    expect(holdings).toHaveLength(16);
    expect(holdings[0].id).toBe('seed-1');
    expect(holdings.some((holding) => holding.symbol === 'NVDA')).toBe(true);
    expect(holdings.some((holding) => holding.symbol === 'ITFS')).toBe(true);
  });

  it('does not overwrite existing holdings', () => {
    saveHoldings([makeHolding('existing')]);

    ensureSeedPortfolio();

    const holdings = loadHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0].id).toBe('existing');
  });

  it('does not duplicate seeded holdings on repeated calls', () => {
    ensureSeedPortfolio();
    ensureSeedPortfolio();

    const holdings = loadHoldings();
    expect(holdings).toHaveLength(16);
  });
});
