import { DownloadOutlined, TableOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, message, Row, Select, Space, Spin, Statistic, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { getEventNames } from '../lib/clickhouse';
import { calculateCohortTable, CohortRow, exportCohortToCSV } from '../lib/cohort-queries';
import CohortTable from './CohortTable';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;

function Cohorts() {
  // Configuration state
  const [activationEvent, setActivationEvent] = useState<string>('');
  const [returnEvent, setReturnEvent] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(60, 'days'),
    dayjs(),
  ]);
  const [cohortPeriod, setCohortPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [retentionWindow, setRetentionWindow] = useState<number>(12);
  const [segmentProperty] = useState<string>('');
  const [segmentValue] = useState<string>('');

  // Data state
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [cohortData, setCohortData] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);

  // Statistics
  const [totalCohorts, setTotalCohorts] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [avgRetention, setAvgRetention] = useState(0);

  // Load available events on mount
  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const events = await getEventNames('app_events');
      setAvailableEvents(events);

      // Auto-select common events if available
      if (events.includes('app_open') && !activationEvent) {
        setActivationEvent('app_open');
        setReturnEvent('app_open');
      }
    } catch (error: any) {
      message.error('Failed to load events');
      console.error('Error loading events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleCalculateCohorts = async () => {
    if (!activationEvent || !returnEvent) {
      message.warning('Please select activation and return events');
      return;
    }

    setLoading(true);
    try {
      const data = await calculateCohortTable({
        activationEvent,
        returnEvent,
        dateRange: [
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
        ],
        cohortPeriod,
        retentionWindow,
        segmentProperty: segmentProperty || undefined,
        segmentValue: segmentValue || undefined,
      });

      setCohortData(data);
      setHasData(true);

      // Calculate statistics
      setTotalCohorts(data.length);

      const totalUsersCount = data.reduce((sum, cohort) => sum + cohort.cohortSize, 0);
      setTotalUsers(totalUsersCount);

      // Calculate average retention (across all periods and cohorts)
      let retentionSum = 0;
      let retentionCount = 0;
      data.forEach((cohort) => {
        Object.values(cohort.retentionData).forEach((value) => {
          if (value !== undefined) {
            retentionSum += value;
            retentionCount++;
          }
        });
      });
      setAvgRetention(retentionCount > 0 ? retentionSum / retentionCount : 0);

      message.success('Cohort data calculated successfully');
    } catch (error: any) {
      message.error(error.message || 'Failed to calculate cohort data');
      console.error('Cohort calculation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    try {
      exportCohortToCSV(cohortData, retentionWindow, cohortPeriod);
      message.success('Cohort data exported successfully');
    } catch (error: any) {
      message.error(error.message || 'Failed to export cohort data');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>Cohort Analysis</Title>
        <Text type="secondary">
          Analyze user retention over time with cohort tables and heatmap visualization
        </Text>
      </div>

      {/* Configuration Panel */}
      <Card title="Configuration" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          {/* Activation Event */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Activation Event</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Defines cohort membership)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder="Select activation event"
              value={activationEvent}
              onChange={setActivationEvent}
              showSearch
              loading={loadingEvents}
              filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {availableEvents.map((event) => (
                <Option key={event} value={event}>
                  {event}
                </Option>
              ))}
            </Select>
          </Col>

          {/* Return Event */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Return Event</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Measures retention)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder="Select return event"
              value={returnEvent}
              onChange={setReturnEvent}
              showSearch
              loading={loadingEvents}
              filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {availableEvents.map((event) => (
                <Option key={event} value={event}>
                  {event}
                </Option>
              ))}
            </Select>
          </Col>

          {/* Date Range */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Cohort Date Range</Text>
            </div>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              format="YYYY-MM-DD"
            />
          </Col>

          {/* Cohort Period */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Cohort Period</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Grouping)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={cohortPeriod}
              onChange={setCohortPeriod}
            >
              <Option value="daily">Daily</Option>
              <Option value="weekly">Weekly</Option>
              <Option value="monthly">Monthly</Option>
            </Select>
          </Col>

          {/* Retention Window */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Retention Window</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Periods to track)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={retentionWindow}
              onChange={setRetentionWindow}
            >
              <Option value={7}>{cohortPeriod === 'daily' ? '7 days' : cohortPeriod === 'weekly' ? '7 weeks' : '7 months'}</Option>
              <Option value={12}>{cohortPeriod === 'daily' ? '12 days' : cohortPeriod === 'weekly' ? '12 weeks' : '12 months'}</Option>
              <Option value={30}>{cohortPeriod === 'daily' ? '30 days' : cohortPeriod === 'weekly' ? '30 weeks' : '30 months'}</Option>
            </Select>
          </Col>

          {/* Action Buttons */}
          <Col xs={24}>
            <Space>
              <Button
                type="primary"
                icon={<TableOutlined />}
                onClick={handleCalculateCohorts}
                loading={loading}
                disabled={!activationEvent || !returnEvent}
              >
                Calculate Cohorts
              </Button>
              {hasData && (
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExportCSV}
                  disabled={loading}
                >
                  Export CSV
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      {hasData && !loading && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Cohorts"
                value={totalCohorts}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Users"
                value={totalUsers}
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return value.toLocaleString();
                  }
                  return value?.toString() || '0';
                }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Avg Retention"
                value={avgRetention}
                suffix="%"
                precision={1}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Calculating cohort data...</Text>
            </div>
          </div>
        </Card>
      )}

      {/* Cohort Table */}
      {!loading && hasData && (
        <CohortTable
          cohortData={cohortData}
          retentionWindow={retentionWindow}
          cohortPeriod={cohortPeriod}
        />
      )}

      {/* Empty State */}
      {!loading && !hasData && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <TableOutlined style={{ fontSize: 48, color: '#ccc' }} />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">
                Configure your cohort analysis above and click "Calculate Cohorts" to view the retention table
              </Text>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default Cohorts;
