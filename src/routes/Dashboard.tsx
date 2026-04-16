import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import PortfolioSummaryComponent from '../components/PortfolioSummary';
import AllocationPie from '../components/AllocationPie';
import PLBar from '../components/PLBar';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { fmtAge } from '../lib/format';

export default function Dashboard() {
  const { rows, summary, settings, isFetching, isLoading, errorMessage, lastUpdated, refresh } = usePortfolio();

  const liveCount = rows.filter((row) => row.priceProvider === 'alpaca' || row.priceProvider === 'coinmarketcap' || row.priceProvider === 'sahmk').length;
  const snapshotCount = rows.filter((row) => row.priceProvider && row.priceProvider !== 'alpaca' && row.priceProvider !== 'coinmarketcap' && row.priceProvider !== 'sahmk').length;
  const unsupportedCount = rows.filter((row) => row.price == null).length;

  if (isLoading) {
    return (
      <section className="page-intro card card--hero">
        <span className="hero-badge">Shared Portfolio</span>
        <h1 className="page-title">Loading shared portfolio...</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        title="Portfolio unavailable"
        description={errorMessage}
        action={<Link to="/settings">Open Settings</Link>}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No holdings yet"
        description="The shared portfolio is empty. Unlock admin access in Settings to add the first holding."
        action={
          <Link to="/settings">
            <Button variant="primary">Open Settings</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="dashboard">
      <section className="hero-panel card card--hero">
        <div className="hero-panel__content">
          <div className="hero-panel__headline">
            <span className="hero-badge">Live Routing Active</span>
            <h1 className="page-title">Trading-floor clarity for a mixed-market portfolio.</h1>
            <p className="hero-panel__lede">
              US names route through Alpaca, crypto routes through CoinMarketCap, Saudi equities route through Sahmk, and unsupported sleeves hold their last trusted snapshot so the book stays readable.
            </p>
          </div>

          <div className="hero-panel__meta">
            <div className="hero-chip">
              <span>Tracked positions</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="hero-chip">
              <span>Live marks</span>
              <strong>{liveCount}</strong>
            </div>
            <div className="hero-chip">
              <span>Snapshot marks</span>
              <strong>{snapshotCount}</strong>
            </div>
            <div className="hero-chip">
              <span>Awaiting quotes</span>
              <strong>{unsupportedCount}</strong>
            </div>
          </div>
        </div>

        <div className="hero-panel__actions">
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
              {isFetching ? 'Refreshing...' : 'Refresh markets'}
            </Button>
          </div>

          <div className="market-coverage card card--dark">
            <div className="market-coverage__row">
              <span>Base currency</span>
              <strong>{settings.baseCurrency}</strong>
            </div>
            <div className="market-coverage__row">
              <span>US venues</span>
              <strong>Alpaca</strong>
            </div>
            <div className="market-coverage__row">
              <span>Crypto</span>
              <strong>CoinMarketCap</strong>
            </div>
            <div className="market-coverage__row">
              <span>Saudi market</span>
              <strong>Sahmk</strong>
            </div>
            <div className="market-coverage__row">
              <span>Fallback</span>
              <strong>Snapshot</strong>
            </div>
          </div>
        </div>
      </section>

      <PortfolioSummaryComponent
        summary={summary}
        baseCurrency={settings.baseCurrency}
      />

      <section className="section-block section-block--dark">
        <div className="section-block__header">
          <div>
            <span className="section-kicker">Allocation + exposure</span>
            <h2 className="section-title">Read the portfolio the way a trading desk would.</h2>
          </div>
        </div>

        <div className="dashboard__charts">
          <AllocationPie
            data={summary.byAssetType}
            title="Allocation by Asset Type"
          />
          <PLBar rows={rows} baseCurrency={settings.baseCurrency} />
        </div>
      </section>
    </div>
  );
}
