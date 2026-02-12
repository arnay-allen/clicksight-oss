import axios from 'axios';
import { schemaAdapter } from './schema-adapter';

// Runtime environment config helper
const getEnv = (key: string, fallback: string = ''): string => {
  // Check runtime config first (production)
  if (typeof window !== 'undefined' && (window as any)._env_) {
    return (window as any)._env_[key] || fallback;
  }
  // Fall back to build-time env (development)
  return import.meta.env[key] || fallback;
};

// ClickHouse connection config (supports both build-time and runtime)
const CLICKHOUSE_URL = getEnv('VITE_CLICKHOUSE_URL', 'http://localhost:8123');
const CLICKHOUSE_USER = getEnv('VITE_CLICKHOUSE_USER', 'default');
const CLICKHOUSE_PASSWORD = getEnv('VITE_CLICKHOUSE_PASSWORD', '');
const CLICKHOUSE_DATABASE = getEnv('VITE_CLICKHOUSE_DATABASE', schemaAdapter.getDatabase());

// ============================================================================
// SCHEMA-AGNOSTIC HELPERS
// ============================================================================
// These functions use the schema adapter to generate schema-agnostic queries
// ============================================================================

/**
 * Get the appropriate column for case-insensitive comparison
 * Uses schema adapter to handle property access (flat vs JSON)
 *
 * @param property - The original property name
 * @returns Object with column name and whether it needs lower() wrapper
 */
function getCaseInsensitiveColumn(property: string): { column: string; needsLower: boolean } {
  // Use schema adapter to get property column (handles flat vs JSON)
  const propertyCol = schemaAdapter.getProperty(property);

  // Check if lowercase columns feature is enabled
  const flag = getEnv('VITE_USE_LOWERCASE_COLUMNS', 'false');
  const isLowercaseEnabled = flag === 'true' || flag === '1';

  if (!isLowercaseEnabled) {
    // Feature disabled: use property column with lower()
    return { column: propertyCol, needsLower: true };
  }

  // Feature enabled: check if this property has a _lc variant
  const lcMapping: Record<string, string> = {
    'pathname': 'pathname_lc',
    '$os': 'os_lc',
    '$device_type': 'device_type_lc',
    '$browser': 'browser_lc',
  };

  const lcColumn = lcMapping[property];
  if (lcColumn) {
    // Use pre-computed lowercase column (no lower() needed)
    return { column: `\`${lcColumn}\``, needsLower: false };
  }

  // No _lc variant: fall back to lower()
  return { column: propertyCol, needsLower: true };
}

/**
 * Get user identifier expression from schema adapter
 * This replaces hardcoded: if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id)
 */
function getUserIdentifier(): string {
  return schemaAdapter.getUserIdentifier();
}

// ============================================================================

