import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
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

  const series = [
    {
      name: 'P/L',
      data: chartData.map((d) => ({
        x: d.symbol,
        y: d.pl,
        fillColor: d.pl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
      })),
    },
  ];

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      height: 280,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: '72%',
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'category',
      labels: { style: { colors: 'var(--color-text)', fontSize: '12px' } },
    },
    yaxis: {
      labels: {
        style: { colors: 'var(--color-text)', fontSize: '11px' },
        formatter: (v: number) => fmtCurrency(v, baseCurrency),
      },
    },
    tooltip: {
      y: {
        formatter: (value: number) => fmtCurrency(value, baseCurrency),
      },
    },
    grid: {
      borderColor: 'var(--color-border)',
    },
    annotations: {
      yaxis: [
        {
          y: 0,
          borderColor: 'var(--color-border)',
        },
      ],
    },
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">Unrealized P/L by Holding</h3>
      <ReactApexChart options={options} series={series} type="bar" height={280} />
    </div>
  );
}
