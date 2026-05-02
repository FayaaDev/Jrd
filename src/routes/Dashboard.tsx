import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import AllocationPie from '../components/AllocationPie';
import PLBar from '../components/PLBar';
import PortfolioSummary from '../components/PortfolioSummary';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { fmtAge } from '../lib/format';
import { useI18n } from '../i18n/useI18n';

export default function Dashboard() {
  const { t } = useI18n();
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
        <span className="hero-badge">{t('dashboard_kicker_private')}</span>
        <h1 className="page-title">{t('dashboard_loading')}</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        title={t('dashboard_unavailable')}
        description={errorMessage}
        action={<Link to="/app/settings">{t('dashboard_open_settings')}</Link>}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('dashboard_no_holdings_title')}
        description={t('dashboard_no_holdings_desc')}
        action={
          <Link to="/app/holdings">
            <Button variant="primary">{t('dashboard_add_holding')}</Button>
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
            <span className="hero-badge">{t('dashboard_badge_live')}</span>
            <h1 className="page-title">{t('dashboard_title')}</h1>
            <p className="hero-panel__lede">
              {t('dashboard_lede')}
            </p>
          </div>
        </div>

        <div className="hero-panel__actions">
          <div className="dashboard__refresh">
            {lastUpdated && (
              <span className="text-muted">{t('dashboard_last_refreshed')} {fmtAge(lastUpdated)}</span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
              disabled={!canRefreshMarkets || isFetching}
            >
              {isFetching ? t('dashboard_refreshing') : t('dashboard_refresh_markets')}
            </Button>
            {priceErrorMessage && (
              <span className="text-negative">{priceErrorMessage}</span>
            )}
            {Object.keys(quoteErrors).length > 0 && !priceErrorMessage && (
              <span className="text-muted">{t('dashboard_live_warnings')} {Object.keys(quoteErrors).join(', ')}</span>
            )}
          </div>

          <div className="market-coverage card card--dark" aria-label="Portfolio classification">
            <div className="market-coverage__row">
              <span>{t('dashboard_market_us')}</span>
              <strong>{usCount} {t('dashboard_assets')}</strong>
            </div>
            <div className="market-coverage__row">
              <span>{t('dashboard_market_saudi')}</span>
              <strong>{saudiCount} {t('dashboard_assets')}</strong>
            </div>
            <div className="market-coverage__row">
              <span>{t('dashboard_market_crypto')}</span>
              <strong>{cryptoCount} {t('dashboard_assets')}</strong>
            </div>
            <div className="market-coverage__row">
              <span>{t('dashboard_market_cash')}</span>
              <strong>{cashCount} {t('dashboard_assets')}</strong>
            </div>
            <div className="market-coverage__row">
              <span>{t('dashboard_market_other')}</span>
              <strong>{otherCount} {t('dashboard_assets')}</strong>
            </div>
          </div>
        </div>
      </section>

      <PortfolioSummary summary={summary} baseCurrency={settings.baseCurrency} />

      <section className="section-block section-block--dark">
        <div className="section-block__header">
          <div>
            <span className="section-kicker">{t('dashboard_section_kicker')}</span>
            <h2 className="section-title">{t('dashboard_section_title')}</h2>
          </div>
        </div>

        <div className="dashboard__charts">
          <AllocationPie
            data={summary.byAssetType}
            title={t('dashboard_chart_alloc')}
            baseCurrency={settings.baseCurrency}
          />
          <PLBar rows={rows} baseCurrency={settings.baseCurrency} />
        </div>
      </section>
    </div>
  );
}