export interface ClickHouseQueryResult {
  data: any[];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface CustomQueryResult {
  data: any[];
  rows: number;
  columns: Array<{ name: string; type: string }>;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
  query: string;
}

/**
 * Get current user email from localStorage
 * Used for query attribution in ClickHouse logs
 */
function getCurrentUserEmail(): string {
  try {
    const userStr = localStorage.getItem('clicksight_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.email || 'unknown';
    }
  } catch {
    // Ignore parsing errors
  }
  return 'unknown';
}

/**
 * Execute a ClickHouse query via HTTP API
 */
export async function queryClickHouse(sql: string, userEmail?: string): Promise<ClickHouseQueryResult> {
  try {
    // Get user email for query attribution
    const email = userEmail || getCurrentUserEmail();

    // Add user attribution comment at the top of the query
    let finalSql = `-- Query executed by: ${email}\n${sql.trim()}`;

    // Add SETTINGS to the query if not already present (only for analytics queries)
    if (!finalSql.toUpperCase().includes('SETTINGS')) {
      // Check if this is an analytics query (not clicksight operational queries like users table)
      // Analytics queries use the schema adapter's table (e.g., analytics.app_events)
      const analyticsTable = schemaAdapter.getTable();
      const analyticsDatabase = schemaAdapter.getDatabase();

      // Apply optimizations if query touches analytics data
      if (finalSql.includes(analyticsTable) || finalSql.includes(analyticsDatabase)) {
        // Add query optimization settings (only performance-enhancing, not restrictive)
        // max_threads: Use 8 threads for parallel processing
        // optimize_read_in_order: Optimize ORDER BY when it matches table sorting key
        finalSql = `${finalSql} SETTINGS max_threads = 8, optimize_read_in_order = 1`;
      }
    }

    const params = new URLSearchParams({
      database: CLICKHOUSE_DATABASE,
      default_format: 'JSON',
    });

    const response = await axios.post(
      `${CLICKHOUSE_URL}/?${params.toString()}`,
      finalSql,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    );

    return {
      data: response.data.data || [],
      rows: response.data.rows || 0,
      statistics: response.data.statistics,
    };
  } catch (error: any) {
    console.error('ClickHouse query error:', error);
    throw new Error(error.response?.data || error.message || 'Failed to execute query');
  }
}

/**
 * Cache utility for dropdown data
 * Cache persists until manual refresh (no TTL)
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCachedData<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    return entry.data; // No TTL check - cache persists until manual refresh
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore cache write failures
  }
}

/**
 * Clear all analytics-related cache
 * Used by manual refresh button
 */
export function clearAnalyticsCache(): void {
  try {
    // Clear all analytics-related cache keys
    Object.keys(sessionStorage)
      .filter(key =>
        key.startsWith('clickhouse:events:') ||        // Event names cache
        key.startsWith('clickhouse:properties:') ||    // Property names cache
        key.startsWith('clickhouse:property_values:')  // Property values cache
      )
      .forEach(key => sessionStorage.removeItem(key));
  } catch {
    // Ignore errors
  }
}

/**
 * Get list of tables in the configured database
 */
export async function getTables(database: string = 'analytics'): Promise<string[]> {
  const cacheKey = `clickhouse:tables:${database}`;
  const cached = getCachedData<string[]>(cacheKey);
  if (cached) return cached;

  const sql = `
    SELECT name
    FROM system.tables
    WHERE database = '${database}'
      AND name NOT LIKE '.%'
      AND name NOT LIKE '%_sideline'
      AND engine NOT IN ('View', 'MaterializedView')
    ORDER BY name
  `;

  const result = await queryClickHouse(sql);
  const tables = result.data.map((row: any) => row.name);

  setCachedData(cacheKey, tables);
  return tables;
}

/**
 * Get list of available events from ClickHouse
 */
export async function getEventNames(table: string = schemaAdapter.getTableName()): Promise<string[]> {
  const cacheKey = `clickhouse:events:${table}`;
  const cached = getCachedData<string[]>(cacheKey);
  if (cached) return cached;

  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  const sql = `
    SELECT DISTINCT ${eventNameCol} as event_name
    FROM ${fullTable}
    WHERE ${dateCol} >= today() - 30
    ORDER BY event_name
    LIMIT 1000
  `;

  const result = await queryClickHouse(sql);
  const events = result.data.map((row: any) => row.event_name);

  setCachedData(cacheKey, events);
  return events;
}

/**
 * Get event count trends over time
 */
export type DateGranularity = 'daily' | 'weekly' | 'monthly';

/**
 * Metric types for analysis
 */
export type MetricType = 'total' | 'unique_users' | 'count_distinct' | 'sum' | 'average' | 'min' | 'max';

/**
 * Configuration for metric calculation
 */
export interface MetricConfig {
  type: MetricType;
  property?: string; // Required for sum/average/min/max
}

/**
 * Get event metric with specified aggregation type
 */
export async function getEventMetric(
  table: string,
  eventName: string,
  startDate: string,
  endDate: string,
  metricConfig: MetricConfig,
  granularity: DateGranularity = 'daily',
  filters?: PropertyFilter[]
): Promise<any[]> {
  // Build the aggregation clause based on metric type
  let aggregationClause: string;

  switch (metricConfig.type) {
    case 'total':
      aggregationClause = 'count(*) as count';
      break;

    case 'unique_users':
      // Use pixel_properties_user_id when available, fallback to pixel_device_id for logged-out users
      aggregationClause = `count(DISTINCT ${getUserIdentifier()}) as count`;
      break;

    case 'count_distinct':
      if (!metricConfig.property) {
        throw new Error('Property is required for count distinct metric');
      }
      aggregationClause = `count(DISTINCT \`${metricConfig.property}\`) as count`;
      break;

    case 'sum':
      if (!metricConfig.property) {
        throw new Error('Property is required for sum metric');
      }
      // Use toFloat64OrZero to handle invalid values gracefully
      aggregationClause = `sum(toFloat64OrZero(\`${metricConfig.property}\`)) as count`;
      break;

    case 'average':
      if (!metricConfig.property) {
        throw new Error('Property is required for average metric');
      }
      // Use toFloat64OrNull to exclude invalid values from average
      aggregationClause = `avg(toFloat64OrNull(\`${metricConfig.property}\`)) as count`;
      break;

    case 'min':
      if (!metricConfig.property) {
        throw new Error('Property is required for min metric');
      }
      // Use toFloat64OrNull to exclude invalid values
      aggregationClause = `min(toFloat64OrNull(\`${metricConfig.property}\`)) as count`;
      break;

    case 'max':
      if (!metricConfig.property) {
        throw new Error('Property is required for max metric');
      }
      // Use toFloat64OrNull to exclude invalid values
      aggregationClause = `max(toFloat64OrNull(\`${metricConfig.property}\`)) as count`;
      break;

    default:
      throw new Error(`Unknown metric type: ${metricConfig.type}`);
  }

  // Get schema-agnostic references
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // Build date grouping based on granularity
  let dateGrouping: string;
  let dateAlias: string;

  switch (granularity) {
    case 'daily':
      dateGrouping = dateCol;
      dateAlias = `${dateCol} as date`;
      break;
    case 'weekly':
      dateGrouping = `toMonday(${dateCol})`;
      dateAlias = `toMonday(${dateCol}) as date`;
      break;
    case 'monthly':
      dateGrouping = `toStartOfMonth(${dateCol})`;
      dateAlias = `toStartOfMonth(${dateCol}) as date`;
      break;
  }

  // Build filter clause (case-insensitive)
  let filterClause = '';
  if (filters && filters.length > 0) {
    const filterConditions = filters.map(filter => {
      const value = filter.value.toLowerCase().replace(/'/g, "''");
      // Get the appropriate column for case-insensitive comparison
      const { column: caseInsensitiveCol, needsLower } = getCaseInsensitiveColumn(filter.property);

      switch (filter.operator) {
        case 'equals':
          return needsLower
            ? `lower(${caseInsensitiveCol}) = '${value}'`
            : `${caseInsensitiveCol} = '${value}'`;
        case 'not_equals':
          return needsLower
            ? `lower(${caseInsensitiveCol}) != '${value}'`
            : `${caseInsensitiveCol} != '${value}'`;
        case 'contains':
          return needsLower
            ? `lower(${caseInsensitiveCol}) LIKE '%${value}%'`
            : `${caseInsensitiveCol} LIKE '%${value}%'`;
        case 'not_contains':
          return needsLower
            ? `lower(${caseInsensitiveCol}) NOT LIKE '%${value}%'`
            : `${caseInsensitiveCol} NOT LIKE '%${value}%'`;
        case 'in':
          const values = value.split(',').map(v => `'${v.trim().toLowerCase()}'`).join(',');
          return needsLower
            ? `lower(${caseInsensitiveCol}) IN (${values})`
            : `${caseInsensitiveCol} IN (${values})`;
        case 'not_in':
          const notValues = value.split(',').map(v => `'${v.trim().toLowerCase()}'`).join(',');
          return needsLower
            ? `lower(${caseInsensitiveCol}) NOT IN (${notValues})`
            : `${caseInsensitiveCol} NOT IN (${notValues})`;
        default:
          return needsLower
            ? `lower(${caseInsensitiveCol}) = '${value}'`
            : `${caseInsensitiveCol} = '${value}'`;
      }
    });
    filterClause = ' AND ' + filterConditions.join(' AND ');
  }

  const sql = `
    SELECT
      ${dateAlias},
      ${aggregationClause}
    FROM ${fullTable}
    WHERE ${eventNameCol} = '${eventName.replace(/'/g, "''")}'
      AND ${dateCol} >= '${startDate}'
      AND ${dateCol} <= '${endDate}'
      ${filterClause}
    GROUP BY ${dateGrouping}
    ORDER BY date
  `;

  const result = await queryClickHouse(sql);
  return result.data;
}

/**
 * Get event trend (backwards compatible - defaults to total count)
 */
export async function getEventTrend(
  table: string,
  eventName: string,
  startDate: string,
  endDate: string,
  granularity: DateGranularity = 'daily',
  filters?: PropertyFilter[],
  filterLogic: 'AND' | 'OR' = 'AND'
): Promise<{ date: string; count: number }[]> {
  // Get schema-agnostic references
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // Build date grouping based on granularity
  let dateGrouping: string;
  let dateAlias: string;

  switch (granularity) {
    case 'weekly':
      dateGrouping = `toMonday(${dateCol})`;
      dateAlias = `toMonday(${dateCol}) as date`;
      break;
    case 'monthly':
      dateGrouping = `toStartOfMonth(${dateCol})`;
      dateAlias = `toStartOfMonth(${dateCol}) as date`;
      break;
    case 'daily':
    default:
      dateGrouping = dateCol;
      dateAlias = `${dateCol} as date`;
      break;
  }

  // Build filter WHERE clause
  const filterClause = buildWhereClause(filters || [], filterLogic);

  const sql = `
    SELECT
      ${dateAlias},
      count(*) as count
    FROM ${fullTable}
    WHERE ${eventNameCol} = '${eventName.replace(/'/g, "''")}'
      AND ${dateCol} >= '${startDate}'
      AND ${dateCol} <= '${endDate}'
      ${filterClause}
    GROUP BY ${dateGrouping}
    ORDER BY date
  `;

  const result = await queryClickHouse(sql);
  return result.data;
}

export interface TrendBreakdown {
  segmentName: string;
  data: { date: string; count: number }[];
}

/**
 * Get event metric with breakdown by properties
 */
export async function getEventMetricWithBreakdown(
  table: string,
  eventName: string,
  startDate: string,
  endDate: string,
  metricConfig: MetricConfig,
  granularity: DateGranularity = 'daily',
  breakdownProperties: string | string[],
  filters?: PropertyFilter[],
  filterLogic: 'AND' | 'OR' = 'AND'
): Promise<TrendBreakdown[]> {
  // Get schema-agnostic references
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // Build the aggregation clause based on metric type
  let aggregationClause: string;

  switch (metricConfig.type) {
    case 'total':
      aggregationClause = 'count(*) as count';
      break;

    case 'unique_users':
      // Use pixel_properties_user_id when available, fallback to pixel_device_id for logged-out users
      aggregationClause = `count(DISTINCT ${getUserIdentifier()}) as count`;
      break;

    case 'count_distinct':
      if (!metricConfig.property) {
        throw new Error('Property is required for count distinct metric');
      }
      aggregationClause = `count(DISTINCT ${schemaAdapter.getProperty(metricConfig.property)}) as count`;
      break;

    case 'sum':
      if (!metricConfig.property) {
        throw new Error('Property is required for sum metric');
      }
      // Use toFloat64OrZero to handle invalid values gracefully
      aggregationClause = `sum(toFloat64OrZero(${schemaAdapter.getProperty(metricConfig.property)})) as count`;
      break;

    case 'average':
      if (!metricConfig.property) {
        throw new Error('Property is required for average metric');
      }
      // Use toFloat64OrNull to exclude invalid values from average
      aggregationClause = `avg(toFloat64OrNull(${schemaAdapter.getProperty(metricConfig.property)})) as count`;
      break;

    case 'min':
      if (!metricConfig.property) {
        throw new Error('Property is required for min metric');
      }
      // Use toFloat64OrNull to exclude invalid values
      aggregationClause = `min(toFloat64OrNull(${schemaAdapter.getProperty(metricConfig.property)})) as count`;
      break;

    case 'max':
      if (!metricConfig.property) {
        throw new Error('Property is required for max metric');
      }
      // Use toFloat64OrNull to exclude invalid values
      aggregationClause = `max(toFloat64OrNull(${schemaAdapter.getProperty(metricConfig.property)})) as count`;
      break;

    default:
      throw new Error(`Unknown metric type: ${metricConfig.type}`);
  }

  // Normalize to array
  const properties = Array.isArray(breakdownProperties) ? breakdownProperties : [breakdownProperties];

  // Filter out empty properties
  const validProperties = properties.filter(p => p && p.trim());

  if (validProperties.length === 0) {
    return [];
  }

  // Build breakdown columns and segment concatenation
  const breakdownColumns = validProperties.map(prop => schemaAdapter.getProperty(prop));

  // Create segment as concatenation of all properties with ' | ' separator
  const segmentExpression = breakdownColumns.length === 1
    ? `${breakdownColumns[0]} AS segment`
    : `concat(${breakdownColumns.map((col, idx) =>
        idx === 0 ? col : `' | ', ${col}`
      ).join(', ')}) AS segment`;

  // Build WHERE conditions to exclude empty values
  const nonEmptyConditions = breakdownColumns.map(col => `${col} != ''`).join(' AND ');

  // Build date grouping based on granularity
  let dateGrouping: string;
  let dateAlias: string;

  switch (granularity) {
    case 'weekly':
      dateGrouping = `toMonday(${dateCol})`;
      dateAlias = `toMonday(${dateCol}) as date`;
      break;
    case 'monthly':
      dateGrouping = `toStartOfMonth(${dateCol})`;
      dateAlias = `toStartOfMonth(${dateCol}) as date`;
      break;
    case 'daily':
    default:
      dateGrouping = dateCol;
      dateAlias = `${dateCol} as date`;
      break;
  }

  // Build filter WHERE clause
  const filterClause = buildWhereClause(filters || [], filterLogic);

  const sql = `
    SELECT
      ${dateAlias},
      ${segmentExpression},
      ${aggregationClause}
    FROM ${fullTable}
    WHERE ${eventNameCol} = '${eventName.replace(/'/g, "''")}'
      AND ${dateCol} >= '${startDate}'
      AND ${dateCol} <= '${endDate}'
      AND ${nonEmptyConditions}
      ${filterClause}
    GROUP BY ${dateGrouping}, segment
    ORDER BY segment, date
  `;

  const result = await queryClickHouse(sql);

  // Group results by segment
  const segmentMap = new Map<string, Array<{ date: string; count: number }>>();

  for (const row of result.data as Array<{ date: string; segment: string; count: number }>) {
    if (!segmentMap.has(row.segment)) {
      segmentMap.set(row.segment, []);
    }
    segmentMap.get(row.segment)!.push({
      date: row.date,
      count: Number(row.count)
    });
  }

  // Convert to breakdown format
  const breakdowns: TrendBreakdown[] = [];
  for (const [segment, data] of segmentMap.entries()) {
    breakdowns.push({
      segmentName: segment,
      data
    });
  }

  // Sort by total count descending
  breakdowns.sort((a, b) => {
    const totalA = a.data.reduce((sum, d) => sum + d.count, 0);
    const totalB = b.data.reduce((sum, d) => sum + d.count, 0);
    return totalB - totalA;
  });

  return breakdowns;
}

/**
 * Get event trend data with breakdown by properties (backwards compatible)
 */
export async function getEventTrendWithBreakdown(
  table: string,
  eventName: string,
  startDate: string,
  endDate: string,
  granularity: DateGranularity = 'daily',
  breakdownProperties: string | string[],
  filters?: PropertyFilter[],
  filterLogic: 'AND' | 'OR' = 'AND'
): Promise<TrendBreakdown[]> {
  // Get schema-agnostic references
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // Normalize to array
  const properties = Array.isArray(breakdownProperties) ? breakdownProperties : [breakdownProperties];

  // Filter out empty properties
  const validProperties = properties.filter(p => p && p.trim());

  if (validProperties.length === 0) {
    return [];
  }

  // Build breakdown columns and segment concatenation
  const breakdownColumns = validProperties.map(prop => schemaAdapter.getProperty(prop));

  // Create segment as concatenation of all properties with ' | ' separator
  const segmentExpression = breakdownColumns.length === 1
    ? `${breakdownColumns[0]} AS segment`
    : `concat(${breakdownColumns.map((col, idx) =>
        idx === 0 ? col : `' | ', ${col}`
      ).join(', ')}) AS segment`;

  // Build WHERE conditions to exclude empty values
  const nonEmptyConditions = breakdownColumns.map(col => `${col} != ''`).join(' AND ');

  // Build date grouping based on granularity
  let dateGrouping: string;
  let dateAlias: string;

  switch (granularity) {
    case 'weekly':
      dateGrouping = `toMonday(${dateCol})`;
      dateAlias = `toMonday(${dateCol}) as date`;
      break;
    case 'monthly':
      dateGrouping = `toStartOfMonth(${dateCol})`;
      dateAlias = `toStartOfMonth(${dateCol}) as date`;
      break;
    case 'daily':
    default:
      dateGrouping = dateCol;
      dateAlias = `${dateCol} as date`;
      break;
  }

  // Build filter WHERE clause
  const filterClause = buildWhereClause(filters || [], filterLogic);

  const sql = `
    SELECT
      ${dateAlias},
      ${segmentExpression},
      count(*) as count
    FROM ${fullTable}
    WHERE ${eventNameCol} = '${eventName.replace(/'/g, "''")}'
      AND ${dateCol} >= '${startDate}'
      AND ${dateCol} <= '${endDate}'
      AND ${nonEmptyConditions}
      ${filterClause}
    GROUP BY ${dateGrouping}, segment
    ORDER BY segment, date
  `;

  const result = await queryClickHouse(sql);

  // Group results by segment
  const segmentMap = new Map<string, Array<{ date: string; count: number }>>();

  for (const row of result.data as Array<{ date: string; segment: string; count: number }>) {
    if (!segmentMap.has(row.segment)) {
      segmentMap.set(row.segment, []);
    }
    segmentMap.get(row.segment)!.push({
      date: row.date,
      count: Number(row.count)
    });
  }

  // Convert to breakdown format
  const breakdowns: TrendBreakdown[] = [];
  for (const [segment, data] of segmentMap.entries()) {
    breakdowns.push({
      segmentName: segment,
      data
    });
  }

  // Sort by total count descending
  breakdowns.sort((a, b) => {
    const totalA = a.data.reduce((sum, d) => sum + d.count, 0);
    const totalB = b.data.reduce((sum, d) => sum + d.count, 0);
    return totalB - totalA;
  });

  // Limit to top 20 segments
  return breakdowns.slice(0, 20);
}

/**
 * Get available property names for an event
 */
export async function getEventProperties(
  _eventName: string,
  table: string = 'app_events'
): Promise<string[]> {
  const cacheKey = `clickhouse:properties:${table}`;
  const cached = getCachedData<string[]>(cacheKey);
  if (cached) return cached;

  // Get column names from the table
  const sql = `
    DESCRIBE TABLE ${table}
  `;

  const result = await queryClickHouse(sql);
  const properties = result.data
    .map((row: any) => row.name)
    .filter((name: string) =>
      // Only filter out client_reference_id, keep date/time columns for breakdown with granularity
      !['client_reference_id'].includes(name)
    );

  setCachedData(cacheKey, properties);
  return properties;
}

/**
 * Get recent/sample values for a specific property
 */
export async function getPropertyValues(
  table: string,
  property: string,
  limit: number = 20
): Promise<string[]> {
  const cacheKey = `clickhouse:propvalues:${table}:${property}:${limit}`;
  const cached = getCachedData<string[]>(cacheKey);
  if (cached) return cached;

  // Get schema-agnostic references
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const dateCol = schemaAdapter.getColumn('date');
  const column = schemaAdapter.getProperty(property);

  const sql = `
    SELECT ${column} as value, count() as cnt
    FROM ${fullTable}
    WHERE ${column} != ''
      AND ${column} IS NOT NULL
      AND ${dateCol} >= today() - 7
    GROUP BY ${column}
    ORDER BY cnt DESC
    LIMIT ${limit}
  `;

  try {
    const result = await queryClickHouse(sql);
    const values = result.data.map((row: any) => row.value).filter((v: any) => v);

    setCachedData(cacheKey, values);
    return values;
  } catch (error) {
    console.error(`Failed to get property values for ${property}:`, error);
    return [];
  }
}

/**
 * Get funnel conversion data
 */
export interface PropertyFilter {
  property: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'in'
    | 'not_in'
    // Numeric operators
    | 'greater_than'
    | 'less_than'
    | 'greater_than_or_equal'
    | 'less_than_or_equal'
    | 'between'
    // String operators
    | 'starts_with'
    | 'ends_with'
    | 'regex'
    // Null checks
    | 'is_empty'
    | 'is_not_empty';
  value: string;
  value2?: string; // For 'between' operator
}

export interface FunnelStep {
  table: string;
  event: string;
  filters?: PropertyFilter[];
  filterLogic?: 'AND' | 'OR'; // How to combine multiple filters
}

export interface FunnelResult {
  step: number;
  stepName: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  segment?: string; // For breakdown by property
}

export interface FunnelBreakdown {
  segmentName: string;
  steps: FunnelResult[];
}

export interface BreakdownProperty {
  property: string;
  granularity?: DateGranularity;
}

export interface TimePeriodFunnel {
  period: string; // e.g., "2025-10-01", "2025-W40", "2025-10"
  periodLabel: string; // e.g., "Oct 1", "Week 40", "October 2025"
  startDate: string;
  endDate: string;
  steps: FunnelResult[];
}

function buildWhereClause(filters: PropertyFilter[], logic: 'AND' | 'OR' = 'AND'): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  // Filter out filters with empty property names
  const validFilters = filters.filter(f => f.property && f.property.trim());

  if (validFilters.length === 0) {
    return '';
  }

  const conditions = validFilters.map(filter => {
    // Get the appropriate column for case-insensitive comparison
    // (uses _lc columns if feature flag enabled, otherwise uses lower())
    const { column: caseInsensitiveCol, needsLower } = getCaseInsensitiveColumn(filter.property);
    const column = `\`${filter.property}\``; // Original column for numeric/null operators

    switch (filter.operator) {
      // Existing string operators (case-insensitive)
      case 'equals':
        const escapedValue = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) = '${escapedValue}'`
          : `${caseInsensitiveCol} = '${escapedValue}'`;
      case 'not_equals':
        const escapedValueNe = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) != '${escapedValueNe}'`
          : `${caseInsensitiveCol} != '${escapedValueNe}'`;
      case 'contains':
        const escapedValueC = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) LIKE '%${escapedValueC}%'`
          : `${caseInsensitiveCol} LIKE '%${escapedValueC}%'`;
      case 'not_contains':
        const escapedValueNc = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) NOT LIKE '%${escapedValueNc}%'`
          : `${caseInsensitiveCol} NOT LIKE '%${escapedValueNc}%'`;
      case 'in':
        // Parse comma-separated values: "value1, value2, value3"
        const inValues = filter.value.split(',')
          .map(v => v.trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => `'${v.replace(/'/g, "''")}'`)
          .join(',');
        if (inValues.length === 0) return '';
        return needsLower
          ? `lower(${caseInsensitiveCol}) IN (${inValues})`
          : `${caseInsensitiveCol} IN (${inValues})`;
      case 'not_in':
        // Parse comma-separated values: "value1, value2, value3"
        const notInValues = filter.value.split(',')
          .map(v => v.trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => `'${v.replace(/'/g, "''")}'`)
          .join(',');
        if (notInValues.length === 0) return '';
        return needsLower
          ? `lower(${caseInsensitiveCol}) NOT IN (${notInValues})`
          : `${caseInsensitiveCol} NOT IN (${notInValues})`;

      // NEW: Numeric operators
      case 'greater_than':
        // Try to parse as number, fallback to string comparison
        const gtValue = filter.value.trim();
        return `toFloat64OrZero(${column}) > ${parseFloat(gtValue) || 0}`;
      case 'less_than':
        const ltValue = filter.value.trim();
        return `toFloat64OrZero(${column}) < ${parseFloat(ltValue) || 0}`;
      case 'greater_than_or_equal':
        const gteValue = filter.value.trim();
        return `toFloat64OrZero(${column}) >= ${parseFloat(gteValue) || 0}`;
      case 'less_than_or_equal':
        const lteValue = filter.value.trim();
        return `toFloat64OrZero(${column}) <= ${parseFloat(lteValue) || 0}`;
      case 'between':
        const betweenValue1 = filter.value.trim();
        const betweenValue2 = (filter.value2 || '').trim();
        if (!betweenValue2) return ''; // Invalid if second value is missing
        return `toFloat64OrZero(${column}) BETWEEN ${parseFloat(betweenValue1) || 0} AND ${parseFloat(betweenValue2) || 0}`;

      // NEW: String operators (case-insensitive)
      case 'starts_with':
        const startsWithValue = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) LIKE '${startsWithValue}%'`
          : `${caseInsensitiveCol} LIKE '${startsWithValue}%'`;
      case 'ends_with':
        const endsWithValue = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) LIKE '%${endsWithValue}'`
          : `${caseInsensitiveCol} LIKE '%${endsWithValue}'`;
      case 'regex':
        // ClickHouse regex is case-sensitive by default, use (?i) for case-insensitive
        const regexValue = filter.value.replace(/'/g, "''");
        return `match(${column}, '(?i)${regexValue}')`;

      // NEW: Null checks
      case 'is_empty':
        return `(${column} = '' OR ${column} IS NULL)`;
      case 'is_not_empty':
        return `(${column} != '' AND ${column} IS NOT NULL)`;

      default:
        return '';
    }
  }).filter(Boolean);

  if (conditions.length === 0) {
    return '';
  }

  // Wrap in parentheses if OR logic and multiple conditions
  const joined = conditions.join(` ${logic} `);
  return conditions.length > 1 && logic === 'OR'
    ? ` AND (${joined})`
    : ` AND ${joined}`;
}

