import { DeleteOutlined, DownloadOutlined, FilterOutlined, FolderOpenOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Dropdown,
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
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SavedChart } from '../lib/charts';
import { clearAnalyticsCache, DateGranularity, getEventMetric, getEventMetricWithBreakdown, getEventNames, getEventProperties, getPropertyValues, MetricConfig, MetricType, PropertyFilter, TrendBreakdown } from '../lib/clickhouse';
import { DATE_RANGE_OPTIONS, DateRangeConfig, DateRangeType, detectDateRangeType, getAbsoluteDateRange, getDateRangeLabel } from '../lib/dateRanges';
import { schemaAdapter } from '../lib/schema-adapter';
import { exportToCSV, exportToPNG } from '../utils/exportUtils';
import ChartLibrary from './ChartLibrary';
import FilterRow from './FilterRow';
import SaveChartModal from './SaveChartModal';

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

// Get metric label for display
const getMetricLabel = (metricType: MetricType, metricProperty?: string): string => {
  switch (metricType) {
    case 'total':
      return 'Total Events';
    case 'unique_users':
      return 'Unique Users';
    case 'count_distinct':
      return `Count Distinct ${metricProperty || 'Property'}`;
    case 'sum':
      return `Sum of ${metricProperty || 'Property'}`;
    case 'average':
      return `Average ${metricProperty || 'Property'}`;
    case 'min':
      return `Min ${metricProperty || 'Property'}`;
    case 'max':
      return `Max ${metricProperty || 'Property'}`;
    default:
      return 'Count';
  }
};

interface EventTrendsProps {
  onNavigate?: (page: string) => void;
}

