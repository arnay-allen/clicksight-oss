import { DownloadOutlined, FilterOutlined, NodeIndexOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Col, DatePicker, InputNumber, message, Row, Select, Space, Statistic, Tabs, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { getEventNames, getPropertyValues, PropertyFilter } from '../lib/clickhouse';
import { calculateUserPaths, exportPathsToCSV, PathAnalysisResult } from '../lib/path-queries';
import FilterRow from './FilterRow';
import PathTable from './PathTable';
import PathTree from './PathTree';
import SankeyDiagram from './SankeyDiagram';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;

function UserPaths() {
  // Configuration state
  const [startEvent, setStartEvent] = useState<string>('');
  const [startEventFilters, setStartEventFilters] = useState<PropertyFilter[]>([]);
  const [endEvent, setEndEvent] = useState<string>('');
  const [endEventFilters, setEndEventFilters] = useState<PropertyFilter[]>([]);
  const [onlyShowPathsToEnd, setOnlyShowPathsToEnd] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs(),
  ]);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [topPaths, setTopPaths] = useState<number>(10);
  const [excludedEvents, setExcludedEvents] = useState<string[]>([
    'API_TIME_TAKEN',
    'app_update_handler',
  ]);
  
  // Data state
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [propertyValuesByProperty, setPropertyValuesByProperty] = useState<Record<string, string[]>>({});
  const [loadingPropertyValues, setLoadingPropertyValues] = useState<Record<string, boolean>>({});
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [pathData, setPathData] = useState<PathAnalysisResult | null>(null);
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
      
      // Auto-select common start event if available
      if (events.includes('$app_open') && !startEvent) {
        setStartEvent('$app_open');
      }
      
      // Load common properties for filters
      const commonProperties = ['pathname', '$os', '$device_type', '$browser', '$screen_width', '$screen_height', 
        '$app_version', '$app_build_number', '$brand', '$browser_version', '$model', '$manufacturer'];
      setAvailableProperties(commonProperties);
    } catch (error: any) {
      message.error('Failed to load events');
      console.error('Error loading events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Load property values for autocomplete
  const loadPropertyValues = async (property: string) => {
    if (propertyValuesByProperty[property]) return; // Already loaded
    
    setLoadingPropertyValues(prev => ({ ...prev, [property]: true }));
    try {
      const values = await getPropertyValues('app_events', property);
      setPropertyValuesByProperty(prev => ({ ...prev, [property]: values }));
    } catch (error) {
      console.error(`Failed to load values for ${property}:`, error);
    } finally {
      setLoadingPropertyValues(prev => ({ ...prev, [property]: false }));
    }
  };

  const handleCalculatePaths = async () => {
    if (!startEvent) {
      message.warning('Please select a start event');
      return;
    }

    // Convert PropertyFilter[] to simple {property, value} format for backend
    const convertFilters = (filters: PropertyFilter[]) => {
      return filters
        .filter(f => f.property && f.value && f.operator === 'equals')
        .map(f => ({ property: f.property, value: f.value }));
    };

    setLoading(true);
    try {
      const data = await calculateUserPaths({
        startEvent,
        startEventFilters: convertFilters(startEventFilters),
        endEvent: endEvent || undefined,
        endEventFilters: convertFilters(endEventFilters),
        onlyShowPathsToEnd,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        maxDepth,
        topPaths,
        excludedEvents,
      });

      setPathData(data);
      setHasData(true);
      message.success('User paths calculated successfully');
    } catch (error: any) {
      message.error(error.message || 'Failed to calculate user paths');
      console.error('Path calculation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!pathData || !pathData.sequences.length) {
      message.warning('No path data to export');
      return;
    }

    try {
      exportPathsToCSV(pathData.sequences, startEvent, endEvent);
      message.success('Path data exported successfully');
    } catch (error: any) {
      message.error(error.message || 'Failed to export path data');
    }
  };

  // Calculate statistics
  const avgPathLength = pathData && pathData.sequences.length > 0
    ? (pathData.sequences.reduce((sum, s) => sum + s.sequence.length, 0) / pathData.sequences.length).toFixed(1)
    : '0';

  const uniqueEvents = pathData
    ? new Set(pathData.nodes.map(n => n.event)).size
    : 0;

  return (
    <div style={{ padding: 24 }}>
      <Title level={2} style={{ marginBottom: 8 }}>User Path Analysis</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Visualize common user journeys and event sequences to understand how users flow through your application
      </Text>

      {/* Configuration Card */}
      <Card title="Configuration" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          {/* Start Event */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Start Event</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Required)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder="Select start event"
              value={startEvent}
              onChange={setStartEvent}
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
          </Col>

          {/* End Event */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>End Event</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Optional)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder="Select end event (optional)"
              value={endEvent}
              onChange={(value) => {
                setEndEvent(value);
                if (!value) {
                  setOnlyShowPathsToEnd(false);
                  setEndEventFilters([]);
                }
              }}
              showSearch
              allowClear
              loading={loadingEvents}
              filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {availableEvents.map(event => (
                <Option key={event} value={event}>{event}</Option>
              ))}
            </Select>
            {endEvent && (
              <Checkbox
                checked={onlyShowPathsToEnd}
                onChange={(e) => setOnlyShowPathsToEnd(e.target.checked)}
                style={{ marginTop: 8 }}
              >
                Only show paths that reach this event
              </Checkbox>
            )}
          </Col>

          {/* Start Event Filters */}
          {startEvent && (
            <Col xs={24}>
              <Card 
                size="small"
                title={
                  <Space>
                    <FilterOutlined />
                    <span>Filters for Start Event: "{startEvent}"</span>
                  </Space>
                }
              >
                {startEventFilters.map((filter, index) => (
                  <FilterRow
                    key={index}
                    filter={filter}
                    properties={availableProperties}
                    onUpdate={(field, value) => {
                      const newFilters = [...startEventFilters];
                      newFilters[index] = { ...newFilters[index], [field]: value };
                      setStartEventFilters(newFilters);
                    }}
                    onRemove={() => {
                      setStartEventFilters(startEventFilters.filter((_, i) => i !== index));
                    }}
                    onPropertyChange={(property) => loadPropertyValues(property)}
                    propertyValues={filter.property ? propertyValuesByProperty[filter.property] || [] : []}
                    loadingPropertyValues={filter.property ? loadingPropertyValues[filter.property] : false}
                  />
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => setStartEventFilters([...startEventFilters, { property: '', operator: 'equals', value: '' }])}
                  block
                  size="small"
                  style={{ marginTop: startEventFilters.length > 0 ? 8 : 0 }}
                >
                  Add Filter
                </Button>
              </Card>
            </Col>
          )}

          {/* End Event Filters */}
          {endEvent && (
            <Col xs={24}>
              <Card 
                size="small"
                title={
                  <Space>
                    <FilterOutlined />
                    <span>Filters for End Event: "{endEvent}"</span>
                  </Space>
                }
              >
                {endEventFilters.map((filter, index) => (
                  <FilterRow
                    key={index}
                    filter={filter}
                    properties={availableProperties}
                    onUpdate={(field, value) => {
                      const newFilters = [...endEventFilters];
                      newFilters[index] = { ...newFilters[index], [field]: value };
                      setEndEventFilters(newFilters);
                    }}
                    onRemove={() => {
                      setEndEventFilters(endEventFilters.filter((_, i) => i !== index));
                    }}
                    onPropertyChange={(property) => loadPropertyValues(property)}
                    propertyValues={filter.property ? propertyValuesByProperty[filter.property] || [] : []}
                    loadingPropertyValues={filter.property ? loadingPropertyValues[filter.property] : false}
                  />
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => setEndEventFilters([...endEventFilters, { property: '', operator: 'equals', value: '' }])}
                  block
                  size="small"
                  style={{ marginTop: endEventFilters.length > 0 ? 8 : 0 }}
                >
                  Add Filter
                </Button>
              </Card>
            </Col>
          )}

          {/* Date Range */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Date Range</Text>
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

          {/* Max Depth */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Path Depth</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Steps to track)
              </Text>
            </div>
            <InputNumber
              style={{ width: '100%' }}
              min={2}
              max={10}
              value={maxDepth}
              onChange={(value) => setMaxDepth(value || 3)}
              placeholder="Enter path depth (2-10)"
            />
          </Col>

          {/* Top Paths */}
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Number of Paths</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Top N paths)
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={topPaths}
              onChange={setTopPaths}
            >
              <Option value={5}>Top 5</Option>
              <Option value={10}>Top 10</Option>
              <Option value={20}>Top 20</Option>
              <Option value={50}>Top 50</Option>
            </Select>
          </Col>

          {/* Excluded Events */}
          <Col xs={24} sm={24} md={16}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Exclude Events</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (Filter out noise events & deduplicate consecutive events)
              </Text>
            </div>
            <Select
              mode="tags"
              style={{ width: '100%' }}
              placeholder="Add events to exclude (e.g., API_TIME_TAKEN)"
              value={excludedEvents}
              onChange={setExcludedEvents}
              maxTagCount="responsive"
            >
              {availableEvents.map(event => (
                <Option key={event} value={event}>{event}</Option>
              ))}
            </Select>
          </Col>

          {/* Action Buttons */}
          <Col xs={24} sm={12} md={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Space>
              <Button
                type="primary"
                icon={<NodeIndexOutlined />}
                onClick={handleCalculatePaths}
                loading={loading}
                disabled={!startEvent}
              >
                Calculate Paths
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
      {hasData && !loading && pathData && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Users"
                value={pathData.totalUsers}
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
                title="Unique Events"
                value={uniqueEvents}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Avg Path Length"
                value={avgPathLength}
                suffix="steps"
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Visualization Tabs */}
      {hasData && !loading && pathData && (
        <Tabs
          defaultActiveKey="sankey"
          items={[
            {
              key: 'sankey',
              label: 'Flow Diagram',
              children: (
                <SankeyDiagram
                  nodes={pathData.nodes}
                  edges={pathData.edges}
                  width={1200}
                  height={600}
                />
              ),
            },
            {
              key: 'tree',
              label: 'Tree View',
              children: (
                <PathTree sequences={pathData.sequences} />
              ),
            },
            {
              key: 'table',
              label: 'Table View',
              children: (
                <PathTable
                  sequences={pathData.sequences}
                  totalUsers={pathData.totalUsers}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export default UserPaths;

