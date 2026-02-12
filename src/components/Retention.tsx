import { DownloadOutlined, LineChartOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, Input, message, Row, Select, Space, Spin, Statistic, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { getEventNames } from '../lib/clickhouse';
import { calculateRetention, exportRetentionToCSV, RetentionDataPoint } from '../lib/retention-queries';
import RetentionChart from './RetentionChart';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;

const DEFAULT_RETENTION_PERIODS = [1, 3, 7, 14, 30];

function Retention() {
  // Configuration state
  const [activationEvent, setActivationEvent] = useState<string>('');
  const [returnEvent, setReturnEvent] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, 'days'),
    dayjs(),
  ]);
  const [retentionPeriods, setRetentionPeriods] = useState<number[]>(DEFAULT_RETENTION_PERIODS);
  const [customPeriod, setCustomPeriod] = useState<string>('');
  const [segmentProperty, setSegmentProperty] = useState<string>('');
  const [segmentValue, setSegmentValue] = useState<string>('');

  // Data state
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [retentionData, setRetentionData] = useState<RetentionDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);

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
    } catch (error) {
      console.error('Failed to load events:', error);
      message.error('Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleCalculateRetention = async () => {
    if (!activationEvent || !returnEvent) {
      message.warning('Please select activation and return events');
      return;
    }

    if (retentionPeriods.length === 0) {
      message.warning('Please select at least one retention period');
      return;
    }

    setLoading(true);
    try {
      const result = await calculateRetention({
        activationEvent,
        returnEvent,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        retentionPeriods,
        segmentProperty: segmentProperty || undefined,
        segmentValue: segmentValue || undefined,
      });

      setRetentionData(result.cohorts);
      setHasData(true);

      if (result.cohorts.length === 0) {
        message.warning('No retention data found for the selected criteria');
      } else {
        message.success(`Retention calculated for ${result.cohorts.length} cohorts`);
      }
    } catch (error: any) {
      console.error('Failed to calculate retention:', error);
      message.error(error.response?.data?.exception || 'Failed to calculate retention');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomPeriod = () => {
    const period = parseInt(customPeriod);
    if (isNaN(period) || period <= 0) {
      message.warning('Please enter a valid positive number');
      return;
    }

    if (retentionPeriods.includes(period)) {
      message.warning('This period is already added');
      return;
    }

    setRetentionPeriods([...retentionPeriods, period].sort((a, b) => a - b));
    setCustomPeriod('');
  };

  const handleRemovePeriod = (period: number) => {
    setRetentionPeriods(retentionPeriods.filter(p => p !== period));
  };

  const handleExportCSV = () => {
    if (retentionData.length === 0) {
      message.warning('No data to export');
      return;
    }

    try {
      const csv = exportRetentionToCSV(retentionData);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retention_${dayjs().format('YYYY-MM-DD_HH-mm')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('Retention data exported successfully');
    } catch (error) {
      console.error('Failed to export:', error);
      message.error('Failed to export data');
    }
  };

  // Calculate summary statistics
  const totalCohorts = retentionData.length;
  const totalUsers = retentionData.reduce((sum, c) => sum + c.cohortSize, 0);
  const avgCohortSize = totalCohorts > 0 ? Math.round(totalUsers / totalCohorts) : 0;

  // Calculate average retention for the first period
  const firstPeriodRetention = retentionData.length > 0 && retentionData[0].retentionData.length > 0
    ? retentionData.reduce((sum, cohort) => {
        const firstPoint = cohort.retentionData[0];
        return sum + (firstPoint ? firstPoint.retentionRate : 0);
      }, 0) / retentionData.length
    : 0;

  return (
    <div style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <Title level={2} style={{ marginBottom: '8px' }}>
            <LineChartOutlined style={{ marginRight: '12px', color: '#9D6CFF' }} />
            Retention Analysis
          </Title>
          <Text style={{ color: '#888', fontSize: '14px' }}>
            Analyze how many users return to your product over time
          </Text>
        </div>

        {/* Configuration Panel */}
        <Card
          style={{
            marginBottom: '24px',
          }}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Event Selection */}
            <Row gutter={16}>
              <Col span={12}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Activation Event *
                </Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select activation event (e.g., sign_up, app_open)"
                  value={activationEvent}
                  onChange={setActivationEvent}
                  showSearch
                  loading={loadingEvents}
                  filterOption={(input, option) =>
                    String(option?.children || '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {availableEvents.map(event => (
                    <Option key={event} value={event}>{event}</Option>
                  ))}
                </Select>
                <Text style={{ fontSize: '12px', color: '#888' }}>
                  The event that defines when a user joins a cohort
                </Text>
              </Col>

              <Col span={12}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Return Event *
                </Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select return event (e.g., app_open, session_start)"
                  value={returnEvent}
                  onChange={setReturnEvent}
                  showSearch
                  loading={loadingEvents}
                  filterOption={(input, option) =>
                    String(option?.children || '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {availableEvents.map(event => (
                    <Option key={event} value={event}>{event}</Option>
                  ))}
                </Select>
                <Text style={{ fontSize: '12px', color: '#888' }}>
                  The event that indicates a user has returned
                </Text>
              </Col>
            </Row>

            {/* Date Range */}
            <Row>
              <Col span={24}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Cohort Date Range *
                </Text>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange}
                  onChange={(dates) => dates && setDateRange(dates as [Dayjs, Dayjs])}
                  format="YYYY-MM-DD"
                />
                <Text style={{ fontSize: '12px', color: '#888' }}>
                  Users who performed the activation event for the first time in this range
                </Text>
              </Col>
            </Row>

            {/* Retention Periods */}
            <Row>
              <Col span={24}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Retention Periods (days) *
                </Text>
                <Space wrap style={{ marginBottom: '8px' }}>
                  {retentionPeriods.map(period => (
                    <Tag
                      key={period}
                      closable
                      onClose={() => handleRemovePeriod(period)}
                      color="blue"
                    >
                      Day {period}
                    </Tag>
                  ))}
                </Space>
                <Space.Compact style={{ width: '300px' }}>
                  <Input
                    placeholder="Add custom period (e.g., 60)"
                    value={customPeriod}
                    onChange={(e) => setCustomPeriod(e.target.value)}
                    onPressEnter={handleAddCustomPeriod}
                    type="number"
                    min="1"
                  />
                  <Button onClick={handleAddCustomPeriod}>Add</Button>
                </Space.Compact>
              </Col>
            </Row>

            {/* Optional Segmentation */}
            <Row gutter={16}>
              <Col span={12}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Segment By Property (Optional)
                </Text>
                <Input
                  placeholder="e.g., $os, platform, country"
                  value={segmentProperty}
                  onChange={(e) => setSegmentProperty(e.target.value)}
                />
              </Col>
              <Col span={12}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  Segment Value
                </Text>
                <Input
                  placeholder="e.g., Android, web, US"
                  value={segmentValue}
                  onChange={(e) => setSegmentValue(e.target.value)}
                  disabled={!segmentProperty}
                />
              </Col>
            </Row>

            {/* Action Buttons */}
            <Row>
              <Col span={24}>
                <Space>
                  <Button
                    type="primary"
                    size="large"
                    icon={<LineChartOutlined />}
                    onClick={handleCalculateRetention}
                    loading={loading}
                  >
                    Calculate Retention
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
          </Space>
        </Card>

        {/* Loading State */}
        {loading && (
          <Card style={{ textAlign: 'center' }}>
            <Spin size="large" tip="Calculating retention..." />
            <div style={{ marginTop: '16px', color: '#888' }}>
              This may take a few seconds for large date ranges...
            </div>
          </Card>
        )}

        {/* Results */}
        {!loading && hasData && (
          <>
            {/* Summary Statistics */}
            <Row gutter={16} style={{ marginBottom: '24px' }}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Total Cohorts"
                    value={totalCohorts}
                    valueStyle={{ color: '#9D6CFF' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Total Users"
                    value={totalUsers.toLocaleString()}
                    valueStyle={{ color: '#9D6CFF' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Avg Cohort Size"
                    value={avgCohortSize.toLocaleString()}
                    valueStyle={{ color: '#9D6CFF' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title={`Avg Day ${retentionPeriods[0] || 1} Retention`}
                    value={firstPeriodRetention.toFixed(2)}
                    suffix="%"
                    valueStyle={{ color: '#9D6CFF' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* Retention Chart */}
            <RetentionChart data={retentionData} title="Retention Curve by Cohort" height={450} />
          </>
        )}

        {/* Empty State */}
        {!loading && !hasData && (
          <Card
            style={{
              textAlign: 'center',
              padding: '48px 24px',
            }}
          >
            <LineChartOutlined style={{ fontSize: '64px', color: '#ccc', marginBottom: '16px' }} />
            <Title level={4} style={{ color: '#888' }}>
              Configure retention analysis above
            </Title>
            <Text style={{ color: '#888' }}>
              Select your activation event, return event, date range, and retention periods to get started
            </Text>
          </Card>
        )}
      </div>
    </div>
  );
}

export default Retention;

