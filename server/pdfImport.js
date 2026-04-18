import { runMistralOcr } from './mistralOcr.js';
import { runOpenAiExtract } from './openaiExtract.js';
import { resolveMarket } from './marketResolver.js';
import { verifySymbols } from './symbolVerifier.js';
import { scoreHoldings } from './confidenceScorer.js';

/**
 * Orchestrates the full PDF import pipeline:
 * OCR → extraction → symbol verification → confidence scoring.
 *
 * Throws { status, message } objects on pipeline errors.
 * Callers are responsible for catching and handling these.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{
 *   brokerName: string|null,
 *   statementDate: string|null,
 *   accountNumber: string|null,
 *   holdings: Array<object>,
 *   warnings: string[],
 * }>}
 */
export async function runPdfImportPipeline(pdfBuffer) {
  // Step 1: OCR
  const { text, pageCount: _pageCount, warnings: ocrWarnings } = await runMistralOcr(pdfBuffer);

  // Step 2: Guard against empty OCR output
  if (!text || text.trim() === '') {
    return {
      brokerName: null,
      statementDate: null,
      accountNumber: null,
      holdings: [],
      warnings: [...ocrWarnings, 'No text could be extracted from this PDF.'],
    };
  }

  // Step 3: Extract structured data
  const result = await runOpenAiExtract(text);

  const { brokerName, statementDate, accountNumber } = result;
  const holdings = result.holdings ?? [];

  // Step 4: Guard against empty holdings
  if (holdings.length === 0) {
    return {
      brokerName,
      statementDate,
      accountNumber,
      holdings: [],
      warnings: [...ocrWarnings],
    };
  }

  // Step 4.5: Resolve markets (normalize synonyms, shape inference, Alpaca lookup)
  const resolved = await Promise.all(
    holdings.map((h) => resolveMarket({ symbol: h.symbol, assetType: h.assetType, rawMarket: h.market }))
  );

  resolved.forEach((r, i) => {
    const before = holdings[i].market;
    holdings[i].market = r.mic ?? 'UNKNOWN';
    if (r.source !== 'llm' && r.mic) {
      holdings[i]._marketResolvedBy = r.source;
      holdings[i]._marketBeforeResolve = before;
    }
    if (!r.mic) {
      holdings[i]._marketResolutionFailed = true;
    }
  });

  // Step 5: Verify symbols
  const verificationMap = await verifySymbols(
    holdings.map((h) => ({ symbol: h.symbol, market: h.market }))
  );

  // Step 6: Score holdings
  const scoredHoldings = scoreHoldings(holdings, verificationMap);

  // Step 7: Return full result
  return {
    brokerName,
    statementDate,
    accountNumber,
    holdings: scoredHoldings,
    warnings: [...ocrWarnings],
  };
}
