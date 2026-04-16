import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminSession } from './useAdminSession';
import { getApiErrorMessage, portfolioQueryKey } from '../api/portfolio';
import {
  uploadPdfForExtraction,
  verifyImportSymbols,
  confirmPdfImport,
} from '../api/pdfImport';
import type {
  ExtractedHolding,
  ExtractionResult,
  ImportSummary,
  MergeStrategy,
} from '../schemas/pdfImport';

type WizardStep = 'idle' | 'uploading' | 'reviewing' | 'confirming' | 'done';

const initialMergeStrategy: MergeStrategy = 'add_new';

export function usePdfImport() {
  const { token } = useAdminSession();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>('idle');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [editedHoldings, setEditedHoldings] = useState<ExtractedHolding[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>(initialMergeStrategy);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Keep refs so async callbacks can read current values without stale closures
  const editedHoldingsRef = useRef<ExtractedHolding[]>([]);
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const mergeStrategyRef = useRef<MergeStrategy>(initialMergeStrategy);

  const setEditedHoldingsAndRef = useCallback((holdings: ExtractedHolding[]) => {
    editedHoldingsRef.current = holdings;
    setEditedHoldings(holdings);
  }, []);

  const setSelectedIdsAndRef = useCallback((ids: Set<number>) => {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  }, []);

  const setMergeStrategyAndRef = useCallback((strategy: MergeStrategy) => {
    mergeStrategyRef.current = strategy;
    setMergeStrategy(strategy);
  }, []);

  const upload = useCallback(async (file: File) => {
    setStep('uploading');
    setError(null);
    try {
      const result = await uploadPdfForExtraction(file, token);
      const holdings = [...result.holdings];
      const autoSelected = new Set<number>();
      holdings.forEach((holding, index) => {
        if (holding.confidence >= 0.8) {
          autoSelected.add(index);
        }
      });
      setExtractionResult(result);
      setEditedHoldingsAndRef(holdings);
      setSelectedIdsAndRef(autoSelected);
      setStep('reviewing');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to upload PDF.'));
      setStep('idle');
    }
  }, [token, setEditedHoldingsAndRef, setSelectedIdsAndRef]);

  const updateHolding = useCallback((index: number, updates: Partial<ExtractedHolding>) => {
    const next = [...editedHoldingsRef.current];
    next[index] = { ...next[index], ...updates };
    setEditedHoldingsAndRef(next);
  }, [setEditedHoldingsAndRef]);

  const toggleSelected = useCallback((index: number) => {
    const next = new Set(selectedIdsRef.current);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIdsAndRef(next);
  }, [setSelectedIdsAndRef]);

  const selectAll = useCallback(() => {
    const allIndices = editedHoldingsRef.current.map((_, i) => i);
    setSelectedIdsAndRef(new Set(allIndices));
  }, [setSelectedIdsAndRef]);

  const deselectAll = useCallback(() => {
    setSelectedIdsAndRef(new Set());
  }, [setSelectedIdsAndRef]);

  const reverify = useCallback(async (indices?: number[]) => {
    setIsVerifying(true);
    setError(null);
    try {
      const current = editedHoldingsRef.current;
      const targets = indices !== undefined
        ? indices.map(i => current[i]).filter((h): h is ExtractedHolding => h !== undefined)
        : current;

      const pairs = targets.map(h => ({ symbol: h.symbol, market: h.market }));
      const results = await verifyImportSymbols(pairs, token);

      const updated = editedHoldingsRef.current.map(holding => {
        const match = results.find(
          r =>
            r.symbol.toLowerCase() === holding.symbol.toLowerCase() &&
            r.market.toLowerCase() === holding.market.toLowerCase()
        );
        if (!match) return holding;
        return {
          ...holding,
          verified: match.verified,
          ...(match.suggestedName !== undefined ? { suggestedName: match.suggestedName } : {}),
        };
      });

      setEditedHoldingsAndRef(updated);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to verify symbols.'));
    } finally {
      setIsVerifying(false);
    }
  }, [token, setEditedHoldingsAndRef]);

  const confirm = useCallback(async () => {
    setStep('confirming');
    setError(null);
    try {
      const currentHoldings = editedHoldingsRef.current;
      const currentSelectedIds = selectedIdsRef.current;
      const currentMergeStrategy = mergeStrategyRef.current;

      const holdingInputs = [...currentSelectedIds]
        .sort((a, b) => a - b)
        .map(i => currentHoldings[i])
        .filter((h): h is ExtractedHolding => h !== undefined)
        .map(h => ({
          symbol: h.symbol,
          name: h.name ?? h.suggestedName ?? undefined,
          assetType: h.assetType,
          market: h.market,
          quantity: h.quantity,
          avgCost: h.avgCost,
          costCurrency: h.costCurrency,
          quoteCurrency: h.quoteCurrency,
        }));

      const result = await confirmPdfImport(holdingInputs, currentMergeStrategy, token);
      void queryClient.invalidateQueries({ queryKey: portfolioQueryKey });
      setImportSummary(result.summary);
      setStep('done');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to confirm import.'));
      setStep('reviewing');
    }
  }, [token, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setExtractionResult(null);
    setEditedHoldingsAndRef([]);
    setSelectedIdsAndRef(new Set());
    setMergeStrategyAndRef(initialMergeStrategy);
    setImportSummary(null);
    setError(null);
    setIsVerifying(false);
  }, [setEditedHoldingsAndRef, setSelectedIdsAndRef, setMergeStrategyAndRef]);

  return {
    step,
    extractionResult,
    editedHoldings,
    selectedIds,
    mergeStrategy,
    importSummary,
    error,
    isVerifying,
    upload,
    updateHolding,
    toggleSelected,
    selectAll,
    deselectAll,
    setMergeStrategy: setMergeStrategyAndRef,
    reverify,
    confirm,
    reset,
  };
}