export async function getFunnelData(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' } // NEW: Optional parameter with safe default
): Promise<FunnelResult[]> {
  if (steps.length === 0) {
    return [];
  }

  // For single table funnels, use ClickHouse's windowFunnel function
  // For multi-table funnels, fall back to sequential join approach
  const allSameTable = steps.every(s => s.table === steps[0].table);

  if (allSameTable && steps.length <= 10) {
    return getFunnelDataOptimized(steps, startDate, endDate, timeWindowHours, metricConfig);
  } else {
    return getFunnelDataMultiTable(steps, startDate, endDate, timeWindowHours, metricConfig);
  }
}

/**
 * Optimized funnel for single table using ClickHouse windowFunnel
 * Now supports all metric types: total, unique_users, sum, average, min, max
 * ✅ SCALABLE: Uses CTE subqueries instead of huge IN clauses
 */
async function getFunnelDataOptimized(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' }
): Promise<FunnelResult[]> {
  // Get schema-agnostic references
  const table = steps[0].table;
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const timestampCol = schemaAdapter.getColumn('timestamp');

  const timeWindowSeconds = timeWindowHours ? timeWindowHours * 3600 : 86400 * 7; // Default 7 days

  // Extract all properties used in filters across all steps
  const allFilterProperties = new Set<string>();
  steps.forEach(step => {
    const properties = extractFilterProperties(step.filters || []);
    properties.forEach(p => allFilterProperties.add(p));
  });

  // Build additional columns for base_events CTE (properties used in filters)
  // IMPORTANT: Select the actual column that will be used in filter conditions
  // (e.g., pathname_lc if VITE_USE_LOWERCASE_COLUMNS=true, otherwise pathname)
  const additionalColumns = Array.from(allFilterProperties).map(prop => {
    const { column: filterColumn, needsLower } = getCaseInsensitiveColumn(prop);
    // If needsLower is false, the column is already lowercase (e.g., pathname_lc)
    // If needsLower is true, we need to select the base column (e.g., pathname)
    if (needsLower) {
      // Select base column and alias it as the property name
      return `${schemaAdapter.getProperty(prop)} as \`${prop}\``;
    } else {
      // Select the _lc column directly (it's already in the schema)
      // Remove backticks from filterColumn if present
      const cleanColumn = filterColumn.replace(/`/g, '');
      return `${cleanColumn} as \`${cleanColumn}\``;
    }
  }).join(',\n    ');

  // Build event conditions with filters
  const eventConditions = steps.map((step) => {
    const whereClause = buildFilterCondition(step.filters || [], step.filterLogic || 'AND');
    const condition = whereClause
      ? `${eventNameCol} = '${step.event.replace(/'/g, "''")}' AND ${whereClause}`
      : `${eventNameCol} = '${step.event.replace(/'/g, "''")}'`;
    return condition;
  });

  // Build metric clause
  const metricClause = buildMetricClause(metricConfig);

  // Build step-specific CTEs and metric queries
  const stepCTEs: string[] = [];
  const metricQueries: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const whereClause = buildFilterCondition(step.filters || [], step.filterLogic || 'AND');

    // CTE for users who reached this step level
    stepCTEs.push(`
step_${i + 1}_users AS (
  SELECT user_identifier
  FROM user_funnels
  WHERE funnel_level >= ${i + 1}
)`);

    // Build metric clause - use pre-computed columns from base_events
    let metricClauseForBase: string;
    if (metricConfig.type === 'unique_users') {
      metricClauseForBase = 'count(DISTINCT user_identifier) AS count';
    } else if (metricConfig.type === 'sum' || metricConfig.type === 'average' || metricConfig.type === 'min' || metricConfig.type === 'max') {
      // For aggregations on properties, we need to query the full table (property not in base_events)
      metricClauseForBase = metricClause;
    } else {
      metricClauseForBase = 'count(*) AS count';
    }

    // For property-based metrics (sum, avg, min, max), query full table
    // For count-based metrics, use base_events
    const useBaseEvents = metricConfig.type === 'total' || metricConfig.type === 'unique_users';

    if (useBaseEvents) {
      // Use base_events for better performance
      metricQueries.push(`
SELECT
  ${i + 1} AS step,
  '${getStepName(step).replace(/'/g, "''")}' AS step_name,
  ${metricClauseForBase}
FROM base_events
WHERE event_name = '${step.event.replace(/'/g, "''")}'
  AND user_identifier IN (SELECT user_identifier FROM step_${i + 1}_users)
  ${whereClause ? `AND ${whereClause}` : ''}`);
    } else {
      // For property metrics, still need to query full table
      metricQueries.push(`
SELECT
  ${i + 1} AS step,
  '${getStepName(step).replace(/'/g, "''")}' AS step_name,
  ${metricClause}
FROM ${fullTable}
WHERE ${eventNameCol} = '${step.event.replace(/'/g, "''")}'
  AND ${dateCol} >= '${startDate}'
  AND ${dateCol} <= '${endDate}'
  AND ${getUserIdentifier()} IN (SELECT user_identifier FROM step_${i + 1}_users)
  ${whereClause ? `AND ${whereClause}` : ''}`);
    }
  }

  // Build complete SQL with optimized CTEs
  // Pre-compute user_identifier once to avoid repeated computation
  const sql = `
WITH
-- Pre-compute user_identifier for performance (avoid repeated computation)
base_events AS (
  SELECT
    ${getUserIdentifier()} AS user_identifier,
    ${eventNameCol} as event_name,
    ${timestampCol} as event_timestamp,
    ${dateCol} as event_date${additionalColumns ? `,\n    ${additionalColumns}` : ''}
  FROM ${fullTable}
  WHERE ${dateCol} >= '${startDate}'
    AND ${dateCol} <= '${endDate}'
    AND user_identifier != ''
),
user_funnels AS (
  SELECT
    user_identifier,
    windowFunnel(${timeWindowSeconds})(
      toDateTime(event_timestamp),
      ${eventConditions.map((cond) => {
        // Replace column references with pre-computed columns
        return cond.replace(new RegExp(eventNameCol, 'g'), 'event_name');
      }).join(',\n      ')}
    ) AS funnel_level
  FROM base_events
  GROUP BY user_identifier
),
${stepCTEs.join(',\n')}

${metricQueries.join('\n\nUNION ALL\n')}

ORDER BY step
  `;

  const result = await queryClickHouse(sql);
  const stepData = result.data as Array<{ step: number; step_name: string; count: number }>;

  // Build final results with conversion/dropoff rates
  const results: FunnelResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const data = stepData.find(d => d.step === i + 1);
    const count = data ? Number(data.count) : 0;

    const conversionRate = i === 0 ? 100 : results[0].count > 0 ? (count / results[0].count) * 100 : 0;
    const dropOffRate = i === 0 ? 0 : results[i - 1].count > 0 ? ((results[i - 1].count - count) / results[i - 1].count) * 100 : 0;

    results.push({
      step: i + 1,
      stepName: getStepName(steps[i]),
      count,
      conversionRate,
      dropOffRate
    });
  }

  return results;
}

