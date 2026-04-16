import { z } from 'zod';

export const SettingsSchema = z.object({
  baseCurrency: z.string().length(3).default('SAR'),
  priceProvider: z.literal('auto').default('auto'),
  fxProvider: z.literal('frankfurter').default('frankfurter'),
  refreshIntervalSec: z.number().int().positive().default(60),
  theme: z.enum(['system', 'light', 'dark']).default('dark'),
});

export const HoldingSchema = z.object({
  id: z.string(),
  symbol: z.string().min(1),
  name: z.string().optional(),
  assetType: z.enum(['stock', 'etf', 'fund', 'crypto', 'cash', 'other']),
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

export const WatchItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  quoteCurrency: z.string().length(3),
  addedAt: z.string(),
});

export const PortfolioSnapshotSchema = z.object({
  holdings: z.array(HoldingSchema),
  settings: SettingsSchema,
  watchlist: z.array(WatchItemSchema),
});

export const HoldingInputSchema = HoldingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const HoldingUpdateSchema = HoldingInputSchema.partial();

export const WatchItemInputSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  quoteCurrency: z.string().length(3),
});

export const ImportPayloadSchema = z.object({
  json: z.string().min(1),
});

export const AdminSessionSchema = z.object({
  token: z.string().min(1),
});

export const FxRateQuerySchema = z.object({
  from: z.string().length(3),
  to: z.string().length(3),
});

export const PdfImportConfirmSchema = z.object({
  holdings: z.array(HoldingInputSchema),
  mergeStrategy: z.enum(['add_new', 'update_existing', 'add_all']),
});
