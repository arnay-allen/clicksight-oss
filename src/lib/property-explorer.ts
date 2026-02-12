import axios from 'axios';

// Runtime environment config helper
const getEnv = (key: string, fallback: string = ''): string => {
  if (typeof window !== 'undefined' && (window as any)._env_) {
    return (window as any)._env_[key] || fallback;
  }
  return import.meta.env[key] || fallback;
};

const CLICKHOUSE_URL = getEnv('VITE_CLICKHOUSE_URL', 'http://localhost:8123');
const CLICKHOUSE_USER = getEnv('VITE_CLICKHOUSE_USER', 'default');
const CLICKHOUSE_PASSWORD = getEnv('VITE_CLICKHOUSE_PASSWORD', '');
const CLICKHOUSE_DATABASE = getEnv('VITE_CLICKHOUSE_DATABASE', 'analytics');

export interface PropertyInfo {
  name: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  totalCount: number;
  uniqueCount: number;
  nullCount: number;
  emptyCount: number;
  sampleValues: string[];
}

export interface PropertyValueDistribution {
  value: string;
  count: number;
  percentage: number;
}

export interface NumericDistribution {
  bucket: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface PropertyStatistics {
  property: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  totalCount: number;
  uniqueCount: number;
  nullCount: number;
  emptyCount: number;
  nullPercentage: number;
  emptyPercentage: number;
  topValues: PropertyValueDistribution[];
  numericStats?: {
    min: number;
    max: number;
    avg: number;
    median: number;
    distribution: NumericDistribution[];
  };
}

/**
 * Get list of all properties with basic statistics
 */
export async function getPropertyList(
  table: string = 'app_events',
  startDate: string,
  endDate: string,
  searchTerm?: string
): Promise<PropertyInfo[]> {
  try {
    // Get all column names from the table
    const describeQuery = `DESCRIBE ${table}`;
    
    const describeParams = new URLSearchParams({
      database: CLICKHOUSE_DATABASE,
      default_format: 'JSONCompact',
    });

    const describeResponse = await axios.post(
      `${CLICKHOUSE_URL}/?${describeParams.toString()}`,
      describeQuery,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: 30000,
      }
    );

    const columns = describeResponse.data.data.map((row: any[]) => row[0]);
    
    // Filter out system columns and apply search
    let filteredColumns = columns.filter((col: string) => 
      !['event_timestamp', 'server_timestamp', 'ist_date', 'client_reference_id', 'meta'].includes(col)
    );

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filteredColumns = filteredColumns.filter((col: string) => 
        col.toLowerCase().includes(lowerSearch)
      );
    }

    // Get statistics for each property (limit to first 50 for performance)
    const propertiesToAnalyze = filteredColumns.slice(0, 50);
    
    const statsPromises = propertiesToAnalyze.map(async (property: string) => {
      try {
        const statsQuery = `
          WITH all_stats AS (
            SELECT 
              count(*) as total_count,
              uniq(\`${property}\`) as unique_count,
              countIf(\`${property}\` IS NULL) as null_count,
              countIf(\`${property}\` = '') as empty_count
            FROM ${table}
            WHERE ist_date >= '${startDate}' AND ist_date <= '${endDate}'
          ),
          samples AS (
            SELECT groupArray(3)(\`${property}\`) as sample_values
            FROM ${table}
            WHERE ist_date >= '${startDate}' AND ist_date <= '${endDate}'
              AND \`${property}\` != '' AND \`${property}\` IS NOT NULL
            LIMIT 1
          )
          SELECT 
            a.total_count,
            a.unique_count,
            a.null_count,
            a.empty_count,
            s.sample_values
          FROM all_stats a, samples s
        `;

        const params = new URLSearchParams({
          database: CLICKHOUSE_DATABASE,
          default_format: 'JSON',
        });

        const response = await axios.post(
          `${CLICKHOUSE_URL}/?${params.toString()}`,
          statsQuery,
          {
            auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
              username: CLICKHOUSE_USER,
              password: CLICKHOUSE_PASSWORD,
            } : undefined,
            headers: {
              'Content-Type': 'text/plain',
            },
            timeout: 10000,
          }
        );

        const data = response.data.data[0];
        
        // Detect data type from sample values
        const dataType = detectDataType(data.sample_values);

        return {
          name: property,
          dataType,
          totalCount: parseInt(data.total_count),
          uniqueCount: parseInt(data.unique_count),
          nullCount: parseInt(data.null_count),
          emptyCount: parseInt(data.empty_count),
          sampleValues: data.sample_values.filter((v: string) => v),
        };
      } catch (err) {
        // If property query fails, return basic info
        return {
          name: property,
          dataType: 'string' as const,
          totalCount: 0,
          uniqueCount: 0,
          nullCount: 0,
          emptyCount: 0,
          sampleValues: [],
        };
      }
    });

    const results = await Promise.all(statsPromises);
    return results;
  } catch (error: any) {
    console.error('Failed to get property list:', error);
    throw new Error(`Failed to get property list: ${error.message}`);
  }
}

