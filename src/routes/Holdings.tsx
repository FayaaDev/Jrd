import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Holding } from '../schemas/holding';
import type { HoldingRow } from '../lib/metrics';
import { usePortfolio } from '../hooks/usePortfolio';
import { useHoldings } from '../hooks/useHoldings';
import HoldingsTable from '../components/HoldingsTable';
import HoldingForm from './HoldingForm';
import { PdfImportWizard } from '../components/PdfImportWizard';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

export default function Holdings() {
  const { rows, settings, isLoading, errorMessage } = usePortfolio();
  const { deleteHolding, canEdit } = useHoldings();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | undefined>(undefined);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);

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
    if (!canEdit) return;
    setEditTarget(undefined);
    setFormOpen(true);
  };

  const handleClose = () => {
    setFormOpen(false);
    setEditTarget(undefined);
  };

  if (isLoading) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">Portfolio inventory</span>
        <h1 className="page-title">Loading shared holdings...</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        title="Unable to load holdings"
        description={errorMessage}
        action={<Link to="/settings">Open Settings</Link>}
      />
    );
  }

  return (
    <div className="holdings-page">
      <section className="page-intro card">
        <div>
          <span className="section-kicker">Portfolio inventory</span>
          <div className="page-header">
            <h1 className="page-title">Holdings</h1>
            <Button variant="secondary" onClick={() => setPdfImportOpen(true)} disabled={!canEdit}>
              Import PDF
            </Button>
            <Button variant="primary" onClick={handleAdd} disabled={!canEdit}>
              + Add Holding
            </Button>
          </div>
          <p className="page-intro__copy">
            Every position is grouped into one execution surface so you can inspect live marks, blended valuations, and open P/L without leaving the book.
          </p>
          {!canEdit && (
            <p className="readonly-note">
              Shared portfolio is public read-only. Unlock admin access in Settings to add, edit, or delete positions.
            </p>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          description={
            canEdit
              ? 'Start building your portfolio by adding your first holding.'
              : 'The shared portfolio is empty. Unlock admin access in Settings to add the first holding.'
          }
          action={
            <>
              {canEdit ? (
                <Button variant="primary" onClick={handleAdd}>
                  Add Holding
                </Button>
              ) : (
                <Link to="/settings">Open Settings</Link>
              )}
              <Link to="/">Back to Dashboard</Link>
            </>
          }
        />
      ) : (
        <HoldingsTable
          rows={rows}
          baseCurrency={settings.baseCurrency}
          onManage={handleEdit}
          canManage={canEdit}
        />
      )}

      <HoldingForm
        key={editTarget?.id ?? (formOpen ? 'new' : 'closed')}
        open={formOpen}
        onClose={handleClose}
        holding={editTarget}
        onDelete={editTarget ? deleteHolding : undefined}
        canEdit={canEdit}
      />

      <PdfImportWizard
        open={pdfImportOpen}
        onClose={() => setPdfImportOpen(false)}
      />
    </div>
  );
}