/**
 * Funnel for multi-table scenarios using sequential joins
 * Now supports all metric types: total, unique_users, sum, average, min, max
 */
async function getFunnelDataMultiTable(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  _timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' }
): Promise<FunnelResult[]> {
  // Get schema-agnostic references
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // For multi-table, we track users sequentially through each step
  const results: FunnelResult[] = [];
  let previousUsers: Set<string> = new Set();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const fullTable = step.table.includes('.') ? step.table : `${schemaAdapter.getDatabase()}.${step.table}`;
    const whereClause = buildWhereClause(step.filters || [], step.filterLogic || 'AND');

    // Step 1: Get users who reached this step (use combined identifier)
    let userSql: string;
    if (i === 0) {
      // First step: get all users (logged-in and logged-out)
      userSql = `
        SELECT DISTINCT ${getUserIdentifier()} as user_id
        FROM ${fullTable}
        WHERE ${eventNameCol} = '${step.event.replace(/'/g, "''")}'
          AND ${dateCol} >= '${startDate}'
          AND ${dateCol} <= '${endDate}'
          ${whereClause}
      `;
    } else {
      // Subsequent steps: only users from previous step
      const userList = Array.from(previousUsers).map(u => `'${u.replace(/'/g, "''")}'`).join(',');
      if (userList.length === 0) {
        // No users from previous step, funnel ends
        results.push({
          step: i + 1,
          stepName: getStepName(step),
          count: 0,
          conversionRate: 0,
          dropOffRate: 100
        });
        continue;
      }

      userSql = `
        SELECT DISTINCT ${getUserIdentifier()} as user_id
        FROM ${fullTable}
        WHERE ${eventNameCol} = '${step.event.replace(/'/g, "''")}'
          AND ${dateCol} >= '${startDate}'
          AND ${dateCol} <= '${endDate}'
          AND ${getUserIdentifier()} IN (${userList})
          ${whereClause}
      `;
    }

    const userResult = await queryClickHouse(userSql);
    const users = userResult.data.map((row: any) => row.user_id);
    const currentUsers = new Set(users);

    if (currentUsers.size === 0) {
      // No users at this step
      const conversionRate = i === 0 ? 100 : 0;
      const dropOffRate = i === 0 ? 0 : 100;

      results.push({
        step: i + 1,
        stepName: getStepName(step),
        count: 0,
        conversionRate,
        dropOffRate
      });

      previousUsers = currentUsers;
      continue;
    }

    // Step 2: Calculate metric for users at this step
    const userList = Array.from(currentUsers).map(u => `'${u.replace(/'/g, "''")}'`).join(',');

    const metricClause = buildMetricClause(metricConfig);

    const metricSql = `
      SELECT ${metricClause}
      FROM ${fullTable}
      WHERE ${eventNameCol} = '${step.event.replace(/'/g, "''")}'
        AND ${dateCol} >= '${startDate}'
        AND ${dateCol} <= '${endDate}'
        AND ${getUserIdentifier()} IN (${userList})
        ${whereClause}
    `;

    const metricResult = await queryClickHouse(metricSql);
    const count = metricResult.data[0]?.count ?? 0;

    const conversionRate = i === 0 ? 100 : results[0].count > 0 ? (Number(count) / results[0].count) * 100 : 0;
    const dropOffRate = i === 0 ? 0 : results[i - 1].count > 0 ? ((results[i - 1].count - Number(count)) / results[i - 1].count) * 100 : 0;

    results.push({
      step: i + 1,
      stepName: getStepName(step),
      count: Number(count),
      conversionRate,
      dropOffRate
    });

    previousUsers = currentUsers;
  }

  return results;
}

