import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ME_PORTFOLIO_SCOPE } from '../api/portfolio';
import type { Holding } from '../schemas/holding';
import type { HoldingRow } from '../lib/metrics';
import { usePortfolio } from '../hooks/usePortfolio';
import { useHoldings } from '../hooks/useHoldings';
import HoldingsTable from '../components/HoldingsTable';
import HoldingForm from './HoldingForm';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useI18n } from '../i18n/useI18n';

export default function Holdings() {
  const { t } = useI18n();
  const { rows, settings, isLoading, errorMessage } = usePortfolio();
  const { deleteHolding, canEdit } = useHoldings();
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
        <span className="section-kicker">{t('holdings_kicker')}</span>
        <h1 className="page-title">{t('holdings_loading')}</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
          title={t('holdings_unavailable')}
          description={errorMessage}
          action={<Link to="/app/settings">{t('dashboard_open_settings')}</Link>}
        />
      );
  }

  return (
    <div className="holdings-page">
      <section className="page-intro card">
        <div>
          <span className="section-kicker">{t('holdings_kicker')}</span>
          <div className="page-header">
            <h1 className="page-title">{t('holdings_title')}</h1>
            <Button variant="primary" onClick={handleAdd} disabled={!canEdit}>
              {t('holdings_add')}
            </Button>
          </div>
          <p className="page-intro__copy">
            {t('holdings_lede')}
          </p>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title={t('holdings_empty_title')}
          description={
            canEdit
              ? t('holdings_empty_can_edit')
              : t('holdings_empty_readonly')
          }
          action={
            <>
              {canEdit ? (
                <Button variant="primary" onClick={handleAdd}>
                  {t('dashboard_add_holding')}
                </Button>
              ) : (
                <Link to="/app/settings">{t('dashboard_open_settings')}</Link>
              )}
              <Link to="/app">{t('holdings_back_dashboard')}</Link>
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
        scope={ME_PORTFOLIO_SCOPE}
      />

    </div>
  );
}
