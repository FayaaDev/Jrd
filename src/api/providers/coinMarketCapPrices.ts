import { z } from 'zod';
import type { PriceProvider, PriceQuote } from '../types';
import { apiPath } from '../base';

const QuoteSchema = z.object({
  price: z.number(),
  last_updated: z.string(),
});

const AssetSchema = z.object({
  symbol: z.string(),
  quote: z.record(z.string(), QuoteSchema),
});

const ResponseSchema = z.object({
  data: z.record(z.string(), AssetSchema),
  status: z.object({
    timestamp: z.string(),
  }).optional(),
});

export const coinMarketCapPricesProvider: PriceProvider = {
  name: 'coinmarketcap',
  async getQuotes(symbols: string[]): Promise<PriceQuote[]> {
    if (symbols.length === 0) return [];

    const params = new URLSearchParams({
      symbol: symbols.join(','),
      convert: 'USD',
    });
    const response = await fetch(apiPath(`/coinmarketcap/v1/cryptocurrency/quotes/latest?${params}`));

    if (!response.ok) {
      throw new Error(`[coinmarketcap] HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const parsed = ResponseSchema.safeParse(json);

    if (!parsed.success) {
      console.warn('[coinmarketcap] Unexpected response shape:', parsed.error.message);
      return [];
    }

    const quotes: PriceQuote[] = [];

    for (const symbol of symbols) {
      const asset = parsed.data.data[symbol];
      const usdQuote = asset?.quote?.USD;

      if (!asset || !usdQuote) {
        continue;
      }

      quotes.push({
        symbol: asset.symbol,
        price: usdQuote.price,
        currency: 'USD',
        asOf: usdQuote.last_updated ?? parsed.data.status?.timestamp ?? new Date().toISOString(),
        provider: 'coinmarketcap',
      });
    }

    return quotes;
  },
};
