import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage, ME_PORTFOLIO_SCOPE, portfolioQueryKey } from '../api/portfolio';
import { priceSnapshotQueryKey } from '../api/prices';
import { confirmPdfImport, uploadPdfForExtraction, verifyImportSymbols } from '../api/pdfImport';
import type {
  ExtractedHolding,
  ExtractionResult,
  ImportSummary,
  MergeStrategy,
} from '../schemas/pdfImport';

type WizardStep = 'idle' | 'uploading' | 'reviewing' | 'confirming' | 'done';

const initialMergeStrategy: MergeStrategy = 'add_new';

export function usePdfImport() {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>('idle');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [editedHoldings, setEditedHoldings] = useState<ExtractedHolding[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>(initialMergeStrategy);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const stepRef = useRef<WizardStep>('idle');
  const editedHoldingsRef = useRef<ExtractedHolding[]>([]);
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const mergeStrategyRef = useRef<MergeStrategy>(initialMergeStrategy);

  const setStepAndRef = useCallback((next: WizardStep) => {
    stepRef.current = next;
    setStep(next);
  }, []);

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
    if (stepRef.current !== 'idle') {
      return;
    }

    setStepAndRef('uploading');
    setError(null);

    try {
      const result = await uploadPdfForExtraction(file);
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
      setStepAndRef('reviewing');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to upload PDF.'));
      setStepAndRef('idle');
    }
  }, [setEditedHoldingsAndRef, setSelectedIdsAndRef, setStepAndRef]);

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
    setSelectedIdsAndRef(new Set(editedHoldingsRef.current.map((_, index) => index)));
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
        ? indices.map((index) => current[index]).filter((holding): holding is ExtractedHolding => holding !== undefined)
        : current;

      const pairs = targets.map((holding) => ({ symbol: holding.symbol, market: holding.market }));
      const results = await verifyImportSymbols(pairs);

      const updated = editedHoldingsRef.current.map((holding) => {
        const match = results.find(
          (result) =>
            result.symbol.toLowerCase() === holding.symbol.toLowerCase()
            && result.market.toLowerCase() === holding.market.toLowerCase(),
        );

        if (!match) {
          return holding;
        }

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
  }, [setEditedHoldingsAndRef]);

  const confirm = useCallback(async () => {
    setStepAndRef('confirming');
    setError(null);

    try {
      const holdingInputs = [...selectedIdsRef.current]
        .sort((left, right) => left - right)
        .map((index) => editedHoldingsRef.current[index])
        .filter((holding): holding is ExtractedHolding => holding !== undefined)
        .map((holding) => ({
          symbol: holding.symbol,
          name: holding.name ?? holding.suggestedName ?? undefined,
          assetType: holding.assetType,
          market: holding.market,
          quantity: holding.quantity,
          avgCost: holding.avgCost,
          costCurrency: holding.costCurrency,
          quoteCurrency: holding.quoteCurrency,
        }));

      const result = await confirmPdfImport(holdingInputs, mergeStrategyRef.current);
      queryClient.setQueryData(portfolioQueryKey(ME_PORTFOLIO_SCOPE), result.ledger);
      void queryClient.invalidateQueries({ queryKey: priceSnapshotQueryKey(ME_PORTFOLIO_SCOPE) });
      setImportSummary(result.summary);
      setStepAndRef('done');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to confirm import.'));
      setStepAndRef('reviewing');
    }
  }, [queryClient, setStepAndRef]);

  const reset = useCallback(() => {
    setStepAndRef('idle');
    setExtractionResult(null);
    setEditedHoldingsAndRef([]);
    setSelectedIdsAndRef(new Set());
    setMergeStrategyAndRef(initialMergeStrategy);
    setImportSummary(null);
    setError(null);
    setIsVerifying(false);
  }, [setEditedHoldingsAndRef, setMergeStrategyAndRef, setSelectedIdsAndRef, setStepAndRef]);

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
