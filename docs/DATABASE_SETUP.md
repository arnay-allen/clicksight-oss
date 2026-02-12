# ClickSight Database Setup

This document describes the ClickHouse tables required for ClickSight's operational features (authentication, saved charts, dashboards, and sharing).

---

## Prerequisites

- **ClickHouse** instance (local or cloud)
- **Database**: `clicksight` (create if not exists)
- **Permissions**: `SELECT`, `INSERT`, `ALTER UPDATE` on `clicksight.*`

---

## Quick Setup

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS clicksight;

-- Run all DDL statements below in order
```

---

## Table Schemas

### 1. Users Table

Stores user authentication and profile information (Google OAuth).

```sql
CREATE TABLE clicksight.users
(
    id UUID,
    email String,
    name String,
    avatar_url String DEFAULT '',
    google_id String,
    created_at DateTime DEFAULT now(),
    last_login DateTime DEFAULT now(),
    status String DEFAULT 'active'  -- 'active', 'inactive', 'deleted'
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;
```

**Key Points:**

- `created_at` is the version column (never changes after INSERT)
- `last_login` can be updated with `ALTER UPDATE`
- Soft delete via `status` field

**Example Insert:**

```sql
INSERT INTO clicksight.users
(id, email, name, avatar_url, google_id, created_at, last_login, status)
VALUES
(generateUUIDv4(), 'user@example.com', 'John Doe', 'https://...', 'google-id-123', now(), now(), 'active');
```

**Example Update (Last Login):**

```sql
ALTER TABLE clicksight.users
UPDATE last_login = now()
WHERE id = 'user-uuid-here';
```

---

### 2. Saved Charts Table

Stores saved chart configurations for reuse and sharing.

```sql
CREATE TABLE clicksight.saved_charts
(
    id UUID,
    name String,
    description String DEFAULT '',
    chart_type String,  -- 'line', 'bar', 'area', 'pie', 'funnel'
    chart_category String,  -- 'insights', 'funnels', 'retention', 'cohorts', 'paths'
    config String,  -- JSON: complete chart configuration
    created_by UUID,  -- Foreign key to users.id
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0  -- Soft delete flag (0 = active, 1 = deleted)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;
```

**Config JSON Examples:**

**Insights Chart:**

```json
{
  "dataSources": [
    {
      "table": "app_events",
      "events": ["page_loaded", "button_clicked"],
      "filters": [
        { "property": "$os", "operator": "equals", "value": "Android" }
      ],
      "filterLogic": "AND"
    }
  ],
  "dateRange": { "start": "2025-10-01", "end": "2025-10-14" },
  "granularity": "daily",
  "breakdownProperties": ["$os"],
  "metricType": "unique_users"
}
```

**Funnel Chart:**

```json
{
  "steps": [
    {
      "table": "app_events",
      "event": "page_loaded",
      "filters": []
    },
    {
      "table": "app_events",
      "event": "button_clicked",
      "filters": []
    }
  ],
  "dateRange": { "start": "2025-10-01", "end": "2025-10-14" },
  "timeWindow": 7,
  "breakdownProperties": []
}
```

---

### 3. Dashboards Table

Stores dashboard metadata and layout configuration.

```sql
CREATE TABLE clicksight.dashboards
(
    id UUID,
    name String,
    description String DEFAULT '',
    layout String DEFAULT '{}',  -- JSON: grid layout configuration
    created_by UUID,  -- Foreign key to users.id
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0  -- Soft delete flag (0 = active, 1 = deleted)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;
```

**Layout JSON Example:**

```json
{
  "lg": [
    { "i": "chart-uuid-1", "x": 0, "y": 0, "w": 6, "h": 4 },
    { "i": "chart-uuid-2", "x": 6, "y": 0, "w": 6, "h": 4 },
    { "i": "chart-uuid-3", "x": 0, "y": 4, "w": 12, "h": 4 }
  ]
}
```

---

### 4. Dashboard Charts Table

Many-to-many relationship between dashboards and charts.

```sql
CREATE TABLE clicksight.dashboard_charts
(
    id UUID,
    dashboard_id UUID,  -- Foreign key to dashboards.id
    chart_id UUID,      -- Foreign key to saved_charts.id
    position_x Int32 DEFAULT 0,
    position_y Int32 DEFAULT 0,
    width Int32 DEFAULT 6,
    height Int32 DEFAULT 4,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0  -- Soft delete flag (0 = active, 1 = deleted)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (dashboard_id, chart_id)
PRIMARY KEY (dashboard_id, chart_id);
```

---

### 5. Chart Shares Table

Manages chart sharing permissions between users.

```sql
CREATE TABLE clicksight.chart_shares
(
    id UUID,
    chart_id UUID,              -- Foreign key to saved_charts.id
    shared_with_user_id UUID,   -- Foreign key to users.id
    shared_by_user_id UUID,     -- Foreign key to users.id
    permission String DEFAULT 'view',  -- 'view' or 'edit'
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0  -- Soft delete flag (0 = active, 1 = deleted)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (chart_id, shared_with_user_id)
PRIMARY KEY (chart_id, shared_with_user_id);
```

---

### 6. Dashboard Shares Table

Manages dashboard sharing permissions between users.

```sql
CREATE TABLE clicksight.dashboard_shares
(
    id UUID,
    dashboard_id UUID,          -- Foreign key to dashboards.id
    shared_with_user_id UUID,   -- Foreign key to users.id
    shared_by_user_id UUID,     -- Foreign key to users.id
    permission String DEFAULT 'view',  -- 'view' or 'edit'
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0  -- Soft delete flag (0 = active, 1 = deleted)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (dashboard_id, shared_with_user_id)
PRIMARY KEY (dashboard_id, shared_with_user_id);
```

---

## Complete Setup Script

Run this script to create all tables at once:

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS clicksight;

-- 1. Users
CREATE TABLE clicksight.users
(
    id UUID,
    email String,
    name String,
    avatar_url String DEFAULT '',
    google_id String,
    created_at DateTime DEFAULT now(),
    last_login DateTime DEFAULT now(),
    status String DEFAULT 'active'
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;

-- 2. Saved Charts
CREATE TABLE clicksight.saved_charts
(
    id UUID,
    name String,
    description String DEFAULT '',
    chart_type String,
    chart_category String,
    config String,
    created_by UUID,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;

-- 3. Dashboards
CREATE TABLE clicksight.dashboards
(
    id UUID,
    name String,
    description String DEFAULT '',
    layout String DEFAULT '{}',
    created_by UUID,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id)
PRIMARY KEY id;

-- 4. Dashboard Charts
CREATE TABLE clicksight.dashboard_charts
(
    id UUID,
    dashboard_id UUID,
    chart_id UUID,
    position_x Int32 DEFAULT 0,
    position_y Int32 DEFAULT 0,
    width Int32 DEFAULT 6,
    height Int32 DEFAULT 4,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (dashboard_id, chart_id)
PRIMARY KEY (dashboard_id, chart_id);

-- 5. Chart Shares
CREATE TABLE clicksight.chart_shares
(
    id UUID,
    chart_id UUID,
    shared_with_user_id UUID,
    shared_by_user_id UUID,
    permission String DEFAULT 'view',
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (chart_id, shared_with_user_id)
PRIMARY KEY (chart_id, shared_with_user_id);

-- 6. Dashboard Shares
CREATE TABLE clicksight.dashboard_shares
(
    id UUID,
    dashboard_id UUID,
    shared_with_user_id UUID,
    shared_by_user_id UUID,
    permission String DEFAULT 'view',
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (dashboard_id, shared_with_user_id)
PRIMARY KEY (dashboard_id, shared_with_user_id);
```

---

## Verification

Check that all tables were created successfully:

```sql
SELECT name, engine, total_rows
FROM system.tables
WHERE database = 'clicksight'
  AND name IN (
    'users',
    'saved_charts',
    'dashboards',
    'dashboard_charts',
    'chart_shares',
    'dashboard_shares'
  )
ORDER BY name;
```

Expected output:

```
┌─name──────────────┬─engine─────────────────┬─total_rows─┐
│ chart_shares      │ ReplacingMergeTree     │          0 │
│ dashboard_charts  │ ReplacingMergeTree     │          0 │
│ dashboard_shares  │ ReplacingMergeTree     │          0 │
│ dashboards        │ ReplacingMergeTree     │          0 │
│ saved_charts      │ ReplacingMergeTree     │          0 │
│ users             │ ReplacingMergeTree     │          0 │
└───────────────────┴────────────────────────┴────────────┘
```

---

## Permissions

Grant necessary permissions to your ClickHouse user:

```sql
-- Replace 'your_clickhouse_user' with your actual username
GRANT SELECT, INSERT, ALTER UPDATE ON clicksight.* TO 'your_clickhouse_user';
```

---

## Important Notes

### ReplacingMergeTree Engine

All tables use `ReplacingMergeTree` for automatic deduplication:

- **Version Column**: `created_at` (never changes after INSERT)
- **Updatable Columns**: Any column NOT in `ORDER BY` and NOT the version column
- **Updates**: Use `ALTER TABLE ... UPDATE` syntax
- **Deletes**: Use soft delete (`is_deleted = 1`) instead of actual deletion

### Soft Deletes

All tables support soft deletion via `is_deleted` flag:

```sql
-- Soft delete a chart
ALTER TABLE clicksight.saved_charts
UPDATE is_deleted = 1, updated_at = now()
WHERE id = 'chart-uuid-here';

-- Query active charts only
SELECT * FROM clicksight.saved_charts
WHERE is_deleted = 0;
```

### UUID Generation

ClickHouse can generate UUIDs automatically:

```sql
INSERT INTO clicksight.users (id, email, name, ...)
VALUES (generateUUIDv4(), 'user@example.com', 'John Doe', ...);
```

---

## Troubleshooting

### Issue: "Table already exists"

If tables already exist, drop them first (⚠️ **WARNING: This deletes all data!**):

```sql
DROP TABLE IF EXISTS clicksight.users;
DROP TABLE IF EXISTS clicksight.saved_charts;
DROP TABLE IF EXISTS clicksight.dashboards;
DROP TABLE IF EXISTS clicksight.dashboard_charts;
DROP TABLE IF EXISTS clicksight.chart_shares;
DROP TABLE IF EXISTS clicksight.dashboard_shares;
```

### Issue: "Permission denied"

Ensure your ClickHouse user has the necessary permissions:

```sql
-- Check current permissions
SHOW GRANTS FOR 'your_clickhouse_user';

-- Grant if missing
GRANT SELECT, INSERT, ALTER UPDATE ON clicksight.* TO 'your_clickhouse_user';
```

### Issue: Updates not working

Remember: You can only update columns that are NOT in `ORDER BY` and NOT the version column:

**✅ Can Update:**

- `email`, `name`, `avatar_url`, `last_login`, `status` (users table)
- `name`, `description`, `config`, `updated_at`, `is_deleted` (saved_charts table)

**❌ Cannot Update:**

- `id` (in ORDER BY)
- `created_at` (version column)

---

## Next Steps

After setting up the database:

1. **Configure ClickSight**: Update `.env.local` with ClickHouse connection details
2. **Test Authentication**: Try logging in with Google OAuth
3. **Create a Chart**: Save your first chart to test the `saved_charts` table
4. **Create a Dashboard**: Build a dashboard to test the `dashboards` table
5. **Share**: Test sharing features to verify the `*_shares` tables

---

**Last Updated**: November 18, 2025
**Version**: 1.0
