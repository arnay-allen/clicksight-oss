import { Card, Empty, Table, Typography } from 'antd';
import React from 'react';
import { CohortRow } from '../lib/cohort-queries';

const { Text } = Typography;

interface CohortTableProps {
  cohortData: CohortRow[];
  retentionWindow: number;
  cohortPeriod: 'daily' | 'weekly' | 'monthly';
}

/**
 * Get heatmap color based on retention percentage
 */
function getHeatmapColor(value: number | undefined): string {
  if (value === undefined || value === null) {
    return '#f5f5f5'; // Gray for N/A
  }

  // Color gradient from red (low) to green (high)
  if (value >= 80) return '#52c41a'; // Green
  if (value >= 60) return '#95de64'; // Light green
  if (value >= 40) return '#ffe58f'; // Yellow
  if (value >= 20) return '#ffbb96'; // Orange
  return '#ff7875'; // Red
}

const CohortTable: React.FC<CohortTableProps> = ({
  cohortData,
  retentionWindow,
  cohortPeriod,
}) => {
  if (cohortData.length === 0) {
    return (
      <Card>
        <Empty description="No cohort data available" />
      </Card>
    );
  }

  const periodLabel = cohortPeriod === 'daily' ? 'Day' : 
                      cohortPeriod === 'weekly' ? 'Week' : 'Month';

  // Build table columns
  const columns: any[] = [
    {
      title: 'Cohort',
      dataIndex: 'cohortDate',
      key: 'cohortDate',
      fixed: 'left',
      width: 120,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Size',
      dataIndex: 'cohortSize',
      key: 'cohortSize',
      width: 80,
      render: (size: number) => <Text>{size.toLocaleString()}</Text>,
    },
  ];

  // Add retention period columns
  for (let i = 0; i <= retentionWindow; i++) {
    columns.push({
      title: `${periodLabel} ${i}`,
      dataIndex: `period_${i}`,
      key: `period_${i}`,
      width: 80,
      align: 'center' as const,
      render: (value: number | undefined) => {
        const bgColor = getHeatmapColor(value);
        const textColor = value !== undefined && value >= 60 ? '#fff' : '#000';
        
        return (
          <div
            style={{
              backgroundColor: bgColor,
              color: textColor,
              padding: '8px',
              borderRadius: '4px',
              fontWeight: 500,
              transition: 'all 0.3s',
            }}
          >
            {value !== undefined ? `${value.toFixed(1)}%` : 'N/A'}
          </div>
        );
      },
    });
  }

  // Transform data for table
  const tableData = cohortData.map((cohort, index) => ({
    key: index,
    cohortDate: cohort.cohortDate,
    cohortSize: cohort.cohortSize,
    ...cohort.retentionData,
  }));

  return (
    <Card 
      style={{ marginTop: 24 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong>Cohort Retention Table</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            (Hover over cells to see exact percentages)
          </Text>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Text type="secondary">Color Legend:</Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#ff7875', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{'< 20%'}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#ffbb96', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>20-40%</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#ffe58f', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>40-60%</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#95de64', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>60-80%</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#52c41a', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{'≥ 80%'}</Text>
            </div>
          </div>
        </div>
      </div>
      
      <Table
        columns={columns}
        dataSource={tableData}
        scroll={{ x: 'max-content' }}
        pagination={false}
        size="small"
        bordered
      />
    </Card>
  );
};

export default CohortTable;

