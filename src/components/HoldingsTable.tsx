import { useState, useMemo } from 'react';
import type { HoldingRow } from '../lib/metrics';
import { fmtCurrency, fmtPercent, fmtNumber } from '../lib/format';
import { Button } from './ui/Button';

interface Props {
  rows: HoldingRow[];
  baseCurrency: string;
  onEdit: (h: HoldingRow) => void;
  onDelete: (id: string) => void;
}

type SortKey =
  | 'symbol'
  | 'name'
  | 'assetType'
  | 'market'
  | 'quantity'
  | 'avgCost'
  | 'price'
  | 'marketValueBase'
  | 'unrealizedPL'
  | 'unrealizedPLPct'
  | 'weight';

type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'name', label: 'Name' },
  { key: 'assetType', label: 'Type' },
  { key: 'market', label: 'Market' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'avgCost', label: 'Avg Cost', numeric: true },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'marketValueBase', label: 'Market Value', numeric: true },
  { key: 'unrealizedPL', label: 'P/L', numeric: true },
  { key: 'unrealizedPLPct', label: 'P/L %', numeric: true },
  { key: 'weight', label: 'Weight', numeric: true },
];

export default function HoldingsTable({ rows, baseCurrency, onEdit, onDelete }: Props) {
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

  const handleDelete = (row: HoldingRow) => {
    if (window.confirm(`Delete ${row.symbol}? This cannot be undone.`)) {
      onDelete(row.id);
    }
  };

  return (
    <div className="holdings-table-wrapper">
      <div className="holdings-table__toolbar">
        <input
          type="search"
          className="form-input"
          placeholder="Filter by symbol, name, or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter holdings"
        />
      </div>
      <div className="table-scroll">
        <table className="table">
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
              <th className="table__th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="table__row">
                <td className="table__td table__td--symbol">{row.symbol}</td>
                <td className="table__td">{row.name ?? '—'}</td>
                <td className="table__td">{row.assetType ?? '—'}</td>
                <td className="table__td">{row.market ?? '—'}</td>
                <td className="table__td table__td--number">{fmtNumber(row.quantity)}</td>
                <td className="table__td table__td--number">
                  {fmtCurrency(row.avgCost, row.costCurrency)}
                </td>
                <td className="table__td table__td--number">
                  {row.price != null
                    ? fmtCurrency(row.price, row.quoteCurrency)
                    : '—'}
                </td>
                <td className="table__td table__td--number">
                  {row.marketValueBase != null
                    ? fmtCurrency(row.marketValueBase, baseCurrency)
                    : '—'}
                </td>
                <td
                  className={`table__td table__td--number ${
                    (row.unrealizedPL ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {row.unrealizedPL != null
                    ? fmtCurrency(row.unrealizedPL, baseCurrency)
                    : '—'}
                </td>
                <td
                  className={`table__td table__td--number ${
                    (row.unrealizedPLPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {row.unrealizedPLPct != null
                    ? fmtPercent(row.unrealizedPLPct)
                    : '—'}
                </td>
                <td className="table__td table__td--number">
                  {row.weight != null ? fmtPercent(row.weight) : '—'}
                </td>
                <td className="table__td table__td--actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onEdit(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(row)}
                  >
                    Delete
                  </Button>
                </td>
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
