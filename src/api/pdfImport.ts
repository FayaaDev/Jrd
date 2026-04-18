import type { PortfolioSnapshot } from './portfolio';
import { PortfolioSnapshotSchema } from './portfolio';
import { apiPath } from './base';
import {
  ExtractionResultSchema,
  VerifySymbolsResponseSchema,
  ImportSummarySchema,
  type ExtractionResult,
  type VerifySymbolResult,
  type ImportSummary,
  type MergeStrategy,
} from '../schemas/pdfImport';
import type { HoldingInput } from './portfolio';

// Shared error parsing (mirrors portfolio.ts parseResponseError)
async function parseError(response: Response): Promise<Error> {
  try {
    const json = await response.json();
    if (json && typeof json.message === 'string') {
      return new Error(json.message);
    }
  } catch {
    // ignore
  }
  return new Error(response.statusText || `HTTP ${response.status}`);
}

/**
 * Fetch the list of valid MIC codes supported by the import pipeline.
 */
export async function fetchValidMarkets(): Promise<string[]> {
  const response = await fetch(apiPath('/pdf-import/valid-markets'));
  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json.markets) ? json.markets : [];
}

/**
 * Upload a PDF and run the full OCR → extraction → verification pipeline.
 * Returns extracted holdings with confidence scores.
 */
export async function uploadPdfForExtraction(
  file: File,
  token: string | null
): Promise<ExtractionResult> {
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiPath('/portfolio/import/pdf'), {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const json = await response.json();
  return ExtractionResultSchema.parse(json);
}

/**
 * Re-verify symbols against price providers (used after user edits in review UI).
 */
export async function verifyImportSymbols(
  pairs: Array<{ symbol: string; market: string }>,
  token: string | null
): Promise<VerifySymbolResult[]> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiPath('/portfolio/import/pdf/verify-symbols'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ symbols: pairs }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const json = await response.json();
  return VerifySymbolsResponseSchema.parse(json).results;
}

/**
 * Confirm import: merge reviewed holdings into the portfolio.
 */
export async function confirmPdfImport(
  holdings: HoldingInput[],
  mergeStrategy: MergeStrategy,
  token: string | null
): Promise<{ snapshot: PortfolioSnapshot; summary: ImportSummary }> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiPath('/portfolio/import/pdf/confirm'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ holdings, mergeStrategy }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const json = await response.json();
  const snapshot = PortfolioSnapshotSchema.parse(json.snapshot);
  const summary = ImportSummarySchema.parse(json.summary);
  return { snapshot, summary };
}
