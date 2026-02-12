import { queryClickHouse } from './clickhouse';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
  permission?: string; // Only present for shared dashboards: 'view' | 'edit'
}

export interface DashboardChart {
  dashboard_id: string;
  chart_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  is_deleted: number;
}

export interface DashboardShare {
  dashboard_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  permission: 'view' | 'edit';
  created_at: string;
  updated_at: string;
  is_deleted: number;
}

// ============================================================================
// DASHBOARD CRUD OPERATIONS
// ============================================================================

/**
 * Create a new dashboard
 */
export async function createDashboard(
  name: string,
  description: string,
  userId: string
): Promise<string> {
  const dashboardId = crypto.randomUUID();
  const escapedName = name.replace(/'/g, "''");
  const escapedDescription = description.replace(/'/g, "''");

  const query = `
    INSERT INTO clicksight.dashboards (id, name, description, layout, created_by, created_at, updated_at, is_deleted)
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
 * Get dashboards created by user
 */
export async function getUserDashboards(userId: string): Promise<Dashboard[]> {
  const query = `
    SELECT
      d.id AS id,
      d.name AS name,
      d.description AS description,
      d.layout AS layout,
      d.created_by AS created_by,
      d.created_at AS created_at,
      d.updated_at AS updated_at,
      d.is_deleted AS is_deleted,
      u.name AS created_by_name,
      u.email AS created_by_email
    FROM clicksight.dashboards d
    LEFT JOIN clicksight.users u ON d.created_by = u.id
    WHERE d.created_by = '${userId}' AND d.is_deleted = 0
    ORDER BY d.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get dashboards shared with user
 */
export async function getSharedDashboards(userId: string): Promise<Dashboard[]> {
  const query = `
    SELECT
      d.id AS id,
      d.name AS name,
      d.description AS description,
      d.layout AS layout,
      d.created_by AS created_by,
      d.created_at AS created_at,
      d.updated_at AS updated_at,
      d.is_deleted AS is_deleted,
      u.name AS created_by_name,
      u.email AS created_by_email,
      s.permission AS permission
    FROM clicksight.dashboards d
    INNER JOIN clicksight.dashboard_shares s ON d.id = s.dashboard_id
    LEFT JOIN clicksight.users u ON d.created_by = u.id
    WHERE s.shared_with_user_id = '${userId}'
      AND s.is_deleted = 0
      AND d.is_deleted = 0
    ORDER BY d.updated_at DESC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get dashboard by ID
 */
export async function getDashboardById(dashboardId: string): Promise<Dashboard | null> {
  const query = `
    SELECT *
    FROM clicksight.dashboards
    WHERE id = '${dashboardId}' AND is_deleted = 0
    LIMIT 1
  `;

  const result = await queryClickHouse(query);
  return result.data?.[0] || null;
}

/**
 * Update dashboard
 */
export async function updateDashboard(
  dashboardId: string,
  name?: string,
  description?: string,
  layout?: object
): Promise<void> {
  const setClauses: string[] = [];

  if (name !== undefined) {
    const escapedName = name.replace(/'/g, "''");
    setClauses.push(`name = '${escapedName}'`);
  }

  if (description !== undefined) {
    const escapedDescription = description.replace(/'/g, "''");
    setClauses.push(`description = '${escapedDescription}'`);
  }

  if (layout !== undefined) {
    const escapedLayout = JSON.stringify(layout).replace(/'/g, "''");
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
 * Add chart to dashboard
 */
export async function addChartToDashboard(
  dashboardId: string,
  chartId: string,
  position: { x: number; y: number; w: number; h: number }
): Promise<void> {
  const query = `
    INSERT INTO clicksight.dashboard_charts (
      dashboard_id, chart_id, position_x, position_y, width, height, created_at, is_deleted
    )
    VALUES (
      '${dashboardId}',
      '${chartId}',
      ${position.x},
      ${position.y},
      ${position.w},
      ${position.h},
      now(),
      0
    )
  `;

  await queryClickHouse(query);
}

/**
 * Get all charts in a dashboard
 */
export async function getDashboardCharts(dashboardId: string): Promise<DashboardChart[]> {
  const query = `
    SELECT *
    FROM clicksight.dashboard_charts
    WHERE dashboard_id = '${dashboardId}' AND is_deleted = 0
    ORDER BY created_at
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
      height = ${position.h}
    WHERE dashboard_id = '${dashboardId}' AND chart_id = '${chartId}'
  `;

  await queryClickHouse(query);
}

/**
 * Remove chart from dashboard
 */
export async function removeChartFromDashboard(
  dashboardId: string,
  chartId: string
): Promise<void> {
  const query = `
    ALTER TABLE clicksight.dashboard_charts
    UPDATE is_deleted = 1
    WHERE dashboard_id = '${dashboardId}' AND chart_id = '${chartId}'
  `;

  await queryClickHouse(query);
}

// ============================================================================
// DASHBOARD SHARING OPERATIONS
// ============================================================================

/**
 * Share dashboard with multiple users
 */
export async function shareDashboard(
  dashboardId: string,
  userIds: string[],
  permission: 'view' | 'edit',
  sharedBy: string
): Promise<void> {
  if (userIds.length === 0) return;

  const values = userIds
    .map(
      (userId) => `(
      '${dashboardId}',
      '${userId}',
      '${sharedBy}',
      '${permission}',
      now(),
      now(),
      0
    )`
    )
    .join(', ');

  const query = `
    INSERT INTO clicksight.dashboard_shares (
      dashboard_id, shared_with_user_id, shared_by_user_id, permission, created_at, updated_at, is_deleted
    )
    VALUES ${values}
  `;

  await queryClickHouse(query);
}

/**
 * Get dashboard shares with user details
 */
export async function getDashboardShares(dashboardId: string): Promise<any[]> {
  const query = `
    SELECT
      u.id as id,
      u.email as email,
      u.name as name,
      u.avatar_url as avatar_url,
      s.permission as permission,
      s.shared_by_user_id as shared_by_user_id,
      s.shared_with_user_id as user_id
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
export async function revokeDashboardShare(dashboardId: string, userId: string): Promise<void> {
  if (!dashboardId || !userId) {
    console.error('revokeDashboardShare called with missing parameters:', { dashboardId, userId });
    throw new Error('Dashboard ID and User ID are required to revoke access');
  }

  const query = `
    ALTER TABLE clicksight.dashboard_shares
    UPDATE is_deleted = 1, updated_at = now()
    WHERE dashboard_id = '${dashboardId}' AND shared_with_user_id = '${userId}'
  `;

  await queryClickHouse(query);
}
