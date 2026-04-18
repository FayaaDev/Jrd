import { describe, expect, it } from 'vitest';
import { buildPriceLookupKey, getProviderForHolding, getProviderForMarket, routeBySymbol } from './prices';

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
