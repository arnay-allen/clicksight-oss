import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getAbsoluteDateRange } from '../lib/dateRanges';
import FunnelChartRenderer from './FunnelChartRenderer';
import InsightsChartRenderer from './InsightsChartRenderer';

interface ChartRendererProps {
  chartId?: string;
  chartName?: string;
  chartCategory: 'insights' | 'funnels';
  chartConfig: string; // JSON string
  height?: number;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartId: _chartId,
  chartName: _chartName,
  chartCategory,
  chartConfig,
  height = 300,
}) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsedConfig = JSON.parse(chartConfig);

      // Convert relative date ranges to absolute dates
      if (parsedConfig.dateRangeConfig) {
        const [start, end] = getAbsoluteDateRange(parsedConfig.dateRangeConfig);
        parsedConfig.dateRange = {
          start: start.format('YYYY-MM-DD'),
          end: end.format('YYYY-MM-DD'),
        };
      }

      setConfig(parsedConfig);
      setError(null);
    } catch (err: any) {
      console.error('Failed to parse chart config:', err);
      setError('Invalid chart configuration');
    } finally {
      setLoading(false);
    }
  }, [chartConfig]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, color: '#ff4d4f' }}>
        {error || 'Failed to load chart'}
      </div>
    );
  }

  if (chartCategory === 'insights') {
    return <InsightsChartRenderer config={config} height={height}  />;
  } else if (chartCategory === 'funnels') {
    return <FunnelChartRenderer config={config} height={height}  />;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
      Unknown chart type
    </div>
  );
};

export default ChartRenderer;
