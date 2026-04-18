import { describe, it, expect } from 'vitest';
import { deriveRow, derivePortfolio, type FxLookup } from './metrics';
import type { Holding } from '../schemas/holding';
import type { PriceQuote } from '../api/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    symbol: 'AAPL',
    assetType: 'stock',
    market: 'XNAS',
    quantity: 10,
    avgCost: 100,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuote(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    symbol: 'AAPL',
    price: 150,
    currency: 'USD',
    asOf: new Date().toISOString(),
    provider: 'mock',
    ...overrides,
  };
}

const noFx: FxLookup = () => undefined;
const usdSar: FxLookup = (from, to) => {
  if (from === 'USD' && to === 'SAR') return 3.75;
  if (from === 'SAR' && to === 'USD') return 1 / 3.75;
  if (from === to) return 1;
  return undefined;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deriveRow', () => {
  it('1. same currency — no FX conversion needed', () => {
    const h = makeHolding({ quantity: 10, avgCost: 100, costCurrency: 'USD', quoteCurrency: 'USD' });
    const q = makeQuote({ price: 150, currency: 'USD' });
    const row = deriveRow(h, q, noFx, 'USD');

    // costBasisBase = 10 * 100 * 1 (same currency)
    expect(row.costBasisBase).toBe(1000);
    // marketValueBase = 10 * 150 * 1
    expect(row.marketValueBase).toBe(1500);
    expect(row.unrealizedPL).toBe(500);
    expect(row.unrealizedPLPct).toBeCloseTo(0.5);
  });

  it('2. multi-currency holding — FX applied correctly', () => {
    const h = makeHolding({ quantity: 5, avgCost: 100, costCurrency: 'USD', quoteCurrency: 'USD' });
    const q = makeQuote({ price: 200, currency: 'USD' });
    const row = deriveRow(h, q, usdSar, 'SAR');

    // costBasisBase = 5 * 100 * 3.75 = 1875
    expect(row.costBasisBase).toBeCloseTo(1875);
    // marketValueBase = 5 * 200 * 3.75 = 3750
    expect(row.marketValueBase).toBeCloseTo(3750);
    expect(row.unrealizedPL).toBeCloseTo(1875);
    expect(row.unrealizedPLPct).toBeCloseTo(1.0);
  });

  it('3. missing FX rate — costBasisBase is NaN, marketValueBase is undefined', () => {
    const h = makeHolding({ costCurrency: 'EUR', quoteCurrency: 'EUR' });
    const q = makeQuote({ currency: 'EUR' });
    const row = deriveRow(h, q, noFx, 'SAR');

    expect(isNaN(row.costBasisBase)).toBe(true);
    expect(row.marketValueBase).toBeUndefined();
    expect(row.unrealizedPL).toBeUndefined();
    expect(row.unrealizedPLPct).toBeUndefined();
  });

  it('4. zero cost — unrealizedPLPct is undefined (not Infinity)', () => {
    const h = makeHolding({ quantity: 5, avgCost: 0, costCurrency: 'USD' });
    const q = makeQuote({ price: 100, currency: 'USD' });
    const row = deriveRow(h, q, noFx, 'USD');

    expect(row.costBasisBase).toBe(0);
    expect(row.marketValueBase).toBe(500);
    // unrealizedPL should be 500 (500 - 0)
    expect(row.unrealizedPL).toBe(500);
    // unrealizedPLPct is undefined when costBasis is 0
    expect(row.unrealizedPLPct).toBeUndefined();
  });

  it('returns price/priceAsOf/priceProvider from quote', () => {
    const h = makeHolding();
    const q = makeQuote({ price: 200, asOf: '2024-01-01T00:00:00Z', provider: 'alpaca' });
    const row = deriveRow(h, q, noFx, 'USD');

    expect(row.price).toBe(200);
    expect(row.priceCurrency).toBe('USD');
    expect(row.priceAsOf).toBe('2024-01-01T00:00:00Z');
    expect(row.priceProvider).toBe('alpaca');
  });

  it('returns undefined fields when no quote provided', () => {
    const h = makeHolding();
    const row = deriveRow(h, undefined, noFx, 'USD');

    expect(row.price).toBeUndefined();
    expect(row.marketValueBase).toBeUndefined();
    expect(row.unrealizedPL).toBeUndefined();
  });

  it('falls back to manual snapshot price when no live quote is available', () => {
    const h = makeHolding({
      quantity: 4,
      avgCost: 100,
      quoteCurrency: 'SAR',
      costCurrency: 'SAR',
      manualPrice: 125,
      manualPriceAsOf: '2026-04-14T00:00:00Z',
      manualPriceProvider: 'assets.md',
    });
    const row = deriveRow(h, undefined, noFx, 'SAR');

    expect(row.price).toBe(125);
    expect(row.priceCurrency).toBe('SAR');
    expect(row.priceAsOf).toBe('2026-04-14T00:00:00Z');
    expect(row.priceProvider).toBe('assets.md');
    expect(row.marketValueBase).toBe(500);
    expect(row.unrealizedPL).toBe(100);
    expect(row.unrealizedPLPct).toBeCloseTo(0.25);
  });

  it('prefers live quote over manual snapshot price when both exist', () => {
    const h = makeHolding({
      manualPrice: 125,
      manualPriceAsOf: '2026-04-14T00:00:00Z',
      manualPriceProvider: 'assets.md',
    });
    const q = makeQuote({ price: 150, provider: 'alpaca' });
    const row = deriveRow(h, q, noFx, 'USD');

    expect(row.price).toBe(150);
    expect(row.priceCurrency).toBe('USD');
    expect(row.priceProvider).toBe('alpaca');
    expect(row.marketValueBase).toBe(1500);
  });

  it('preserves the provider currency even when the holding fallback currency differs', () => {
    const h = makeHolding({ quoteCurrency: 'SAR' });
    const q = makeQuote({ currency: 'USD' });
    const row = deriveRow(h, q, usdSar, 'SAR');

    expect(row.priceCurrency).toBe('USD');
    expect(row.marketValueBase).toBeCloseTo(5625);
  });
});

