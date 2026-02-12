import { Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useState } from 'react';
import { PathSequence } from '../lib/path-queries';

const { Text } = Typography;

interface PathTableProps {
  sequences: PathSequence[];
  totalUsers: number;
}

interface TableDataType extends PathSequence {
  key: string;
}

const PathTable: React.FC<PathTableProps> = ({ sequences, totalUsers }) => {
  const [pageSize, setPageSize] = useState(10);

  // Prepare table data
  const tableData: TableDataType[] = sequences.map((seq, index) => ({
    key: `path-${index}`,
    ...seq,
  }));

  // Dynamic columns based on max path length
  const maxLength = Math.max(...sequences.map(s => s.sequence.length), 0);

  const stepColumns: ColumnsType<TableDataType> = Array.from({ length: maxLength }, (_, i) => ({
    title: `Step ${i + 1}`,
    key: `step-${i}`,
    width: 150,
    render: (_, record) => {
      const event = record.sequence[i];
      return event ? (
        <Tag color="blue" style={{ fontSize: 12 }}>
          {event}
        </Tag>
      ) : (
        <Text type="secondary">—</Text>
      );
    },
  }));

  const columns: ColumnsType<TableDataType> = [
    {
      title: '#',
      key: 'index',
      width: 50,
      render: (_, __, index) => (
        <Text strong>{index + 1}</Text>
      ),
    },
    ...stepColumns,
    {
      title: 'Users',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      defaultSortOrder: 'descend',
      render: (count: number) => (
        <Text strong>{count.toLocaleString()}</Text>
      ),
    },
    {
      title: '% of Total',
      dataIndex: 'percentage',
      key: 'percentage',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.percentage - b.percentage,
      render: (percentage: number) => (
        <Text type="success">{percentage}%</Text>
      ),
    },
    {
      title: 'Path Length',
      key: 'length',
      width: 100,
      align: 'center',
      sorter: (a, b) => a.sequence.length - b.sequence.length,
      render: (_, record) => (
        <Tag color="geekblue">{record.sequence.length} steps</Tag>
      ),
    },
  ];

  if (sequences.length === 0) {
    return (
      <Card title="Path Details Table">
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          No path data available. Configure and calculate paths to see the detailed table.
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Path Details Table"
      style={{ marginBottom: 24 }}
      extra={
        <Text type="secondary">
          Showing top {sequences.length} paths out of {totalUsers.toLocaleString()} total users
        </Text>
      }
    >
      <Table
        dataSource={tableData}
        columns={columns}
        pagination={{
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          onShowSizeChange: (_, size) => setPageSize(size),
          showTotal: (total) => `Total ${total} paths`,
        }}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default PathTable;