/**
 * Extract all property names referenced in filters
 * Used to determine which columns need to be included in base_events CTE
 */
function extractFilterProperties(filters: PropertyFilter[]): string[] {
  if (!filters || filters.length === 0) {
    return [];
  }

  const properties = new Set<string>();
  filters.forEach(f => {
    if (f.property && f.property.trim()) {
      properties.add(f.property);
    }
  });

  return Array.from(properties);
}

function buildFilterCondition(filters: PropertyFilter[], logic: 'AND' | 'OR' = 'AND'): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  // Filter out filters with empty property names
  const validFilters = filters.filter(f => f.property && f.property.trim());

  if (validFilters.length === 0) {
    return '';
  }

  const conditions = validFilters.map(filter => {
    // Get the appropriate column for case-insensitive comparison
    // (uses _lc columns if feature flag enabled, otherwise uses lower())
    const { column: caseInsensitiveCol, needsLower } = getCaseInsensitiveColumn(filter.property);

    switch (filter.operator) {
      case 'equals':
        const escapedValue = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) = '${escapedValue}'`
          : `${caseInsensitiveCol} = '${escapedValue}'`;
      case 'not_equals':
        const escapedValueNe = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) != '${escapedValueNe}'`
          : `${caseInsensitiveCol} != '${escapedValueNe}'`;
      case 'contains':
        const escapedValueC = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) LIKE '%${escapedValueC}%'`
          : `${caseInsensitiveCol} LIKE '%${escapedValueC}%'`;
      case 'not_contains':
        const escapedValueNc = filter.value.toLowerCase().replace(/'/g, "''");
        return needsLower
          ? `lower(${caseInsensitiveCol}) NOT LIKE '%${escapedValueNc}%'`
          : `${caseInsensitiveCol} NOT LIKE '%${escapedValueNc}%'`;
      case 'in':
        const inValues = filter.value.split(',')
          .map(v => v.trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => `'${v.replace(/'/g, "''")}'`)
          .join(',');
        if (inValues.length === 0) return '';
        return needsLower
          ? `lower(${caseInsensitiveCol}) IN (${inValues})`
          : `${caseInsensitiveCol} IN (${inValues})`;
      case 'not_in':
        const notInValues = filter.value.split(',')
          .map(v => v.trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => `'${v.replace(/'/g, "''")}'`)
          .join(',');
        if (notInValues.length === 0) return '';
        return needsLower
          ? `lower(${caseInsensitiveCol}) NOT IN (${notInValues})`
          : `${caseInsensitiveCol} NOT IN (${notInValues})`;
      default:
        return '';
    }
  }).filter(Boolean);

  if (conditions.length === 0) {
    return '';
  }

  // Always wrap in parentheses for clarity, especially with OR
  const joined = conditions.join(` ${logic} `);
  return conditions.length > 1
    ? `(${joined})`
    : joined;
}

