import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { HoldingRow } from '../lib/metrics';
import { fmtCurrency } from '../lib/format';

interface Props {
  rows: HoldingRow[];
  baseCurrency: string;
}

export default function PLBar({ rows, baseCurrency }: Props) {
  const chartData = rows
    .filter((r) => r.unrealizedPL != null)
    .map((r) => ({
      symbol: r.symbol,
      pl: r.unrealizedPL ?? 0,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="chart-container">
      <h3 className="chart-title">Unrealized P/L by Holding</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <XAxis dataKey="symbol" tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => fmtCurrency(v, baseCurrency)}
            width={80}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number) => [fmtCurrency(value, baseCurrency), 'P/L']}
          />
          <ReferenceLine y={0} stroke="var(--color-border)" />
          <Bar dataKey="pl" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.pl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
