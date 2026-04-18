import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPriceLookupKey,
  fetchPriceSnapshot,
  getProviderForHolding,
  getProviderForMarket,
  refreshPriceSnapshot,
  routeBySymbol,
} from './prices';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getProviderForMarket', () => {
  it('routes supported US markets to Alpaca', () => {
    expect(getProviderForMarket('XNAS')).toBe('alpaca');
    expect(getProviderForMarket('XNYS')).toBe('alpaca');
    expect(getProviderForMarket('ARCX')).toBe('alpaca');
  });

  it('routes Saudi market to Sahmk', () => {
    expect(getProviderForMarket('XSAU')).toBe('sahmk');
  });

  it('routes crypto market aliases to CoinMarketCap', () => {
    expect(getProviderForMarket('CRYPTO')).toBe('coinmarketcap');
    expect(getProviderForMarket('cryptocurrency')).toBe('coinmarketcap');
  });

  it('falls back to snapshot pricing for unsupported markets', () => {
    expect(getProviderForMarket('XLON')).toBe('snapshot');
    expect(getProviderForMarket('MONEYMARKET')).toBe('snapshot');
  });
});

describe('getProviderForHolding', () => {
  it('routes crypto assets to CoinMarketCap regardless of market label', () => {
    expect(getProviderForHolding({ assetType: 'crypto', market: 'CUSTOM' })).toBe('coinmarketcap');
  });
});

describe('routeBySymbol', () => {
  it('groups symbols by market provider', () => {
    const result = routeBySymbol(
      ['NVDA', 'BTC', '2010', 'ISDW.L'],
      [
        { symbol: 'NVDA', assetType: 'stock', market: 'XNAS' },
        { symbol: 'BTC', assetType: 'crypto', market: 'CRYPTO' },
        { symbol: '2010', assetType: 'stock', market: 'XSAU' },
        { symbol: 'ISDW.L', assetType: 'etf', market: 'XLON' },
      ],
    );

    expect(result.alpaca).toEqual(['NVDA']);
    expect(result.coinmarketcap).toEqual(['BTC']);
    expect(result.sahmk).toEqual(['2010']);
    expect(result.snapshot).toEqual(['ISDW.L']);
  });
});

describe('buildPriceLookupKey', () => {
  it('normalizes symbol and market casing', () => {
    expect(buildPriceLookupKey({ symbol: 'msft', market: 'xnas', assetType: 'stock' })).toBe('MSFT|XNAS|stock');
  });
});

describe('price snapshot requests', () => {
  it('posts to the authenticated refresh endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          updatedAt: '2026-04-18T06:00:00.000Z',
          lastSuccessfulAt: '2026-04-18T06:00:00.000Z',
          lastAttemptedAt: '2026-04-18T06:00:00.000Z',
          isRefreshing: false,
          refreshIntervalSec: 60,
          errors: {},
          quotes: {},
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await refreshPriceSnapshot();

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe('/api/me/prices/refresh');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
  });

  it('surfaces API error messages from manual refresh requests', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Admin access is required for this action.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(refreshPriceSnapshot()).rejects.toThrow('Admin access is required for this action.');
  });

  it('parses the expanded snapshot metadata contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          updatedAt: '2026-04-18T06:00:00.000Z',
          lastSuccessfulAt: '2026-04-18T06:00:00.000Z',
          lastAttemptedAt: '2026-04-18T06:01:00.000Z',
          isRefreshing: false,
          refreshIntervalSec: 60,
          errors: { alpaca: 'provider unavailable' },
          quotes: {},
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await expect(fetchPriceSnapshot()).resolves.toMatchObject({
      lastSuccessfulAt: '2026-04-18T06:00:00.000Z',
      lastAttemptedAt: '2026-04-18T06:01:00.000Z',
      errors: { alpaca: 'provider unavailable' },
    });
  });
});
