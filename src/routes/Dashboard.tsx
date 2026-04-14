import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import PortfolioSummaryComponent from '../components/PortfolioSummary';
import AllocationPie from '../components/AllocationPie';
import PLBar from '../components/PLBar';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { fmtAge } from '../lib/format';

export default function Dashboard() {
  const { rows, summary, settings, isFetching, lastUpdated, refresh } = usePortfolio();

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No holdings yet"
        description="Add your first holding to start tracking your portfolio."
        action={
          <Link to="/holdings">
            <Button variant="primary">Add Holdings</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="page-title">Dashboard</h1>
        <div className="dashboard__refresh">
          {lastUpdated && (
            <span className="text-muted">Last refreshed {fmtAge(lastUpdated)}</span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <PortfolioSummaryComponent
        summary={summary}
        baseCurrency={settings.baseCurrency}
      />

      <div className="dashboard__charts">
        <AllocationPie
          data={summary.byAssetType}
          title="Allocation by Asset Type"
        />
        <PLBar rows={rows} baseCurrency={settings.baseCurrency} />
      </div>
    </div>
  );
}
