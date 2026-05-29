# PDF Brokerage Statement Import

## Context

Jrd currently supports LLM-backed import. Users with brokerage accounts need a way to bulk-import holdings from their broker's PDF statements (Saudi brokers like Al Rajhi, SNB Capital, Riyad Capital, plus international brokers). The feature uses a three-stage AI pipeline: Mistral OCR for reliable PDF text extraction, OpenAI Structured Outputs for normalizing into the app's Holding schema, and a post-LLM validation layer for confidence scoring and symbol verification.

---

## Pipeline Architecture

```
PDF Upload → Mistral OCR → OpenAI Structured Outputs → Validation Layer → Review UI → Merge
```

### Stage 1: Mistral OCR
- Send base64-encoded PDF to `POST https://api.mistral.ai/v1/ocr` using `mistral-ocr-latest` model
- Concatenate all `pages[].markdown` with page-break markers
- Handles: scanned docs, Arabic text, complex table layouts
- Error: empty extraction returns warning, API failure returns 502

### Stage 2: OpenAI Structured Outputs
- Send OCR markdown to OpenAI with `response_format: { type: "json_schema", json_schema: { strict: true, schema: ... } }`
- System prompt instructs: extract symbol, name, assetType, market (MIC code), quantity, avgCost, totalCost, totalMarketValue, currentPrice, costCurrency, quoteCurrency, rawText per holding; plus brokerName, statementDate, accountNumber
- `temperature: 0` for deterministic extraction
- For Saudi brokers: use numeric Tadawul symbols (e.g. "2222"), transliterate Arabic names, default market to XSAU

### Stage 3: Post-LLM Validation
**Pass A — Schema conformance:** Parse each holding through existing `HoldingInputSchema` (Zod). Flag field-level errors.