/**
 * Get detailed statistics for a specific property
 */
export async function getPropertyStatistics(
  table: string,
  property: string,
  startDate: string,
  endDate: string
): Promise<PropertyStatistics> {
  try {
    // Get basic stats and top values
    const statsQuery = `
      WITH stats AS (
        SELECT 
          count(*) as total_count,
          uniq(\`${property}\`) as unique_count,
          countIf(\`${property}\` IS NULL) as null_count,
          countIf(\`${property}\` = '') as empty_count
        FROM ${table}
        WHERE ist_date >= '${startDate}' AND ist_date <= '${endDate}'
      ),
      top_values AS (
        SELECT 
          \`${property}\` as value,
          count(*) as count
        FROM ${table}
        WHERE ist_date >= '${startDate}' AND ist_date <= '${endDate}'
          AND \`${property}\` != '' AND \`${property}\` IS NOT NULL
        GROUP BY value
        ORDER BY count DESC
        LIMIT 10
      )
      SELECT 
        s.total_count,
        s.unique_count,
        s.null_count,
        s.empty_count,
        groupArray((t.value, t.count)) as top_values
      FROM stats s
      CROSS JOIN top_values t
      GROUP BY s.total_count, s.unique_count, s.null_count, s.empty_count
    `;

    const params = new URLSearchParams({
      database: CLICKHOUSE_DATABASE,
      default_format: 'JSON',
    });

    const response = await axios.post(
      `${CLICKHOUSE_URL}/?${params.toString()}`,
      statsQuery,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: 30000,
      }
    );

    // Handle empty result (when property has no non-null/non-empty values)
    if (!response.data.data || response.data.data.length === 0) {
      return {
        property,
        dataType: 'string',
        totalCount: 0,
        uniqueCount: 0,
        nullCount: 0,
        emptyCount: 0,
        nullPercentage: 0,
        emptyPercentage: 0,
        topValues: [],
        numericStats: undefined,
      };
    }

    const data = response.data.data[0];
    const totalCount = parseInt(data.total_count);
    const uniqueCount = parseInt(data.unique_count);
    const nullCount = parseInt(data.null_count);
    const emptyCount = parseInt(data.empty_count);

    // Parse top values
    const topValues: PropertyValueDistribution[] = data.top_values.map((item: any) => ({
      value: item[0],
      count: parseInt(item[1]),
      percentage: (parseInt(item[1]) / totalCount) * 100,
    }));

    // Detect data type
    const dataType = detectDataType(topValues.map(v => v.value));

    // Get numeric statistics if it's a number
    let numericStats = undefined;
    if (dataType === 'number') {
      numericStats = await getNumericStatistics(table, property, startDate, endDate);
    }

    return {
      property,
      dataType,
      totalCount,
      uniqueCount,
      nullCount,
      emptyCount,
      nullPercentage: (nullCount / totalCount) * 100,
      emptyPercentage: (emptyCount / totalCount) * 100,
      topValues,
      numericStats,
    };
  } catch (error: any) {
    console.error('Failed to get property statistics:', error);
    throw new Error(`Failed to get property statistics: ${error.message}`);
  }
}

/**
 * Get numeric statistics and distribution
 */
