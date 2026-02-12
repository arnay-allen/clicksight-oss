import { Card, Empty } from 'antd';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RetentionDataPoint } from '../lib/retention-queries';

interface RetentionChartProps {
  data: RetentionDataPoint[];
  title?: string;
  height?: number;
}

const COLORS = [
  '#9D6CFF', '#FF6B9D', '#4ECDC4', '#FFD93D', '#FF6B6B',
  '#6BCF7F', '#A8DADC', '#F4A261', '#E76F51', '#2A9D8F'
];

const RetentionChart: React.FC<RetentionChartProps> = ({ data, title = 'Retention Curve', height = 400 }) => {
  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <Empty description="No retention data available" />
      </Card>
    );
  }

  // Transform data for Recharts
  // We need to create a dataset where each row represents a day, 
  // and each cohort is a separate line
  const allDays = new Set<number>();
  data.forEach(cohort => {
    cohort.retentionData.forEach(point => allDays.add(point.day));
  });
  const sortedDays = Array.from(allDays).sort((a, b) => a - b);

  const chartData = sortedDays.map(day => {
    const dataPoint: any = { day: `Day ${day}` };
    
    data.forEach((cohort, index) => {
      const point = cohort.retentionData.find(p => p.day === day);
      dataPoint[`cohort_${index}`] = point ? point.retentionRate : null;
    });
    
    return dataPoint;
  });

  return (
    <Card
      title={title}
      style={{
        marginTop: '16px',
      }}
      bodyStyle={{ padding: '24px' }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
          <XAxis
            dataKey="day"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
            }}
            formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, '']}
          />
          <Legend
            formatter={(value) => {
              const cohortIndex = parseInt(value.split('_')[1]);
              return data[cohortIndex] ? `${data[cohortIndex].cohortDate} (${data[cohortIndex].cohortSize} users)` : value;
            }}
          />
          {data.map((_cohort, index) => (
            <Line
              key={index}
              type="monotone"
              dataKey={`cohort_${index}`}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
              name={`cohort_${index}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default RetentionChart;