function EventTrends({ onNavigate }: EventTrendsProps = {}) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [eventsByTable, setEventsByTable] = useState<Record<string, string[]>>({});
  const [propertiesByTable, setPropertiesByTable] = useState<Record<string, string[]>>({});
  const [breakdownProperties, setBreakdownProperties] = useState<string[]>([]);
  const [trendBreakdowns, setTrendBreakdowns] = useState<Record<string, TrendBreakdown[]>>({});
  const [granularity, setGranularity] = useState<DateGranularity>('daily');
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('last_7_days');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(6, 'days').startOf('day'),
    dayjs().endOf('day')
  ]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialChartLoading, setInitialChartLoading] = useState(false); // Full-screen loading for chart load
  const [error, setError] = useState<string>('');
  const [eventsLoading, setEventsLoading] = useState<Record<string, boolean>>({});
  const [propertiesLoading, setPropertiesLoading] = useState<Record<string, boolean>>({});
  const [highlightedSource, setHighlightedSource] = useState<string | null>(null);
  const [propertyValueSuggestions, setPropertyValueSuggestions] = useState<Record<string, string[]>>({});
  
  // Metric configuration
  const [metricType, setMetricType] = useState<MetricType>('total');
  const [metricProperty, setMetricProperty] = useState<string>('');
  
  // Chart save/load state
  const [saveChartModalVisible, setSaveChartModalVisible] = useState(false);
  const [chartLibraryVisible, setChartLibraryVisible] = useState(false);
  
  // Track loaded chart for update vs. save-as-new
  const [loadedChartId, setLoadedChartId] = useState<string | null>(null);
  const [loadedChartName, setLoadedChartName] = useState<string | null>(null);
  const [loadedChartDescription, setLoadedChartDescription] = useState<string>('');
  const [loadedChartType, setLoadedChartType] = useState<string>('line');
  const [loadedChartPermission, setLoadedChartPermission] = useState<string | undefined>(undefined);
  
  // Flag to prevent auto-loading during chart restoration
  const [isRestoringChart, setIsRestoringChart] = useState(false);

  // Load a saved chart (defined early for useEffect)
  const handleLoadChart = async (chart: SavedChart) => {
    try {
      // Show full-screen loading overlay
      setInitialChartLoading(true);
      
      const config = JSON.parse(chart.config);
      
      // Set flag to prevent auto-loading during restoration
      setIsRestoringChart(true);
      
      // Track loaded chart metadata for update functionality
      setLoadedChartId(chart.id);
      setLoadedChartName(chart.name);
      setLoadedChartDescription(chart.description || '');
      setLoadedChartType(chart.chart_type || 'line');
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
      
      // Restore granularity
      if (config.granularity) {
        setGranularity(config.granularity);
      }
      
      // Restore breakdown properties
      if (config.breakdownProperties) {
        setBreakdownProperties(config.breakdownProperties);
      }
      
      // Restore metric config (backwards compatible - defaults to 'total')
      if (config.metricConfig) {
        setMetricType(config.metricConfig.type || 'total');
        setMetricProperty(config.metricConfig.property || '');
      } else {
        // Legacy charts default to 'total' metric
        setMetricType('total');
        setMetricProperty('');
      }

      // Load events and properties for all tables FIRST before setting dataSources
      await Promise.all(config.dataSources.map(async (ds: DataSource) => {
        if (ds.table) {
          await loadEventsForTable(ds.table);
          await loadPropertiesForTable(ds.table);
        }
      }));
      
      // NOW restore data sources after events are loaded
      setDataSources(config.dataSources || []);
      
      // Clear flag and trigger manual load after state is set
      setTimeout(() => {
        setIsRestoringChart(false);
      }, 100);
    } catch (error) {
      console.error('Error loading chart:', error);
      setIsRestoringChart(false);
    }
  };

  // Initialize data source with table from schema config
  useEffect(() => {
    // Check if we're loading a chart from sessionStorage
    const chartToLoadStr = sessionStorage.getItem('chartToLoad');
    if (chartToLoadStr) {
      // Skip default setup if loading a saved chart
      return;
    }
    
    // Auto-add table from schema config as first data source
    const tableName = schemaAdapter.getTableName();
    const initialDataSource: DataSource = {
      id: '1',
      table: tableName,
      events: []
    };
    setDataSources([initialDataSource]);
    // Load events for the table
    loadEventsForTable(tableName, '1');
    // Load properties for the table
    loadPropertiesForTable(tableName);
  }, []);

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
          
          if (chart.chart_category === 'insights') {
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


  // Update absolute dates when date range type changes
  useEffect(() => {
    const config: DateRangeConfig = { type: dateRangeType };
    const [start, end] = getAbsoluteDateRange(config);
    setDateRange([start, end]);
  }, [dateRangeType]);

  // Auto-load trend data when dependencies change
  useEffect(() => {
    // Skip auto-loading if we're restoring a chart
    if (isRestoringChart) {
      return;
    }
    
    const hasValidData = dataSources.some(ds => ds.table && ds.events.length > 0);
    if (hasValidData) {
      // Debounce to avoid too many requests
      const timer = setTimeout(() => {
        loadTrendData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dataSources, dateRange, granularity, breakdownProperties, metricType, metricProperty, isRestoringChart]);

  const loadEventsForTable = async (table: string, sourceId?: string) => {
    if (eventsByTable[table]) {
      return; // Already loaded
    }
    
    try {
      setEventsLoading(prev => ({ ...prev, [table]: true }));
      const events = await getEventNames(table);
      setEventsByTable(prev => ({ ...prev, [table]: events }));
      
      // Auto-select page_loaded if available, otherwise first event
      if (sourceId && events.length > 0) {
        const defaultEvent = events.includes('page_loaded') ? 'page_loaded' : events[0];
        setDataSources(prev => 
          prev.map(ds => ds.id === sourceId ? { 
            ...ds, 
            events: [defaultEvent]
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
      const values = await getPropertyValues(table, property, 20);
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
    // Validate metric property for sum/avg/min/max
    if (['sum', 'average', 'min', 'max'].includes(metricType) && !metricProperty) {
      setError(`Please select a property for ${metricType} calculation`);
      return;
    }

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
      
      // Build metric config
      const metricConfig: MetricConfig = {
        type: metricType,
        property: metricProperty || undefined
      };
      
      if (breakdownProperties.length > 0) {
        // Fetch breakdown data for each combination using new metric function
        const breakdownResults: Record<string, TrendBreakdown[]> = {};
        
        for (const combo of allCombinations) {
          const breakdowns = await getEventMetricWithBreakdown(
            combo.table,
            combo.eventName,
            startDate.format('YYYY-MM-DD'),
            endDate.format('YYYY-MM-DD'),
            metricConfig,
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
        // Regular trend without breakdown using new metric function
        const allSourcesData = await Promise.all(
          allCombinations.map(combo => 
            getEventMetric(
              combo.table,
              combo.eventName,
              startDate.format('YYYY-MM-DD'),
              endDate.format('YYYY-MM-DD'),
              metricConfig,
              granularity,
              combo.filters
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
      setInitialChartLoading(false); // Clear full-screen loading overlay
    }
  };

  // Helper functions to manage data sources
  const addDataSource = async () => {
    const tableName = schemaAdapter.getTableName();
    const newSource: DataSource = {
      id: Date.now().toString(),
      table: tableName,
      events: []
    };
    setDataSources(prev => [...prev, newSource]);
    await loadEventsForTable(tableName, newSource.id);
  };

  const removeDataSource = (id: string) => {
    setDataSources(prev => prev.filter(ds => ds.id !== id));
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

  // Build chart configuration for saving
  const buildChartConfig = () => {
    // Detect if current date range matches a relative pattern
    const detectedConfig = detectDateRangeType(dateRange[0], dateRange[1]);
    
    const metricConfig: MetricConfig = {
      type: metricType,
      property: metricProperty || undefined
    };
    
    return {
      dataSources: dataSources,
      dateRangeConfig: detectedConfig,  // Store relative date range config
      granularity: granularity,
      breakdownProperties: breakdownProperties,
      metricConfig: metricConfig,  // Include metric configuration
    };
  };

  // Export handlers
  const handleExportPNG = () => {
    // If breakdown is used, export the breakdown section instead
    const hasBreakdown = Object.keys(trendBreakdowns).length > 0;
    const elementId = hasBreakdown ? 'breakdown-charts-container' : 'insights-chart-container';
    
    const chartElement = document.getElementById(elementId);
    if (chartElement) {
      const filename = `insights-${dayjs().format('YYYY-MM-DD-HHmmss')}.png`;
      exportToPNG(chartElement, filename);
    } else {
      message.error('Chart not found');
    }
  };

  const handleExportCSV = () => {
    // Check if we have breakdown data or regular chart data
    const hasBreakdownData = Object.keys(trendBreakdowns).length > 0 && 
                             Object.values(trendBreakdowns).some(data => data.length > 0);
    const hasRegularData = chartData.length > 0;

    if (!hasBreakdownData && !hasRegularData) {
      message.warning('No data to export');
      return;
    }

    const filename = `insights-${dayjs().format('YYYY-MM-DD-HHmmss')}.csv`;
    
    // If we have breakdown data, flatten it for export
    if (hasBreakdownData) {
      const flattenedData: any[] = [];
      Object.entries(trendBreakdowns).forEach(([sourceKey, breakdowns]) => {
        breakdowns.forEach((breakdown) => {
          breakdown.data.forEach((point: any) => {
            flattenedData.push({
              source: sourceKey,
              segment: breakdown.segmentName,
              date: point.date,
              count: point.count,
            });
          });
        });
      });
      exportToCSV(flattenedData, filename);
    } else {
      // Export regular chart data
      exportToCSV(chartData, filename);
    }
  };

  const handleNewChart = () => {
    // Clear loaded chart state to start fresh
    setLoadedChartId(null);
    setLoadedChartName(null);
    setLoadedChartDescription('');
    setLoadedChartType('line');
  };

  const handleRefreshData = async () => {
    try {
      // Clear all analytics cache
      clearAnalyticsCache();
      
      // Re-fetch event names for current data sources
      const newEventsLoading: Record<string, boolean> = {};
      const newEventsByTable: Record<string, string[]> = {};
      
      for (const source of dataSources) {
        if (source.table) {
          newEventsLoading[source.table] = true;
          setEventsLoading(newEventsLoading);
          
          try {
            const events = await getEventNames(source.table);
            newEventsByTable[source.table] = events;
          } catch (err) {
            console.error(`Failed to fetch events for ${source.table}:`, err);
          } finally {
            newEventsLoading[source.table] = false;
            setEventsLoading({ ...newEventsLoading });
          }
        }
      }
      
      setEventsByTable(newEventsByTable);
      
      message.success('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      message.error('Failed to refresh data');
    }
  };

  return (
    <div>
      <Card 
        title={
          <Space>
            <span>Event Trends - Multi-Datasource</span>
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
                  {
                    key: 'png',
                    label: 'Export as PNG',
                    onClick: handleExportPNG,
                  },
                  {
                    key: 'csv',
                    label: 'Export as CSV',
                    onClick: handleExportCSV,
                  },
                ],
              }}
              disabled={chartData.length === 0 && Object.keys(trendBreakdowns).length === 0}
            >
              <Button icon={<DownloadOutlined />} disabled={chartData.length === 0 && Object.keys(trendBreakdowns).length === 0}>
                Export
              </Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => setSaveChartModalVisible(true)}
              disabled={dataSources.length === 0 || !dataSources.some(ds => ds.events.length > 0)}
            >
              Save Chart
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
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
                  <Col span={21}>
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
                          <FilterRow
                            key={filterIndex}
                            filter={filter}
                            properties={propertiesByTable[source.table] || []}
                            onUpdate={(field, value) => updateFilter(source.id, filterIndex, field, value)}
                            onRemove={() => removeFilter(source.id, filterIndex)}
                            onPropertyChange={(property) => {
                              // Fetch property value suggestions when property changes
                              const key = `${source.table}:${property}`;
                              if (!propertyValueSuggestions[key]) {
                                getPropertyValues(source.table, property, 10)
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
                              const key = `${source.table}:${filter.property}`;
                              return propertyValueSuggestions[key] || [];
                            })()}
                            loadingPropertyValues={false}
                          />
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

              {/* Metric Configuration */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Metric Type</div>
                  <Select
                    style={{ width: '100%' }}
                    value={metricType}
                    onChange={(value) => {
                      setMetricType(value);
                      // Clear property if switching away from sum/avg/min/max/count_distinct
                      if (!['count_distinct', 'sum', 'average', 'min', 'max'].includes(value)) {
                        setMetricProperty('');
                      }
                    }}
                    options={[
                      { label: 'Total Events', value: 'total' },
                      { label: 'Unique Users', value: 'unique_users' },
                      { label: 'Count Distinct', value: 'count_distinct' },
                      { label: 'Sum', value: 'sum' },
                      { label: 'Average', value: 'average' },
                      { label: 'Minimum', value: 'min' },
                      { label: 'Maximum', value: 'max' }
                    ]}
                  />
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {metricType === 'total' && 'Count all matching events'}
                    {metricType === 'unique_users' && 'Count distinct users'}
                    {metricType === 'count_distinct' && 'Count distinct values of a property'}
                    {metricType === 'sum' && 'Sum of property values'}
                    {metricType === 'average' && 'Average of property values'}
                    {metricType === 'min' && 'Minimum property value'}
                    {metricType === 'max' && 'Maximum property value'}
                  </div>
                </Col>
                {['count_distinct', 'sum', 'average', 'min', 'max'].includes(metricType) && (
                  <Col span={6}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Property *</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Select property"
                      value={metricProperty}
                      onChange={(value) => setMetricProperty(value)}
                      showSearch
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
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      Property for {metricType} calculation
                    </div>
                  </Col>
                )}
              </Row>

              {/* Configuration */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
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

      {/* Statistics for each table+event combination - ONLY WHEN NOT USING BREAKDOWN */}
      {!loading && chartData.length > 0 && (
        <>
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
                      title={getMetricLabel(metricType, metricProperty)}
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

          <div id="insights-chart-container">
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
          </div>
        </>
      )}

      {/* Breakdown Results */}
      {!loading && Object.keys(trendBreakdowns).length > 0 && (
        <div id="breakdown-charts-container">
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
                                title={getMetricLabel(metricType, metricProperty)}
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
        </div>
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

      {/* Save Chart Modal */}
      <SaveChartModal
        visible={saveChartModalVisible}
        onClose={() => setSaveChartModalVisible(false)}
        chartCategory="insights"
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
        currentPage="insights"
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
            Loading chart data...
          </div>
        </div>
      )}
    </div>
  );
}

export default EventTrends;

