import { DeleteOutlined, DownloadOutlined, DownOutlined, FilterOutlined, FolderOpenOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  InputNumber,
  message,
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
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SavedChart } from '../lib/charts';
import { BreakdownProperty, clearAnalyticsCache, FunnelBreakdown, FunnelResult, FunnelStep, getEventNames, getEventProperties, getFunnelData, getFunnelDataWithBreakdown, getPropertyValues, MetricType, PropertyFilter } from '../lib/clickhouse';
import { DATE_RANGE_OPTIONS, DateRangeConfig, DateRangeType, detectDateRangeType, getAbsoluteDateRange, getDateRangeLabel } from '../lib/dateRanges';
import { schemaAdapter } from '../lib/schema-adapter';
import { exportToCSV, exportToPNG } from '../utils/exportUtils';
import ChartLibrary from './ChartLibrary';
import FilterRow from './FilterRow';
import SaveChartModal from './SaveChartModal';

const { RangePicker } = DatePicker;

// Funnel step with UI state
interface FunnelStepUI extends FunnelStep {
  id: string;
}

// Predefined colors for funnel steps
const STEP_COLORS = ['#52c41a', '#1890ff', '#faad14', '#f5222d', '#722ed1'];

interface FunnelsProps {
  onNavigate?: (page: string) => void;
}

