/**
 * Audit Logger for SQL Playground
 * Logs all query executions to clicksight.sql_playground_audit table
 */

import axios from 'axios';
import { CustomQueryResult } from './clickhouse';

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

interface AuditLogEntry {
  userId: string;
  userEmail: string;
  userName: string;
  queryText: string;
  sanitizedQuery: string;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  errorMessage?: string;
  errorCode?: number;
  errorType?: string;
  result?: CustomQueryResult;
  maxRowsLimit: number;
  timeoutSeconds: number;
  clientIp?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * Calculate MD5 hash of a string (for query_hash)
 */
function md5Hash(str: string): string {
  // Simple hash function for query deduplication
  // In production, you might want to use a proper MD5 library
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Log a query execution to the audit table
 */
export async function logQueryExecution(entry: AuditLogEntry): Promise<void> {
  try {
    const queryHash = md5Hash(entry.queryText.trim().toLowerCase());
    const now = new Date().toISOString();

    // Extract statistics from result if available
    const stats = entry.result?.statistics;
    const metadata = entry.result;

    // Build INSERT query
    const insertQuery = `
      INSERT INTO clicksight.sql_playground_audit (
        user_id,
        user_email,
        user_name,
        query_text,
        query_hash,
        sanitized_query,
        status,
        error_message,
        error_code,
        error_type,
        rows_returned,
        columns_count,
        result_size_bytes,
        execution_time_ms,
        elapsed_time_ms,
        rows_read,
        bytes_read,
        rows_written,
        bytes_written,
        peak_memory_usage,
        memory_usage,
        read_compressed_bytes,
        read_uncompressed_bytes,
        cpu_time_microseconds,
        max_rows_limit,
        timeout_seconds,
        client_ip,
        user_agent,
        session_id,
        executed_at,
        created_at
      ) VALUES (
        '${escapeString(entry.userId)}',
        '${escapeString(entry.userEmail)}',
        '${escapeString(entry.userName)}',
        '${escapeString(entry.queryText)}',
        '${queryHash}',
        '${escapeString(entry.sanitizedQuery)}',
        '${entry.status}',
        ${entry.errorMessage ? `'${escapeString(entry.errorMessage)}'` : 'NULL'},
        ${entry.errorCode || 'NULL'},
        ${entry.errorType ? `'${escapeString(entry.errorType)}'` : 'NULL'},
        ${metadata?.rows || 0},
        ${metadata?.columns?.length || 0},
        ${estimateResultSize(metadata)},
        ${stats?.elapsed || 0},
        ${stats?.elapsed || 0},
        ${stats?.rows_read || 0},
        ${stats?.bytes_read || 0},
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        ${entry.maxRowsLimit},
        ${entry.timeoutSeconds},
        ${entry.clientIp ? `'${escapeString(entry.clientIp)}'` : 'NULL'},
        ${entry.userAgent ? `'${escapeString(entry.userAgent)}'` : 'NULL'},
        ${entry.sessionId ? `'${escapeString(entry.sessionId)}'` : 'NULL'},
        '${now}',
        '${now}'
      )
    `;

    // Execute the insert (fire and forget - don't block the UI)
    await axios.post(
      `${CLICKHOUSE_URL}/?database=clicksight`,
      insertQuery,
      {
        auth: CLICKHOUSE_USER && CLICKHOUSE_PASSWORD ? {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        } : undefined,
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: 5000, // 5 second timeout for audit logging
      }
    );
  } catch (error) {
    // Silently fail - don't disrupt user experience if audit logging fails
    console.error('Failed to log query execution:', error);
  }
}

/**
 * Escape single quotes in SQL strings
 */
function escapeString(str: string): string {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

/**
 * Estimate result size in bytes
 */
function estimateResultSize(result?: CustomQueryResult): number {
  if (!result || !result.data) return 0;

  try {
    // Rough estimate: JSON stringified size
    const jsonString = JSON.stringify(result.data);
    return jsonString.length;
  } catch {
    return 0;
  }
}

/**
 * Extract error details from ClickHouse error
 */
export function parseClickHouseError(errorMessage: string): {
  code?: number;
  type?: string;
  message: string;
} {
  // Example: "Code: 158. DB::Exception: ..."
  const codeMatch = errorMessage.match(/Code:\s*(\d+)/);
  const typeMatch = errorMessage.match(/DB::Exception:\s*([^.]+)/);

  return {
    code: codeMatch ? parseInt(codeMatch[1]) : undefined,
    type: typeMatch ? typeMatch[1].split(':')[0].trim() : undefined,
    message: errorMessage,
  };
}
