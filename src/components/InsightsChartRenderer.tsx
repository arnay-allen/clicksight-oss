import { message, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateGranularity, getEventMetric, getEventMetricWithBreakdown, MetricConfig } from '../lib/clickhouse';

interface InsightsChartRendererProps {
  config: any;
  height?: number;
}

const COLORS = [
  '#9D6CFF', '#FF6B9D', '#4ECDC4', '#FFD93D', '#FF6B6B',
  '#6BCF7F', '#A8DADC', '#F4A261', '#E76F51', '#2A9D8F'
];

const InsightsChartRenderer: React.FC<InsightsChartRendererProps> = ({ config, height = 300 }) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChartData();
  }, [config]);

  const loadChartData = async () => {
    if (!config || !config.dataSources || config.dataSources.length === 0) {
      setError('No data sources configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { dataSources, dateRange, granularity, breakdownProperties } = config;

      if (!dateRange || !dateRange.start || !dateRange.end) {
        throw new Error('Date range not configured');
      }

      const hasBreakdown = breakdownProperties && breakdownProperties.length > 0;

      if (hasBreakdown) {
        // Load with breakdown
        await loadWithBreakdown(dataSources, dateRange, granularity, breakdownProperties);
      } else {
        // Load without breakdown
        await loadWithoutBreakdown(dataSources, dateRange, granularity);
      }
    } catch (err: any) {
      console.error('Failed to load chart data:', err);
      setError(err.message || 'Failed to load chart data');
      message.error(`Failed to load chart: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadWithoutBreakdown = async (dataSources: any[], dateRange: any, granularity: string) => {
    // Check if metric config is provided
    const metricConfig: MetricConfig = (config.metricConfig) || { type: 'total' };

    const allPromises = dataSources.flatMap((ds: any) =>
      ds.events.map((eventName: string) =>
        getEventMetric(
          ds.table,
          eventName,
          dateRange.start,
          dateRange.end,
          metricConfig,
          (granularity || 'daily') as DateGranularity,
          ds.filters
        ).then((data) => ({ eventName, table: ds.table, data }))
      )
    );

    const results = await Promise.all(allPromises);

    // Merge all results into a single dataset
    const mergedData: { [key: string]: any } = {};

    results.forEach(({ eventName, table, data }) => {
      data.forEach((item: any) => {
        const dateKey = item.date;
        if (!mergedData[dateKey]) {
          mergedData[dateKey] = { date: dateKey };
        }
        const key = `${table}__${eventName}`;
        mergedData[dateKey][key] = item.count;
      });
    });

    const finalData = Object.values(mergedData).sort((a: any, b: any) =>
      a.date.localeCompare(b.date)
    );

    setChartData(finalData);
  };

  const loadWithBreakdown = async (
    dataSources: any[],
    dateRange: any,
    granularity: string,
    breakdownProperties: any[]
  ) => {
    // Check if metric config is provided
    const metricConfig: MetricConfig = (config.metricConfig) || { type: 'total' };

    const allPromises = dataSources.flatMap((ds: any) =>
      ds.events.map((eventName: string) =>
        getEventMetricWithBreakdown(
          ds.table,
          eventName,
          dateRange.start,
          dateRange.end,
          metricConfig,
          (granularity || 'daily') as DateGranularity,
          breakdownProperties,
          ds.filters,
          ds.filterLogic
        ).then((data) => ({ eventName, table: ds.table, data }))
      )
    );

    const results = await Promise.all(allPromises);

    // For breakdown, we show each segment as a separate line
    const mergedData: { [key: string]: any } = {};
    const allSegments = new Set<string>();

    results.forEach(({ eventName, table, data }) => {
      // data is TrendBreakdown[] - an array of {segmentName, data: [...]}
      data.forEach((breakdown: any) => {
        const segmentKey = `${table}__${eventName}__${breakdown.segmentName}`;
        allSegments.add(segmentKey);

        breakdown.data.forEach((item: any) => {
          const dateKey = item.date;
          if (!mergedData[dateKey]) {
            mergedData[dateKey] = { date: dateKey };
          }
          mergedData[dateKey][segmentKey] = item.count;
        });
      });
    });

    const finalData = Object.values(mergedData).sort((a: any, b: any) =>
      a.date.localeCompare(b.date)
    );

    setChartData(finalData);
  };

  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  const getDataKeys = () => {
    if (chartData.length === 0) return [];
    const firstItem = chartData[0];
    return Object.keys(firstItem).filter((key) => key !== 'date');
  };

  const formatLegendLabel = (value: string) => {
    // Format: table__eventName or table__eventName__segment
    const parts = value.split('__');
    if (parts.length === 2) {
      return parts[1]; // eventName
    } else if (parts.length === 3) {
      return `${parts[1]} (${parts[2]})`; // eventName (segment)
    }
    return value;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <Spin size="large" tip="Loading chart data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, color: '#ff4d4f' }}>
        {error}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, color: '#888' }}>
        No data available for the selected date range
      </div>
    );
  }

  const dataKeys = getDataKeys();

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="date" stroke="#888" style={{ fontSize: 11 }} />
          <YAxis stroke="#888" style={{ fontSize: 11 }} tickFormatter={formatYAxis} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(20, 20, 20, 0.95)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
            }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: any) => [value.toLocaleString(), '']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={formatLegendLabel}
          />
          {dataKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default InsightsChartRenderer;