async function getNumericStatistics(
  table: string,
  property: string,
  startDate: string,
  endDate: string
): Promise<PropertyStatistics['numericStats']> {
  try {
    const numericQuery = `
      WITH numeric_values AS (
        SELECT toFloat64OrNull(\`${property}\`) as num_value
        FROM ${table}
        WHERE ist_date >= '${startDate}' AND ist_date <= '${endDate}'
          AND \`${property}\` != '' AND \`${property}\` IS NOT NULL
          AND toFloat64OrNull(\`${property}\`) IS NOT NULL
      ),
      stats AS (
        SELECT 
          min(num_value) as min_val,
          max(num_value) as max_val,
          avg(num_value) as avg_val,
          quantile(0.5)(num_value) as median_val
        FROM numeric_values
      ),
      distribution AS (
        SELECT 
          floor(num_value / GREATEST((s.max_val - s.min_val) / 10, 1)) * GREATEST((s.max_val - s.min_val) / 10, 1) as bucket_start,
          count(*) as count
        FROM numeric_values, stats s
        GROUP BY bucket_start
        ORDER BY bucket_start
        LIMIT 10
      )
      SELECT 
        s.min_val,
        s.max_val,
        s.avg_val,
        s.median_val,
        groupArray((d.bucket_start, d.count)) as distribution
      FROM stats s
      CROSS JOIN distribution d
      GROUP BY s.min_val, s.max_val, s.avg_val, s.median_val
    `;

    const params = new URLSearchParams({
      database: CLICKHOUSE_DATABASE,
      default_format: 'JSON',
    });

    const response = await axios.post(
      `${CLICKHOUSE_URL}/?${params.toString()}`,
      numericQuery,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: 30000,
      }
    );

    if (response.data.data.length === 0) {
      return undefined;
    }

    const data = response.data.data[0];
    const totalCount = data.distribution.reduce((sum: number, item: any) => sum + parseInt(item[1]), 0);

    return {
      min: parseFloat(data.min_val),
      max: parseFloat(data.max_val),
      avg: parseFloat(data.avg_val),
      median: parseFloat(data.median_val),
      distribution: data.distribution.map((item: any) => {
        const bucketStart = parseFloat(item[0]);
        const count = parseInt(item[1]);
        const bucketSize = (parseFloat(data.max_val) - parseFloat(data.min_val)) / 10;
        
        return {
          bucket: `${bucketStart.toFixed(2)} - ${(bucketStart + bucketSize).toFixed(2)}`,
          min: bucketStart,
          max: bucketStart + bucketSize,
          count,
          percentage: (count / totalCount) * 100,
        };
      }),
    };
  } catch (error) {
    console.error('Failed to get numeric statistics:', error);
    return undefined;
  }
}

/**
 * Detect data type from sample values
 */
function detectDataType(values: string[]): 'string' | 'number' | 'date' | 'boolean' | 'mixed' {
  if (values.length === 0) return 'string';

  let numericCount = 0;
  let dateCount = 0;
  let booleanCount = 0;

  for (const value of values) {
    // Check if boolean
    if (value === 'true' || value === 'false' || value === '0' || value === '1') {
      booleanCount++;
      continue;
    }

    // Check if numeric
    if (!isNaN(parseFloat(value)) && isFinite(parseFloat(value))) {
      numericCount++;
      continue;
    }

    // Check if date (ISO format or timestamp)
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{10,13}$/.test(value)) {
      dateCount++;
      continue;
    }
  }

  const total = values.length;
  const numericRatio = numericCount / total;
  const dateRatio = dateCount / total;
  const booleanRatio = booleanCount / total;

  // If 80%+ of values match a type, classify as that type
  if (numericRatio >= 0.8) return 'number';
  if (dateRatio >= 0.8) return 'date';
  if (booleanRatio >= 0.8) return 'boolean';
  if (numericRatio + dateRatio + booleanRatio < 0.5) return 'string';

  return 'mixed';
}

/**
 * Export property statistics as CSV
 */
export function exportPropertyStatistics(stats: PropertyStatistics): void {
  const rows: string[] = [];
  
  // Header
  rows.push('Property Statistics');
  rows.push('');
  
  // Basic info
  rows.push('Property Name,' + stats.property);
  rows.push('Data Type,' + stats.dataType);
  rows.push('Total Count,' + stats.totalCount);
  rows.push('Unique Count,' + stats.uniqueCount);
  rows.push('Null Count,' + stats.nullCount + ' (' + stats.nullPercentage.toFixed(2) + '%)');
  rows.push('Empty Count,' + stats.emptyCount + ' (' + stats.emptyPercentage.toFixed(2) + '%)');
  rows.push('');
  
  // Top values
  rows.push('Top Values');
  rows.push('Value,Count,Percentage');
  stats.topValues.forEach(item => {
    rows.push(`"${item.value}",${item.count},${item.percentage.toFixed(2)}%`);
  });
  
  // Numeric stats if available
  if (stats.numericStats) {
    rows.push('');
    rows.push('Numeric Statistics');
    rows.push('Min,' + stats.numericStats.min);
    rows.push('Max,' + stats.numericStats.max);
    rows.push('Average,' + stats.numericStats.avg.toFixed(2));
    rows.push('Median,' + stats.numericStats.median.toFixed(2));
    rows.push('');
    rows.push('Distribution');
    rows.push('Bucket,Count,Percentage');
    stats.numericStats.distribution.forEach(item => {
      rows.push(`"${item.bucket}",${item.count},${item.percentage.toFixed(2)}%`);
    });
  }

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `property_${stats.property}_statistics.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

