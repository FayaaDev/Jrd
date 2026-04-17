import { useRef, useEffect } from 'react';
import type { ExtractedHolding } from '../schemas/pdfImport';

interface ImportReviewTableProps {
  holdings: ExtractedHolding[];
  selectedIds: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdate: (index: number, updates: Partial<ExtractedHolding>) => void;
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'confidence-dot--high';
  if (confidence >= 0.5) return 'confidence-dot--medium';
  return 'confidence-dot--low';
}

function VerifiedBadge({ verified }: { verified: boolean | null }) {
  if (verified === true) {
    return <span className="verified-badge verified-badge--yes">✓</span>;
  }
  if (verified === false) {
    return <span className="verified-badge verified-badge--no">✗</span>;
  }
  return <span className="verified-badge verified-badge--unknown">?</span>;
}

const ASSET_TYPE_OPTIONS = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: 'Fund' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export function ImportReviewTable({
  holdings,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onUpdate,
}: ImportReviewTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allSelected = holdings.length > 0 && selectedIds.size === holdings.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < holdings.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function handleHeaderCheckbox() {
    if (allSelected || someSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  }

  if (holdings.length === 0) {
    return (
      <div className="review-table__empty">
        No holdings could be extracted from the PDF.
      </div>
    );
  }

  return (
    <div className="review-table-wrapper">
      <table className="review-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                ref={headerCheckboxRef}
                checked={allSelected}
                onChange={handleHeaderCheckbox}
                aria-label="Select all"
              />
            </th>
            <th>Conf.</th>
            <th>Symbol</th>
            <th>Name</th>
            <th>Type</th>
            <th>Market</th>
            <th>Qty</th>
            <th>Avg Cost</th>
            <th>Currency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding, index) => {
            const isSelected = selectedIds.has(index);
            const isLowConf = holding.confidence < 0.5;
            let rowClass = '';
            if (isSelected) rowClass += ' row--selected';
            if (isLowConf) rowClass += ' row--low-confidence';

            return (
              <tr key={index} className={rowClass.trim()}>
                <td>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(index)}
                    aria-label={`Select ${holding.symbol}`}
                  />
                </td>
                <td>
                  <span
                    className={`confidence-dot ${getConfidenceClass(holding.confidence)}`}
                    title={`Confidence: ${Math.round(holding.confidence * 100)}%`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="review-table__input"
                    value={holding.symbol}
                    onChange={(e) => onUpdate(index, { symbol: e.target.value })}
                    aria-label="Symbol"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="review-table__input"
                    value={holding.name ?? ''}
                    placeholder={holding.suggestedName ?? ''}
                    onChange={(e) => onUpdate(index, { name: e.target.value || null })}
                    aria-label="Name"
                  />
                </td>
                <td>
                  <select
                    className="review-table__input"
                    value={holding.assetType}
                    onChange={(e) =>
                      onUpdate(index, {
                        assetType: e.target.value as ExtractedHolding['assetType'],
                      })
                    }
                    aria-label="Asset type"
                  >
                    {ASSET_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="review-table__input"
                    value={holding.market}
                    onChange={(e) => onUpdate(index, { market: e.target.value })}
                    aria-label="Market"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="review-table__input"
                    value={holding.quantity}
                    onChange={(e) =>
                      onUpdate(index, { quantity: parseFloat(e.target.value) || 0 })
                    }
                    aria-label="Quantity"
                    step="any"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="review-table__input"
                    value={holding.avgCost}
                    onChange={(e) =>
                      onUpdate(index, { avgCost: parseFloat(e.target.value) || 0 })
                    }
                    aria-label="Average cost"
                    step="any"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="review-table__input"
                    value={holding.costCurrency}
                    maxLength={3}
                    onChange={(e) =>
                      onUpdate(index, { costCurrency: e.target.value.toUpperCase() })
                    }
                    aria-label="Currency"
                  />
                </td>
                <td>
                  <VerifiedBadge verified={holding.verified} />
                  {holding.flags.length > 0 && (
                    <span
                      className="flags-warning"
                      title={holding.flags.join('\n')}
                      aria-label="Warnings"
                    >
                      {' '}⚠
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="review-table__summary">
        {selectedIds.size} of {holdings.length} selected
      </div>
    </div>
  );
}
