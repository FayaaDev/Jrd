import type { PortfolioSummary as PortfolioSummaryType } from '../lib/metrics';
import { fmtCurrency, fmtPercent } from '../lib/format';
import { Card } from './ui/Card';

interface Props {
  summary: PortfolioSummaryType | undefined;
  baseCurrency: string;
}

interface StatCardProps {
  label: string;
  value: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}

function StatCard({ label, value, highlight = 'neutral' }: StatCardProps) {
  return (
    <Card className={`stat-card stat-card--${highlight}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
    </Card>
  );
}

export default function PortfolioSummary({ summary, baseCurrency }: Props) {
  const marketValue = summary?.totalMV != null ? fmtCurrency(summary.totalMV, baseCurrency) : '—';
  const totalCost = summary != null ? fmtCurrency(summary.totalCost, baseCurrency) : '—';
  const unrealizedPl = summary?.totalPL != null ? fmtCurrency(summary.totalPL, baseCurrency) : '—';
  const plPct = summary?.totalPLPct != null ? fmtPercent(summary.totalPLPct) : '—';

  const highlight: 'positive' | 'negative' | 'neutral' =
    summary?.totalPL == null
      ? 'neutral'
      : summary.totalPL >= 0
      ? 'positive'
      : 'negative';

  return (
    <div className="portfolio-summary">
      <StatCard label="Market Value" value={marketValue} />
      <StatCard label="Total Cost" value={totalCost} />
      <StatCard label="Unrealized P/L" value={unrealizedPl} highlight={highlight} />
      <StatCard label="P/L %" value={plPct} highlight={highlight} />
    </div>
  );
}