function getStepName(step: FunnelStep): string {
  const filterText = step.filters && step.filters.length > 0
    ? ` [${step.filters.map(f => `${f.property} ${f.operator} "${f.value}"`).join(', ')}]`
    : '';
  return `${step.event}${filterText}`;
}

/**
 * Helper function to build metric aggregation clause
 */
function buildMetricClause(metricConfig: MetricConfig): string {
  switch (metricConfig.type) {
    case 'total':
      return 'count(*) AS count';
    case 'unique_users':
      // Use pixel_properties_user_id when available, fallback to pixel_device_id for logged-out users
      return 'count(DISTINCT if(pixel_properties_user_id != \'\', pixel_properties_user_id, pixel_device_id)) AS count';
    case 'count_distinct':
      if (!metricConfig.property) {
        throw new Error('Property required for count distinct metric');
      }
      return `count(DISTINCT \`${metricConfig.property}\`) AS count`;
    case 'sum':
      if (!metricConfig.property) {
        throw new Error('Property required for sum metric');
      }
      return `sum(toFloat64OrZero(\`${metricConfig.property}\`)) AS count`;
    case 'average':
      if (!metricConfig.property) {
        throw new Error('Property required for average metric');
      }
      return `avg(toFloat64OrNull(\`${metricConfig.property}\`)) AS count`;
    case 'min':
      if (!metricConfig.property) {
        throw new Error('Property required for min metric');
      }
      return `min(toFloat64OrNull(\`${metricConfig.property}\`)) AS count`;
    case 'max':
      if (!metricConfig.property) {
        throw new Error('Property required for max metric');
      }
      return `max(toFloat64OrNull(\`${metricConfig.property}\`)) AS count`;
    default:
      return 'count(*) AS count';
  }
}

/**
 * Get funnel data with breakdown by property (single or multiple)
 */
export async function getFunnelDataWithBreakdown(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  breakdownProperties: string | string[] | BreakdownProperty[],
  timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' } // NEW: Optional parameter with safe default
): Promise<FunnelBreakdown[]> {
  // Normalize to BreakdownProperty array
  let properties: BreakdownProperty[];

  if (Array.isArray(breakdownProperties)) {
    if (breakdownProperties.length > 0 && typeof breakdownProperties[0] === 'object') {
      properties = breakdownProperties as BreakdownProperty[];
    } else {
      properties = (breakdownProperties as string[]).map(p => ({ property: p }));
    }
  } else {
    properties = [{ property: breakdownProperties as string }];
  }

  if (steps.length === 0 || properties.length === 0) {
    return [];
  }

  // Normalize properties: handle both string[] and BreakdownProperty[]
  const normalizedProperties: BreakdownProperty[] = properties.map(p =>
    typeof p === 'string' ? { property: p } : p
  );

  // Filter out empty properties
  const validProperties = normalizedProperties.filter(p => p && p.property && typeof p.property === 'string' && p.property.trim());

  if (validProperties.length === 0) {
    return [];
  }

  // For single table funnels with breakdown
  const allSameTable = steps.every(s => s.table === steps[0].table);

  if (allSameTable) {
    return getFunnelBreakdownOptimized(steps, startDate, endDate, validProperties, timeWindowHours, metricConfig);
  } else {
    return getFunnelBreakdownMultiTable(steps, startDate, endDate, validProperties, timeWindowHours, metricConfig);
  }
}

/**
 * Optimized breakdown for single table using GROUP BY
 * Now supports all metric types: total, unique_users, sum, average, min, max
 */
