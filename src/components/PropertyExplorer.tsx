import { CopyOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, Input, message, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { exportPropertyStatistics, getPropertyList, getPropertyStatistics, PropertyInfo, PropertyStatistics } from '../lib/property-explorer';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const PropertyExplorer: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'day').startOf('day'),
    dayjs().subtract(1, 'day').endOf('day'),
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [propertyStats, setPropertyStats] = useState<PropertyStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  // Load property list on mount and when filters change
  useEffect(() => {
    loadProperties();
  }, [dateRange]);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const [startDate, endDate] = dateRange;
      const props = await getPropertyList(
        'app_events',
        startDate.format('YYYY-MM-DD'),
        endDate.format('YYYY-MM-DD'),
        searchTerm
      );
      setProperties(props);
    } catch (error: any) {
      message.error('Failed to load properties: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPropertyStats = async (property: string) => {
    setSelectedProperty(property);
    setStatsLoading(true);
    setPropertyStats(null);
    
    try {
      const [startDate, endDate] = dateRange;
      const stats = await getPropertyStatistics(
        'app_events',
        property,
        startDate.format('YYYY-MM-DD'),
        endDate.format('YYYY-MM-DD')
      );
      setPropertyStats(stats);
    } catch (error: any) {
      message.error('Failed to load property statistics: ' + error.message);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSearch = () => {
    loadProperties();
  };

  const handleCopyProperty = (property: string) => {
    navigator.clipboard.writeText(property);
    message.success('Property name copied to clipboard');
  };

  const handleExport = () => {
    if (propertyStats) {
      exportPropertyStatistics(propertyStats);
      message.success('Property statistics exported');
    }
  };

  const getDataTypeColor = (dataType: PropertyInfo['dataType']) => {
    switch (dataType) {
      case 'number': return 'blue';
      case 'string': return 'green';
      case 'date': return 'purple';
      case 'boolean': return 'orange';
      case 'mixed': return 'default';
      default: return 'default';
    }
  };

  const getDataTypeIcon = (dataType: PropertyInfo['dataType']) => {
    switch (dataType) {
      case 'number': return '123';
      case 'string': return 'Abc';
      case 'date': return '📅';
      case 'boolean': return '✓/✗';
      case 'mixed': return '⚡';
      default: return '?';
    }
  };

  const propertyColumns = [
    {
      title: 'Property Name',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
      ellipsis: true,
      render: (name: string) => (
        <Space style={{ whiteSpace: 'nowrap' }}>
          <Text strong style={{ fontFamily: 'monospace' }}>{name}</Text>
          <Tooltip title="Copy property name">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleCopyProperty(name);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'dataType',
      key: 'dataType',
      width: '12%',
      render: (dataType: PropertyInfo['dataType']) => (
        <Tag color={getDataTypeColor(dataType)}>
          {getDataTypeIcon(dataType)} {dataType}
        </Tag>
      ),
      filters: [
        { text: 'String', value: 'string' },
        { text: 'Number', value: 'number' },
        { text: 'Date', value: 'date' },
        { text: 'Boolean', value: 'boolean' },
        { text: 'Mixed', value: 'mixed' },
      ],
      onFilter: (value: any, record: PropertyInfo) => record.dataType === value,
    },
    {
      title: 'Total Count',
      dataIndex: 'totalCount',
      key: 'totalCount',
      width: '12%',
      render: (count: number) => count.toLocaleString(),
      sorter: (a: PropertyInfo, b: PropertyInfo) => a.totalCount - b.totalCount,
    },
    {
      title: 'Unique Values',
      dataIndex: 'uniqueCount',
      key: 'uniqueCount',
      width: '12%',
      render: (count: number) => count.toLocaleString(),
      sorter: (a: PropertyInfo, b: PropertyInfo) => a.uniqueCount - b.uniqueCount,
    },
    {
      title: 'Null/Empty',
      key: 'nullEmpty',
      width: '12%',
      render: (_: any, record: PropertyInfo) => {
        const nullEmptyCount = record.nullCount + record.emptyCount;
        const percentage = record.totalCount > 0 
          ? ((nullEmptyCount / record.totalCount) * 100).toFixed(1)
          : '0';
        return `${nullEmptyCount.toLocaleString()} (${percentage}%)`;
      },
      sorter: (a: PropertyInfo, b: PropertyInfo) => 
        (a.nullCount + a.emptyCount) - (b.nullCount + b.emptyCount),
    },
    {
      title: 'Sample Values',
      dataIndex: 'sampleValues',
      key: 'sampleValues',
      width: '22%',
      render: (values: string[]) => (
        <Text ellipsis style={{ fontSize: '12px', color: '#888' }}>
          {values.slice(0, 3).join(', ')}
        </Text>
      ),
    },
  ];

  const topValuesColumns = [
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '50%',
      render: (value: string) => (
        <Space>
          <Text code>{value}</Text>
          <Tooltip title="Copy value">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(value);
                message.success('Value copied to clipboard');
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
      width: '25%',
      render: (count: number) => count.toLocaleString(),
    },
    {
      title: 'Percentage',
      dataIndex: 'percentage',
      key: 'percentage',
      width: '25%',
      render: (percentage: number) => `${percentage.toFixed(2)}%`,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Property Explorer</Title>
        <Text type="secondary">
          Explore event properties, their distributions, and statistics
        </Text>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={10}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Search properties..."
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onPressEnter={handleSearch}
              />
              <Button type="primary" onClick={handleSearch}>
                Search
              </Button>
            </Space.Compact>
          </Col>
          <Col span={8}>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Text type="secondary">
              {properties.length} properties found
            </Text>
          </Col>
        </Row>
      </Card>

      <Row gutter={24}>
        {/* Property List */}
        <Col span={selectedProperty ? 14 : 24}>
          <Card title="Properties" loading={loading}>
            <Table
              dataSource={properties}
              columns={propertyColumns}
              rowKey="name"
              pagination={{ 
                pageSize: pageSize,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                onShowSizeChange: (_current, size) => setPageSize(size),
              }}
              onRow={(record) => ({
                onClick: () => loadPropertyStats(record.name),
                style: { cursor: 'pointer' },
              })}
              size="small"
            />
          </Card>
        </Col>

        {/* Property Details */}
        {selectedProperty && (
          <Col span={10}>
            <Card
              title={
                <Space>
                  <Text>Property Details</Text>
                  {propertyStats && (
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={handleExport}
                    >
                      Export
                    </Button>
                  )}
                </Space>
              }
              extra={
                <Button
                  type="text"
                  size="small"
                  onClick={() => {
                    setSelectedProperty(null);
                    setPropertyStats(null);
                  }}
                >
                  ✕
                </Button>
              }
              loading={statsLoading}
            >
              {propertyStats && (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* Property Name */}
                  <div>
                    <Text strong style={{ fontSize: '18px', fontFamily: 'monospace' }}>
                      {propertyStats.property}
                    </Text>
                    <br />
                    <Tag color={getDataTypeColor(propertyStats.dataType)} style={{ marginTop: 8 }}>
                      {getDataTypeIcon(propertyStats.dataType)} {propertyStats.dataType}
                    </Tag>
                  </div>

                  {/* Statistics */}
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title="Total Count"
                        value={propertyStats.totalCount}
                        valueStyle={{ fontSize: '20px' }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Unique Values"
                        value={propertyStats.uniqueCount}
                        valueStyle={{ fontSize: '20px' }}
                      />
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title="Null Values"
                        value={propertyStats.nullCount}
                        suffix={`(${propertyStats.nullPercentage.toFixed(1)}%)`}
                        valueStyle={{ fontSize: '16px' }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Empty Values"
                        value={propertyStats.emptyCount}
                        suffix={`(${propertyStats.emptyPercentage.toFixed(1)}%)`}
                        valueStyle={{ fontSize: '16px' }}
                      />
                    </Col>
                  </Row>

                  {/* Numeric Statistics */}
                  {propertyStats.numericStats && (
                    <>
                      <div>
                        <Text strong>Numeric Statistics</Text>
                        <Row gutter={8} style={{ marginTop: 8 }}>
                          <Col span={12}>
                            <Text type="secondary">Min: </Text>
                            <Text>{propertyStats.numericStats.min.toFixed(2)}</Text>
                          </Col>
                          <Col span={12}>
                            <Text type="secondary">Max: </Text>
                            <Text>{propertyStats.numericStats.max.toFixed(2)}</Text>
                          </Col>
                          <Col span={12}>
                            <Text type="secondary">Avg: </Text>
                            <Text>{propertyStats.numericStats.avg.toFixed(2)}</Text>
                          </Col>
                          <Col span={12}>
                            <Text type="secondary">Median: </Text>
                            <Text>{propertyStats.numericStats.median.toFixed(2)}</Text>
                          </Col>
                        </Row>
                      </div>

                      {/* Distribution Chart */}
                      <div>
                        <Text strong>Distribution</Text>
                        <div style={{ marginTop: 16, height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={propertyStats.numericStats.distribution}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="bucket" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                style={{ fontSize: '10px' }}
                              />
                              <YAxis />
                              <RechartsTooltip />
                              <Bar dataKey="count" fill="#1890ff" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Top Values Distribution Chart (for string properties) */}
                  {!propertyStats.numericStats && propertyStats.topValues.length > 0 && (
                    <div>
                      <Text strong>Value Distribution</Text>
                      <div style={{ marginTop: 16, height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={propertyStats.topValues}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="value" 
                              angle={-45}
                              textAnchor="end"
                              height={80}
                              style={{ fontSize: '10px' }}
                            />
                            <YAxis />
                            <RechartsTooltip />
                            <Bar dataKey="count" fill="#52c41a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Top Values */}
                  <div>
                    <Text strong>Top 10 Values</Text>
                    <Table
                      dataSource={propertyStats.topValues}
                      columns={topValuesColumns}
                      rowKey="value"
                      pagination={false}
                      size="small"
                      style={{ marginTop: 8 }}
                    />
                  </div>
                </Space>
              )}
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default PropertyExplorer;

