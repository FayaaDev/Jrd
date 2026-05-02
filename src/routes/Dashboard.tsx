import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import AllocationPie from '../components/AllocationPie';
import PLBar from '../components/PLBar';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { fmtAge } from '../lib/format';

export default function Dashboard() {
  const {
    rows,
    summary,
    settings,
    isFetching,
    isLoading,
    errorMessage,
    priceErrorMessage,
    quoteErrors,
    lastUpdated,
    canRefreshMarkets,
    refresh,
  } = usePortfolio();

  const usCount = rows.filter((row) => row.priceProvider === 'alpaca').length;
  const saudiCount = rows.filter((row) => row.priceProvider === 'sahmk').length;
  const cryptoCount = rows.filter((row) => row.assetType === 'crypto' || row.priceProvider === 'coinmarketcap').length;
  const cashCount = rows.filter((row) => row.assetType === 'cash').length;
  const otherCount = Math.max(0, rows.length - usCount - saudiCount - cryptoCount - cashCount);

  if (isLoading) {
    return (
      <section className="page-intro card card--hero">
        <span className="hero-badge">Private ledger</span>
        <h1 className="page-title">Loading your portfolio...</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        title="Portfolio unavailable"
        description={errorMessage}
        action={<Link to="/app/settings">Open Settings</Link>}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No holdings yet"
        description="Your ledger is ready. Add your first holding to start tracking the portfolio."
        action={
          <Link to="/app/holdings">
            <Button variant="primary">Add Holding</Button>
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
            <span className="hero-badge">Live routing active</span>
            <h1 className="page-title">Track your private ledger with live, market-aware pricing.</h1>
            <p className="hero-panel__lede">
              US names route through Alpaca, crypto routes through CoinMarketCap, Saudi equities route through Sahmk, and unsupported sleeves keep their last trusted snapshot so your book stays readable.
            </p>
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
              disabled={!canRefreshMarkets || isFetching}
            >
              {isFetching ? 'Refreshing...' : 'Refresh markets'}
            </Button>
            {priceErrorMessage && (
              <span className="text-negative">{priceErrorMessage}</span>
            )}
            {Object.keys(quoteErrors).length > 0 && !priceErrorMessage && (
              <span className="text-muted">Live quote warnings: {Object.keys(quoteErrors).join(', ')}</span>
            )}
          </div>

          <div className="market-coverage card card--dark" aria-label="Portfolio classification">
            <div className="market-coverage__row">
              <span>US market</span>
              <strong>{usCount} assets</strong>
            </div>
            <div className="market-coverage__row">
              <span>Saudi market</span>
              <strong>{saudiCount} assets</strong>
            </div>
            <div className="market-coverage__row">
              <span>Crypto</span>
              <strong>{cryptoCount} assets</strong>
            </div>
            <div className="market-coverage__row">
              <span>Cash</span>
              <strong>{cashCount} assets</strong>
            </div>
            <div className="market-coverage__row">
              <span>Other</span>
              <strong>{otherCount} assets</strong>
            </div>
          </div>
        </div>
      </section>

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
            baseCurrency={settings.baseCurrency}
          />
          <PLBar rows={rows} baseCurrency={settings.baseCurrency} />
        </div>
      </section>
    </div>
  );
}
