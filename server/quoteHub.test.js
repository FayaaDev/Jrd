import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./store.js', () => ({
  getLedgerByUserId: vi.fn(),
}));

import { getLedgerByUserId } from './store.js';
import { __resetQuoteHubStateForTests, getPriceSnapshot } from './quoteHub.js';

function buildSnapshot(overrides = {}) {
  return {
    holdings: [
      {
        id: 'h1',
        symbol: 'AAPL',
        assetType: 'stock',
        market: 'XNAS',
        quantity: 1,
        avgCost: 100,
        costCurrency: 'USD',
        quoteCurrency: 'USD',
        createdAt: '2026-04-18T06:00:00.000Z',
        updatedAt: '2026-04-18T06:00:00.000Z',
      },
    ],
    settings: {
      baseCurrency: 'SAR',
      priceProvider: 'auto',
      fxProvider: 'frankfurter',
      refreshIntervalSec: 60,
      theme: 'dark',
    },
    watchlist: [],
    ...overrides,
  };
}

describe('quoteHub freshness', () => {
  const env = { ...process.env };

  beforeEach(() => {
    __resetQuoteHubStateForTests();
    vi.restoreAllMocks();
    process.env.ALPACA_KEY_ID = 'alpaca-key';
    process.env.ALPACA_SECRET_KEY = 'alpaca-secret';
    vi.mocked(getLedgerByUserId).mockResolvedValue(buildSnapshot());
  });

  afterEach(() => {
    process.env = { ...env };
    __resetQuoteHubStateForTests();
  });

  it('does not advance lastSuccessfulAt when a refresh returns no live quotes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bars: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const snapshot = await getPriceSnapshot({ userId: 'user-1', force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.lastAttemptedAt).toBeTruthy();
    expect(snapshot.lastSuccessfulAt).toBeUndefined();
    expect(snapshot.updatedAt).toBeUndefined();
  });

  it('uses the last attempt timestamp to avoid repeated retries after a failed refresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bars: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await getPriceSnapshot({ userId: 'user-1', force: true });
    const snapshot = await getPriceSnapshot({ userId: 'user-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.lastAttemptedAt).toBeTruthy();
    expect(snapshot.lastSuccessfulAt).toBeUndefined();
  });

  it('advances lastSuccessfulAt when live quotes are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bars: {
            AAPL: {
              c: 201.25,
              t: '2026-04-18T06:05:00.000Z',
            },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const snapshot = await getPriceSnapshot({ userId: 'user-1', force: true });

    expect(snapshot.lastSuccessfulAt).toBeTruthy();
    expect(snapshot.updatedAt).toBe(snapshot.lastSuccessfulAt);
    expect(snapshot.quotes['AAPL|XNAS|stock']).toMatchObject({
      price: 201.25,
      provider: 'alpaca',
      currency: 'USD',
    });
  });
});
