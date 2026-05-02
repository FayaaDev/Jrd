import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  archiveAdminLedger,
  createOrRecreateAdminLedger,
  deleteAdminLedger,
  exportAdminPortfolio,
  fetchAdminUser,
  getApiErrorMessage,
  restoreAdminLedger,
  type PortfolioScope,
} from '../api/portfolio';
import { useHoldings } from '../hooks/useHoldings';
import { usePortfolio } from '../hooks/usePortfolio';
import { useSettings } from '../hooks/useSettings';
import { useWatchlist } from '../hooks/useWatchlist';
import { usePrices } from '../hooks/usePrices';
import type { Holding } from '../schemas/holding';
import type { HoldingRow } from '../lib/metrics';
import type { Settings as SettingsType } from '../schemas/settings';
import HoldingsTable from '../components/HoldingsTable';
import HoldingForm from './HoldingForm';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { fmtAge, fmtCurrency } from '../lib/format';

function downloadJsonFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminPortfolioDetail() {
  const { userId = '' } = useParams();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | undefined>();
  const [watchSymbol, setWatchSymbol] = useState('');
  const [watchCurrency, setWatchCurrency] = useState('USD');
  const [watchName, setWatchName] = useState('');
  const [watchError, setWatchError] = useState('');

  const scope: PortfolioScope = { kind: 'admin', userId };
  const ownerQuery = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchAdminUser(userId),
  });
  const portfolio = usePortfolio(scope);
  const holdings = useHoldings(scope);
  const watchlist = useWatchlist(scope);
  const [settings, setSettings, settingsMeta] = useSettings(scope);
  const watchlistPrices = usePrices(
    scope,
    watchlist.watchlist.map((item) => item.symbol),
    watchlist.watchlist.map((item) => ({
      symbol: item.symbol,
      assetType: 'stock' as const,
      market: item.quoteCurrency === 'SAR' && /^\d+$/.test(item.symbol) ? 'XSAU' : 'XNAS',
    })),
    settings,
  );

  const invalidateAdminQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
  };

  const recreateMutation = useMutation({
    mutationFn: createOrRecreateAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to recreate this ledger.')),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to archive this ledger.')),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to restore this ledger.')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to delete this ledger.')),
  });

  const owner = ownerQuery.data;

  const openEditForm = (row: HoldingRow) => {
    setEditTarget({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetType: row.assetType,
      market: row.market,
      quantity: row.quantity,
      avgCost: row.avgCost,
      costCurrency: row.costCurrency,
      quoteCurrency: row.quoteCurrency,
      manualPrice: row.manualPrice,
      manualPriceAsOf: row.manualPriceAsOf,
      manualPriceProvider: row.manualPriceProvider,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditTarget(undefined);
  };

  const updateSetting = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    if (!settingsMeta.canEdit) {
      return;
    }

    setSettings({ ...settings, [key]: value });
  };

  const handleAddWatchItem = (event: React.FormEvent) => {
    event.preventDefault();

    const symbol = watchSymbol.trim().toUpperCase();
    if (!symbol) {
      setWatchError('Symbol is required.');
      return;
    }

    if (watchlist.watchlist.some((item) => item.symbol === symbol)) {
      setWatchError(`${symbol} is already in the watchlist.`);
      return;
    }

    watchlist.addWatchItem({
      symbol,
      quoteCurrency: watchCurrency.trim().toUpperCase() || 'USD',
      name: watchName.trim() || undefined,
    });
    setWatchSymbol('');
    setWatchCurrency('USD');
    setWatchName('');
    setWatchError('');
  };

  if (ownerQuery.isPending && portfolio.isLoading) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">Admin detail</span>
        <h1 className="page-title">Loading user ledger...</h1>
      </section>
    );
  }

  if (ownerQuery.error) {
    return (
      <EmptyState
        title="User unavailable"
        description={ownerQuery.error instanceof Error ? ownerQuery.error.message : 'Unable to load the requested user.'}
        action={<Link to="/admin/users">Back to Users</Link>}
      />
    );
  }

  const missingLedger = Boolean(portfolio.errorMessage && portfolio.errorMessage.toLowerCase().includes('ledger not found'));

  if (missingLedger) {
    return (
      <div className="admin-page">
        <section className="page-intro card">
          <span className="section-kicker">Admin detail</span>
          <h1 className="page-title">{owner?.name ?? owner?.email ?? userId}</h1>
          <p className="page-intro__copy">No ledger exists for this user yet. Create one to provision a blank private portfolio.</p>
        </section>

        <EmptyState
          title="Ledger missing"
          description="This account exists but does not currently have a portfolio ledger."
          action={(
            <Button
              onClick={() => recreateMutation.mutate(userId)}
              disabled={recreateMutation.isPending}
            >
              {recreateMutation.isPending ? 'Creating...' : 'Create Ledger'}
            </Button>
          )}
        />
      </div>
    );
  }

  if (portfolio.errorMessage) {
    return <EmptyState title="Portfolio unavailable" description={portfolio.errorMessage} action={<Link to="/admin/portfolios">Back to Portfolios</Link>} />;
  }

  return (
    <div className="admin-page admin-detail-page">
      <section className="page-intro card">
        <span className="section-kicker">Admin detail</span>
        <div className="page-header">
          <h1 className="page-title">{owner?.name ?? owner?.email ?? userId}</h1>
          <div className="admin-table-actions">
            <Button
              variant="secondary"
              onClick={() => {
                void exportAdminPortfolio(userId)
                  .then((json) => downloadJsonFile(`fayafolio-${userId}.json`, json))
                  .catch((error) => window.alert(getApiErrorMessage(error, 'Unable to export this ledger.')));
              }}
            >
              Export Ledger
            </Button>
            {portfolio.isArchived ? (
              <Button variant="secondary" onClick={() => restoreMutation.mutate(userId)} disabled={restoreMutation.isPending}>
                Restore
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => archiveMutation.mutate(userId)} disabled={archiveMutation.isPending}>
                Archive
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                const confirmed = window.confirm(`Recreate ${owner?.email ?? userId}'s ledger as a blank active portfolio?`);
                if (confirmed) {
                  recreateMutation.mutate(userId);
                }
              }}
              disabled={recreateMutation.isPending}
            >
              Recreate Blank Ledger
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const confirmed = window.confirm(`Delete ${owner?.email ?? userId}'s ledger permanently? This cannot be undone.`);
                if (confirmed) {
                  deleteMutation.mutate(userId);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Delete Ledger
            </Button>
          </div>
        </div>
        <p className="page-intro__copy">
          {owner?.email} • role {owner?.role ?? 'user'} • ledger {portfolio.isArchived ? 'archived' : 'active'}
        </p>
      </section>

      <section className="admin-stats-grid">
        <Card className="admin-stat-card">
          <span className="section-kicker">Holdings</span>
          <strong className="admin-stat-card__value">{portfolio.rows.length}</strong>
        </Card>
        <Card className="admin-stat-card">
          <span className="section-kicker">Watchlist</span>
          <strong className="admin-stat-card__value">{watchlist.watchlist.length}</strong>
        </Card>
        <Card className="admin-stat-card">
          <span className="section-kicker">Base currency</span>
          <strong className="admin-stat-card__value">{settings.baseCurrency}</strong>
        </Card>
        <Card className="admin-stat-card">
          <span className="section-kicker">Last market refresh</span>
          <strong className="admin-stat-card__value">{portfolio.lastUpdated ? fmtAge(portfolio.lastUpdated) : 'Never'}</strong>
        </Card>
      </section>

      <Card className="settings-section">
        <div className="page-header">
          <h2 className="section-title">Holdings</h2>
          <Button onClick={() => {
            setEditTarget(undefined);
            setFormOpen(true);
          }}>
            Add Holding
          </Button>
        </div>
        {portfolio.rows.length === 0 ? (
          <p className="text-muted">This ledger has no holdings yet.</p>
        ) : (
          <HoldingsTable
            rows={portfolio.rows}
            baseCurrency={portfolio.settings.baseCurrency}
            onManage={openEditForm}
            canManage
          />
        )}
      </Card>

      <Card className="settings-section">
        <h2 className="section-title">Settings</h2>
        <div className="form-row">
          <Input
            label="Base Currency"
            value={settings.baseCurrency}
            onChange={(event) => updateSetting('baseCurrency', event.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            disabled={settingsMeta.isSaving}
          />
          <Select
            label="Language"
            value={settings.language}
            onChange={(event) => updateSetting('language', event.target.value as SettingsType['language'])}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ar', label: 'Arabic' },
            ]}
            disabled={settingsMeta.isSaving}
          />
          <Select
            label="Theme"
            value={settings.theme}
            onChange={(event) => updateSetting('theme', event.target.value as SettingsType['theme'])}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            disabled={settingsMeta.isSaving}
          />
        </div>
      </Card>

      <Card className="settings-section">
        <h2 className="section-title">Watchlist</h2>
        <form onSubmit={handleAddWatchItem} className="watchlist-add-form">
          <div className="form-row">
            <Input
              label="Symbol"
              value={watchSymbol}
              onChange={(event) => {
                setWatchSymbol(event.target.value);
                setWatchError('');
              }}
              placeholder="e.g. MSFT"
              error={watchError}
              disabled={watchlist.isSaving}
            />
            <Input
              label="Quote Currency"
              value={watchCurrency}
              onChange={(event) => setWatchCurrency(event.target.value.toUpperCase().slice(0, 3))}
              maxLength={3}
              disabled={watchlist.isSaving}
            />
            <Input
              label="Name"
              value={watchName}
              onChange={(event) => setWatchName(event.target.value)}
              placeholder="Optional"
              disabled={watchlist.isSaving}
            />
          </div>
          <Button type="submit" size="sm" disabled={watchlist.isSaving}>Add Watch Item</Button>
        </form>

        {watchlist.watchlist.length === 0 ? (
          <p className="text-muted">This ledger has no watchlist symbols yet.</p>
        ) : (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Symbol</th>
                  <th className="table__th">Name</th>
                  <th className="table__th">Currency</th>
                  <th className="table__th table__th--number">Price</th>
                  <th className="table__th">As of</th>
                  <th className="table__th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.watchlist.map((item) => {
                  const quote = watchlistPrices.prices[item.symbol];
                  return (
                    <tr key={item.id} className="table__row">
                      <td className="table__td table__td--symbol">{item.symbol}</td>
                      <td className="table__td">{item.name ?? '—'}</td>
                      <td className="table__td">{item.quoteCurrency}</td>
                      <td className="table__td table__td--number">
                        {quote ? fmtCurrency(quote.price, quote.currency) : '—'}
                      </td>
                      <td className="table__td">{quote?.asOf ? fmtAge(quote.asOf) : '—'}</td>
                      <td className="table__td table__td--actions">
                        <Button variant="danger" size="sm" onClick={() => watchlist.removeWatchItem(item.symbol)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <HoldingForm
        key={editTarget?.id ?? (formOpen ? 'new-admin' : 'closed-admin')}
        open={formOpen}
        onClose={closeForm}
        holding={editTarget}
        onDelete={editTarget ? holdings.deleteHolding : undefined}
        canEdit
        scope={scope}
      />
    </div>
  );
}