**Pass B — Symbol verification:** Check each symbol against its market's provider:
- XNAS/XNYS/ARCX → Alpaca (batch call to `/v2/stocks/bars/latest`)
- XSAU → Sahmk (per-symbol `/quote/{symbol}/`)
- CRYPTO → CoinMarketCap (batch call to `/v1/cryptocurrency/quotes/latest`)
- UNKNOWN → mark unverified, user must set market manually
- All three provider groups run in parallel via `Promise.allSettled`
- Missing provider credentials → `verified: null` (don't fail pipeline)

**Pass C — Numeric cross-checks:**
- If `totalCost` extracted: verify `|quantity * avgCost - totalCost| / totalCost < 0.01`
- If `currentPrice` + `totalMarketValue` extracted: same check
- Flag discrepancies as warnings

**Confidence scoring** (per holding, 0.0–1.0):
| Deduction | Reason |
|-----------|--------|
| -0.30 | Symbol verification failed |
| -0.15 | Symbol verification skipped (no credentials / UNKNOWN market) |
| -0.20 | Numeric cross-check failed |
| -0.10 | avgCost is 0 |
| -0.10 | Market is UNKNOWN |
| -0.10 | Name is null/empty |
| -0.05 | assetType is "other" |

Thresholds: >= 0.8 green (auto-selected), 0.5–0.79 yellow, < 0.5 red.

---

## Server Changes

### New Endpoints (all require admin auth)

**`POST /api/portfolio/import/pdf`** — Upload + full pipeline
- Accepts: `multipart/form-data`, single `file` field (PDF, max 20MB)
- Uses `multer.memoryStorage()` — no temp files on disk
- Returns: `{ brokerName, statementDate, holdings: ExtractedHolding[], warnings: string[] }`
- Timeout: 120s (OCR ~10s + extraction ~10s + verification ~10s)

**`POST /api/portfolio/import/pdf/verify-symbols`** — Re-verify after user edits
- Accepts: `{ symbols: [{symbol, market}] }`
- Returns: `{ results: [{symbol, market, verified: boolean|null, suggestedName?: string}] }`

**`POST /api/portfolio/import/pdf/confirm`** — Merge reviewed holdings
- Accepts: `{ holdings: HoldingInput[], mergeStrategy: 'add_new' | 'update_existing' | 'add_all' }`
- Duplicate detection: `symbol.toUpperCase() + market.toUpperCase()` match
- `add_new`: skip duplicates, add non-matches only
- `update_existing`: overwrite quantity/avgCost on duplicates, add non-matches
- `add_all`: add everything as new rows regardless
- Returns: `{ snapshot: PortfolioSnapshot, summary: { added, updated, skipped } }`

### New Environment Variables
```
MISTRAL_API_KEY=        # Mistral OCR API
OPENAI_API_KEY=         # OpenAI Structured Outputs
OPENAI_MODEL=gpt-4o-2024-08-06   # Model with json_schema support
```

### New Dependency
- `multer` — multipart form-data parsing (memory storage)

### New Server Files
```
server/
  pdfImport.js          # Pipeline orchestrator (OCR → extract → validate → score)
  mistralOcr.js         # Mistral OCR API client (bare fetch)
  openaiExtract.js      # OpenAI structured outputs client (bare fetch, includes JSON schema + system prompt)
  symbolVerifier.js     # Symbol verification against Alpaca/Sahmk/CMC (reuses existing credential pattern)
  confidenceScorer.js   # Scoring logic
```

No SDK packages for Mistral/OpenAI — bare `fetch()` calls, consistent with existing Alpaca/Sahmk/CMC proxy pattern.

---

## Frontend Changes

### UI Flow (multi-step modal)

**Step 1 — Upload:** File input with drag-and-drop zone (`accept=".pdf"`, max 20MB). "Upload & Extract" button sends FormData to server.

**Step 2 — Processing:** Loading state with stage indicators: "Reading PDF..." → "Extracting holdings..." → "Verifying symbols...". Shows broker name and statement date when available.

**Step 3 — Review Table:** Editable table with columns:
- Checkbox (selection for import, high-confidence auto-checked)
- Confidence indicator (colored dot: green/yellow/red)
- Symbol, Name, Asset Type, Market, Quantity, Avg Cost, Currency
- Status column (verified/unverified/error with tooltip for warnings)
- Each cell is inline-editable
- "Re-verify" button to re-check symbols after edits
- Row count summary showing selected/total

**Step 4 — Confirm:** Merge strategy selector dropdown. Summary: "X new, Y updates, Z skipped". "Confirm Import" button.

### Entry Points
1. **Holdings page** (`src/routes/Holdings.tsx`): "Import PDF" button next to "+ Add Holding" in page header
2. **Settings page** (`src/routes/Settings.tsx`): "Import from PDF" button in Data Management section alongside existing JSON import

### New Frontend Files
```
src/
  api/pdfImport.ts              # API client functions (upload, verifySymbols, confirmImport)
  hooks/usePdfImport.ts         # State machine: idle → uploading → reviewing → confirming → done
  components/PdfImportWizard.tsx # Multi-step modal (reuses Modal, Button, Card, Input, Select)
  components/ImportReviewTable.tsx  # Editable review table with confidence indicators
  schemas/pdfImport.ts          # Zod schemas for extraction response, confidence, verification
```

### Modified Frontend Files
- `src/routes/Holdings.tsx` — add Import PDF button
- `src/routes/Settings.tsx` — add Import from PDF button
- `src/api/portfolio.ts` — add 3 new API client functions
- `src/styles/app.css` — styles for review table, confidence dots, drag-drop zone

---

## Error Handling

| Stage | Error | Response |
|-------|-------|----------|
| Upload | File >20MB or not PDF | 400/413 with message |
| OCR | MISTRAL_API_KEY missing | 503 "Mistral OCR not configured" |
| OCR | API failure or timeout (60s) | 502/504 with Mistral error |
| OCR | Empty text extraction | 200 with warning + empty holdings |
| Extraction | OPENAI_API_KEY missing | 503 "OpenAI not configured" |
| Extraction | API failure, refusal, or timeout | 502/504/422 with message |
| Verification | Provider API failure | Mark affected as `verified: null`, don't fail pipeline |
| Confirm | Zod validation failure | 400 with per-holding errors |

---

## Edge Cases
- **Multi-page statements**: All pages concatenated with page-break markers, full text sent to OpenAI
- **Partial OCR failures**: Proceed with successful pages, warn about unreadable ones
- **Arabic text**: Mistral OCR handles natively; OpenAI prompt says transliterate names, use numeric Tadawul symbols
- **Ambiguous symbols**: Market field + broker name context disambiguates; UNKNOWN market requires manual user input
- **Scanned vs digital PDFs**: Mistral OCR handles both transparently
- **OCR text >100K chars**: Truncate with warning (unlikely for brokerage statements)
- **Rate limits**: Surface 429 as retryable error to user

---

## Implementation Order

1. Server: `mistralOcr.js`, `openaiExtract.js` (API clients)
2. Server: `symbolVerifier.js`, `confidenceScorer.js` (validation)
3. Server: `pdfImport.js` (orchestrator) + endpoints in `index.js` + multer setup
4. Frontend: `schemas/pdfImport.ts` + `api/pdfImport.ts` (types + API client)
5. Frontend: `hooks/usePdfImport.ts` (state machine)
6. Frontend: `PdfImportWizard.tsx` + `ImportReviewTable.tsx` (UI)
7. Frontend: Wire into Holdings.tsx + Settings.tsx
8. Update `.env.example`, test end-to-end

---

## Verification Plan
1. Upload a real Saudi broker PDF → confirm OCR extracts Arabic text and tables correctly
2. Upload a US broker PDF → confirm Alpaca symbol verification works
3. Test with a mixed portfolio statement → confirm multi-market routing
4. Edit a symbol in review UI → re-verify → confirm status updates
5. Confirm import with each merge strategy → check holdings in database
6. Test error cases: no API keys configured, corrupt PDF, empty statement
7. Test admin auth: confirm all endpoints reject unauthenticated requests

---

## Files to Modify
- `server/index.js` — add multer, 3 new endpoints
- `server/schemas.js` — add PdfImportConfirmSchema
- `src/routes/Holdings.tsx` — add Import PDF button
- `src/routes/Settings.tsx` — add Import from PDF button  
- `src/api/portfolio.ts` — add API client functions
- `src/styles/app.css` — review table + upload zone styles
- `.env.example` — add MISTRAL_API_KEY, OPENAI_API_KEY, OPENAI_MODEL
- `package.json` — add multer

## Files to Create
- `server/pdfImport.js`, `server/mistralOcr.js`, `server/openaiExtract.js`, `server/symbolVerifier.js`, `server/confidenceScorer.js`
- `src/api/pdfImport.ts`, `src/hooks/usePdfImport.ts`, `src/components/PdfImportWizard.tsx`, `src/components/ImportReviewTable.tsx`, `src/schemas/pdfImport.ts`
