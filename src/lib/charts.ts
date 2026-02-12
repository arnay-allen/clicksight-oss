/**
 * Charts & Dashboards Library
 * Handles all CRUD operations for saved charts, dashboards, and sharing
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import config from './config';

const CLICKHOUSE_URL = config.CLICKHOUSE_URL;
const CLICKHOUSE_USER = config.CLICKHOUSE_USER;
const CLICKHOUSE_PASSWORD = config.CLICKHOUSE_PASSWORD;

// ============================================================================
// Interfaces
// ============================================================================

export interface SavedChart {
  id: string;
  name: string;
  description: string;
  chart_type: string;
  chart_category: string;
  config: string; // JSON string
  created_by: string;
  created_by_name?: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
  permission?: string; // Only present for shared charts: 'view' | 'edit'
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  layout: string; // JSON string
  created_by: string;
  created_by_name?: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
}

export interface DashboardChart {
  id: string;
  dashboard_id: string;
  chart_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  is_deleted: number;
}

export interface ChartShare {
  id: string;
  chart_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  permission: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
}

export interface DashboardShare {
  id: string;
  dashboard_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  permission: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function queryClickHouse(query: string): Promise<any> {
  try {
    const response = await axios.post(CLICKHOUSE_URL, query, {
      auth: {
        username: CLICKHOUSE_USER,
        password: CLICKHOUSE_PASSWORD,
      },
      params: {
        default_format: 'JSON',
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('ClickHouse query error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.exception || error.message);
  }
}

// ============================================================================
// SAVED CHARTS OPERATIONS
// ============================================================================

/**
 * Save a new chart
 */
