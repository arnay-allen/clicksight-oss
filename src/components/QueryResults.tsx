import { DownloadOutlined, DownOutlined } from '@ant-design/icons';
import { Button, Dropdown, Menu, message, Space, Table } from 'antd';
import React, { useState } from 'react';
import type { CustomQueryResult } from '../lib/clickhouse';

interface QueryResultsProps {
  result: CustomQueryResult | null;
  loading?: boolean;
}

const QueryResults: React.FC<QueryResultsProps> = ({ result, loading = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  if (!result) {
    return null;
  }

  // Generate columns from result metadata
  const columns = result.columns.map((col) => ({
    title: col.name,
    dataIndex: col.name,
    key: col.name,
    ellipsis: true,
    render: (value: any) => {
      if (value === null || value === undefined) {
        return <span style={{ color: '#888', fontStyle: 'italic' }}>null</span>;
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    },
  }));

  // Export functions
  const exportAsCSV = () => {
    try {
      const headers = result.columns.map(col => col.name).join(',');
      const rows = result.data.map(row =>
        result.columns.map(col => {
          const value = row[col.name];
          if (value === null || value === undefined) return '';
          const strValue = String(value);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        }).join(',')
      );

      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query-results-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      message.success('Exported as CSV');
    } catch (error: any) {
      message.error('Failed to export CSV: ' + error.message);
    }
  };

  const exportAsJSON = () => {
    try {
      const json = JSON.stringify(result.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query-results-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);

      message.success('Exported as JSON');
    } catch (error: any) {
      message.error('Failed to export JSON: ' + error.message);
    }
  };

  const exportAsTSV = () => {
    try {
      const headers = result.columns.map(col => col.name).join('\t');
      const rows = result.data.map(row =>
        result.columns.map(col => {
          const value = row[col.name];
          if (value === null || value === undefined) return '';
          return String(value).replace(/\t/g, ' ');
        }).join('\t')
      );

      const tsv = [headers, ...rows].join('\n');
      const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query-results-${Date.now()}.tsv`;
      link.click();
      URL.revokeObjectURL(url);

      message.success('Exported as TSV');
    } catch (error: any) {
      message.error('Failed to export TSV: ' + error.message);
    }
  };

  const exportMenu = (
    <Menu
      items={[
        {
          key: 'csv',
          label: 'Export as CSV',
          onClick: exportAsCSV,
        },
        {
          key: 'json',
          label: 'Export as JSON',
          onClick: exportAsJSON,
        },
        {
          key: 'tsv',
          label: 'Export as TSV',
          onClick: exportAsTSV,
        },
      ]}
    />
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
        <Space>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            Query Results
          </div>
          <div style={{ color: '#888', fontSize: 14 }}>
            {result.rows.toLocaleString()} {result.rows === 1 ? 'row' : 'rows'}
            {result.statistics && (
              <span> • {result.statistics.elapsed.toFixed(2)}s</span>
            )}
            {result.statistics && result.statistics.rows_read > 0 && (
              <span> • {result.statistics.rows_read.toLocaleString()} rows read</span>
            )}
          </div>
        </Space>

        <Dropdown overlay={exportMenu} trigger={['click']}>
          <Button icon={<DownloadOutlined />}>
            Export <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      <Table
        columns={columns}
        dataSource={result.data}
        loading={loading}
        rowKey={(_, index) => String(index)}
        pagination={{
          current: currentPage,
          pageSize,
          total: result.rows,
          showSizeChanger: false,
          showTotal: (total) => `Total ${total} rows`,
          onChange: (page) => setCurrentPage(page),
        }}
        scroll={{ x: 'max-content', y: 500 }}
        size="small"
        bordered
        style={{
          backgroundColor: '#1f1f1f',
        }}
      />
    </div>
  );
};

export default QueryResults;
