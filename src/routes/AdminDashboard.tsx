import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminSummary } from '../api/portfolio';
import { Card } from '../components/ui/Card';

const statCards = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'activeLedgers', label: 'Active ledgers' },
  { key: 'archivedLedgers', label: 'Archived ledgers' },
  { key: 'missingLedgers', label: 'Missing ledgers' },
] as const;

export default function AdminDashboard() {
  const summaryQuery = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: fetchAdminSummary,
  });

  return (
    <div className="admin-page">
      <section className="page-intro card">
        <span className="section-kicker">Admin console</span>
        <h1 className="page-title">Ledger operations</h1>
        <p className="page-intro__copy">
          Monitor user adoption, inspect portfolio coverage, and move straight into the ledger and user management surfaces.
        </p>
      </section>

      {summaryQuery.error && (
        <Card className="settings-section">
          <p className="text-negative">{summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Unable to load admin summary.'}</p>
        </Card>
      )}

      <section className="admin-stats-grid">
        {statCards.map((card) => (
          <Card key={card.key} className="admin-stat-card">
            <span className="section-kicker">{card.label}</span>
            <strong className="admin-stat-card__value">
              {summaryQuery.data ? summaryQuery.data[card.key] : '...'}
            </strong>
          </Card>
        ))}
      </section>

      <section className="admin-links-grid">
        <Card className="admin-link-card">
          <span className="section-kicker">Portfolios</span>
          <h2 className="section-title">Review and repair ledgers</h2>
          <p className="text-muted">Search by user, filter active versus archived ledgers, and create or recreate missing ledgers.</p>
          <Link to="/admin/portfolios" className="btn btn--secondary btn--md">Open Portfolios</Link>
        </Card>

        <Card className="admin-link-card">
          <span className="section-kicker">Users</span>
          <h2 className="section-title">Inspect account ownership</h2>
          <p className="text-muted">Review user records, roles, creation dates, and whether a ledger exists for each account.</p>
          <Link to="/admin/users" className="btn btn--secondary btn--md">Open Users</Link>
        </Card>
      </section>
    </div>
  );
}
