import { z } from 'zod';
import type { PriceProvider, PriceQuote } from '../types';
import { apiPath } from '../base';

const ResponseSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  updated_at: z.string(),
});

export const sahmkPricesProvider: PriceProvider = {
  name: 'sahmk',
  async getQuotes(symbols: string[]): Promise<PriceQuote[]> {
    const quotes: PriceQuote[] = [];

    for (const symbol of symbols) {
      const response = await fetch(apiPath(`/sahmk/quote/${symbol}/`));

      if (!response.ok) {
        throw new Error(`[sahmk] HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const parsed = ResponseSchema.safeParse(json);

      if (!parsed.success) {
        console.warn('[sahmk] Unexpected response shape:', parsed.error.message);
        continue;
      }

      quotes.push({
        symbol: parsed.data.symbol,
        price: parsed.data.price,
        currency: 'SAR',
        asOf: parsed.data.updated_at,
        provider: 'sahmk',
      });
    }

    return quotes;
  },
};
