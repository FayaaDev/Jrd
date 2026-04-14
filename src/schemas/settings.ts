import { z } from 'zod';

export const SettingsSchema = z.object({
  baseCurrency: z.string().length(3).default('SAR'),
  priceProvider: z.literal('auto').default('auto'),
  fxProvider: z.literal('frankfurter').default('frankfurter'),
  refreshIntervalSec: z.number().int().positive().default(60),
  theme: z.enum(['system', 'light', 'dark']).default('dark'),
});

export type Settings = z.infer<typeof SettingsSchema>;
