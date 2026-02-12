/**
 * SQL Query Validator for ClickSight Playground
 * Ensures only safe SELECT queries are executed
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedQuery?: string;
}

/**
 * Validates that a SQL query is safe to execute
 * Only SELECT queries are allowed
 */
export function validateQuery(sql: string): ValidationResult {
  if (!sql || sql.trim().length === 0) {
    return {
      isValid: false,
      error: 'Query cannot be empty'
    };
  }

  const trimmedQuery = sql.trim();

  // Check query size (1MB limit)
  if (trimmedQuery.length > 1048576) {
    return {
      isValid: false,
      error: 'Query exceeds maximum size of 1MB'
    };
  }

  // Remove comments and normalize whitespace
  const normalized = removeComments(trimmedQuery)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Check for multiple statements (semicolons not at the end)
  const semicolonCount = (normalized.match(/;/g) || []).length;
  const endsWithSemicolon = normalized.endsWith(';');

  if (semicolonCount > 1 || (semicolonCount === 1 && !endsWithSemicolon)) {
    return {
      isValid: false,
      error: 'Multiple statements are not allowed. Only single SELECT queries are permitted.'
    };
  }

  // Check if query starts with SELECT
  if (!normalized.startsWith('select')) {
    return {
      isValid: false,
      error: 'Only SELECT queries are allowed. INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, and other modification statements are not permitted.'
    };
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'insert', 'update', 'delete', 'drop', 'alter', 'create',
    'truncate', 'replace', 'merge', 'grant', 'revoke',
    'execute', 'exec', 'call', 'system'
  ];

  for (const keyword of dangerousKeywords) {
    // Use word boundaries to avoid false positives (e.g., "inserted_at" column)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) {
      return {
        isValid: false,
        error: `Dangerous keyword '${keyword.toUpperCase()}' detected. Only SELECT queries are allowed.`
      };
    }
  }

  // Sanitize and return
  const sanitized = sanitizeQuery(trimmedQuery);

  return {
    isValid: true,
    sanitizedQuery: sanitized
  };
}

/**
 * Sanitizes a SQL query by removing comments and normalizing whitespace
 */
export function sanitizeQuery(sql: string): string {
  // Remove SQL comments
  let sanitized = removeComments(sql);

  // Normalize whitespace but preserve line breaks for readability
  sanitized = sanitized
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return sanitized;
}

/**
 * Removes SQL comments from a query
 */
function removeComments(sql: string): string {
  // Remove single-line comments (-- ...)
  let result = sql.replace(/--[^\n]*/g, '');

  // Remove multi-line comments (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  return result;
}

/**
 * Checks if a query is a valid SELECT query
 */
export function isValidSelectQuery(sql: string): boolean {
  const result = validateQuery(sql);
  return result.isValid;
}

/**
 * Gets example query templates
 */
export function getExampleQueries(): Array<{ name: string; description: string; query: string }> {
  return [
    {
      name: 'Daily Active Users',
      description: 'Count unique users per day for the last 30 days',
      query: `-- Daily Active Users (last 30 days)
SELECT
  ist_date,
  uniq(pixel_properties_user_id) as dau
FROM app_events
WHERE ist_date >= today() - 30
GROUP BY ist_date
ORDER BY ist_date;`
    },
    {
      name: 'Top Events',
      description: 'Top 10 events by count in the last 7 days',
      query: `-- Top 10 Events by Count
SELECT
  event_name,
  count(*) as count
FROM app_events
WHERE ist_date >= today() - 7
GROUP BY event_name
ORDER BY count DESC
LIMIT 10;`
    },
    {
      name: 'Hourly Distribution',
      description: 'Event distribution by hour for today',
      query: `-- Hourly Event Distribution (today)
SELECT
  toHour(server_timestamp) as hour,
  count(*) as events
FROM app_events
WHERE ist_date = today()
GROUP BY hour
ORDER BY hour;`
    },
    {
      name: 'Top Cities',
      description: 'Top 10 cities by unique users',
      query: `-- Top 10 Cities by Unique Users
SELECT
  JSONExtractString(pixel_properties, 'cf_city') as city,
  uniq(pixel_properties_user_id) as users
FROM app_events
WHERE ist_date >= today() - 7 AND city != ''
GROUP BY city
ORDER BY users DESC
LIMIT 10;`
    },
    {
      name: 'Event Properties',
      description: 'Explore all properties for a specific event',
      query: `-- Event Properties Explorer
SELECT
  event_name,
  count(*) as event_count,
  uniq(pixel_properties_user_id) as unique_users,
  groupUniqArray(10)(JSONExtractString(pixel_properties, 'cf_country')) as top_countries
FROM app_events
WHERE ist_date >= today() - 7
  AND event_name = 'app_open'
GROUP BY event_name;`
    },
    {
      name: 'User Journey',
      description: 'First 5 events for each user',
      query: `-- User Journey (first 5 events per user)
SELECT
  pixel_properties_user_id,
  groupArray(5)(event_name) as event_sequence,
  min(server_timestamp) as first_event_time
FROM app_events
WHERE ist_date >= today() - 1
  AND pixel_properties_user_id != ''
GROUP BY pixel_properties_user_id
LIMIT 100;`
    }
  ];
}