export async function saveChart(
  name: string,
  description: string,
  chartType: string,
  chartCategory: string, // 'insights' or 'funnels'
  config: object,
  userId: string
): Promise<string> {
  const chartId = uuidv4();
  const escapedName = name.replace(/'/g, "''");
  const escapedDescription = description.replace(/'/g, "''");
  const escapedConfig = JSON.stringify(config).replace(/'/g, "''");

  const query = `
    INSERT INTO clicksight.saved_charts 
    (id, name, description, chart_type, chart_category, config, created_by, created_at, updated_at, is_deleted)
    VALUES (
      '${chartId}',
      '${escapedName}',
      '${escapedDescription}',
      '${chartType}',
      '${chartCategory}',
      '${escapedConfig}',
      '${userId}',
      now(),
      now(),
      0
    )
  `;

  await queryClickHouse(query);
  return chartId;
}

/**
 * Get all charts created by a user
 */
export async function getUserCharts(userId: string): Promise<SavedChart[]> {
  const query = `
    SELECT 
      c.id AS id, 
      c.name AS name, 
      c.description AS description, 
      c.chart_type AS chart_type, 
      c.chart_category AS chart_category, 
      c.config AS config, 
      c.created_by AS created_by, 
      c.created_at AS created_at, 
      c.updated_at AS updated_at, 
      c.is_deleted AS is_deleted,
      u.name AS created_by_name, 
      u.email AS created_by_email
    FROM clicksight.saved_charts c
    LEFT JOIN clicksight.users u ON c.created_by = u.id
    WHERE c.created_by = '${userId}' AND c.is_deleted = 0
    ORDER BY c.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get a single chart by ID
 */
export async function getSavedChartById(chartId: string): Promise<SavedChart | null> {
  const query = `
    SELECT id, name, description, chart_type, chart_category, config, created_by, created_at, updated_at, is_deleted
    FROM clicksight.saved_charts
    WHERE id = '${chartId}' AND is_deleted = 0
    LIMIT 1
  `;

  const result = await queryClickHouse(query);
  return result.data?.[0] || null;
}

/**
 * Get charts shared with a user
 */
export async function getSharedCharts(userId: string): Promise<SavedChart[]> {
  const query = `
    SELECT 
      c.id AS id, 
      c.name AS name, 
      c.description AS description, 
      c.chart_type AS chart_type, 
      c.chart_category AS chart_category, 
      c.config AS config, 
      c.created_by AS created_by, 
      c.created_at AS created_at, 
      c.updated_at AS updated_at, 
      c.is_deleted AS is_deleted,
      u.name AS created_by_name, 
      u.email AS created_by_email,
      s.permission AS permission
    FROM clicksight.saved_charts c
    INNER JOIN clicksight.chart_shares s ON c.id = s.chart_id
    LEFT JOIN clicksight.users u ON c.created_by = u.id
    WHERE s.shared_with_user_id = '${userId}' AND c.is_deleted = 0 AND s.is_deleted = 0
    ORDER BY c.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get a single chart by ID
 */
export async function getChartById(chartId: string): Promise<SavedChart | null> {
  const query = `
    SELECT id, name, description, chart_type, chart_category, config, created_by, created_at, updated_at, is_deleted
    FROM clicksight.saved_charts
    WHERE id = '${chartId}' AND is_deleted = 0
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const result = await queryClickHouse(query);
  if (result.data && result.data.length > 0) {
    return result.data[0];
  }
  return null;
}

/**
 * Update an existing chart
 * Uses ALTER UPDATE to modify name, description, chart_type, config, and updated_at
 */
export async function updateChart(
  chartId: string,
  updates: {
    name?: string;
    description?: string;
    chart_type?: string;
    config?: object;
  }
): Promise<void> {
  const setClauses: string[] = [];

  if (updates.name !== undefined) {
    const escapedName = updates.name.replace(/'/g, "''");
    setClauses.push(`name = '${escapedName}'`);
  }

  if (updates.description !== undefined) {
    const escapedDescription = updates.description.replace(/'/g, "''");
    setClauses.push(`description = '${escapedDescription}'`);
  }

  if (updates.chart_type !== undefined) {
    setClauses.push(`chart_type = '${updates.chart_type}'`);
  }

  if (updates.config !== undefined) {
    const escapedConfig = JSON.stringify(updates.config).replace(/'/g, "''");
    setClauses.push(`config = '${escapedConfig}'`);
  }

  // Always update the updated_at timestamp
  setClauses.push('updated_at = now()');

  const query = `
    ALTER TABLE clicksight.saved_charts
    UPDATE ${setClauses.join(', ')}
    WHERE id = '${chartId}'
  `;

  await queryClickHouse(query);
}

/**
 * Soft delete a chart
 */
export async function deleteChart(chartId: string): Promise<void> {
  const query = `
    ALTER TABLE clicksight.saved_charts
    UPDATE is_deleted = 1, updated_at = now()
    WHERE id = '${chartId}'
  `;

  await queryClickHouse(query);
}

// ============================================================================
// CHART SHARING OPERATIONS
// ============================================================================

/**
 * Share a chart with multiple users
 */
export async function shareChart(
  chartId: string,
  userIds: string[],
  permission: 'view' | 'edit',
  sharedByUserId: string
): Promise<void> {
  const values = userIds.map((userId) => {
    const shareId = uuidv4();
    return `('${shareId}', '${chartId}', '${userId}', '${sharedByUserId}', '${permission}', now(), now(), 0)`;
  });

  const query = `
    INSERT INTO clicksight.chart_shares 
    (id, chart_id, shared_with_user_id, shared_by_user_id, permission, created_at, updated_at, is_deleted)
    VALUES ${values.join(', ')}
  `;

  await queryClickHouse(query);
}

/**
 * Get all users a chart is shared with
 */
export async function getChartShares(chartId: string): Promise<any[]> {
  const query = `
    SELECT 
      u.id as id,
      u.email as email, 
      u.name as name, 
      u.avatar_url as avatar_url, 
      s.permission as permission,
      s.shared_by_user_id as shared_by_user_id,
      s.shared_with_user_id as user_id
    FROM clicksight.chart_shares s
    INNER JOIN clicksight.users u ON s.shared_with_user_id = u.id
    WHERE s.chart_id = '${chartId}' AND s.is_deleted = 0 AND u.status = 'active'
    ORDER BY u.name
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Revoke chart share for a user
 */
export async function revokeChartShare(chartId: string, userId: string): Promise<void> {
  if (!chartId || !userId) {
    console.error('revokeChartShare called with missing parameters:', { chartId, userId });
    throw new Error('Chart ID and User ID are required to revoke access');
  }

  const query = `
    ALTER TABLE clicksight.chart_shares
    UPDATE is_deleted = 1, updated_at = now()
    WHERE chart_id = '${chartId}' AND shared_with_user_id = '${userId}'
  `;

  await queryClickHouse(query);
}

// ============================================================================
// DASHBOARD OPERATIONS
// ============================================================================

/**
 * Create a new dashboard
 */
export async function createDashboard(
  name: string,
  description: string,
  userId: string
): Promise<string> {
  const dashboardId = uuidv4();
  const escapedName = name.replace(/'/g, "''");
  const escapedDescription = description.replace(/'/g, "''");

  const query = `
    INSERT INTO clicksight.dashboards 
    (id, name, description, layout, created_by, created_at, updated_at, is_deleted)
    VALUES (
      '${dashboardId}',
      '${escapedName}',
      '${escapedDescription}',
      '{}',
      '${userId}',
      now(),
      now(),
      0
    )
  `;

  await queryClickHouse(query);
  return dashboardId;
}

/**
 * Get all dashboards created by a user
 */
export async function getUserDashboards(userId: string): Promise<Dashboard[]> {
  const query = `
    SELECT 
      d.id, d.name, d.description, d.layout, 
      d.created_by, d.created_at, d.updated_at, d.is_deleted,
      u.name as created_by_name, u.email as created_by_email
    FROM clicksight.dashboards d
    LEFT JOIN clicksight.users u ON d.created_by = u.id
    WHERE d.created_by = '${userId}' AND d.is_deleted = 0
    ORDER BY d.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get dashboards shared with a user
 */
export async function getSharedDashboards(userId: string): Promise<Dashboard[]> {
  const query = `
    SELECT 
      d.id, d.name, d.description, d.layout, 
      d.created_by, d.created_at, d.updated_at, d.is_deleted,
      u.name as created_by_name, u.email as created_by_email
    FROM clicksight.dashboards d
    INNER JOIN clicksight.dashboard_shares s ON d.id = s.dashboard_id
    LEFT JOIN clicksight.users u ON d.created_by = u.id
    WHERE s.shared_with_user_id = '${userId}' AND d.is_deleted = 0 AND s.is_deleted = 0
    ORDER BY d.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get a single dashboard by ID
 */
export async function getDashboardById(dashboardId: string): Promise<Dashboard | null> {
  const query = `
    SELECT id, name, description, layout, created_by, created_at, updated_at, is_deleted
    FROM clicksight.dashboards
    WHERE id = '${dashboardId}' AND is_deleted = 0
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const result = await queryClickHouse(query);
  if (result.data && result.data.length > 0) {
    return result.data[0];
  }
  return null;
}

/**
 * Update dashboard
 */
export async function updateDashboard(
  dashboardId: string,
  updates: {
    name?: string;
    description?: string;
    layout?: object;
  }
): Promise<void> {
  const setClauses: string[] = [];

  if (updates.name !== undefined) {
    const escapedName = updates.name.replace(/'/g, "''");
    setClauses.push(`name = '${escapedName}'`);
  }

  if (updates.description !== undefined) {
    const escapedDescription = updates.description.replace(/'/g, "''");
    setClauses.push(`description = '${escapedDescription}'`);
  }

  if (updates.layout !== undefined) {
    const escapedLayout = JSON.stringify(updates.layout).replace(/'/g, "''");
    setClauses.push(`layout = '${escapedLayout}'`);
  }

  // Always update the updated_at timestamp
  setClauses.push('updated_at = now()');

  const query = `
    ALTER TABLE clicksight.dashboards
    UPDATE ${setClauses.join(', ')}
    WHERE id = '${dashboardId}'
  `;

  await queryClickHouse(query);
}

/**
 * Soft delete a dashboard
 */
export async function deleteDashboard(dashboardId: string): Promise<void> {
  const query = `
    ALTER TABLE clicksight.dashboards
    UPDATE is_deleted = 1, updated_at = now()
    WHERE id = '${dashboardId}'
  `;

  await queryClickHouse(query);
}

// ============================================================================
// DASHBOARD CHARTS OPERATIONS
// ============================================================================

/**
 * Add a chart to a dashboard
 */
export async function addChartToDashboard(
  dashboardId: string,
  chartId: string,
  position: { x: number; y: number; w: number; h: number }
): Promise<void> {
  const relationId = uuidv4();

  const query = `
    INSERT INTO clicksight.dashboard_charts 
    (id, dashboard_id, chart_id, position_x, position_y, width, height, created_at, updated_at, is_deleted)
    VALUES (
      '${relationId}',
      '${dashboardId}',
      '${chartId}',
      ${position.x},
      ${position.y},
      ${position.w},
      ${position.h},
      now(),
      now(),
      0
    )
  `;

  await queryClickHouse(query);
}

/**
 * Get all charts in a dashboard
 */
export async function getDashboardCharts(dashboardId: string): Promise<any[]> {
  const query = `
    SELECT 
      c.id,
      c.name,
      c.description,
      c.chart_type,
      c.chart_category,
      c.config,
      dc.position_x,
      dc.position_y,
      dc.width,
      dc.height
    FROM clicksight.dashboard_charts dc
    INNER JOIN clicksight.saved_charts c ON dc.chart_id = c.id
    WHERE dc.dashboard_id = '${dashboardId}' AND dc.is_deleted = 0 AND c.is_deleted = 0
    ORDER BY dc.position_y, dc.position_x
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Update chart position in dashboard
 */
export async function updateChartPosition(
  dashboardId: string,
  chartId: string,
  position: { x: number; y: number; w: number; h: number }
): Promise<void> {
  const query = `
    ALTER TABLE clicksight.dashboard_charts
    UPDATE 
      position_x = ${position.x},
      position_y = ${position.y},
      width = ${position.w},
      height = ${position.h},
      updated_at = now()
    WHERE dashboard_id = '${dashboardId}' AND chart_id = '${chartId}'
  `;

  await queryClickHouse(query);
}

/**
 * Remove a chart from a dashboard
 */
export async function removeChartFromDashboard(
  dashboardId: string,
  chartId: string
): Promise<void> {
  const query = `
    ALTER TABLE clicksight.dashboard_charts
    UPDATE is_deleted = 1, updated_at = now()
    WHERE dashboard_id = '${dashboardId}' AND chart_id = '${chartId}'
  `;

  await queryClickHouse(query);
}

// ============================================================================
// DASHBOARD SHARING OPERATIONS
// ============================================================================

/**
 * Share a dashboard with multiple users
 */
export async function shareDashboard(
  dashboardId: string,
  userIds: string[],
  permission: 'view' | 'edit',
  sharedByUserId: string
): Promise<void> {
  const values = userIds.map((userId) => {
    const shareId = uuidv4();
    return `('${shareId}', '${dashboardId}', '${userId}', '${sharedByUserId}', '${permission}', now(), now(), 0)`;
  });

  const query = `
    INSERT INTO clicksight.dashboard_shares 
    (id, dashboard_id, shared_with_user_id, shared_by_user_id, permission, created_at, updated_at, is_deleted)
    VALUES ${values.join(', ')}
  `;

  await queryClickHouse(query);
}

/**
 * Get all users a dashboard is shared with
 */
export async function getDashboardShares(dashboardId: string): Promise<any[]> {
  const query = `
    SELECT 
      u.id, 
      u.email, 
      u.name, 
      u.avatar_url, 
      s.permission,
      s.shared_by_user_id
    FROM clicksight.dashboard_shares s
    INNER JOIN clicksight.users u ON s.shared_with_user_id = u.id
    WHERE s.dashboard_id = '${dashboardId}' AND s.is_deleted = 0 AND u.status = 'active'
    ORDER BY u.name
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Revoke dashboard share for a user
 */
export async function revokeDashboardShare(
  dashboardId: string,
  userId: string
): Promise<void> {
  const query = `
    ALTER TABLE clicksight.dashboard_shares
    UPDATE is_deleted = 1, updated_at = now()
    WHERE dashboard_id = '${dashboardId}' AND shared_with_user_id = '${userId}'
  `;

  await queryClickHouse(query);
}

