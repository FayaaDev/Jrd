import { z } from 'zod';

export const WatchItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  quoteCurrency: z.string().length(3),
  addedAt: z.string(),
});

export type WatchItem = z.infer<typeof WatchItemSchema>;
