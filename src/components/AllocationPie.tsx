import { PieChart, Pie, Tooltip, Legend, Cell, ResponsiveContainer } from 'recharts';

interface Props {
  data: Record<string, number>;
  title?: string;
}

const COLORS = [
  '#F0B90B', '#F8D12F', '#0ECB81', '#F6465D', '#FFD000',
  '#848E9C', '#32313A', '#686A6C', '#2B2F36', '#D0980B',
];

export default function AllocationPie({ data, title }: Props) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (chartData.length === 0) return null;

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name, value }) =>
              `${name} ${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%`
            }
          >
            {chartData.map((_entry, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [
              `${total > 0 ? ((value / total) * 100).toFixed(2) : 0}%`,
              'Allocation',
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
