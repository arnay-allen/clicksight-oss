import { Spin, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getFunnelData, getFunnelDataWithBreakdown } from '../lib/clickhouse';
import { getAbsoluteDateRange } from '../lib/dateRanges';

interface FunnelChartRendererProps {
  config: any;
  height?: number;
}

const COLORS = ['#9D6CFF', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#FF6B9D', '#FFA500', '#00CED1', '#32CD32', '#FFD700'];

const FunnelChartRenderer: React.FC<FunnelChartRendererProps> = ({ config, height = 300 }) => {
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [segmentNames, setSegmentNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFunnelData();
  }, [config]);

  const loadFunnelData = async () => {
    // Support both 'steps' and 'funnelSteps' for compatibility
    const steps = config?.funnelSteps || config?.steps;
    
    if (!config || !steps || steps.length === 0) {
      setError('No funnel steps configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { dateRange, dateRangeConfig, timeWindow, breakdownProperties, metricConfig } = config;

      // Convert date range (support both new relative and old absolute formats)
      let startDate: string, endDate: string;
      
      if (dateRangeConfig) {
        // New format: relative date range
        const [start, end] = getAbsoluteDateRange(dateRangeConfig);
        startDate = start.format('YYYY-MM-DD');
        endDate = end.format('YYYY-MM-DD');
      } else if (dateRange && dateRange.start && dateRange.end) {
        // Legacy format: absolute dates
        startDate = dayjs(dateRange.start).format('YYYY-MM-DD');
        endDate = dayjs(dateRange.end).format('YYYY-MM-DD');
      } else {
        throw new Error('Date range not configured');
      }

      // NEW: Extract metric config with backwards compatibility
      const metric = metricConfig || { type: 'total' };

      // Check if we have breakdown properties
      const hasBreakdown = breakdownProperties && 
                           breakdownProperties.length > 0 && 
                           breakdownProperties.some((bp: any) => bp.property || typeof bp === 'string');

      if (hasBreakdown) {
        // Load funnel data WITH breakdown (returns FunnelBreakdown[])
        const breakdownData = await getFunnelDataWithBreakdown(
          steps,
          startDate,
          endDate,
          breakdownProperties,
          timeWindow || 86400,
          metric // NEW: Pass metric config
        );

        // Transform breakdown data to show all segments in one chart
        if (breakdownData && breakdownData.length > 0) {
          // Create a combined dataset where each step has data for all segments
          const stepNames = breakdownData[0]?.steps?.map((s: any) => s.stepName) || [];
          const segments = breakdownData.map((bd: any) => bd.segmentName);
          
          const combinedData = stepNames.map((stepName: string, stepIndex: number) => {
            const dataPoint: any = { stepName };
            
            // Add count for each segment
            breakdownData.forEach((segment) => {
              const step = segment.steps[stepIndex];
              dataPoint[segment.segmentName] = step.count;
            });
            
            return dataPoint;
          });

          setSegmentNames(segments);
          setFunnelData(combinedData);
        } else {
          setSegmentNames([]);
          setFunnelData([]);
        }
      } else {
        // Load funnel data WITHOUT breakdown (returns FunnelResult[])
        const funnelResults = await getFunnelData(
          steps,
          startDate,
          endDate,
          timeWindow || 86400,
          metric // NEW: Pass metric config
        );

        if (funnelResults && funnelResults.length > 0) {
          setSegmentNames([]);
          setFunnelData(funnelResults);
        } else {
          setSegmentNames([]);
          setFunnelData([]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load funnel data:', err);
      setError(err.message || 'Failed to load funnel data');
      message.error(`Failed to load funnel: ${err.message}`);
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <Spin size="large" tip="Loading funnel data..." />
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

  if (funnelData.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, color: '#888' }}>
        No data available for this funnel
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={funnelData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 100, bottom: segmentNames.length > 0 ? 40 : 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis type="number" stroke="#888" style={{ fontSize: 11 }} tickFormatter={formatYAxis} />
          <YAxis
            type="category"
            dataKey="stepName"
            stroke="#888"
            style={{ fontSize: 11 }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(20, 20, 20, 0.95)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
            }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: any, name: string) => {
              return [`${value.toLocaleString()} users`, name];
            }}
          />
          {segmentNames.length > 0 && (
            <Legend
              wrapperStyle={{ color: '#fff', fontSize: 11 }}
              iconType="rect"
            />
          )}
          {segmentNames.length > 0 ? (
            // Render multiple bars for breakdown
            segmentNames.map((segmentName, index) => (
              <Bar
                key={segmentName}
                dataKey={segmentName}
                fill={COLORS[index % COLORS.length]}
                radius={[0, 4, 4, 0]}
              />
            ))
          ) : (
            // Render single bar for no breakdown
            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
              {funnelData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FunnelChartRenderer;