describe('derivePortfolio', () => {
  it('5a. byAssetType sums correctly', () => {
    const h1 = makeHolding({ id: 'h1', assetType: 'stock', quantity: 10, avgCost: 100, costCurrency: 'USD' });
    const h2 = makeHolding({ id: 'h2', symbol: 'BTC', assetType: 'crypto', quantity: 1, avgCost: 30000, costCurrency: 'USD' });

    const row1 = deriveRow(h1, makeQuote({ symbol: 'AAPL', price: 150 }), noFx, 'USD');
    const row2 = deriveRow(h2, makeQuote({ symbol: 'BTC', price: 40000 }), noFx, 'USD');

    const summary = derivePortfolio([row1, row2]);

    expect(summary.byAssetType['stock']).toBeCloseTo(1500);
    expect(summary.byAssetType['crypto']).toBeCloseTo(40000);
  });

  it('5b. weights sum to ~1', () => {
    const h1 = makeHolding({ id: 'h1', assetType: 'stock', quantity: 10, avgCost: 100, costCurrency: 'USD' });
    const h2 = makeHolding({ id: 'h2', symbol: 'MSFT', assetType: 'stock', quantity: 5, avgCost: 200, costCurrency: 'USD' });

    const row1 = deriveRow(h1, makeQuote({ symbol: 'AAPL', price: 150 }), noFx, 'USD');
    const row2 = deriveRow(h2, makeQuote({ symbol: 'MSFT', price: 300 }), noFx, 'USD');

    const rows = [row1, row2];
    derivePortfolio(rows);

    const totalWeight = rows.reduce((acc, r) => acc + (r.weight ?? 0), 0);
    expect(totalWeight).toBeCloseTo(1.0);
  });

  it('totalCost and totalMV aggregate correctly', () => {
    const h1 = makeHolding({ id: 'h1', quantity: 10, avgCost: 100, costCurrency: 'USD' });
    const h2 = makeHolding({ id: 'h2', symbol: 'MSFT', quantity: 5, avgCost: 200, costCurrency: 'USD' });

    const row1 = deriveRow(h1, makeQuote({ price: 120 }), noFx, 'USD');
    const row2 = deriveRow(h2, makeQuote({ symbol: 'MSFT', price: 250 }), noFx, 'USD');

    const summary = derivePortfolio([row1, row2]);

    // totalCost = 10*100 + 5*200 = 2000
    expect(summary.totalCost).toBe(2000);
    // totalMV = 10*120 + 5*250 = 2450
    expect(summary.totalMV).toBe(2450);
    expect(summary.totalPL).toBe(450);
    expect(summary.totalPLPct).toBeCloseTo(0.225);
  });
});
