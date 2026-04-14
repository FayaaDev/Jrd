import { z } from 'zod';
import type { FxProvider } from '../types';

const SAR_USD_PEG = 3.75;

const ResponseSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.number()),
});

export const frankfurterFxProvider: FxProvider = {
  name: 'frankfurter',
  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    // SAR is pegged to USD, so resolve this pair locally instead of depending on
    // the remote FX API for the main conversion path used by US holdings.
    if (from === 'USD' && to === 'SAR') return SAR_USD_PEG;
    if (from === 'SAR' && to === 'USD') return 1 / SAR_USD_PEG;

    const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`[frankfurter] HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const parsed = ResponseSchema.safeParse(json);

    if (!parsed.success) {
      throw new Error(`[frankfurter] Unexpected response: ${parsed.error.message}`);
    }

    const rate = parsed.data.rates[to];
    if (rate === undefined) {
      throw new Error(`[frankfurter] Rate for ${to} not found in response`);
    }

    return rate;
  },
};
