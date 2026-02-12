import { DeleteOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateGranularity, getEventNames, getEventProperties, getEventTrend, getEventTrendWithBreakdown, getPropertyValues, getTables, PropertyFilter, TrendBreakdown } from '../lib/clickhouse';

const { RangePicker } = DatePicker;

// Data source type
interface DataSource {
  id: string;
  table: string;
  events: string[]; // Array of event names
  filters?: PropertyFilter[]; // Filters apply to all events in this data source
  filterLogic?: 'AND' | 'OR';
}

// Predefined colors for different events
const CHART_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'
];

// Format large numbers for Y-axis
const formatYAxis = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
};

function EventTrends() {
  const [tables, setTables] = useState<string[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [eventsByTable, setEventsByTable] = useState<Record<string, string[]>>({});
  const [propertiesByTable, setPropertiesByTable] = useState<Record<string, string[]>>({});
  const [breakdownProperties, setBreakdownProperties] = useState<string[]>([]);
  const [trendBreakdowns, setTrendBreakdowns] = useState<Record<string, TrendBreakdown[]>>({});
  const [granularity, setGranularity] = useState<DateGranularity>('daily');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [tablesLoading, setTablesLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState<Record<string, boolean>>({});
  const [propertiesLoading, setPropertiesLoading] = useState<Record<string, boolean>>({});
  const [highlightedSource, setHighlightedSource] = useState<string | null>(null);
  const [propertyValueSuggestions, setPropertyValueSuggestions] = useState<Record<string, string[]>>({});

  // Load tables on mount and auto-select app_events
  useEffect(() => {
    loadTables();
    // Auto-add app_events as first data source
    const initialDataSource: DataSource = {
      id: '1',
      table: 'app_events',
      events: []
    };
    setDataSources([initialDataSource]);
    // Load events for the default table
    loadEventsForTable('app_events', '1');
    // Load properties for the default table
    loadPropertiesForTable('app_events');
  }, []);

  // Auto-load trend data when dependencies change
  useEffect(() => {
    const hasValidData = dataSources.some(ds => ds.table && ds.events.length > 0);
    if (hasValidData && !tablesLoading) {
      // Debounce to avoid too many requests
      const timer = setTimeout(() => {
        loadTrendData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dataSources, dateRange, granularity, breakdownProperties]);

  const loadTables = async () => {
    try {
      setTablesLoading(true);
      const tableList = await getTables();
      setTables(tableList);
    } catch (err: any) {
      setError('Failed to load tables: ' + err.message);
    } finally {
      setTablesLoading(false);
    }
  };

  const loadEventsForTable = async (table: string, sourceId?: string) => {
    if (eventsByTable[table]) {
      return; // Already loaded
    }

    try {
      setEventsLoading(prev => ({ ...prev, [table]: true }));
      const events = await getEventNames(table);
      setEventsByTable(prev => ({ ...prev, [table]: events }));

      // Auto-select first event if this is for a specific source
      if (sourceId && events.length > 0) {
        setDataSources(prev =>
          prev.map(ds => ds.id === sourceId ? {
            ...ds,
            events: [events[0]]
          } : ds)
        );
      }
    } catch (err: any) {
      // Only show error in console for auto-load, don't set UI error
      console.error(`Failed to load events for ${table}:`, err.message);
      setEventsByTable(prev => ({ ...prev, [table]: [] }));
    } finally {
      setEventsLoading(prev => ({ ...prev, [table]: false }));
    }
  };

  const loadPropertiesForTable = async (table: string) => {
    if (propertiesByTable[table]) {
      return; // Already loaded
    }

    try {
      setPropertiesLoading(prev => ({ ...prev, [table]: true }));
      // Get first event from table to fetch properties
      const events = eventsByTable[table] || await getEventNames(table);
      if (events.length > 0) {
        const properties = await getEventProperties(events[0], table);
        setPropertiesByTable(prev => ({ ...prev, [table]: properties }));
      }
    } catch (err: any) {
      console.error(`Failed to load properties for ${table}:`, err.message);
      setPropertiesByTable(prev => ({ ...prev, [table]: [] }));
    } finally {
      setPropertiesLoading(prev => ({ ...prev, [table]: false }));
    }
  };

  const loadPropertyValues = async (table: string, property: string) => {
    const key = `${table}:${property}`;
    if (propertyValueSuggestions[key]) {
      return; // Already loaded
    }

    try {
      const values = await getPropertyValues(property, table, 20);
      setPropertyValueSuggestions(prev => ({ ...prev, [key]: values }));
    } catch (err: any) {
      console.error(`Failed to load property values for ${property}:`, err.message);
    }
  };

  // Filter management functions
  const addFilter = (sourceId: string) => {
    setDataSources(prev => prev.map(ds => {
      if (ds.id === sourceId) {
        return {
          ...ds,
          filters: [
            ...(ds.filters || []),
            { property: '', operator: 'equals', value: '' }
          ]
        };
      }
      return ds;
    }));
  };

  const removeFilter = (sourceId: string, filterIndex: number) => {
    setDataSources(prev => prev.map(ds => {
      if (ds.id === sourceId) {
        return {
          ...ds,
          filters: (ds.filters || []).filter((_, idx) => idx !== filterIndex)
        };
      }
      return ds;
    }));
  };

  const updateFilter = (
    sourceId: string,
    filterIndex: number,
    field: keyof PropertyFilter,
    value: any
  ) => {
    setDataSources(prev => prev.map(ds => {
      if (ds.id === sourceId) {
        const newFilters = [...(ds.filters || [])];
        newFilters[filterIndex] = {
          ...newFilters[filterIndex],
          [field]: value
        };

        // Load property values when property is selected
        if (field === 'property' && value && ds.table) {
          loadPropertyValues(ds.table, value);
        }

        return { ...ds, filters: newFilters };
      }
      return ds;
    }));
  };

  const updateFilterLogic = (sourceId: string, logic: 'AND' | 'OR') => {
    setDataSources(prev => prev.map(ds => {
      if (ds.id === sourceId) {
        return { ...ds, filterLogic: logic };
      }
      return ds;
    }));
  };

  const loadTrendData = async () => {
    // Flatten all source+event combinations
    const allCombinations: Array<{
      table: string;
      eventName: string;
      filters?: PropertyFilter[];
      filterLogic?: 'AND' | 'OR';
    }> = [];
    dataSources.forEach(ds => {
      if (ds.table && ds.events.length > 0) {
        ds.events.forEach(eventName => {
          allCombinations.push({
            table: ds.table,
            eventName,
            filters: ds.filters,
            filterLogic: ds.filterLogic
          });
        });
      }
    });

    if (allCombinations.length === 0) {
      setError('Please select at least one table and event');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [startDate, endDate] = dateRange;

      if (breakdownProperties.length > 0) {
        // Fetch breakdown data for each combination
        const breakdownResults: Record<string, TrendBreakdown[]> = {};

        for (const combo of allCombinations) {
          const breakdowns = await getEventTrendWithBreakdown(
            combo.table,
            combo.eventName,
            startDate.format('YYYY-MM-DD'),
            endDate.format('YYYY-MM-DD'),
            granularity,
            breakdownProperties,
            combo.filters,
            combo.filterLogic || 'AND'
          );
          const key = `${combo.eventName} (${combo.table})`;
          breakdownResults[key] = breakdowns;
        }

        setTrendBreakdowns(breakdownResults);
        setChartData([]); // Clear regular chart data
      } else {
        // Regular trend without breakdown
        const allSourcesData = await Promise.all(
          allCombinations.map(combo =>
            getEventTrend(
              combo.table,
              combo.eventName,
              startDate.format('YYYY-MM-DD'),
              endDate.format('YYYY-MM-DD'),
              granularity,
              combo.filters,
              combo.filterLogic || 'AND'
            )
          )
        );

        // Merge data from all sources into a single array with dates as keys
        const dateMap = new Map<string, any>();

        allSourcesData.forEach((sourceData, index) => {
          const combo = allCombinations[index];
          const sourceKey = `${combo.eventName} (${combo.table})`;

          sourceData.forEach(item => {
            if (!dateMap.has(item.date)) {
              dateMap.set(item.date, { date: item.date });
            }
            dateMap.get(item.date)![sourceKey] = Number(item.count || 0);
          });
        });

        // Convert map to array and sort by date
        const mergedData = Array.from(dateMap.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        );

        setChartData(mergedData);
        setTrendBreakdowns({}); // Clear breakdown data
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions to manage data sources
  const addDataSource = async () => {
    const newSource: DataSource = {
      id: Date.now().toString(),
      table: tables[0] || '',
      events: []
    };
    setDataSources(prev => [...prev, newSource]);
    if (newSource.table) {
      await loadEventsForTable(newSource.table, newSource.id);
    }
  };

  const removeDataSource = (id: string) => {
    setDataSources(prev => prev.filter(ds => ds.id !== id));
  };

  const updateDataSourceTable = async (id: string, table: string) => {
    setDataSources(prev =>
      prev.map(ds => {
        if (ds.id === id) {
          return { ...ds, table, events: [] };
        }
        return ds;
      })
    );
    await loadEventsForTable(table, id);
    await loadPropertiesForTable(table);
  };

  const updateDataSourceEvents = (id: string, eventNames: string[]) => {
    setDataSources(prev =>
      prev.map(ds => ds.id === id ? { ...ds, events: eventNames } : ds)
    );
  };

  // Calculate stats for data sources
  const getTotalForSource = (sourceKey: string) => {
    return chartData.reduce((sum, item) => sum + Number(item[sourceKey] || 0), 0);
  };

  const getAvgForSource = (sourceKey: string) => {
    const total = getTotalForSource(sourceKey);
    return chartData.length > 0 ? Math.round((total / chartData.length) * 10) / 10 : 0;
  };

  // Get all valid table+event combinations
  const getAllCombinations = () => {
    const combinations: Array<{ id: string; table: string; event: string; sourceIndex: number }> = [];
    dataSources.forEach((ds, index) => {
      if (ds.table && ds.events.length > 0) {
        ds.events.forEach(eventName => {
          combinations.push({
            id: `${ds.id}-${eventName}`,
            table: ds.table,
            event: eventName,
            sourceIndex: index
          });
        });
      }
    });
    return combinations;
  };

  return (
    <div>
      <Card title="Event Trends - Multi-Datasource" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Data Source Selection */}
          <div>
            {dataSources.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>Data Source</span>
              </div>
            )}

            {dataSources.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlusOutlined />}
                  onClick={addDataSource}
                  loading={tablesLoading}
                >
                  Add Data Source
                </Button>
                <div style={{ marginTop: 12, color: '#888' }}>
                  Get started by adding a data source to analyze events
                </div>
              </div>
            )}

            {dataSources.map((source, index) => (
              <Card
                key={source.id}
                size="small"
                style={{
                  marginBottom: 12,
                  borderLeft: `4px solid ${CHART_COLORS[index % CHART_COLORS.length]}`
                }}
              >
                <Row gutter={16} align="middle">
                  <Col span={1}>
                    <Tag color={CHART_COLORS[index % CHART_COLORS.length]}>{index + 1}</Tag>
                  </Col>
                  <Col span={10}>
                    <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>Table</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Select table"
                      loading={tablesLoading}
                      value={source.table}
                      onChange={(value) => updateDataSourceTable(source.id, value)}
                      showSearch
                      disabled={true}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={tables.map(table => ({
                        label: table,
                        value: table
                      }))}
                    />
                  </Col>
                  <Col span={11}>
                    <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>Events (Multiple)</div>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder={eventsLoading[source.table] ? "Loading events..." : "Select one or more events"}
                      loading={eventsLoading[source.table]}
                      value={source.events}
                      onChange={(value) => updateDataSourceEvents(source.id, value)}
                      showSearch
                      maxTagCount="responsive"
                      disabled={!source.table || eventsLoading[source.table]}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={(eventsByTable[source.table] || []).map(event => ({
                        label: event,
                        value: event
                      }))}
                    />
                  </Col>
                  <Col span={2}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeDataSource(source.id)}
                      disabled={true}
                      style={{ visibility: 'hidden' }}
                    />
                  </Col>
                </Row>

                {/* Data Source Level Filters */}
                {source.table && (
                  <div style={{ marginTop: 12, paddingLeft: 40 }}>
                    {/* Filters */}
                    {source.filters && source.filters.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {/* Filter Logic Toggle (only if 2+ filters) */}
                        {source.filters.length >= 2 && (
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ marginRight: 8, fontSize: 12 }}>Filter Logic:</span>
                            <Radio.Group
                              size="small"
                              value={source.filterLogic || 'AND'}
                              onChange={(e) => updateFilterLogic(source.id, e.target.value)}
                            >
                              <Radio.Button value="AND">AND</Radio.Button>
                              <Radio.Button value="OR">OR</Radio.Button>
                            </Radio.Group>
                          </div>
                        )}
                        {source.filters.map((filter, filterIndex) => (
                          <Row key={filterIndex} gutter={8} style={{ marginBottom: 8 }} align="middle">
                            <Col span={7}>
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                placeholder="Property"
                                value={filter.property}
                                onChange={(value) => updateFilter(source.id, filterIndex, 'property', value)}
                                showSearch
                                disabled={!source.table || propertiesLoading[source.table]}
                                loading={propertiesLoading[source.table]}
                                filterOption={(input, option) =>
                                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={(propertiesByTable[source.table] || []).map(prop => ({
                                  label: prop,
                                  value: prop
                                }))}
                              />
                            </Col>
                            <Col span={6}>
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                value={filter.operator}
                                onChange={(value) => updateFilter(source.id, filterIndex, 'operator', value)}
                                options={[
                                  { label: 'equals', value: 'equals' },
                                  { label: 'not equals', value: 'not_equals' },
                                  { label: 'contains', value: 'contains' },
                                  { label: 'not contains', value: 'not_contains' },
                                  { label: 'in (list)', value: 'in' },
                                  { label: 'not in (list)', value: 'not_in' }
                                ]}
                              />
                            </Col>
                            <Col span={9}>
                              <Select
                                size="small"
                                mode="tags"
                                maxTagCount={1}
                                placeholder={
                                  filter.operator === 'in' || filter.operator === 'not_in'
                                    ? 'value1, value2, value3'
                                    : 'Value (type or select)'
                                }
                                value={filter.value ? [filter.value] : []}
                                onChange={(values: string[]) => {
                                  // Take the last value entered
                                  const newValue = values[values.length - 1] || '';
                                  updateFilter(source.id, filterIndex, 'value', newValue);
                                }}
                                showSearch
                                allowClear
                                onClear={() => updateFilter(source.id, filterIndex, 'value', '')}
                                filterOption={(input, option) =>
                                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                disabled={!filter.property}
                                style={{ width: '100%' }}
                                options={(() => {
                                  const key = `${source.table}:${filter.property}`;
                                  const suggestions = propertyValueSuggestions[key] || [];
                                  return suggestions.map(v => ({
                                    label: v,
                                    value: v
                                  }));
                                })()}
                              />
                            </Col>
                            <Col span={2}>
                              <Button
                                size="small"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeFilter(source.id, filterIndex)}
                              />
                            </Col>
                          </Row>
                        ))}
                      </div>
                    )}

                    {/* Add Filter Button */}
                    <Button
                      size="small"
                      type="dashed"
                      icon={<FilterOutlined />}
                      onClick={() => addFilter(source.id)}
                      disabled={!source.table || propertiesLoading[source.table]}
                    >
                      Add Filter
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {dataSources.length > 0 && (
            <>
              <Divider />

              {/* Configuration */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Date Range</div>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={dateRange}
                    onChange={(dates) => dates && setDateRange(dates as [Dayjs, Dayjs])}
                    format="YYYY-MM-DD"
                  />
                </Col>
                <Col span={4}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Granularity</div>
                  <Select
                    style={{ width: '100%' }}
                    value={granularity}
                    onChange={(value) => setGranularity(value)}
                    options={[
                      { label: 'Daily', value: 'daily' },
                      { label: 'Weekly', value: 'weekly' },
                      { label: 'Monthly', value: 'monthly' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>
                    Breakdown By (optional)
                    {breakdownProperties.length > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                        ({breakdownProperties.length} selected)
                      </span>
                    )}
                  </div>
                  <Select
                    mode="multiple"
                    style={{ width: '100%' }}
                    placeholder="Select properties (max 3)"
                    value={breakdownProperties}
                    onChange={(value) => setBreakdownProperties(value.slice(0, 3))}
                    showSearch
                    maxTagCount="responsive"
                    disabled={!dataSources[0]?.table || propertiesLoading[dataSources[0]?.table]}
                    loading={propertiesLoading[dataSources[0]?.table]}
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={(propertiesByTable[dataSources[0]?.table] || []).map(prop => ({
                      label: prop,
                      value: prop
                    }))}
                  />
                  {breakdownProperties.length > 1 && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      Combined: {breakdownProperties.join(' | ')}
                    </div>
                  )}
                </Col>
              </Row>

              {loading && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Spin tip="Loading trend data..." />
                </div>
              )}

              {error && loading === false && (
                <Alert
                  message="Error"
                  description={error}
                  type="error"
                  closable
                  onClose={() => setError('')}
                />
              )}
            </>
          )}
        </Space>
      </Card>

      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading data...</div>
          </div>
        </Card>
      )}

      {!loading && chartData.length > 0 && getAllCombinations().length > 0 && (
        <>
          {/* Statistics for each table+event combination */}
          {getAllCombinations().map((combo, index) => {
            const sourceKey = `${combo.event} (${combo.table})`;
            return (
              <Card
                key={combo.id}
                title={
                  <div>
                    <Tag color={CHART_COLORS[index % CHART_COLORS.length]} style={{ marginRight: 8 }}>
                      {index + 1}
                    </Tag>
                    <span style={{ fontWeight: 600 }}>{combo.event}</span>
                    <span style={{ color: '#888', fontSize: 14, marginLeft: 8 }}>
                      from {combo.table}
                    </span>
                  </div>
                }
                style={{
                  marginBottom: 16,
                  borderLeft: `4px solid ${CHART_COLORS[index % CHART_COLORS.length]}`
                }}
              >
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="Total Events"
                      value={getTotalForSource(sourceKey)}
                      valueStyle={{ color: '#3f8600' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={granularity === 'daily' ? 'Average per Day' : granularity === 'weekly' ? 'Average per Week' : 'Average per Month'}
                      value={getAvgForSource(sourceKey)}
                      precision={1}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={granularity === 'daily' ? 'Days' : granularity === 'weekly' ? 'Weeks' : 'Months'}
                      value={chartData.length}
                      valueStyle={{ color: '#cf1322' }}
                    />
                  </Col>
                </Row>
              </Card>
            );
          })}

          <Card title="Multi-Source Event Trends">
            <ResponsiveContainer width="100%" height={500}>
              <LineChart
                data={chartData}
                onMouseMove={(e: any) => {
                  if (e && e.activeTooltipIndex !== undefined) {
                    // Highlight logic handled by stroke opacity
                  }
                }}
                onMouseLeave={() => setHighlightedSource(null)}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={formatYAxis} />
                <Tooltip formatter={(value: any) => value.toLocaleString()} />
                <Legend
                  onClick={(e: any) => {
                    setHighlightedSource(highlightedSource === e.value ? null : e.value);
                  }}
                  onMouseEnter={(e: any) => setHighlightedSource(e.value)}
                  onMouseLeave={() => setHighlightedSource(null)}
                  wrapperStyle={{ cursor: 'pointer' }}
                />
                {getAllCombinations().map((combo, index) => {
                  const sourceKey = `${combo.event} (${combo.table})`;
                  return (
                    <Line
                      key={combo.id}
                      type="monotone"
                      dataKey={sourceKey}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={highlightedSource === null || highlightedSource === sourceKey ? 3 : 1}
                      strokeOpacity={highlightedSource === null || highlightedSource === sourceKey ? 1 : 0.2}
                      dot={false}
                      name={sourceKey}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* Breakdown Results */}
      {!loading && Object.keys(trendBreakdowns).length > 0 && (
        <>
          {Object.entries(trendBreakdowns).map(([eventKey, breakdowns]) => {
            if (breakdowns.length === 0) return null;

            // Merge breakdown data for this event
            const dateMap = new Map<string, any>();
            breakdowns.forEach((breakdown) => {
              breakdown.data.forEach(item => {
                if (!dateMap.has(item.date)) {
                  dateMap.set(item.date, { date: item.date });
                }
                dateMap.get(item.date)![breakdown.segmentName] = Number(item.count || 0);
              });
            });

            const mergedData = Array.from(dateMap.values()).sort((a, b) =>
              a.date.localeCompare(b.date)
            );

            return (
              <Card
                key={eventKey}
                title={
                  <div>
                    {eventKey} - Breakdown by{' '}
                    <span style={{ color: '#1890ff' }}>
                      {breakdownProperties.join(' | ')}
                    </span>
                    {breakdownProperties.length > 1 && (
                      <span style={{ fontSize: 14, color: '#888', marginLeft: 8 }}>
                        (Combined dimensions)
                      </span>
                    )}
                  </div>
                }
                style={{ marginBottom: 16 }}
              >
                {/* Segment Statistics */}
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  {breakdowns.map((breakdown, idx) => {
                    const total = breakdown.data.reduce((sum, d) => sum + d.count, 0);
                    const avg = breakdown.data.length > 0 ? total / breakdown.data.length : 0;

                    return (
                      <Col key={breakdown.segmentName} span={8}>
                        <Card
                          size="small"
                          style={{ borderLeft: `4px solid ${CHART_COLORS[idx % CHART_COLORS.length]}` }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>
                            {breakdown.segmentName}
                          </div>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Statistic
                                title="Total"
                                value={total}
                                valueStyle={{ fontSize: 16, color: '#3f8600' }}
                              />
                            </Col>
                            <Col span={12}>
                              <Statistic
                                title="Avg/Day"
                                value={avg}
                                precision={1}
                                valueStyle={{ fontSize: 16, color: '#1890ff' }}
                              />
                            </Col>
                          </Row>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>

                {/* Trend Chart */}
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={mergedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={formatYAxis} />
                    <Tooltip formatter={(value: any) => value.toLocaleString()} />
                    <Legend />
                    {breakdowns.map((breakdown, idx) => (
                      <Line
                        key={breakdown.segmentName}
                        type="monotone"
                        dataKey={breakdown.segmentName}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        name={breakdown.segmentName}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            );
          })}
        </>
      )}

      {!loading && chartData.length === 0 && Object.keys(trendBreakdowns).length === 0 && getAllCombinations().length > 0 && !error && (
        <Card>
          <Alert
            message="No Data"
            description="No data found for the selected data sources and date range. Try adjusting your filters."
            type="info"
          />
        </Card>
      )}
    </div>
  );
}

export default EventTrends;