function Funnels({ onNavigate }: FunnelsProps = {}) {

  const [funnelSteps, setFunnelSteps] = useState<FunnelStepUI[]>([]);
  const [eventsByTable, setEventsByTable] = useState<Record<string, string[]>>({});
  const [propertiesByTable, setPropertiesByTable] = useState<Record<string, string[]>>({});
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('last_7_days');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(6, 'days').startOf('day'),
    dayjs().endOf('day')
  ]);
  const [timeWindow, setTimeWindow] = useState<number | null>(null);
  const [funnelResults, setFunnelResults] = useState<FunnelResult[]>([]);
  const [funnelBreakdowns, setFunnelBreakdowns] = useState<FunnelBreakdown[]>([]);
  const [breakdownProperties, setBreakdownProperties] = useState<BreakdownProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialChartLoading, setInitialChartLoading] = useState(false); // Full-screen loading for chart load
  const [error, setError] = useState<string>('');
  const [eventsLoading, setEventsLoading] = useState<Record<string, boolean>>({});
  const [propertiesLoading, setPropertiesLoading] = useState<Record<string, boolean>>({});
  const [propertyValueSuggestions, setPropertyValueSuggestions] = useState<Record<string, string[]>>({});

  // NEW: Metric configuration state
  const [metricType, setMetricType] = useState<MetricType>('total');
  const [metricProperty, setMetricProperty] = useState<string>('');

  // Chart save/load state
  const [saveChartModalVisible, setSaveChartModalVisible] = useState(false);
  const [chartLibraryVisible, setChartLibraryVisible] = useState(false);

  // Track loaded chart for update vs. save-as-new
  const [loadedChartId, setLoadedChartId] = useState<string | null>(null);
  const [loadedChartName, setLoadedChartName] = useState<string | null>(null);
  const [loadedChartDescription, setLoadedChartDescription] = useState<string>('');
  const [loadedChartType, setLoadedChartType] = useState<string>('horizontal-bar');
  const [loadedChartPermission, setLoadedChartPermission] = useState<string | undefined>(undefined);

  // Initialize first step with table from schema config
  useEffect(() => {
    const tableName = schemaAdapter.getTableName();
    // Auto-create first step with table from schema config
    const initialStep: FunnelStepUI = {
      id: '1',
      table: tableName,
      event: '',
      filters: [],
      filterLogic: 'AND'
    };
    setFunnelSteps([initialStep]);
    // Load events and properties for the table
    loadEventsForTable(tableName);
    loadPropertiesForTable(tableName);
  }, []);

  // Update absolute dates when date range type changes
  useEffect(() => {
    const config: DateRangeConfig = { type: dateRangeType };
    const [start, end] = getAbsoluteDateRange(config);
    setDateRange([start, end]);
  }, [dateRangeType]);

  // Handle loading chart from sessionStorage (dashboard eye icon)
  useEffect(() => {
    // Use a flag to prevent multiple executions
    let chartLoaded = false;

    const checkSessionStorage = () => {
      if (chartLoaded) {
        return;
      }

      const chartToLoadStr = sessionStorage.getItem('chartToLoad');

      if (chartToLoadStr) {
        try {
          const chart = JSON.parse(chartToLoadStr);

          if (chart.chart_category === 'funnels') {
            chartLoaded = true;
            sessionStorage.removeItem('chartToLoad');
            handleLoadChart(chart);
          }
        } catch (error) {
          console.error('Error loading chart from sessionStorage:', error);
          sessionStorage.removeItem('chartToLoad');
        }
      }
    };

    // Check after a small delay to ensure sessionStorage is written
    const timeoutId = setTimeout(checkSessionStorage, 150);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);


  const loadEventsForTable = async (table: string) => {
    if (eventsByTable[table]) {
      return; // Already loaded
    }

    try {
      setEventsLoading(prev => ({ ...prev, [table]: true }));
      const events = await getEventNames(table);
      setEventsByTable(prev => ({ ...prev, [table]: events }));
    } catch (err: any) {
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
      const properties = await getEventProperties('', table);
      setPropertiesByTable(prev => ({ ...prev, [table]: properties }));
    } catch (err: any) {
      console.error(`Failed to load properties for ${table}:`, err.message);
      setPropertiesByTable(prev => ({ ...prev, [table]: [] }));
    } finally {
      setPropertiesLoading(prev => ({ ...prev, [table]: false }));
    }
  };

  const addFunnelStep = async () => {
    const tableName = schemaAdapter.getTableName();
    const newStep: FunnelStepUI = {
      id: Date.now().toString(),
      table: tableName,
      event: '',
      filters: [],
      filterLogic: 'AND'
    };
    setFunnelSteps(prev => [...prev, newStep]);
    // Events and properties should already be loaded
    if (!eventsByTable[tableName]) {
      await loadEventsForTable(tableName);
    }
    if (!propertiesByTable[tableName]) {
      await loadPropertiesForTable(tableName);
    }
  };

  const removeStep = (id: string) => {
    setFunnelSteps(prev => prev.filter(step => step.id !== id));
  };

  const updateFilterLogic = (id: string, logic: 'AND' | 'OR') => {
    setFunnelSteps(prev =>
      prev.map(step => (step.id === id ? { ...step, filterLogic: logic } : step))
    );
  };

  const updateStepEvent = (id: string, event: string) => {
    setFunnelSteps(prev =>
      prev.map(step => (step.id === id ? { ...step, event } : step))
    );
  };

  const loadPropertyValues = async (table: string, property: string) => {
    const key = `${table}:${property}`;
    try {
      // FIX: Correct parameter order - (table, property, limit)
      const values = await getPropertyValues(table, property, 20);
      setPropertyValueSuggestions(prev => ({ ...prev, [key]: values }));
    } catch (err) {
      console.error(`Failed to load property values for ${property}:`, err);
    }
  };

  const addFilter = (stepId: string) => {
    setFunnelSteps(prev =>
      prev.map(step => {
        if (step.id === stepId) {
          const newFilter: PropertyFilter = {
            property: '',
            operator: 'equals',
            value: ''
          };
          return {
            ...step,
            filters: [...(step.filters || []), newFilter]
          };
        }
        return step;
      })
    );
  };

  const updateFilter = (stepId: string, filterIndex: number, field: keyof PropertyFilter, value: string) => {
    // Load property values when property is selected
    if (field === 'property' && value) {
      const step = funnelSteps.find(s => s.id === stepId);
      if (step?.table) {
        loadPropertyValues(step.table, value);
      }
    }

    setFunnelSteps(prev =>
      prev.map(step => {
        if (step.id === stepId && step.filters) {
          const updatedFilters = [...step.filters];
          // Don't convert to lowercase here - keep original case for display
          // Lowercasing happens in the SQL query
          updatedFilters[filterIndex] = {
            ...updatedFilters[filterIndex],
            [field]: value
          };
          return { ...step, filters: updatedFilters };
        }
        return step;
      })
    );
  };

  const removeFilter = (stepId: string, filterIndex: number) => {
    setFunnelSteps(prev =>
      prev.map(step => {
        if (step.id === stepId && step.filters) {
          return {
            ...step,
            filters: step.filters.filter((_, idx) => idx !== filterIndex)
          };
        }
        return step;
      })
    );
  };

  const calculateFunnel = async () => {
    const validSteps = funnelSteps.filter(step => step.table && step.event);

    if (validSteps.length < 2) {
      setError('Please add at least 2 steps to the funnel');
      return;
    }

    // NEW: Validate metric config
    if (['sum', 'average', 'min', 'max'].includes(metricType) && !metricProperty) {
      message.error('Please select a property for this metric type');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [startDate, endDate] = dateRange;
      const start = startDate.format('YYYY-MM-DD');
      const end = endDate.format('YYYY-MM-DD');

      // NEW: Build metric config
      const metricConfig = {
        type: metricType,
        property: metricProperty || undefined
      };

      if (breakdownProperties.length > 0 && breakdownProperties.some(bp => bp.property)) {
        // Get funnel with breakdown
        const validBreakdowns = breakdownProperties.filter(bp => bp.property);
        const breakdowns = await getFunnelDataWithBreakdown(
          validSteps,
          start,
          end,
          validBreakdowns,
          timeWindow || undefined,
          metricConfig // NEW: Pass metric config
        );
        setFunnelBreakdowns(breakdowns);
        setFunnelResults([]);
      } else {
        // Get regular funnel
        const results = await getFunnelData(
          validSteps,
          start,
          end,
          timeWindow || undefined,
          metricConfig // NEW: Pass metric config
        );
        setFunnelResults(results);
        setFunnelBreakdowns([]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      // Note: initialChartLoading is cleared in handleLoadChart, not here
    }
  };

  const overallConversion = funnelResults.length > 0 && funnelResults[0].count > 0
    ? ((funnelResults[funnelResults.length - 1].count / funnelResults[0].count) * 100).toFixed(1)
    : '0.0';

  // Build chart configuration for saving
  const buildChartConfig = () => {
    // Detect if current date range matches a relative pattern
    const detectedConfig = detectDateRangeType(dateRange[0], dateRange[1]);

    return {
      funnelSteps: funnelSteps,
      dateRangeConfig: detectedConfig,  // Store relative date range config
      timeWindow: timeWindow,
      breakdownProperties: breakdownProperties,
      metricConfig: { // NEW: Include metric config
        type: metricType,
        property: metricProperty || undefined
      }
    };
  };

  // NEW: Helper function to get metric label
  const getMetricLabel = (type: MetricType, property?: string): string => {
    switch (type) {
      case 'total':
        return 'Conversions';
      case 'unique_users':
        return 'Unique Users';
      case 'count_distinct':
        return `Count Distinct ${property || 'Property'}`;
      case 'sum':
        return `Sum of ${property || 'Property'}`;
      case 'average':
        return `Avg ${property || 'Property'}`;
      case 'min':
        return `Min ${property || 'Property'}`;
      case 'max':
        return `Max ${property || 'Property'}`;
      default:
        return 'Count';
    }
  };

  // Load a saved chart
  const handleLoadChart = async (chart: SavedChart) => {
    try {
      // Show full-screen loading overlay
      setInitialChartLoading(true);

      const config = JSON.parse(chart.config);

      // Track loaded chart metadata for update functionality
      setLoadedChartId(chart.id);
      setLoadedChartName(chart.name);
      setLoadedChartDescription(chart.description || '');
      setLoadedChartType(chart.chart_type || 'horizontal-bar');
      setLoadedChartPermission(chart.permission);

      // Restore date range (support both old and new formats)
      if (config.dateRangeConfig) {
        // New format: relative date range config
        setDateRangeType(config.dateRangeConfig.type);
        const [start, end] = getAbsoluteDateRange(config.dateRangeConfig);
        setDateRange([start, end]);
      } else if (config.dateRange) {
        // Legacy format: absolute dates
        setDateRange([
          dayjs(config.dateRange.start),
          dayjs(config.dateRange.end),
        ]);
        // Try to detect if it matches a relative pattern
        const detectedConfig = detectDateRangeType(
          dayjs(config.dateRange.start),
          dayjs(config.dateRange.end)
        );
        setDateRangeType(detectedConfig.type);
      }

      // Restore time window
      if (config.timeWindow !== undefined) {
        setTimeWindow(config.timeWindow);
      }

      // Restore breakdown properties
      if (config.breakdownProperties) {
        setBreakdownProperties(config.breakdownProperties);
      }

      // NEW: Restore metric config (with backwards compatibility)
      if (config.metricConfig) {
        setMetricType(config.metricConfig.type || 'total');
        setMetricProperty(config.metricConfig.property || '');
      } else {
        // Legacy charts default to 'total' metric
        setMetricType('total');
        setMetricProperty('');
      }

      // Load events and properties for all tables FIRST before setting funnel steps
      await Promise.all(config.funnelSteps.map(async (step: FunnelStepUI) => {
        if (step.table) {
          await loadEventsForTable(step.table);
          await loadPropertiesForTable(step.table);
        }
      }));

      // NOW restore funnel steps after events are loaded
      setFunnelSteps(config.funnelSteps || []);

      // Clear loading overlay - all components are now populated
      setInitialChartLoading(false);
    } catch (error) {
      console.error('Error loading chart:', error);
      setInitialChartLoading(false); // Clear on error too
    }
  };

  const handleNewChart = () => {
    // Clear loaded chart state to start fresh
    setLoadedChartId(null);
    setLoadedChartName(null);
    setLoadedChartDescription('');
    setLoadedChartType('horizontal-bar');
  };

  const handleRefreshData = async () => {
    try {
      // Clear all analytics cache
      clearAnalyticsCache();

      // Re-fetch event names for the configured table
      const tableName = schemaAdapter.getTableName();
      setEventsLoading({ ...eventsLoading, [tableName]: true });
      try {
        const events = await getEventNames(tableName);
        setEventsByTable({ ...eventsByTable, [tableName]: events });
      } catch (err) {
        console.error(`Failed to fetch events for ${tableName}:`, err);
      } finally {
        setEventsLoading({ ...eventsLoading, [tableName]: false });
      }

      message.success('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      message.error('Failed to refresh data');
    }
  };

  // Export handlers
  const handleExportPNG = () => {
    // If breakdown is used, export the breakdown section instead
    const hasBreakdown = Object.keys(funnelBreakdowns).length > 0;
    const elementId = hasBreakdown ? 'funnel-breakdown-container' : 'funnel-chart-container';

    const chartElement = document.getElementById(elementId);
    if (chartElement) {
      const filename = `funnel-${dayjs().format('YYYY-MM-DD-HHmmss')}.png`;
      exportToPNG(chartElement, filename);
    } else {
      message.error('Chart not found');
    }
  };

  const handleExportCSV = () => {
    // Check if we have breakdown data or regular funnel data
    const hasBreakdownData = funnelBreakdowns && funnelBreakdowns.length > 0;
    const hasRegularData = funnelResults && funnelResults.length > 0;

    if (!hasBreakdownData && !hasRegularData) {
      message.warning('No data to export');
      return;
    }

    const filename = `funnel-${dayjs().format('YYYY-MM-DD-HHmmss')}.csv`;

    // NEW: Get metric label for CSV header
    const metricColumnName = getMetricLabel(metricType, metricProperty).toLowerCase().replace(/ /g, '_');

    // If we have breakdown data, flatten it for export
    if (hasBreakdownData) {
      const rows: any[] = [];
      funnelBreakdowns.forEach((breakdown: FunnelBreakdown) => {
        breakdown.steps.forEach((step: FunnelResult, index: number) => {
          rows.push({
            segment: breakdown.segmentName,
            step: index + 1,
            event_name: step.stepName,
            [metricColumnName]: step.count, // NEW: Use metric label as column name
            conversion_rate: step.conversionRate?.toFixed(2) || '0.00',
            drop_off_rate: step.dropOffRate?.toFixed(2) || '0.00'
          });
        });
      });
      exportToCSV(rows, filename);
    } else {
      // Export regular funnel data
      const rows = funnelResults.map((step: FunnelResult, index: number) => ({
        step: index + 1,
        event_name: step.stepName,
        [metricColumnName]: step.count, // NEW: Use metric label as column name
        conversion_rate: step.conversionRate?.toFixed(2) || '0.00',
        drop_off_rate: step.dropOffRate?.toFixed(2) || '0.00'
      }));
      exportToCSV(rows, filename);
    }
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <span>Funnel Analysis</span>
            {loadedChartId && (
              <Tag color="blue" closable onClose={handleNewChart}>
                Editing: {loadedChartName}
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            {loadedChartId && (
              <Button
                icon={<PlusOutlined />}
                onClick={handleNewChart}
              >
                New Chart
              </Button>
            )}
            <Button
              icon={<FolderOpenOutlined />}
              onClick={() => setChartLibraryVisible(true)}
            >
              Load Chart
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshData}
              loading={Object.values(eventsLoading).some(loading => loading)}
              title="Reload event names and filter options"
            >
              Refresh Data
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'png', label: 'Export as PNG', onClick: handleExportPNG },
                  { key: 'csv', label: 'Export as CSV', onClick: handleExportCSV },
                ]
              }}
              disabled={funnelResults.length === 0 && funnelBreakdowns.length === 0}
            >
              <Button icon={<DownloadOutlined />}>
                Export <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => setSaveChartModalVisible(true)}
              disabled={funnelSteps.length === 0 || !funnelSteps.every(s => s.table && s.event)}
            >
              Save Chart
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Funnel Steps */}
          <div>
            {funnelSteps.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>Funnel Steps</span>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={addFunnelStep}
                  disabled={funnelSteps.length >= 10}
                >
                  Add Step
                </Button>
              </div>
            )}

            {funnelSteps.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlusOutlined />}
                  onClick={addFunnelStep}
                >
                  Add First Step
                </Button>
                <div style={{ marginTop: 12, color: '#888' }}>
                  Create a funnel by adding sequential event steps
                </div>
              </div>
            )}

            {funnelSteps.map((step, index) => (
              <div key={step.id} style={{ marginBottom: 12 }}>
                {index > 0 && (
                  <div style={{ textAlign: 'center', margin: '8px 0' }}>
                    <DownOutlined style={{ fontSize: 16, color: '#888' }} />
                  </div>
                )}
                <Card
                  size="small"
                  style={{
                    borderLeft: `4px solid ${STEP_COLORS[index % STEP_COLORS.length]}`
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Row gutter={16} align="middle">
                      <Col span={1}>
                        <Tag color={STEP_COLORS[index % STEP_COLORS.length]}>{index + 1}</Tag>
                      </Col>
                      <Col span={21}>
                        <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>Event</div>
                        <Select
                          style={{ width: '100%' }}
                          placeholder={eventsLoading[step.table] ? "Loading events..." : "Select event"}
                          loading={eventsLoading[step.table]}
                          value={step.event}
                          onChange={(value) => updateStepEvent(step.id, value)}
                          showSearch
                          disabled={!step.table || eventsLoading[step.table]}
                          filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          options={(eventsByTable[step.table] || []).map(event => ({
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
                          onClick={() => removeStep(step.id)}
                          disabled={funnelSteps.length === 1}
                        />
                      </Col>
                    </Row>

                    {/* Property Filters */}
                    {step.filters && step.filters.length > 0 && (
                      <div style={{ paddingLeft: 40, marginTop: 8 }}>
                        {/* Filter Logic Toggle (only show if 2+ filters) */}
                        {step.filters.length > 1 && (
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ marginRight: 8, fontSize: 12, color: '#888' }}>
                              Combine filters with:
                            </span>
                            <Radio.Group
                              size="small"
                              value={step.filterLogic || 'AND'}
                              onChange={(e) => updateFilterLogic(step.id, e.target.value)}
                            >
                              <Radio.Button value="AND">AND</Radio.Button>
                              <Radio.Button value="OR">OR</Radio.Button>
                            </Radio.Group>
                          </div>
                        )}
                        {step.filters.map((filter, filterIndex) => (
                          <FilterRow
                            key={filterIndex}
                            filter={filter}
                            properties={propertiesByTable[step.table] || []}
                            onUpdate={(field, value) => updateFilter(step.id, filterIndex, field, value)}
                            onRemove={() => removeFilter(step.id, filterIndex)}
                            onPropertyChange={(property) => {
                              // Fetch property value suggestions when property changes
                              const key = `${step.table}:${property}`;
                              if (!propertyValueSuggestions[key]) {
                                getPropertyValues(step.table, property, 10)
                                  .then(values => {
                                    setPropertyValueSuggestions(prev => ({
                                      ...prev,
                                      [key]: values
                                    }));
                                  })
                                  .catch(err => {
                                    console.error('Failed to fetch property values:', err);
                                  });
                              }
                            }}
                            propertyValues={(() => {
                              const key = `${step.table}:${filter.property}`;
                              return propertyValueSuggestions[key] || [];
                            })()}
                            loadingPropertyValues={false}
                          />
                        ))}
                      </div>
                    )}

                    {/* Add Filter Button */}
                    {step.table && step.event && (
                      <div style={{ paddingLeft: 40 }}>
                        <Button
                          size="small"
                          type="dashed"
                          icon={<FilterOutlined />}
                          onClick={() => addFilter(step.id)}
                          disabled={!step.table || propertiesLoading[step.table]}
                        >
                          Add Filter
                        </Button>
                      </div>
                    )}
                  </Space>
                </Card>
              </div>
            ))}
          </div>

          {funnelSteps.length > 0 && (
            <>
              <Divider />

              {/* Configuration */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Date Range</div>
                  <Select
                    style={{ width: '100%', marginBottom: 8 }}
                    value={dateRangeType}
                    onChange={(value: DateRangeType) => setDateRangeType(value)}
                    placeholder="Select date range"
                  >
                    {DATE_RANGE_OPTIONS.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Select>
                  {dateRangeType === 'custom' && (
                    <RangePicker
                      style={{ width: '100%' }}
                      value={dateRange}
                      onChange={(dates) => {
                        if (dates && dates[0] && dates[1]) {
                          setDateRange(dates as [Dayjs, Dayjs]);
                          // Update to custom type with specific dates
                          const config: DateRangeConfig = {
                            type: 'custom',
                            customStart: dates[0].format('YYYY-MM-DD'),
                            customEnd: dates[1].format('YYYY-MM-DD'),
                          };
                          const [start, end] = getAbsoluteDateRange(config);
                          setDateRange([start, end]);
                        }
                      }}
                      format="YYYY-MM-DD"
                    />
                  )}
                  {dateRangeType !== 'custom' && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      {getDateRangeLabel({ type: dateRangeType })}
                    </div>
                  )}
                </Col>
                <Col span={12}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Time Window (hours, optional)</div>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="e.g., 24 for 1 day"
                    value={timeWindow}
                    onChange={(value) => setTimeWindow(value)}
                    min={1}
                  />
                </Col>
              </Row>

              {/* NEW: Metric Configuration Section */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Metric Type</div>
                  <Select
                    style={{ width: '100%' }}
                    value={metricType}
                    onChange={(value) => setMetricType(value)}
                    options={[
                      { label: 'Total Events', value: 'total' },
                      { label: 'Unique Users', value: 'unique_users' },
                      { label: 'Count Distinct', value: 'count_distinct' },
                      { label: 'Sum', value: 'sum' },
                      { label: 'Average', value: 'average' },
                      { label: 'Min', value: 'min' },
                      { label: 'Max', value: 'max' },
                    ]}
                  />
                </Col>
                {['count_distinct', 'sum', 'average', 'min', 'max'].includes(metricType) && (
                  <Col span={12}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Property</div>
                    <Select
                      style={{ width: '100%' }}
                      value={metricProperty}
                      onChange={(value) => setMetricProperty(value)}
                      placeholder="Select a property"
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={funnelSteps[0]?.table && propertiesByTable[funnelSteps[0].table]
                        ? propertiesByTable[funnelSteps[0].table].map(prop => ({
                            label: prop,
                            value: prop
                          }))
                        : []
                      }
                    />
                  </Col>
                )}
              </Row>

              {/* Breakdown Properties Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>Breakdown By (optional)</span>
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      if (breakdownProperties.length < 3) {
                        setBreakdownProperties([...breakdownProperties, { property: '' }]);
                      }
                    }}
                    disabled={breakdownProperties.length >= 3 || !funnelSteps[0]?.table}
                    size="small"
                  >
                    Add Property
                  </Button>
                </div>

                {breakdownProperties.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontSize: 14 }}>
                    Add properties to break down funnel results by dimensions
                  </div>
                )}

                {breakdownProperties.map((bp, index) => {
                  const isDateProperty = bp.property && (
                    bp.property.toLowerCase().includes('date') ||
                    bp.property.toLowerCase().includes('time') ||
                    bp.property === 'ist_date' ||
                    bp.property === 'event_timestamp'
                  );

                  return (
                    <Card
                      key={index}
                      size="small"
                      style={{ marginBottom: 12 }}
                    >
                      <Row gutter={16} align="middle">
                        <Col span={1}>
                          <Tag color={STEP_COLORS[index % STEP_COLORS.length]}>{index + 1}</Tag>
                        </Col>
                        <Col span={isDateProperty ? 10 : 21}>
                          <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>Property</div>
                          <Select
                            style={{ width: '100%' }}
                            placeholder="Select property"
                            value={bp.property || undefined}
                            onChange={(value) => {
                              const updated = [...breakdownProperties];
                              updated[index] = { property: value };
                              setBreakdownProperties(updated);
                            }}
                            showSearch
                            disabled={!funnelSteps[0]?.table || propertiesLoading[funnelSteps[0]?.table]}
                            loading={propertiesLoading[funnelSteps[0]?.table]}
                            filterOption={(input, option) =>
                              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={(propertiesByTable[funnelSteps[0]?.table] || []).map(prop => ({
                              label: prop,
                              value: prop
                            }))}
                          />
                        </Col>
                        {isDateProperty && (
                          <Col span={11}>
                            <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>
                              Granularity
                              <span style={{ marginLeft: 8, color: '#1890ff' }}>(Date property detected)</span>
                            </div>
                            <Select
                              style={{ width: '100%' }}
                              placeholder="Select granularity"
                              value={bp.granularity || 'daily'}
                              onChange={(value) => {
                                const updated = [...breakdownProperties];
                                updated[index] = { ...bp, granularity: value };
                                setBreakdownProperties(updated);
                              }}
                              options={[
                                { label: 'Daily', value: 'daily' },
                                { label: 'Weekly', value: 'weekly' },
                                { label: 'Monthly', value: 'monthly' }
                              ]}
                            />
                          </Col>
                        )}
                        <Col span={2}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              setBreakdownProperties(breakdownProperties.filter((_, i) => i !== index));
                            }}
                          />
                        </Col>
                      </Row>
                    </Card>
                  );
                })}

                {breakdownProperties.length > 1 && (
                  <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                    Combined breakdown: {breakdownProperties.filter(bp => bp.property).map(bp => bp.property).join(' | ')}
                  </div>
                )}
              </div>

              <Button
                type="primary"
                onClick={calculateFunnel}
                loading={loading}
                size="large"
                block
                disabled={funnelSteps.filter(s => s.table && s.event).length < 2}
              >
                Calculate Funnel
              </Button>

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
            <div style={{ marginTop: 16 }}>Calculating funnel...</div>
          </div>
        </Card>
      )}

      {!loading && funnelResults.length > 0 && (
        <>
          {/* Overall Conversion */}
          <Card style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title={`Starting ${getMetricLabel(metricType, metricProperty)}`}
                  value={funnelResults[0].count}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={`Completed ${getMetricLabel(metricType, metricProperty)}`}
                  value={funnelResults[funnelResults.length - 1].count}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Overall Conversion"
                  value={overallConversion}
                  suffix="%"
                  precision={1}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Col>
            </Row>
          </Card>

          {/* Step-by-Step Breakdown */}
          <Card title="Step-by-Step Breakdown" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {funnelResults.map((result, index) => (
                <Card
                  key={result.step}
                  size="small"
                  style={{ borderLeft: `4px solid ${STEP_COLORS[index % STEP_COLORS.length]}` }}
                >
                  <Row gutter={16} align="middle">
                    <Col span={12}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>
                        Step {result.step}: {result.stepName}
                      </div>
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title={getMetricLabel(metricType, metricProperty)}
                        value={result.count}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="Conversion"
                        value={result.conversionRate.toFixed(1)}
                        suffix="%"
                        valueStyle={{ fontSize: 20, color: '#52c41a' }}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="Drop-off"
                        value={result.dropOffRate.toFixed(1)}
                        suffix="%"
                        valueStyle={{ fontSize: 20, color: '#f5222d' }}
                      />
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          </Card>

          {/* Funnel Visualization */}
          <div id="funnel-chart-container">
          <Card title="Funnel Visualization">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={funnelResults}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="stepName" type="category" width={250} />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === 'count') return [value.toLocaleString(), 'Users'];
                    if (name === 'conversionRate') return [`${value.toFixed(1)}%`, 'Conversion'];
                    if (name === 'dropOffRate') return [`${value.toFixed(1)}%`, 'Drop-off'];
                    return value;
                  }}
                />
                <Legend />
                <Bar dataKey="count" name="Users" >
                  {funnelResults.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={STEP_COLORS[index % STEP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          </div>
        </>
      )}


      {/* Breakdown Results */}
      {!loading && funnelBreakdowns.length > 0 && (
        <div id="funnel-breakdown-container">
          {/* Combined Chart for All Segments */}
          <Card
            title={
              <div>
                Funnel Comparison - {' '}
                <span style={{ color: '#1890ff' }}>
                  {breakdownProperties.filter(bp => bp.property).map(bp => {
                    if (bp.granularity) {
                      return `${bp.property} (${bp.granularity})`;
                    }
                    return bp.property;
                  }).join(' | ')}
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
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={(() => {
                  // Transform breakdown data to combined format
                  if (funnelBreakdowns.length === 0) return [];
                  const stepNames = funnelBreakdowns[0].steps.map(s => s.stepName);
                  return stepNames.map((stepName, stepIndex) => {
                    const dataPoint: any = { stepName };
                    funnelBreakdowns.forEach(breakdown => {
                      dataPoint[breakdown.segmentName] = breakdown.steps[stepIndex].count;
                    });
                    return dataPoint;
                  });
                })()}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 100, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  type="number"
                  stroke="#888"
                  style={{ fontSize: 11 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                    return value.toString();
                  }}
                />
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
                <Legend
                  wrapperStyle={{ color: '#fff', fontSize: 11 }}
                  iconType="rect"
                />
                {funnelBreakdowns.map((breakdown, index) => (
                  <Bar
                    key={breakdown.segmentName}
                    dataKey={breakdown.segmentName}
                    fill={STEP_COLORS[index % STEP_COLORS.length]}
                    radius={[0, 4, 4, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Individual Segment Details */}
          <Card
            title={
              <div>
                Detailed Breakdown by Segment
              </div>
            }
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {funnelBreakdowns.map((breakdown, breakdownIndex) => {
                const overallConv = breakdown.steps[0].count > 0
                  ? ((breakdown.steps[breakdown.steps.length - 1].count / breakdown.steps[0].count) * 100).toFixed(1)
                  : '0.0';

                return (
                  <Card
                    key={breakdown.segmentName}
                    size="small"
                    title={
                      <div>
                        <Tag color={STEP_COLORS[breakdownIndex % STEP_COLORS.length]} style={{ marginRight: 8 }}>
                          {breakdownIndex + 1}
                        </Tag>
                        <span style={{ fontWeight: 600, fontSize: 16 }}>{breakdown.segmentName}</span>
                        <span style={{ marginLeft: 16, fontSize: 14, color: '#888' }}>
                          {breakdown.steps[0].count.toLocaleString()} users • {overallConv}% conversion
                        </span>
                      </div>
                    }
                    style={{ borderLeft: `4px solid ${STEP_COLORS[breakdownIndex % STEP_COLORS.length]}` }}
                  >
                    {/* Stats Cards */}
                    <Row gutter={16} style={{ marginBottom: 24 }}>
                      {breakdown.steps.map((step, stepIndex) => (
                        <Col key={step.step} span={24 / breakdown.steps.length}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                              Step {step.step}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
                              {step.count.toLocaleString()}
                            </div>
                            <div style={{ fontSize: 14, color: '#52c41a' }}>
                              {step.conversionRate.toFixed(1)}%
                            </div>
                            {stepIndex > 0 && (
                              <div style={{ fontSize: 12, color: '#f5222d', marginTop: 4 }}>
                                -{step.dropOffRate.toFixed(1)}% drop
                              </div>
                            )}
                          </div>
                        </Col>
                      ))}
                    </Row>

                    {/* Funnel Visualization for this segment */}
                    <ResponsiveContainer width="100%" height={Math.max(250, breakdown.steps.length * 80)}>
                      <BarChart
                        data={breakdown.steps}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis
                          dataKey="stepName"
                          type="category"
                          width={200}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value: any, name: string) => {
                            if (name === 'count') return [value.toLocaleString(), 'Users'];
                            if (name === 'conversionRate') return [`${value.toFixed(2)}%`, 'Conversion'];
                            return value;
                          }}
                        />
                        <Bar dataKey="count" name="Users" fill={STEP_COLORS[breakdownIndex % STEP_COLORS.length]}>
                          {breakdown.steps.map((_entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={STEP_COLORS[index % STEP_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })}
            </Space>
          </Card>

          {/* Comparison Chart */}
          <Card title="Conversion Comparison">
            <ResponsiveContainer width="100%" height={Math.max(300, funnelBreakdowns.length * 60)}>
              <BarChart
                data={funnelBreakdowns.map((breakdown) => ({
                  segment: breakdown.segmentName,
                  conversion: breakdown.steps[0].count > 0
                    ? (breakdown.steps[breakdown.steps.length - 1].count / breakdown.steps[0].count) * 100
                    : 0,
                  users: breakdown.steps[0].count
                }))}
                layout="horizontal"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="segment" />
                <YAxis label={{ value: 'Conversion %', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === 'Conversion Rate (%)' || name === 'conversion') {
                      const rounded = Math.round(Number(value) * 100) / 100;
                      return [`${rounded.toFixed(2)}%`, 'Conversion Rate'];
                    }
                    if (name === 'Starting Users' || name === 'users') {
                      return [value.toLocaleString(), 'Starting Users'];
                    }
                    return value;
                  }}
                />
                <Legend />
                <Bar dataKey="conversion" name="Conversion Rate (%)" fill="#722ed1" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* Save Chart Modal */}
      <SaveChartModal
        visible={saveChartModalVisible}
        onClose={() => setSaveChartModalVisible(false)}
        chartCategory="funnels"
        config={buildChartConfig()}
        existingChart={loadedChartId ? {
          id: loadedChartId,
          name: loadedChartName || '',
          description: loadedChartDescription,
          chart_type: loadedChartType,
          permission: loadedChartPermission,
        } : undefined}
      />

      {/* Chart Library Drawer */}
      <ChartLibrary
        visible={chartLibraryVisible}
        onClose={() => setChartLibraryVisible(false)}
        onLoadChart={handleLoadChart}
        onNavigate={onNavigate}
        currentPage="funnels"
      />

      {/* Full-screen loading overlay for initial chart load */}
      {initialChartLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <Spin size="large" />
          <div style={{ marginTop: 24, color: '#fff', fontSize: 16 }}>
            Loading funnel data...
          </div>
        </div>
      )}
    </div>
  );
}

export default Funnels;
