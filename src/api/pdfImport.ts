import { apiPath } from './base';
import { PortfolioLedgerSchema, type HoldingInput, type PortfolioLedger } from './portfolio';
import {
  ExtractionResultSchema,
  ImportSummarySchema,
  VerifySymbolsResponseSchema,
  type ExtractionResult,
  type ImportSummary,
  type MergeStrategy,
  type VerifySymbolResult,
} from '../schemas/pdfImport';

async function parseError(response: Response): Promise<Error> {
  try {
    const json = await response.json();
    if (json && typeof json.message === 'string') {
      return new Error(json.message);
    }
  } catch {
    // Ignore malformed error bodies and fall back to the status text.
  }

  return new Error(response.statusText || `HTTP ${response.status}`);
}

export async function fetchValidMarkets(): Promise<string[]> {
  const response = await fetch(apiPath('/pdf-import/valid-markets'), {
    credentials: 'include',
  });
  if (!response.ok) return [];

  const json = await response.json();
  return Array.isArray(json.markets) ? json.markets : [];
}

export async function uploadPdfForExtraction(file: File): Promise<ExtractionResult> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(apiPath('/me/portfolio/import/pdf'), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return ExtractionResultSchema.parse(await response.json());
}

export async function verifyImportSymbols(
  pairs: Array<{ symbol: string; market: string }>,
): Promise<VerifySymbolResult[]> {
  const response = await fetch(apiPath('/me/portfolio/import/pdf/verify-symbols'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbols: pairs }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return VerifySymbolsResponseSchema.parse(await response.json()).results;
}

export async function confirmPdfImport(
  holdings: HoldingInput[],
  mergeStrategy: MergeStrategy,
): Promise<{ ledger: PortfolioLedger; summary: ImportSummary }> {
  const response = await fetch(apiPath('/me/portfolio/import/pdf/confirm'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ holdings, mergeStrategy }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const json = await response.json();
  return {
    ledger: PortfolioLedgerSchema.parse(json.ledger),
    summary: ImportSummarySchema.parse(json.summary),
  };
}
