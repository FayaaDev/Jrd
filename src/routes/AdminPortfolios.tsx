import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveAdminLedger,
  createOrRecreateAdminLedger,
  deleteAdminLedger,
  fetchAdminPortfolios,
  getApiErrorMessage,
  restoreAdminLedger,
} from '../api/portfolio';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { fmtAge } from '../lib/format';

export default function AdminPortfolios() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'archived'>('all');

  const portfoliosQuery = useQuery({
    queryKey: ['admin', 'portfolios', { search, status }],
    queryFn: () => fetchAdminPortfolios({
      q: search,
      status: status === 'all' ? undefined : status,
    }),
  });

  const invalidateAdminQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
  };

  const recreateMutation = useMutation({
    mutationFn: createOrRecreateAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to create or recreate the ledger.')),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to archive the ledger.')),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to restore the ledger.')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminLedger,
    onSuccess: () => void invalidateAdminQueries(),
    onError: (error) => window.alert(getApiErrorMessage(error, 'Unable to delete the ledger.')),
  });

  const rows = useMemo(() => portfoliosQuery.data ?? [], [portfoliosQuery.data]);

  return (
    <div className="admin-page">
      <section className="page-intro card">
        <span className="section-kicker">Admin portfolios</span>
        <h1 className="page-title">Portfolio ledgers</h1>
        <p className="page-intro__copy">
          Search by owner, filter ledger status, and jump into any user ledger for inspection, repair, or archival work.
        </p>
      </section>

      <Card className="admin-toolbar-card">
        <div className="admin-toolbar">
          <Input
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | 'active' | 'archived')}
            options={[
              { value: 'all', label: 'All ledgers' },
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>
      </Card>

      {portfoliosQuery.error && (
        <Card className="settings-section">
          <p className="text-negative">{portfoliosQuery.error instanceof Error ? portfoliosQuery.error.message : 'Unable to load portfolio ledgers.'}</p>
        </Card>
      )}

      <div className="table-scroll card">
        <table className="table">
          <thead>
            <tr>
              <th className="table__th">Owner</th>
              <th className="table__th">Status</th>
              <th className="table__th table__th--number">Holdings</th>
              <th className="table__th table__th--number">Watchlist</th>
              <th className="table__th">Updated</th>
              <th className="table__th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="table__row">
                <td className="table__td">
                  <div className="holding-cell">
                    <span className="holding-cell__primary">{row.name ?? row.email}</span>
                    <span className="holding-cell__meta">{row.email}</span>
                  </div>
                </td>
                <td className="table__td">{row.status ?? 'missing'}</td>
                <td className="table__td table__td--number">{row.holdingsCount}</td>
                <td className="table__td table__td--number">{row.watchlistCount}</td>
                <td className="table__td">{row.updatedAt ? fmtAge(row.updatedAt) : 'Never'}</td>
                <td className="table__td table__td--actions admin-table-actions">
                  {row.hasLedger && (
                    <Link to={`/admin/portfolios/${row.userId}`} className="btn btn--secondary btn--sm">View</Link>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!row.hasLedger) {
                        recreateMutation.mutate(row.userId);
                        return;
                      }

                      const confirmed = window.confirm(`Recreate ${row.email}'s ledger as a blank active portfolio?`);
                      if (confirmed) {
                        recreateMutation.mutate(row.userId);
                      }
                    }}
                    disabled={recreateMutation.isPending}
                  >
                    {row.hasLedger ? 'Recreate' : 'Create'}
                  </Button>
                  {row.status === 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => archiveMutation.mutate(row.userId)}
                      disabled={archiveMutation.isPending}
                    >
                      Archive
                    </Button>
                  )}
                  {row.status === 'archived' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => restoreMutation.mutate(row.userId)}
                      disabled={restoreMutation.isPending}
                    >
                      Restore
                    </Button>
                  )}
                  {row.hasLedger && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        const confirmed = window.confirm(`Delete ${row.email}'s ledger permanently? This cannot be undone.`);
                        if (confirmed) {
                          deleteMutation.mutate(row.userId);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="table__empty">
            {portfoliosQuery.isPending ? 'Loading ledgers...' : 'No ledgers match the current filters.'}
          </p>
        )}
      </div>
    </div>
  );
}