async function getFunnelBreakdownOptimized(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  breakdownProperties: BreakdownProperty[],
  timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' }
): Promise<FunnelBreakdown[]> {
  // Get schema-agnostic references
  const table = steps[0].table;
  const fullTable = table.includes('.') ? table : `${schemaAdapter.getDatabase()}.${table}`;
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const timestampCol = schemaAdapter.getColumn('timestamp');

  const timeWindowSeconds = timeWindowHours ? timeWindowHours * 3600 : 86400 * 7;

  // Extract all properties used in filters across all steps
  const allFilterProperties = new Set<string>();
  steps.forEach(step => {
    const properties = extractFilterProperties(step.filters || []);
    properties.forEach(p => allFilterProperties.add(p));
  });

  // Build breakdown columns with granularity transformation
  const breakdownColumns = breakdownProperties.map(bp => {
    const colName = schemaAdapter.getProperty(bp.property);

    // Apply granularity transformation for date properties
    if (bp.granularity) {
      switch (bp.granularity) {
        case 'weekly':
          return `toMonday(${colName})`;
        case 'monthly':
          return `toStartOfMonth(${colName})`;
        case 'daily':
        default:
          return colName;
      }
    }
    return colName;
  });

  // Create segment as concatenation of all properties with ' | ' separator
  const segmentExpression = breakdownColumns.length === 1
    ? `${breakdownColumns[0]} AS segment`
    : `concat(${breakdownColumns.map((col, idx) =>
        idx === 0 ? col : `' | ', ${col}`
      ).join(', ')}) AS segment`;

  // Build WHERE conditions to exclude empty values (only for non-date columns)
  const nonEmptyConditions = breakdownProperties
    .map((bp, idx) => {
      // Skip empty check for any date-related columns (they can't be compared to empty string)
      const isDateColumn = bp.property === schemaAdapter.getColumn('date') ||
                          bp.property === schemaAdapter.getColumn('timestamp') ||
                          bp.granularity !== undefined; // If granularity is set, it's a date

      if (isDateColumn) {
        return null;
      }
      return `${breakdownColumns[idx]} != ''`;
    })
    .filter(Boolean)
    .join(' AND ');

  // Build additional columns for base_events CTE (properties used in filters, excluding breakdown properties)
  // IMPORTANT: Select the actual column that will be used in filter conditions
  const additionalColumns = Array.from(allFilterProperties)
    .filter(prop => !breakdownProperties.some(bp => bp.property === prop)) // Don't duplicate breakdown properties
    .map(prop => {
      const { column: filterColumn, needsLower } = getCaseInsensitiveColumn(prop);
      if (needsLower) {
        // Select base column and alias it as the property name
        return `${schemaAdapter.getProperty(prop)} as \`${prop}\``;
      } else {
        // Select the _lc column directly (it's already in the schema)
        const cleanColumn = filterColumn.replace(/`/g, '');
        return `${cleanColumn} as \`${cleanColumn}\``;
      }
    }).join(',\n    ');

  // Build event conditions with filters
  const eventConditions = steps.map((step) => {
    const whereClause = buildFilterCondition(step.filters || [], step.filterLogic || 'AND');
    const condition = whereClause
      ? `${eventNameCol} = '${step.event.replace(/'/g, "''")}' AND ${whereClause}`
      : `${eventNameCol} = '${step.event.replace(/'/g, "''")}'`;
    return condition;
  });

  // ✅ SCALABLE: Use single query with CTEs - no huge IN clauses!
  const metricClause = buildMetricClause(metricConfig);

  // Build metric queries for each step - use base_events for performance
  const metricQueries: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const whereClause = buildFilterCondition(step.filters || [], step.filterLogic || 'AND');

    // Build metric clause - use pre-computed columns from base_events
    let metricClauseForBase: string;
    if (metricConfig.type === 'unique_users') {
      metricClauseForBase = 'count(DISTINCT user_identifier) AS count';
    } else if (metricConfig.type === 'sum' || metricConfig.type === 'average' || metricConfig.type === 'min' || metricConfig.type === 'max') {
      // For aggregations on properties, we need to query the full table (property not in base_events)
      metricClauseForBase = metricClause;
    } else {
      metricClauseForBase = 'count(*) AS count';
    }

    // For property-based metrics (sum, avg, min, max), query full table
    // For count-based metrics, use base_events
    const useBaseEvents = metricConfig.type === 'total' || metricConfig.type === 'unique_users';

    if (useBaseEvents) {
      metricQueries.push(`
SELECT
  ${i + 1} AS step,
  '${getStepName(step).replace(/'/g, "''")}' AS step_name,
  segment,
  ${metricClauseForBase}
FROM base_events
WHERE event_name = '${step.event.replace(/'/g, "''")}'
  AND (user_identifier, segment) IN (
    SELECT user_identifier, segment
    FROM user_funnels
    WHERE funnel_level >= ${i + 1}
  )
  ${whereClause ? `AND ${whereClause}` : ''}
GROUP BY segment`);
    } else {
      // For property metrics, still need to query full table
      metricQueries.push(`
SELECT
  ${i + 1} AS step,
  '${getStepName(step).replace(/'/g, "''")}' AS step_name,
  ${segmentExpression},
  ${metricClause}
FROM ${fullTable}
WHERE ${eventNameCol} = '${step.event.replace(/'/g, "''")}'
  AND ${dateCol} >= '${startDate}'
  AND ${dateCol} <= '${endDate}'
  AND (${getUserIdentifier()}, ${segmentExpression.replace(' AS segment', '')}) IN (
    SELECT user_identifier, segment
    FROM user_funnels
    WHERE funnel_level >= ${i + 1}
  )
  ${whereClause ? `AND ${whereClause}` : ''}
GROUP BY segment`);
    }
  }

  // Build complete SQL with optimized CTEs
  // Pre-compute user_identifier and segment for performance
  const sql = `
WITH
-- Pre-compute user_identifier and segment for performance (avoid repeated computation)
base_events AS (
  SELECT
    ${getUserIdentifier()} AS user_identifier,
    ${eventNameCol} as event_name,
    ${timestampCol} as event_timestamp,
    ${dateCol} as event_date,
    ${segmentExpression}${additionalColumns ? `,\n    ${additionalColumns}` : ''}
  FROM ${fullTable}
  WHERE ${dateCol} >= '${startDate}'
    AND ${dateCol} <= '${endDate}'
    ${nonEmptyConditions ? `AND ${nonEmptyConditions}` : ''}
    AND user_identifier != ''
),
user_funnels AS (
  SELECT
    user_identifier,
    segment,
    windowFunnel(${timeWindowSeconds})(
      toDateTime(event_timestamp),
      ${eventConditions.map((cond) => {
        // Replace column references with pre-computed columns
        return cond.replace(new RegExp(eventNameCol, 'g'), 'event_name');
      }).join(',\n      ')}
    ) AS funnel_level
  FROM base_events
  GROUP BY user_identifier, segment
  HAVING funnel_level > 0
)

${metricQueries.join('\n\nUNION ALL\n')}

ORDER BY segment, step
  `;

  const result = await queryClickHouse(sql);
  const allData = result.data as Array<{ step: number; step_name: string; segment: string; count: number }>;

  // Group by segment
  const segmentMap = new Map<string, Array<{ step: number; count: number }>>();

  for (const row of allData) {
    if (!segmentMap.has(row.segment)) {
      segmentMap.set(row.segment, []);
    }
    segmentMap.get(row.segment)!.push({ step: row.step, count: Number(row.count) });
  }

  // Build final results
  const breakdowns: FunnelBreakdown[] = [];

  for (const [segment, stepData] of segmentMap.entries()) {
    const segmentSteps: FunnelResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const data = stepData.find(d => d.step === i + 1);
      const count = data ? data.count : 0;

      const conversionRate = i === 0 ? 100 : segmentSteps[0].count > 0 ? (count / segmentSteps[0].count) * 100 : 0;
      const dropOffRate = i === 0 ? 0 : segmentSteps[i - 1].count > 0 ? ((segmentSteps[i - 1].count - count) / segmentSteps[i - 1].count) * 100 : 0;

      segmentSteps.push({
        step: i + 1,
        stepName: getStepName(steps[i]),
        count,
        conversionRate,
        dropOffRate,
        segment
      });
    }

    breakdowns.push({
      segmentName: segment,
      steps: segmentSteps
    });
  }

  // Sort by total metric value at step 1 descending
  breakdowns.sort((a, b) => b.steps[0].count - a.steps[0].count);

  return breakdowns;
}

/**
 * Breakdown for multi-table funnels
 * Now supports all metric types: total, unique_users, sum, average, min, max
 */
