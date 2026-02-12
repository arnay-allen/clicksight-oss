import { CloseOutlined, DeleteOutlined, DownloadOutlined, DownOutlined, FilterOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Dropdown, Input, message, Select, Space, Spin, Table, Tabs, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import React, { useEffect, useState } from 'react';
import { clearAnalyticsCache, getEventNames, getEventProperties, getPropertyValues, getRecentEvents } from '../lib/clickhouse';
import theme from '../styles/theme';
import { formatPropertyValue } from '../utils/propertyFormatter';

const { RangePicker } = DatePicker;
const { Option } = Select;

dayjs.extend(relativeTime);

interface PropertyFilter {
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'in' | 'not_in';
  value: string;
}

interface EventRow {
  event_name: string;
  ist_date: string;
  server_timestamp: string;
  pixel_properties?: string | any;
  pathname?: string;
  event_timestamp?: string;
  [key: string]: any;
}

function Events() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'day').startOf('day'),
    dayjs().subtract(1, 'day').endOf('day')
  ]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loadedEvents, setLoadedEvents] = useState<EventRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 100;
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  // const [jsonMode, setJsonMode] = useState<Record<string, boolean>>({});
  const [activeTabByRow, setActiveTabByRow] = useState<Record<string, string>>({});
  const [tabJsonModeByRow, setTabJsonModeByRow] = useState<Record<string, Record<string, boolean>>>({});
  
  // Event selection
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [loadingEventNames, setLoadingEventNames] = useState(false);
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState('');

  // Filters
  const [filters, setFilters] = useState<PropertyFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [newFilter, setNewFilter] = useState<PropertyFilter>({
    property: '',
    operator: 'equals',
    value: ''
  });
  const [propertyValues, setPropertyValues] = useState<string[]>([]);
  const [loadingPropertyValues, setLoadingPropertyValues] = useState(false);

  // Load available events and properties on mount
  useEffect(() => {
    loadAvailableEvents();
    loadAvailableProperties();
  }, []);

  // Load events data when filters change
  useEffect(() => {
    if (dateRange) {
      loadEvents(true); // true = reset
    }
  }, [dateRange, selectedEvents, filters]);

  const loadAvailableEvents = async () => {
    try {
      setLoadingEventNames(true);
      const events = await getEventNames('app_events');
      setAvailableEvents(events);
    } catch (err: any) {
      message.error('Failed to load event names: ' + err.message);
    } finally {
      setLoadingEventNames(false);
    }
  };

  const loadAvailableProperties = async () => {
    try {
      const properties = await getEventProperties('app_events');
      setAvailableProperties(properties);
    } catch (err: any) {
      console.error('Failed to load properties:', err);
    }
  };

  const loadPropertyValues = async (property: string) => {
    try {
      setLoadingPropertyValues(true);
      const values = await getPropertyValues('app_events', property);
      setPropertyValues(values.slice(0, 50)); // Limit to 50 values
    } catch (err: any) {
      console.error('Failed to load property values:', err);
      setPropertyValues([]);
    } finally {
      setLoadingPropertyValues(false);
    }
  };

  const parsePixelProperties = (pixelProps: any): any => {
    if (!pixelProps) return {};
    if (typeof pixelProps === 'string') {
      try {
        return JSON.parse(pixelProps);
      } catch {
        return {};
      }
    }
    return pixelProps;
  };

  const loadEvents = async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
        setLoadedEvents([]);
      } else {
        setLoadingMore(true);
      }

      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      const offset = reset ? 0 : loadedEvents.length;
      
      // Pass filters to the query
      const result = await getRecentEvents(
        startDate, 
        endDate, 
        pageSize, 
        offset,
        selectedEvents.length > 0 ? selectedEvents : undefined,
        filters.length > 0 ? filters : undefined
      );
      
      if (reset) {
        setEvents(result.data);
        setLoadedEvents(result.data);
      } else {
        const newEvents = [...loadedEvents, ...result.data];
        setEvents(newEvents);
        setLoadedEvents(newEvents);
      }
      
      setTotalEvents(result.total);
      setHasMore(result.data.length === pageSize);
      setLastUpdated(new Date());
      
    } catch (err: any) {
      message.error('Failed to load events: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleRefreshData = async () => {
    try {
      // Clear all analytics cache
      clearAnalyticsCache();
      
      // Show loading state
      setLoadingEventNames(true);
      setLoadingProperties(true);
      
      // Re-fetch event names
      try {
        const names = await getEventNames('app_events');
        setAvailableEvents(names);
      } catch (err) {
        console.error('Failed to fetch event names:', err);
      } finally {
        setLoadingEventNames(false);
      }
      
      // Re-fetch properties
      try {
        const props = await getEventProperties('app_events');
        setAvailableProperties(props);
      } catch (err) {
        console.error('Failed to fetch properties:', err);
      } finally {
        setLoadingProperties(false);
      }
      
      message.success('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      message.error('Failed to refresh data');
    }
  };

  const exportEventsAsJSON = () => {
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        filters: {
          dateRange: {
            start: dateRange[0].format('YYYY-MM-DD'),
            end: dateRange[1].format('YYYY-MM-DD')
          },
          eventNames: selectedEvents.length > 0 ? selectedEvents : 'all',
          propertyFilters: filters.map(f => ({
            property: f.property,
            operator: f.operator,
            value: f.value
          }))
        },
        totalEvents: loadedEvents.length,
        events: loadedEvents.map(event => ({
          event_name: event.event_name,
          server_timestamp: event.server_timestamp,
          pixel_properties_user_id: event.pixel_properties_user_id || event['pixel_properties.user_id'] || '',
          pixel_device_id: event.pixel_device_id || '',
          city: extractPropertyFromEvent(event, 'cf_city'),
          state: extractPropertyFromEvent(event, 'cf_state'),
          country: extractPropertyFromEvent(event, 'cf_country'),
          pixel_properties: parsePixelProperties(event.pixel_properties),
          meta: event.meta || {},
          all_properties: event
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clicksight-events-${dateRange[0].format('YYYY-MM-DD')}-to-${dateRange[1].format('YYYY-MM-DD')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      message.success(`Exported ${loadedEvents.length} events as JSON`);
    } catch (error: any) {
      message.error('Failed to export events: ' + error.message);
    }
  };

  const getEventColor = (eventName: string): string => {
    let hash = 0;
    for (let i = 0; i < eventName.length; i++) {
      hash = eventName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % theme.colors.chart.length;
    return theme.colors.chart[index];
  };

  // const formatTime = (timestamp: string): string => {
  //   return dayjs(timestamp).fromNow();
  // };

  const truncateText = (text: string, maxLength: number = 20): string => {
    if (!text) return '-';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  const extractPropertyFromEvent = (event: EventRow, propertyPath: string): any => {
    const pixelProps = parsePixelProperties(event.pixel_properties);
    
    // Handle pixel_properties fields
    if (propertyPath.includes('cf_city')) return pixelProps.cf_city || '-';
    if (propertyPath.includes('cf_state')) return pixelProps.cf_state || '-';
    if (propertyPath.includes('cf_country')) return pixelProps.cf_country || '-';
    if (propertyPath.includes('user_id')) {
      // Try multiple sources for user_id
      return pixelProps.user_id || 
             event.pixel_properties_user_id || 
             event['pixel_properties.user_id'] || 
             '-';
    }
    
    return event[propertyPath] || '-';
  };

  const isPropertyEmpty = (value: any): boolean => {
    return value === null || 
           value === undefined || 
           value === '' || 
           value === '-' ||
           (typeof value === 'string' && value.trim() === '');
  };

  const groupPropertiesByCategory = (event: EventRow) => {
    const pixelProps = parsePixelProperties(event.pixel_properties);
    const myProperties: Record<string, any> = {};
    const yourProperties: Record<string, any> = {};
    const allProperties: Record<string, any> = {};

    const excludeFields = ['pathname', 'ist_date', 'event_timestamp', 'server_timestamp'];
    
    // Add pixel properties (excluding $ and empty values)
    Object.keys(pixelProps).forEach(key => {
      const value = pixelProps[key];
      if (!key.startsWith('$') && !isPropertyEmpty(value)) {
        myProperties[key] = value;
        allProperties[`pixel_properties.${key}`] = value;
      }
    });

    // Add other event properties (excluding empty values)
    Object.keys(event).forEach(key => {
      const value = event[key];
      if (!excludeFields.includes(key) && 
          key !== 'pixel_properties' && 
          !key.startsWith('$') && 
          !isPropertyEmpty(value)) {
        yourProperties[key] = value;
        allProperties[key] = value;
      }
    });

    return { myProperties, yourProperties, allProperties };
  };

  const renderPropertyTable = (properties: Record<string, any>) => {
    const entries = Object.entries(properties);
    
    if (entries.length === 0) {
      return (
        <div style={{ color: theme.colors.text.muted, padding: '20px', textAlign: 'center' }}>
          No properties found
        </div>
      );
    }
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', fontSize: '13px' }}>
        {entries.map(([key, value]) => (
          <React.Fragment key={key}>
            <div style={{ 
              color: theme.colors.text.muted,
              fontWeight: 500,
              padding: '8px 12px',
              background: theme.colors.background.card,
              borderRadius: '4px'
            }}>
              {key}
            </div>
            <div style={{ 
              color: theme.colors.text.primary,
              padding: '8px 12px',
              background: theme.colors.background.card,
              borderRadius: '4px',
              wordBreak: 'break-word',
              fontFamily: 'Monaco, monospace',
              fontSize: '12px'
            }}>
              {formatPropertyValue(value)}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // const renderJSONView = (event: EventRow) => {
  //   const displayEvent = {
  //     ...event,
  //     pixel_properties: parsePixelProperties(event.pixel_properties)
  //   };
  //   
  //   return (
  //     <pre style={{
  //       background: theme.colors.background.card,
  //       padding: '16px',
  //       borderRadius: '8px',
  //       border: `1px solid ${theme.colors.border.subtle}`,
  //       color: theme.colors.text.primary,
  //       fontSize: '12px',
  //       fontFamily: 'Monaco, monospace',
  //       overflow: 'auto',
  //       maxHeight: '400px',
  //       margin: 0,
  //       whiteSpace: 'pre-wrap',
  //       wordBreak: 'break-word'
  //     }}>
  //       {JSON.stringify(displayEvent, null, 2)}
  //     </pre>
  //   );
  // };

  const expandedRowRender = (record: EventRow) => {
    const rowKey = record.client_reference_id;
    const activeTab = activeTabByRow[rowKey] || 'pixel';
    const tabJsonMode = tabJsonModeByRow[rowKey] || {};
    const { myProperties, yourProperties, allProperties } = groupPropertiesByCategory(record);

    const setActiveTab = (tab: string) => {
      setActiveTabByRow(prev => ({ ...prev, [rowKey]: tab }));
    };

    const setTabJsonMode = (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
      setTabJsonModeByRow(prev => ({
        ...prev,
        [rowKey]: updater(prev[rowKey] || {})
      }));
    };

    const renderTabContent = (properties: any, tabKey: string) => {
      const isJsonMode = tabJsonMode[tabKey] || false;
      
      return (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            marginBottom: '12px'
          }}>
            <Button
              size="small"
              onClick={() => {
                setTabJsonMode(prev => ({ ...prev, [tabKey]: !prev[tabKey] }));
              }}
              style={{
                background: isJsonMode ? theme.colors.primary : 'transparent',
                color: isJsonMode ? '#fff' : theme.colors.text.primary,
                border: `1px solid ${isJsonMode ? theme.colors.primary : theme.colors.border.elevated}`
              }}
            >
              {isJsonMode ? 'Table View' : 'JSON View'}
            </Button>
          </div>
          {isJsonMode ? (
            <pre style={{
              background: theme.colors.background.main,
              padding: '16px',
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border.subtle}`,
              maxHeight: '400px',
              overflow: 'auto',
              fontSize: '12px',
              lineHeight: '1.5',
              color: theme.colors.text.primary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {JSON.stringify(properties, null, 2)}
            </pre>
          ) : (
            renderPropertyTable(properties)
          )}
        </div>
      );
    };

    return (
      <div style={{
        padding: '16px',
        background: theme.colors.background.elevated,
        borderRadius: '8px'
      }}>
        <div style={{ 
          fontSize: '14px', 
          fontWeight: 600, 
          color: theme.colors.text.primary,
          marginBottom: '16px'
        }}>
          Event Details
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'pixel',
              label: `Pixel Properties (${Object.keys(myProperties).length})`,
              children: renderTabContent(myProperties, 'pixel')
            },
            {
              key: 'your',
              label: `Your Properties (${Object.keys(yourProperties).length})`,
              children: renderTabContent(yourProperties, 'your')
            },
            {
              key: 'all',
              label: `All Properties (${Object.keys(allProperties).length})`,
              children: renderTabContent(allProperties, 'all')
            }
          ]}
        />
      </div>
    );
  };

  const columns = [
    {
      title: 'Event Name',
      dataIndex: 'event_name',
      key: 'event_name',
      width: 250,
      sorter: (a: EventRow, b: EventRow) => a.event_name.localeCompare(b.event_name),
      render: (text: string, record: EventRow) => {
        const rowKey = record.client_reference_id;
        const isExpanded = expandedRowKeys.includes(rowKey);
        
        const handleToggleExpand = (e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent interference with table sorting
          if (isExpanded) {
            setExpandedRowKeys(expandedRowKeys.filter(k => k !== rowKey));
          } else {
            setExpandedRowKeys([...expandedRowKeys, rowKey]);
          }
        };
        
        return (
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={handleToggleExpand}
          >
            {isExpanded ? (
              <DownOutlined style={{ fontSize: '12px', color: theme.colors.text.muted }} />
            ) : (
              <RightOutlined style={{ fontSize: '12px', color: theme.colors.text.muted }} />
            )}
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: getEventColor(text)
            }} />
            <span style={{ fontWeight: 500 }}>{text}</span>
          </div>
        );
      },
    },
    {
      title: 'Time',
      dataIndex: 'server_timestamp',
      key: 'time',
      width: 180,
      sorter: (a: EventRow, b: EventRow) => {
        return new Date(a.server_timestamp).getTime() - new Date(b.server_timestamp).getTime();
      },
      render: (_: any, record: EventRow) => {
        // Use ist_date + server_timestamp to show accurate time
        // ist_date is what we filter on, so show that date with server time
        const displayDate = record.ist_date || record.server_timestamp;
        // const displayTime = dayjs(displayDate).format('MMM DD, YYYY HH:mm');
        const tooltipTime = dayjs(record.server_timestamp).format('YYYY-MM-DD HH:mm:ss');
        
        return (
          <Tooltip title={`Server: ${tooltipTime} | IST Date: ${record.ist_date}`}>
            <span style={{ color: theme.colors.text.secondary, fontSize: '12px' }}>
              {displayDate ? dayjs(displayDate).format('MMM DD, HH:mm') : '-'}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: 'User ID',
      key: 'user_id',
      width: 200,
      sorter: (a: EventRow, b: EventRow) => {
        const userA = extractPropertyFromEvent(a, 'user_id');
        const userB = extractPropertyFromEvent(b, 'user_id');
        return userA.localeCompare(userB);
      },
      render: (_: any, record: EventRow) => {
        const userId = extractPropertyFromEvent(record, 'user_id');
        return (
          <Tooltip title={userId}>
            <span style={{ fontFamily: 'Monaco, monospace', fontSize: '12px' }}>
              {truncateText(userId, 25)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: 'City',
      key: 'city',
      width: 150,
      sorter: (a: EventRow, b: EventRow) => {
        const cityA = extractPropertyFromEvent(a, 'cf_city');
        const cityB = extractPropertyFromEvent(b, 'cf_city');
        return cityA.localeCompare(cityB);
      },
      render: (_: any, record: EventRow) => extractPropertyFromEvent(record, 'cf_city'),
    },
    {
      title: 'State',
      key: 'state',
      width: 120,
      sorter: (a: EventRow, b: EventRow) => {
        const stateA = extractPropertyFromEvent(a, 'cf_state');
        const stateB = extractPropertyFromEvent(b, 'cf_state');
        return stateA.localeCompare(stateB);
      },
      render: (_: any, record: EventRow) => extractPropertyFromEvent(record, 'cf_state'),
    },
    {
      title: 'Country',
      key: 'country',
      width: 150,
      sorter: (a: EventRow, b: EventRow) => {
        const countryA = extractPropertyFromEvent(a, 'cf_country');
        const countryB = extractPropertyFromEvent(b, 'cf_country');
        return countryA.localeCompare(countryB);
      },
      render: (_: any, record: EventRow) => extractPropertyFromEvent(record, 'cf_country'),
    },
  ];

  const addFilter = () => {
    if (newFilter.property && newFilter.value) {
      setFilters([...filters, newFilter]);
      setNewFilter({ property: '', operator: 'equals', value: '' });
      setShowFilterDropdown(false);
    } else {
      message.warning('Please select a property and enter a value');
    }
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const filteredEventOptions = availableEvents.filter(event =>
    event.toLowerCase().includes(eventSearchQuery.toLowerCase())
  );

  const eventDropdownContent = (
    <div style={{
      width: 400,
      background: theme.colors.background.elevated,
      border: `1px solid ${theme.colors.border.elevated}`,
      borderRadius: '8px',
      boxShadow: theme.shadows.lg,
      maxHeight: '400px',
      overflow: 'auto'
    }}>
      <div style={{ padding: '12px', borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
        <Input
          placeholder="Search events..."
          prefix={<SearchOutlined />}
          value={eventSearchQuery}
          onChange={(e) => setEventSearchQuery(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ padding: '8px' }}>
        {filteredEventOptions.map(event => (
          <div
            key={event}
            onClick={() => {
              if (!selectedEvents.includes(event)) {
                setSelectedEvents([...selectedEvents, event]);
              }
              setShowEventDropdown(false);
              setEventSearchQuery('');
            }}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: selectedEvents.includes(event) ? theme.colors.background.main : 'transparent'
            }}
            onMouseEnter={(e) => {
              if (!selectedEvents.includes(event)) {
                e.currentTarget.style.background = theme.colors.background.hover;
              }
            }}
            onMouseLeave={(e) => {
              if (!selectedEvents.includes(event)) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: getEventColor(event)
            }} />
            <span style={{ fontSize: '14px', color: theme.colors.text.primary }}>{event}</span>
          </div>
        ))}
        {filteredEventOptions.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: theme.colors.text.muted }}>
            No events found
          </div>
        )}
      </div>
    </div>
  );

  const filterDropdownContent = (
    <div style={{
      width: 400,
      background: theme.colors.background.elevated,
      border: `1px solid ${theme.colors.border.elevated}`,
      borderRadius: '8px',
      boxShadow: theme.shadows.lg,
      padding: '16px'
    }}>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: theme.colors.text.secondary, fontSize: '12px' }}>
          Property
        </label>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Select property"
          value={newFilter.property || undefined}
          onChange={(value) => {
            setNewFilter({ ...newFilter, property: value });
            loadPropertyValues(value);
          }}
          filterOption={(input, option) =>
            String(option?.children || '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {availableProperties.map(prop => (
            <Option key={prop} value={prop}>{prop}</Option>
          ))}
        </Select>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: theme.colors.text.secondary, fontSize: '12px' }}>
          Operator
        </label>
        <Select
          style={{ width: '100%' }}
          value={newFilter.operator}
          onChange={(value) => setNewFilter({ ...newFilter, operator: value })}
        >
          <Option value="equals">Equals</Option>
          <Option value="not_equals">Not Equals</Option>
          <Option value="contains">Contains</Option>
          <Option value="not_contains">Not Contains</Option>
          <Option value="in">In (comma separated)</Option>
          <Option value="not_in">Not In (comma separated)</Option>
        </Select>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: theme.colors.text.secondary, fontSize: '12px' }}>
          Value
        </label>
        <Select
          showSearch
          mode={newFilter.operator === 'in' || newFilter.operator === 'not_in' ? 'tags' : undefined}
          style={{ width: '100%' }}
          placeholder="Enter or select value"
          value={newFilter.value || undefined}
          onChange={(value) => setNewFilter({ ...newFilter, value: Array.isArray(value) ? value.join(',') : value })}
          loading={loadingPropertyValues}
          filterOption={(input, option) =>
            String(option?.children || '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {propertyValues.map(val => (
            <Option key={val} value={val}>{val}</Option>
          ))}
        </Select>
      </div>

      <Space>
        <Button type="primary" onClick={addFilter} size="small">
          Add Filter
        </Button>
        <Button onClick={() => setShowFilterDropdown(false)} size="small">
          Cancel
        </Button>
      </Space>
    </div>
  );

  return (
    <div style={{ padding: '24px' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Events</h2>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadEvents(true)}
            loading={loading}
            size="small"
          >
            Updated {dayjs(lastUpdated).fromNow()}
          </Button>
          <Tooltip title="Reload event names and filter options">
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshData}
              loading={loadingEventNames || loadingProperties}
              size="small"
            >
              Refresh Data
            </Button>
          </Tooltip>
          <Tooltip title="Export all loaded events as JSON">
            <Button
              icon={<DownloadOutlined />}
              onClick={exportEventsAsJSON}
              disabled={loadedEvents.length === 0}
              size="small"
            >
              Export JSON
            </Button>
          </Tooltip>
        </div>

        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates) {
              setDateRange(dates as [Dayjs, Dayjs]);
            }
          }}
          format="YYYY-MM-DD"
          allowClear={false}
          presets={[
            { label: 'Today', value: [dayjs(), dayjs()] },
            { label: 'Yesterday', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'days'), dayjs()] },
            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'days'), dayjs()] },
            { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
          ]}
        />
      </div>

      {/* SELECT EVENT Section */}
      <div style={{
        marginBottom: '16px',
        padding: '16px',
        background: theme.colors.background.card,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: '8px'
      }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 600, 
          color: theme.colors.text.secondary,
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          SELECT EVENT
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {selectedEvents.map(event => (
            <div
              key={event}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: theme.colors.background.elevated,
                border: `1px solid ${theme.colors.border.elevated}`,
                borderRadius: '6px',
                fontSize: '14px',
                color: theme.colors.text.primary
              }}
            >
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: getEventColor(event)
              }} />
              <span>{event}</span>
              <CloseOutlined
                style={{ 
                  fontSize: '10px', 
                  cursor: 'pointer',
                  color: theme.colors.text.muted
                }}
                onClick={() => {
                  setSelectedEvents(selectedEvents.filter(e => e !== event));
                }}
              />
            </div>
          ))}
          
          <Dropdown
            open={showEventDropdown}
            onOpenChange={setShowEventDropdown}
            dropdownRender={() => eventDropdownContent}
            trigger={['click']}
          >
            <Button
              icon={<PlusOutlined />}
              size="small"
              style={{
                background: 'transparent',
                border: `1px dashed ${theme.colors.border.elevated}`,
                color: theme.colors.text.secondary
              }}
            >
              Add Event
            </Button>
          </Dropdown>

          <Dropdown
            open={showFilterDropdown}
            onOpenChange={setShowFilterDropdown}
            dropdownRender={() => filterDropdownContent}
            trigger={['click']}
          >
            <Button
              icon={<FilterOutlined />}
              size="small"
              style={{
                background: 'transparent',
                border: `1px dashed ${theme.colors.border.elevated}`,
                color: theme.colors.text.secondary
              }}
            >
              Add Filter
            </Button>
          </Dropdown>

          {(selectedEvents.length > 0 || filters.length > 0) && (
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              type="text"
              onClick={() => {
                setSelectedEvents([]);
                setFilters([]);
              }}
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Display active filters */}
        {filters.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {filters.map((filter, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  background: theme.colors.background.elevated,
                  border: `1px solid ${theme.colors.primary}`,
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: theme.colors.text.primary
                }}
              >
                <FilterOutlined style={{ color: theme.colors.primary }} />
                <span style={{ color: theme.colors.text.secondary }}>{filter.property}</span>
                <span style={{ color: theme.colors.text.muted }}>{filter.operator}</span>
                <span style={{ color: theme.colors.text.primary, fontWeight: 500 }}>"{filter.value}"</span>
                <CloseOutlined
                  style={{ 
                    fontSize: '10px', 
                    cursor: 'pointer',
                    color: theme.colors.text.muted
                  }}
                  onClick={() => removeFilter(index)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{
        marginBottom: '16px',
        padding: '12px 16px',
        background: theme.colors.background.card,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: '8px',
        fontSize: '13px'
      }}>
        <span style={{ color: theme.colors.text.muted }}>Showing </span>
        <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>
          {Number(events.length).toLocaleString('en-US')}
        </span>
        <span style={{ color: theme.colors.text.muted }}> results of </span>
        <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>
          {Number(totalEvents).toLocaleString('en-US')}
        </span>
        <span style={{ color: theme.colors.text.muted }}> matches</span>
      </div>

      {/* Table */}
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={events}
          rowKey={(record) => record.client_reference_id}
          pagination={false}
          expandable={{
            expandedRowRender,
            expandedRowKeys,
            expandIcon: () => null, // Hide default expand icon
            onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          }}
          style={{
            background: theme.colors.background.card,
            borderRadius: '8px',
            border: `1px solid ${theme.colors.border.subtle}`
          }}
        />
      </Spin>

      {/* Load More Button */}
      {hasMore && !loading && (
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          padding: '20px',
          background: theme.colors.background.card,
          borderRadius: '8px',
          border: `1px solid ${theme.colors.border.subtle}`
        }}>
          <div style={{ 
            color: theme.colors.text.muted, 
            fontSize: '13px', 
            marginBottom: '12px' 
          }}>
            Showing {Number(loadedEvents.length).toLocaleString('en-US')} results through {dayjs().format('MMM D, YYYY, h:mm A')}
          </div>
          <Button
            type="primary"
            loading={loadingMore}
            onClick={() => loadEvents(false)}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.colors.border.elevated}`,
              color: theme.colors.text.primary
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export default Events;
