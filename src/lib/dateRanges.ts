import dayjs, { Dayjs } from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

// Extend dayjs with quarter support
dayjs.extend(quarterOfYear);

/**
 * Date Range Types
 * - Relative: Updates dynamically based on current date
 * - Custom: Fixed absolute date range
 */
export type DateRangeType =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'last_60_days'
  | 'last_90_days'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'custom';

export interface DateRangeConfig {
  type: DateRangeType;
  // Only used for 'custom' type
  customStart?: string;  // ISO date string
  customEnd?: string;    // ISO date string
}

/**
 * Date Range Option for UI Dropdown
 */
export interface DateRangeOption {
  value: DateRangeType;
  label: string;
  description?: string;
}

/**
 * Available date range options for dropdown
 */
export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'today', label: 'Today', description: 'Today only' },
  { value: 'yesterday', label: 'Yesterday', description: 'Yesterday only' },
  { value: 'last_7_days', label: 'Last 7 days', description: 'Including today' },
  { value: 'last_14_days', label: 'Last 14 days', description: 'Including today' },
  { value: 'last_30_days', label: 'Last 30 days', description: 'Including today' },
  { value: 'last_60_days', label: 'Last 60 days', description: 'Including today' },
  { value: 'last_90_days', label: 'Last 90 days', description: 'Including today' },
  { value: 'this_week', label: 'This week', description: 'Monday - Today' },
  { value: 'last_week', label: 'Last week', description: 'Last Monday - Sunday' },
  { value: 'this_month', label: 'This month', description: 'Month start - Today' },
  { value: 'last_month', label: 'Last month', description: 'Previous month' },
  { value: 'this_quarter', label: 'This quarter', description: 'Quarter start - Today' },
  { value: 'last_quarter', label: 'Last quarter', description: 'Previous quarter' },
  { value: 'custom', label: 'Custom range', description: 'Pick specific dates' },
];

/**
 * Convert relative date range to absolute dates
 */
export function getAbsoluteDateRange(config: DateRangeConfig): [Dayjs, Dayjs] {
  const now = dayjs();

  switch (config.type) {
    case 'today':
      return [now.startOf('day'), now.endOf('day')];

    case 'yesterday':
      return [
        now.subtract(1, 'day').startOf('day'),
        now.subtract(1, 'day').endOf('day'),
      ];

    case 'last_7_days':
      return [now.subtract(6, 'days').startOf('day'), now.endOf('day')];

    case 'last_14_days':
      return [now.subtract(13, 'days').startOf('day'), now.endOf('day')];

    case 'last_30_days':
      return [now.subtract(29, 'days').startOf('day'), now.endOf('day')];

    case 'last_60_days':
      return [now.subtract(59, 'days').startOf('day'), now.endOf('day')];

    case 'last_90_days':
      return [now.subtract(89, 'days').startOf('day'), now.endOf('day')];

    case 'this_week':
      return [now.startOf('week'), now.endOf('day')];

    case 'last_week':
      return [
        now.subtract(1, 'week').startOf('week'),
        now.subtract(1, 'week').endOf('week'),
      ];

    case 'this_month':
      return [now.startOf('month'), now.endOf('day')];

    case 'last_month':
      return [
        now.subtract(1, 'month').startOf('month'),
        now.subtract(1, 'month').endOf('month'),
      ];

    case 'this_quarter':
      return [now.startOf('quarter'), now.endOf('day')];

    case 'last_quarter':
      return [
        now.subtract(1, 'quarter').startOf('quarter'),
        now.subtract(1, 'quarter').endOf('quarter'),
      ];

    case 'custom':
      if (!config.customStart || !config.customEnd) {
        // Fallback to last 7 days if custom dates not provided
        return [now.subtract(6, 'days').startOf('day'), now.endOf('day')];
      }
      return [dayjs(config.customStart), dayjs(config.customEnd)];

    default:
      // Default to last 7 days
      return [now.subtract(6, 'days').startOf('day'), now.endOf('day')];
  }
}

/**
 * Convert absolute dates to date range config
 * Attempts to detect if dates match a relative range pattern
 */
export function detectDateRangeType(
  startDate: Dayjs,
  endDate: Dayjs
): DateRangeConfig {
  const now = dayjs();

  // Check if it's today
  if (
    startDate.isSame(now.startOf('day'), 'day') &&
    endDate.isSame(now.endOf('day'), 'day')
  ) {
    return { type: 'today' };
  }

  // Check if it's yesterday
  const yesterday = now.subtract(1, 'day');
  if (
    startDate.isSame(yesterday.startOf('day'), 'day') &&
    endDate.isSame(yesterday.endOf('day'), 'day')
  ) {
    return { type: 'yesterday' };
  }

  // Check if end date is today (for "last N days" patterns)
  if (endDate.isSame(now, 'day') || endDate.isAfter(now.startOf('day'))) {
    const daysDiff = now.diff(startDate, 'days');

    if (daysDiff === 6) return { type: 'last_7_days' };
    if (daysDiff === 13) return { type: 'last_14_days' };
    if (daysDiff === 29) return { type: 'last_30_days' };
    if (daysDiff === 59) return { type: 'last_60_days' };
    if (daysDiff === 89) return { type: 'last_90_days' };
  }

  // Check this week
  if (
    startDate.isSame(now.startOf('week'), 'day') &&
    endDate.isSame(now, 'day')
  ) {
    return { type: 'this_week' };
  }

  // Check last week
  const lastWeek = now.subtract(1, 'week');
  if (
    startDate.isSame(lastWeek.startOf('week'), 'day') &&
    endDate.isSame(lastWeek.endOf('week'), 'day')
  ) {
    return { type: 'last_week' };
  }

  // Check this month
  if (
    startDate.isSame(now.startOf('month'), 'day') &&
    endDate.isSame(now, 'day')
  ) {
    return { type: 'this_month' };
  }

  // Check last month
  const lastMonth = now.subtract(1, 'month');
  if (
    startDate.isSame(lastMonth.startOf('month'), 'day') &&
    endDate.isSame(lastMonth.endOf('month'), 'day')
  ) {
    return { type: 'last_month' };
  }

  // Default to custom range
  return {
    type: 'custom',
    customStart: startDate.format('YYYY-MM-DD'),
    customEnd: endDate.format('YYYY-MM-DD'),
  };
}

/**
 * Get human-readable label for date range config
 */
export function getDateRangeLabel(config: DateRangeConfig): string {
  const option = DATE_RANGE_OPTIONS.find((opt) => opt.value === config.type);

  if (config.type === 'custom' && config.customStart && config.customEnd) {
    return `${dayjs(config.customStart).format('MMM D, YYYY')} - ${dayjs(config.customEnd).format('MMM D, YYYY')}`;
  }

  return option?.label || 'Custom range';
}

/**
 * Serialize date range config for storage
 */
export function serializeDateRange(config: DateRangeConfig): string {
  return JSON.stringify(config);
}

/**
 * Deserialize date range config from storage
 */
export function deserializeDateRange(json: string): DateRangeConfig {
  try {
    return JSON.parse(json);
  } catch {
    // Fallback to last 7 days
    return { type: 'last_7_days' };
  }
}
