import { queryClickHouse } from './clickhouse';
import { schemaAdapter } from './schema-adapter';

export interface CohortRow {
  cohortDate: string;
  cohortSize: number;
  retentionData: { [key: string]: number }; // day/week -> retention %
}

export interface CohortConfig {
  activationEvent: string;
  returnEvent: string;
  dateRange: [string, string];
  cohortPeriod: 'daily' | 'weekly' | 'monthly';
  retentionWindow: number; // number of periods to show
  segmentProperty?: string;
  segmentValue?: string;
}

/**
 * Calculate cohort retention table
 */
export async function calculateCohortTable(
  config: CohortConfig
): Promise<CohortRow[]> {
  const {
    activationEvent,
    returnEvent,
    dateRange,
    cohortPeriod,
    retentionWindow,
    segmentProperty,
    segmentValue,
  } = config;

  const [startDate, endDate] = dateRange;

  // Build cohort grouping based on period
  let cohortGrouping = '';
  let periodDiff = '';

  switch (cohortPeriod) {
    case 'daily':
      cohortGrouping = 'toDate(activation_date)';
      periodDiff = 'dateDiff(\'day\', cohort_date, return_date)';
      break;
    case 'weekly':
      cohortGrouping = 'toMonday(activation_date)';
      periodDiff = 'dateDiff(\'week\', cohort_date, return_date)';
      break;
    case 'monthly':
      cohortGrouping = 'toStartOfMonth(activation_date)';
      periodDiff = 'dateDiff(\'month\', cohort_date, return_date)';
      break;
  }

  // Build segment filter
  let segmentFilter = '';
  if (segmentProperty && segmentValue) {
    const escapedValue = segmentValue.toLowerCase().replace(/'/g, "''");
    segmentFilter = `AND lower(\`${segmentProperty}\`) = '${escapedValue}'`;
  }

  // Get schema-agnostic references
  const table = schemaAdapter.getTable();
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const userIdentifier = schemaAdapter.getUserIdentifier();

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

    -- Step 1: Get cohort assignments (first time user performed activation event)
    cohort_users AS (
      SELECT
        user_identifier,
        min(event_date) as activation_date
      FROM base_events
      WHERE event_name = '${activationEvent}'
      GROUP BY user_identifier
    ),

    -- Step 2: Assign cohort period to each user
    cohorts AS (
      SELECT
        user_identifier,
        activation_date,
        ${cohortGrouping} as cohort_date
      FROM cohort_users
    ),

    -- Step 3: Get all return events for cohort users
    return_events AS (
      SELECT
        c.user_identifier,
        c.cohort_date,
        e.event_date as return_date
      FROM cohorts c
      INNER JOIN base_events e
        ON e.user_identifier = c.user_identifier
      WHERE e.event_name = '${returnEvent}'
        AND e.event_date >= c.cohort_date
    ),

    -- Step 4: Calculate retention by period
    retention_by_period AS (
      SELECT
        cohort_date,
        ${periodDiff} as period_num,
        uniq(user_identifier) as retained_users
      FROM return_events
      WHERE period_num >= 0 AND period_num <= ${retentionWindow}
      GROUP BY cohort_date, period_num
    ),

    -- Step 5: Get cohort sizes (period 0)
    cohort_sizes AS (
      SELECT
        cohort_date,
        count(DISTINCT user_identifier) as cohort_size
      FROM cohorts
      GROUP BY cohort_date
    )

    -- Step 6: Join and calculate retention percentages
    SELECT
      cs.cohort_date,
      cs.cohort_size,
      rbp.period_num,
      rbp.retained_users,
      round((rbp.retained_users / cs.cohort_size) * 100, 2) as retention_pct
    FROM cohort_sizes cs
    LEFT JOIN retention_by_period rbp
      ON cs.cohort_date = rbp.cohort_date
    WHERE rbp.period_num IS NOT NULL
    ORDER BY cs.cohort_date DESC, rbp.period_num ASC
  `;

  try {
    const result = await queryClickHouse(query);

    // Transform flat results into cohort rows
    const data = result.data || [];
    const cohortMap = new Map<string, CohortRow>();

    data.forEach((row: any) => {
      const cohortDate = row.cohort_date;

      if (!cohortMap.has(cohortDate)) {
        cohortMap.set(cohortDate, {
          cohortDate,
          cohortSize: parseInt(row.cohort_size, 10),
          retentionData: {},
        });
      }

      const cohort = cohortMap.get(cohortDate)!;
      const periodKey = `period_${row.period_num}`;
      cohort.retentionData[periodKey] = parseFloat(row.retention_pct);
    });

    return Array.from(cohortMap.values());
  } catch (error: any) {
    console.error('Cohort calculation error:', error);
    throw new Error(
      error.response?.data?.exception || 'Failed to calculate cohort data'
    );
  }
}

/**
 * Export cohort table to CSV
 */
export function exportCohortToCSV(
  cohortData: CohortRow[],
  retentionWindow: number,
  cohortPeriod: string
): void {
  if (cohortData.length === 0) {
    throw new Error('No cohort data to export');
  }

  // Build CSV header
  const periodLabel = cohortPeriod === 'daily' ? 'Day' :
                      cohortPeriod === 'weekly' ? 'Week' : 'Month';

  let csvContent = `Cohort Date,Size,${periodLabel} 0`;
  for (let i = 1; i <= retentionWindow; i++) {
    csvContent += `,${periodLabel} ${i}`;
  }
  csvContent += '\n';

  // Build CSV rows
  cohortData.forEach((cohort) => {
    let row = `${cohort.cohortDate},${cohort.cohortSize}`;

    for (let i = 0; i <= retentionWindow; i++) {
      const periodKey = `period_${i}`;
      const value = cohort.retentionData[periodKey];
      row += `,${value !== undefined ? value.toFixed(2) + '%' : 'N/A'}`;
    }

    csvContent += row + '\n';
  });

  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `cohort_analysis_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