async function getFunnelBreakdownMultiTable(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  breakdownProperties: BreakdownProperty[],
  timeWindowHours?: number,
  metricConfig: MetricConfig = { type: 'total' }
): Promise<FunnelBreakdown[]> {
  // Get schema-agnostic references
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');

  // Get unique segments from first step
  const firstStep = steps[0];
  const fullTable = firstStep.table.includes('.') ? firstStep.table : `${schemaAdapter.getDatabase()}.${firstStep.table}`;

  // Build breakdown columns with granularity transformation
  const breakdownColumns = breakdownProperties.map(bp => {
    const colName = schemaAdapter.getProperty(bp.property);

    // Apply granularity transformation for date properties
    if (bp.granularity) {
      switch (bp.granularity) {
        case 'weekly':
          return `toMonday(${colName})`;
        case 'monthly':
          return `toStartOfMonth(${colName})`;
        case 'daily':
        default:
          return colName;
      }
    }
    return colName;
  });

  // Create segment as concatenation of all properties
  const segmentExpression = breakdownColumns.length === 1
    ? `${breakdownColumns[0]} AS segment`
    : `concat(${breakdownColumns.map((col, idx) =>
        idx === 0 ? col : `' | ', ${col}`
      ).join(', ')}) AS segment`;

  // Build WHERE conditions to exclude empty values (only for non-date columns)
  const nonEmptyConditions = breakdownProperties
    .map((bp, idx) => {
      // Skip empty check for any date-related columns (they can't be compared to empty string)
      const isDateColumn = bp.property === schemaAdapter.getColumn('date') ||
                          bp.property === schemaAdapter.getColumn('timestamp') ||
                          bp.granularity !== undefined; // If granularity is set, it's a date

      if (isDateColumn) {
        return null;
      }
      return `${breakdownColumns[idx]} != ''`;
    })
    .filter(Boolean)
    .join(' AND ');
  const whereClause = buildWhereClause(firstStep.filters || [], firstStep.filterLogic || 'AND');

  const segmentsSql = `
    SELECT DISTINCT ${segmentExpression}
    FROM ${fullTable}
    WHERE ${eventNameCol} = '${firstStep.event.replace(/'/g, "''")}'
      AND ${dateCol} >= '${startDate}'
      AND ${dateCol} <= '${endDate}'
      ${nonEmptyConditions ? `AND ${nonEmptyConditions}` : ''}
      ${whereClause}
    LIMIT 20
  `;

  const segmentsResult = await queryClickHouse(segmentsSql);
  const segments = segmentsResult.data.map((row: any) => row.segment);

  // Calculate funnel for each segment
  const breakdowns: FunnelBreakdown[] = [];

  for (const segment of segments) {
    // Parse segment back into individual property values (split by ' | ')
    const segmentValues = segment.split(' | ');

    // Add segment filters to each step
    const segmentSteps = steps.map(step => {
      const additionalFilters = breakdownProperties.map((bp, idx) => ({
        property: bp.property,
        operator: 'equals' as const,
        value: segmentValues[idx]?.toLowerCase() || ''
      }));

      return {
        ...step,
        filters: [
          ...(step.filters || []),
          ...additionalFilters
        ]
      };
    });

    // Get funnel data for this segment WITH METRIC CONFIG
    const segmentResults = await getFunnelDataMultiTable(segmentSteps, startDate, endDate, timeWindowHours, metricConfig);

    if (segmentResults.length > 0 && segmentResults[0].count > 0) {
      // Add segment to each result
      segmentResults.forEach(r => r.segment = segment);

      breakdowns.push({
        segmentName: segment,
        steps: segmentResults
      });
    }
  }

  // Sort by total metric value at step 1 descending
  breakdowns.sort((a, b) => b.steps[0].count - a.steps[0].count);

  return breakdowns;
}

/**
 * Split date range into periods based on granularity
 */
function generateDatePeriods(startDate: string, endDate: string, granularity: DateGranularity): Array<{ period: string; periodLabel: string; startDate: string; endDate: string }> {
  const periods: Array<{ period: string; periodLabel: string; startDate: string; endDate: string }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (granularity === 'daily') {
    let current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      periods.push({
        period: dateStr,
        periodLabel: new Date(current).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        startDate: dateStr,
        endDate: dateStr
      });
      current.setDate(current.getDate() + 1);
    }
  } else if (granularity === 'weekly') {
    let current = new Date(start);
    // Start from Monday of the week containing startDate
    const dayOfWeek = current.getDay();
    const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    current.setDate(current.getDate() + diff);

    while (current <= end) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Clamp to actual date range
      const periodStart = weekStart < start ? start : weekStart;
      const periodEnd = weekEnd > end ? end : weekEnd;

      const weekNumber = Math.ceil((weekStart.getDate() + new Date(weekStart.getFullYear(), weekStart.getMonth(), 1).getDay()) / 7);

      periods.push({
        period: `${weekStart.getFullYear()}-W${weekNumber}`,
        periodLabel: `Week ${weekNumber} (${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0]
      });

      current.setDate(current.getDate() + 7);
    }
  } else { // monthly
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const monthStart = new Date(current);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      // Clamp to actual date range
      const periodStart = monthStart < start ? start : monthStart;
      const periodEnd = monthEnd > end ? end : monthEnd;

      periods.push({
        period: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        periodLabel: monthStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0]
      });

      current.setMonth(current.getMonth() + 1);
    }
  }

  return periods;
}

/**
 * Get funnel data split by time periods
 */
export async function getFunnelDataByPeriod(
  steps: FunnelStep[],
  startDate: string,
  endDate: string,
  granularity: DateGranularity,
  timeWindowHours?: number
): Promise<TimePeriodFunnel[]> {
  const periods = generateDatePeriods(startDate, endDate, granularity);
  const results: TimePeriodFunnel[] = [];

  for (const period of periods) {
    const funnelResults = await getFunnelData(steps, period.startDate, period.endDate, timeWindowHours);

    results.push({
      period: period.period,
      periodLabel: period.periodLabel,
      startDate: period.startDate,
      endDate: period.endDate,
      steps: funnelResults
    });
  }

  return results;
}

/**
 * Get recent events for Events page with pagination and filters
 */
export async function getRecentEvents(
  dateStart: string,
  dateEnd: string,
  limit: number = 500,
  offset: number = 0,
  eventNames?: string[],
  filters?: PropertyFilter[]
): Promise<{ data: any[]; total: number }> {
  // Build WHERE clause
  let whereClause = `ist_date >= '${dateStart}' AND ist_date <= '${dateEnd}'`;

  // Add event name filter if provided
  if (eventNames && eventNames.length > 0) {
    const eventNamesStr = eventNames.map(name => `'${name}'`).join(', ');
    whereClause += ` AND event_name IN (${eventNamesStr})`;
  }

  // Add property filters if provided
  if (filters && filters.length > 0) {
    const filterCondition = buildFilterCondition(filters, 'AND');
    if (filterCondition) {
      whereClause += ` AND (${filterCondition})`;
    }
  }

  // Get paginated data
  const sql = `
    SELECT *
    FROM ${schemaAdapter.getTable()}
    WHERE ${whereClause}
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  // Get total count
  const countSql = `
    SELECT count(*) as total
    FROM ${schemaAdapter.getTable()}
    WHERE ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    queryClickHouse(sql),
    queryClickHouse(countSql)
  ]);

  return {
    data: dataResult.data,
    total: countResult.data[0]?.total || 0
  };
}

/**
 * Execute a custom SQL query from the Playground
 * Includes additional security and performance constraints
 */
export async function executeCustomQuery(
  sql: string,
  timeoutMs: number = 120000,
  maxRows: number = 10000
): Promise<CustomQueryResult> {
  try {
    const startTime = Date.now();

    // Get user email for attribution
    const userEmail = getCurrentUserEmail();

    // Remove trailing semicolon if present (must be removed before SETTINGS)
    let finalQuery = sql.trim();
    if (finalQuery.endsWith(';')) {
      finalQuery = finalQuery.slice(0, -1).trim();
    }

    // Add LIMIT if not present
    const limitRegex = /\bLIMIT\s+\d+/i;
    if (!limitRegex.test(finalQuery)) {
      finalQuery = `${finalQuery} LIMIT ${maxRows}`;
    }

    // Add SETTINGS for timeout and result limits (no max_rows_to_read for Playground)
    const settingsClause = `SETTINGS max_execution_time = ${Math.floor(timeoutMs / 1000)}, max_result_rows = ${maxRows}`;

    const queryWithSettings = `${finalQuery} ${settingsClause}`;

    // Add user attribution comment
    const queryWithAttribution = `-- Query executed by: ${userEmail}\n${queryWithSettings}`;

    const params = new URLSearchParams({
      database: CLICKHOUSE_DATABASE,
      default_format: 'JSONCompact',
    });

    const response = await axios.post(
      `${CLICKHOUSE_URL}/?${params.toString()}`,
      queryWithAttribution,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: timeoutMs,
      }
    );

    const result = response.data;
    const elapsed = Date.now() - startTime;

    // Parse JSONCompact format
    const columns = (result.meta || []).map((col: any) => ({
      name: col.name,
      type: col.type
    }));

    const data = (result.data || []).map((row: any[]) => {
      const obj: any = {};
      columns.forEach((col: any, idx: number) => {
        obj[col.name] = row[idx];
      });
      return obj;
    });

    return {
      data,
      rows: data.length,
      columns,
      statistics: {
        elapsed: elapsed / 1000, // Convert to seconds
        rows_read: result.rows_read || result.rows || data.length,
        bytes_read: result.bytes_read || 0,
      },
      query: finalQuery
    };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data || error.message;
      throw new Error(`ClickHouse query failed: ${message}`);
    }
    throw error;
  }
}
