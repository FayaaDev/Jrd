import { z } from 'zod';

export const AssetType = z.enum(['stock', 'etf', 'fund', 'crypto', 'cash', 'other']);

export const HoldingSchema = z.object({
  id: z.string(),
  symbol: z.string().min(1),
  name: z.string().optional(),
  assetType: AssetType,
  market: z.string(),
  quantity: z.number().nonnegative(),
  avgCost: z.number().nonnegative(),
  costCurrency: z.string().length(3),
  quoteCurrency: z.string().length(3),
  manualPrice: z.number().nonnegative().optional(),
  manualPriceAsOf: z.string().optional(),
  manualPriceProvider: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Holding = z.infer<typeof HoldingSchema>;
export type AssetTypeValue = z.infer<typeof AssetType>;
