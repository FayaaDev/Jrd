import { describe, expect, it } from 'vitest';
import { getProviderForMarket, routeBySymbol } from './prices';

describe('getProviderForMarket', () => {
  it('routes supported US markets to Alpaca', () => {
    expect(getProviderForMarket('XNAS')).toBe('alpaca');
    expect(getProviderForMarket('XNYS')).toBe('alpaca');
    expect(getProviderForMarket('ARCX')).toBe('alpaca');
  });

  it('routes Saudi market to Sahmk', () => {
    expect(getProviderForMarket('XSAU')).toBe('sahmk');
  });

  it('falls back to snapshot pricing for unsupported markets', () => {
    expect(getProviderForMarket('XLON')).toBe('snapshot');
    expect(getProviderForMarket('MONEYMARKET')).toBe('snapshot');
  });
});

describe('routeBySymbol', () => {
  it('groups symbols by market provider', () => {
    const result = routeBySymbol(
      ['NVDA', '2010', 'ISDW.L'],
      [
        { symbol: 'NVDA', market: 'XNAS' },
        { symbol: '2010', market: 'XSAU' },
        { symbol: 'ISDW.L', market: 'XLON' },
      ],
    );

    expect(result.alpaca).toEqual(['NVDA']);
    expect(result.sahmk).toEqual(['2010']);
    expect(result.snapshot).toEqual(['ISDW.L']);
  });
});
