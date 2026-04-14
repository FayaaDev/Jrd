import { z } from 'zod';
import type { PriceProvider, PriceQuote } from '../types';

const BarSchema = z.object({
  t: z.string(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});

const ResponseSchema = z.object({
  bars: z.record(z.string(), BarSchema),
});

export const alpacaPricesProvider: PriceProvider = {
  name: 'alpaca',
  async getQuotes(symbols: string[]): Promise<PriceQuote[]> {
    if (symbols.length === 0) return [];

    const url = `/api/alpaca/v2/stocks/bars/latest?symbols=${symbols.join(',')}&feed=iex`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`[alpaca] HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const parsed = ResponseSchema.safeParse(json);

    if (!parsed.success) {
      console.warn('[alpaca] Unexpected response shape:', parsed.error.message);
      return [];
    }

    const quotes: PriceQuote[] = [];
    for (const [symbol, bar] of Object.entries(parsed.data.bars)) {
      quotes.push({
        symbol,
        price: bar.c,
        currency: 'USD',
        asOf: bar.t,
        provider: 'alpaca',
      });
    }
    return quotes;
  },
};
