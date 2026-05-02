import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { fmtCurrency } from '../lib/format';

interface Props {
  data: Record<string, number>;
  title?: string;
  baseCurrency?: string;
}

const COLORS = [
  '#F0B90B',
  '#F8D12F',
  '#0ECB81',
  '#F6465D',
  '#FFD000',
  '#848E9C',
  '#32313A',
  '#686A6C',
  '#2B2F36',
  '#D0980B',
];

export default function AllocationPie({ data, title, baseCurrency }: Props) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (entries.length === 0) return null;

  const labels = entries.map((d) => d.name);
  const series = entries.map((d) => d.value);
  const total = series.reduce((s, v) => s + v, 0);

  const options: ApexOptions = {
    chart: {
      type: 'donut',
      toolbar: { show: false },
      animations: { enabled: true },
    },
    labels,
    colors: COLORS,
    legend: {
      show: true,
      position: 'bottom',
      labels: { colors: 'var(--color-text)' },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number, opts) => {
        const name = opts?.w?.globals?.labels?.[opts?.seriesIndex ?? 0] ?? '';
        return `${name} ${val.toFixed(1)}%`;
      },
      style: {
        fontSize: '12px',
        fontWeight: '600',
      },
      dropShadow: { enabled: false },
    },
    tooltip: {
      y: {
        formatter: (value: number) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          const formattedValue = baseCurrency ? fmtCurrency(value, baseCurrency) : value.toFixed(2);
          return `${formattedValue} (${pct.toFixed(2)}%)`;
        },
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '62%',
        },
      },
    },
    stroke: {
      width: 0,
    },
  };

  return (
    <div className="chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ReactApexChart options={options} series={series} type="donut" height={280} />
    </div>
  );
}
