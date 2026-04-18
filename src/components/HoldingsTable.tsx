import { useState, useMemo } from 'react';
import type { HoldingRow } from '../lib/metrics';
import { fmtCompactCurrency, fmtPercent, fmtNumber } from '../lib/format';
import { Button } from './ui/Button';

interface Props {
  rows: HoldingRow[];
  baseCurrency: string;
  onManage: (h: HoldingRow) => void;
  canManage?: boolean;
}

type SortKey =
  | 'symbol'
  | 'name'
  | 'quantity'
  | 'avgCost'
  | 'price'
  | 'marketValueBase'
  | 'unrealizedPL'
  | 'unrealizedPLPct'
  | 'weight';

type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'symbol', label: 'Asset' },
  { key: 'name', label: 'Name' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'avgCost', label: 'Cost', numeric: true },
  { key: 'price', label: 'Last', numeric: true },
  { key: 'marketValueBase', label: 'Value', numeric: true },
  { key: 'unrealizedPL', label: 'P/L', numeric: true },
  { key: 'weight', label: 'Wt', numeric: true },
];

function shortenName(name: string | undefined): string {
  if (!name) return '—';
  return name.length > 24 ? `${name.slice(0, 24).trimEnd()}...` : name;
}

function compactMeta(row: HoldingRow): string {
  return [row.assetType?.toUpperCase(), row.market].filter(Boolean).join(' • ');
}

export default function HoldingsTable({ rows, baseCurrency, onManage, canManage = true }: Props) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.assetType ?? '').toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof HoldingRow];
      const bv = b[sortKey as keyof HoldingRow];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="holdings-table-wrapper">
      <div className="holdings-table__toolbar">
        <div className="holdings-table__toolbar-copy">
          <span className="section-kicker">Search the book</span>
          <p className="text-muted">{sorted.length} visible positions after filters and sorting.</p>
        </div>
        <input
          type="search"
          className="form-input holdings-table__search"
          placeholder="Filter by symbol, name, or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter holdings"
        />
      </div>
      <div className="table-scroll">
        <table className="table table--holdings-compact">
          <thead>
            <tr>
              {COLUMNS.map(({ key, label, numeric }) => (
                <th
                  key={key}
                  className={`table__th table__th--sortable${numeric ? ' table__th--number' : ''}`}
                  onClick={() => handleSort(key)}
                >
                  {label}
                  {sortKey === key ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : ''}
                </th>
              ))}
               {canManage && <th className="table__th">Actions</th>}
             </tr>
           </thead>
           <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="table__row">
                <td className="table__td table__td--symbol">
                  <div className="holding-cell">
                    <span className="holding-cell__primary">{row.symbol}</span>
                    <span className="holding-cell__meta">{compactMeta(row) || '—'}</span>
                  </div>
                </td>
                <td className="table__td table__td--name" title={row.name ?? undefined}>
                  <div className="holding-cell">
                    <span className="holding-cell__primary holding-cell__primary--truncate">{shortenName(row.name)}</span>
                    <span className="holding-cell__meta holding-cell__meta--truncate">{row.notes ?? row.priceProvider ?? 'Tracked position'}</span>
                  </div>
                </td>
                <td className="table__td table__td--number" title={fmtNumber(row.quantity)}>{fmtNumber(row.quantity, row.quantity >= 100 ? 0 : 2)}</td>
                <td className="table__td table__td--number">
                  {fmtCompactCurrency(row.avgCost, row.costCurrency)}
                </td>
                <td className="table__td table__td--number">
                  <div className="holding-cell holding-cell--number">
                    <span className="holding-cell__primary">
                      {row.price != null
                        ? fmtCompactCurrency(row.price, row.priceCurrency ?? row.quoteCurrency)
                        : '—'}
                    </span>
                    <span className="holding-cell__meta">{row.priceProvider ?? 'No source'}</span>
                  </div>
                </td>
                <td className="table__td table__td--number">
                  {row.marketValueBase != null
                    ? fmtCompactCurrency(row.marketValueBase, baseCurrency)
                    : '—'}
                </td>
                <td
                  className={`table__td table__td--number ${
                    (row.unrealizedPL ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  <div className="holding-cell holding-cell--number">
                    <span className="holding-cell__primary">
                      {row.unrealizedPL != null
                        ? fmtCompactCurrency(row.unrealizedPL, baseCurrency)
                        : '—'}
                    </span>
                    <span className="holding-cell__meta">
                      {row.unrealizedPLPct != null ? fmtPercent(row.unrealizedPLPct) : '—'}
                    </span>
                  </div>
                </td>
                <td className="table__td table__td--number">
                  {row.weight != null ? fmtPercent(row.weight) : '—'}
                </td>
                {canManage && (
                  <td className="table__td table__td--actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="btn--icon"
                      aria-label={`Open actions for ${row.symbol}`}
                      onClick={() => onManage(row)}
                    >
                      ⋯
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <p className="table__empty">No holdings match your filter.</p>
      )}
    </div>
  );
}
