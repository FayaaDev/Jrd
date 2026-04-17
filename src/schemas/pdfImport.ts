import { z } from 'zod';

// A single extracted holding from the PDF pipeline (server enriches with confidence data)
export const ExtractedHoldingSchema = z.object({
  // Fields extracted by OpenAI
  symbol: z.string(),
  name: z.string().nullable(),
  assetType: z.enum(['stock', 'etf', 'fund', 'crypto', 'cash', 'other']),
  market: z.string(),
  quantity: z.number(),
  avgCost: z.number(),
  totalCost: z.number().nullable(),
  totalMarketValue: z.number().nullable(),
  currentPrice: z.number().nullable(),
  costCurrency: z.string(),
  quoteCurrency: z.string(),
  rawText: z.string(),
  // Fields added by the confidence scorer
  confidence: z.number(),
  flags: z.array(z.string()),
  verified: z.boolean().nullable(),
  suggestedName: z.string().optional(),
  warnings: z.array(z.string()),
});

// Full pipeline response
export const ExtractionResultSchema = z.object({
  brokerName: z.string().nullable(),
  statementDate: z.string().nullable(),
  accountNumber: z.string().nullable(),
  holdings: z.array(ExtractedHoldingSchema),
  warnings: z.array(z.string()),
});

// Symbol verification response
export const VerifySymbolResultSchema = z.object({
  symbol: z.string(),
  market: z.string(),
  verified: z.boolean().nullable(),
  suggestedName: z.string().optional(),
});

export const VerifySymbolsResponseSchema = z.object({
  results: z.array(VerifySymbolResultSchema),
});

// Confirm import response
export const ImportSummarySchema = z.object({
  added: z.number(),
  updated: z.number(),
  skipped: z.number(),
});

// (PortfolioSnapshot is from api/portfolio.ts — we'll import the type there)

export type ExtractedHolding = z.infer<typeof ExtractedHoldingSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type VerifySymbolResult = z.infer<typeof VerifySymbolResultSchema>;
export type ImportSummary = z.infer<typeof ImportSummarySchema>;
export type MergeStrategy = 'add_new' | 'update_existing' | 'add_all';
