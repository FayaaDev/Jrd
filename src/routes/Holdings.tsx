import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Holding } from '../schemas/holding';
import type { HoldingRow } from '../lib/metrics';
import { usePortfolio } from '../hooks/usePortfolio';
import { useHoldings } from '../hooks/useHoldings';
import HoldingsTable from '../components/HoldingsTable';
import HoldingForm from './HoldingForm';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

export default function Holdings() {
  const { rows, settings } = usePortfolio();
  const { deleteHolding } = useHoldings();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | undefined>(undefined);

  const handleEdit = (row: HoldingRow) => {
    // HoldingRow extends Holding — extract the Holding fields
    const holding: Holding = {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetType: row.assetType,
      market: row.market,
      quantity: row.quantity,
      avgCost: row.avgCost,
      costCurrency: row.costCurrency,
      quoteCurrency: row.quoteCurrency,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    setEditTarget(holding);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditTarget(undefined);
    setFormOpen(true);
  };

  const handleClose = () => {
    setFormOpen(false);
    setEditTarget(undefined);
  };

  return (
    <div className="holdings-page">
      <div className="page-header">
        <h1 className="page-title">Holdings</h1>
        <Button variant="primary" onClick={handleAdd}>
          + Add Holding
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          description="Start building your portfolio by adding your first holding."
          action={
            <>
              <Button variant="primary" onClick={handleAdd}>
                Add Holding
              </Button>
              <Link to="/">Back to Dashboard</Link>
            </>
          }
        />
      ) : (
        <HoldingsTable
          rows={rows}
          baseCurrency={settings.baseCurrency}
          onEdit={handleEdit}
          onDelete={deleteHolding}
        />
      )}

      <HoldingForm open={formOpen} onClose={handleClose} holding={editTarget} />
    </div>
  );
}
