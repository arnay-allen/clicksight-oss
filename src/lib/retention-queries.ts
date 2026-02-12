import { queryClickHouse } from './clickhouse';
import { schemaAdapter } from './schema-adapter';

export interface RetentionConfig {
  activationEvent: string;
  returnEvent: string;
  startDate: string;
  endDate: string;
  retentionPeriods: number[]; // e.g., [1, 3, 7, 14, 30]
  segmentProperty?: string;
  segmentValue?: string;
}

export interface RetentionDataPoint {
  cohortDate: string;
  cohortSize: number;
  retentionData: {
    day: number;
    retainedUsers: number;
    retentionRate: number;
  }[];
}

export interface RetentionResult {
  cohorts: RetentionDataPoint[];
  totalUsers: number;
}

/**
 * Calculate retention for users across specified periods
 * 
 * Logic:
 * 1. Identify cohort users (first time they performed activation event)
 * 2. Track when they return (performed return event N days later)
 * 3. Calculate retention percentage for each period
 */
export async function calculateRetention(config: RetentionConfig): Promise<RetentionResult> {
  const {
    activationEvent,
    returnEvent,
    startDate,
    endDate,
    retentionPeriods,
    segmentProperty,
    segmentValue,
  } = config;

  // Build segment filter
  const segmentFilter = segmentProperty && segmentValue
    ? `AND lower(\`${segmentProperty}\`) = lower('${segmentValue.replace(/'/g, "''")}')`
    : '';

  // Get schema-agnostic references
  const table = schemaAdapter.getTable();
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const userIdentifier = schemaAdapter.getUserIdentifier();

  // Build the query with optimized CTEs
  const query = `
    WITH 
    -- Pre-compute user_identifier for performance (avoid repeated computation)
    base_events AS (
      SELECT 
        ${userIdentifier} as user_identifier,
        ${eventNameCol} as event_name,
        ${dateCol} as event_date
      FROM ${table}
      WHERE ${dateCol} >= '${startDate}'
        AND ${dateCol} <= '${endDate}'
        ${segmentFilter}
        AND user_identifier != ''
    ),
    cohort_users AS (
      -- Step 1: Identify cohort users with their cohort date (first activation)
      SELECT 
        user_identifier,
        min(event_date) as cohort_date
      FROM base_events
      WHERE event_name = '${activationEvent.replace(/'/g, "''")}'
      GROUP BY user_identifier
    ),
    retention_events AS (
      -- Step 2: Join with all return events to calculate days since cohort
      SELECT 
        c.cohort_date,
        c.user_identifier,
        dateDiff('day', c.cohort_date, e.event_date) as days_since_cohort
      FROM cohort_users c
      INNER JOIN base_events e
        ON e.user_identifier = c.user_identifier
        AND e.event_name = '${returnEvent.replace(/'/g, "''")}'
        AND e.event_date >= c.cohort_date
    ),
    cohort_sizes AS (
      -- Get cohort sizes (Day 0)
      SELECT 
        cohort_date,
        count(DISTINCT user_identifier) as cohort_size
      FROM cohort_users
      GROUP BY cohort_date
    )
    -- Step 3: Calculate retention for each period
    SELECT 
      r.cohort_date,
      r.days_since_cohort as day,
      count(DISTINCT r.user_identifier) as retained_users,
      cs.cohort_size
    FROM retention_events r
    INNER JOIN cohort_sizes cs ON r.cohort_date = cs.cohort_date
    WHERE r.days_since_cohort IN (${retentionPeriods.join(',')})
    GROUP BY r.cohort_date, r.days_since_cohort, cs.cohort_size
    ORDER BY r.cohort_date, r.days_since_cohort
  `;

  const result = await queryClickHouse(query);

  // Process results into structured format
  const rows = result.data || [];
  const cohortsMap = new Map<string, RetentionDataPoint>();

  rows.forEach((row: any) => {
    const cohortDate = row.cohort_date;
    const day = parseInt(row.day);
    const retainedUsers = parseInt(row.retained_users);
    const cohortSize = parseInt(row.cohort_size);

    if (!cohortsMap.has(cohortDate)) {
      cohortsMap.set(cohortDate, {
        cohortDate,
        cohortSize,
        retentionData: [],
      });
    }

    const cohort = cohortsMap.get(cohortDate)!;
    cohort.retentionData.push({
      day,
      retainedUsers,
      retentionRate: cohortSize > 0 ? (retainedUsers / cohortSize) * 100 : 0,
    });
  });

  const cohorts = Array.from(cohortsMap.values());
  const totalUsers = cohorts.reduce((sum, c) => sum + c.cohortSize, 0);

  return {
    cohorts,
    totalUsers,
  };
}

/**
 * Get average retention across all cohorts for a single retention curve
 */
export async function calculateAverageRetention(config: RetentionConfig): Promise<{
  day: number;
  retentionRate: number;
  retainedUsers: number;
  totalCohortSize: number;
}[]> {
  const result = await calculateRetention(config);
  
  // Aggregate retention data across all cohorts
  const periodMap = new Map<number, { retained: number; total: number }>();

  result.cohorts.forEach(cohort => {
    cohort.retentionData.forEach(point => {
      const existing = periodMap.get(point.day) || { retained: 0, total: 0 };
      periodMap.set(point.day, {
        retained: existing.retained + point.retainedUsers,
        total: existing.total + cohort.cohortSize,
      });
    });
  });

  const averageData = Array.from(periodMap.entries())
    .map(([day, data]) => ({
      day,
      retentionRate: data.total > 0 ? (data.retained / data.total) * 100 : 0,
      retainedUsers: data.retained,
      totalCohortSize: data.total,
    }))
    .sort((a, b) => a.day - b.day);

  return averageData;
}

/**
 * Export retention data to CSV format
 */
export function exportRetentionToCSV(data: RetentionDataPoint[]): string {
  if (data.length === 0) return '';

  // Get all unique days across all cohorts
  const allDays = new Set<number>();
  data.forEach(cohort => {
    cohort.retentionData.forEach(point => allDays.add(point.day));
  });
  const sortedDays = Array.from(allDays).sort((a, b) => a - b);

  // Build CSV header
  const header = ['Cohort Date', 'Cohort Size', ...sortedDays.map(d => `Day ${d}`)];
  
  // Build CSV rows
  const rows = data.map(cohort => {
    const row = [cohort.cohortDate, cohort.cohortSize.toString()];
    
    sortedDays.forEach(day => {
      const point = cohort.retentionData.find(p => p.day === day);
      row.push(point ? `${point.retentionRate.toFixed(2)}%` : '-');
    });
    
    return row.join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

