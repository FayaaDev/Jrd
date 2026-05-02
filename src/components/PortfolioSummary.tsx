import type { PortfolioSummary as PortfolioSummaryType } from '../lib/metrics';
import { fmtPercent } from '../lib/format';
import { Card } from './ui/Card';
import { useI18n } from '../i18n/useI18n';
import type { ReactNode } from 'react';

interface Props {
  summary: PortfolioSummaryType | undefined;
  baseCurrency: string;
}

interface StatCardProps {
  eyebrow: string;
  label: string;
  value: ReactNode;
  subtitle?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}

function StatCard({ eyebrow, label, value, subtitle, highlight = 'neutral' }: StatCardProps) {
  return (
    <Card className={`stat-card stat-card--${highlight}`}>
      <div className="stat-card__eyebrow">{eyebrow}</div>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {subtitle && <div className="stat-card__meta">{subtitle}</div>}
    </Card>
  );
}

function MoneyValue({ value, currency }: { value: number | undefined; currency: string }) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);

  const currencyPart = parts.find((p) => p.type === 'currency')?.value ?? currency;
  const rest = parts
    .filter((p) => p.type !== 'currency')
    .map((p) => p.value)
    .join('')
    .trim();

  return (
    <span className="stat-card__money">
      <span className="stat-card__amount">{rest}</span>
      <span className="stat-card__currency" aria-label={currency}>{currencyPart}</span>
    </span>
  );
}

export default function PortfolioSummary({ summary, baseCurrency }: Props) {
  const { t } = useI18n();
  const marketValue = <MoneyValue value={summary?.totalMV} currency={baseCurrency} />;
  const totalCost = <MoneyValue value={summary?.totalCost} currency={baseCurrency} />;
  const unrealizedPl = <MoneyValue value={summary?.totalPL} currency={baseCurrency} />;
  const plPct = summary?.totalPLPct != null ? fmtPercent(summary.totalPLPct) : '—';

  const highlight: 'positive' | 'negative' | 'neutral' =
    summary?.totalPL == null
      ? 'neutral'
      : summary.totalPL >= 0
      ? 'positive'
      : 'negative';

  return (
    <div className="portfolio-summary">
      <StatCard
        eyebrow={t('portfolio_summary_eyebrow')}
        label={t('portfolio_summary_market_value_label')}
        value={marketValue}
        subtitle={t('portfolio_summary_market_value_subtitle')}
      />
      <StatCard
        eyebrow={t('portfolio_summary_eyebrow')}
        label={t('portfolio_summary_total_cost_label')}
        value={totalCost}
        subtitle={t('portfolio_summary_total_cost_subtitle')}
      />
      <StatCard
        eyebrow={t('portfolio_summary_eyebrow')}
        label={t('portfolio_summary_unrealized_pl_label')}
        value={unrealizedPl}
        subtitle={t('portfolio_summary_unrealized_pl_subtitle')}
        highlight={highlight}
      />
      <StatCard
        eyebrow={t('portfolio_summary_eyebrow')}
        label={t('portfolio_summary_pl_pct_label')}
        value={plPct}
        subtitle={t('portfolio_summary_pl_pct_subtitle')}
        highlight={highlight}
      />
    </div>
  );
}
