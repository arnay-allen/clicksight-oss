# Schema Setup Guide

This guide explains how to configure ClickSight to work with your ClickHouse event table.

## Table of Contents

- [Overview](#overview)
- [Schema Configuration File](#schema-configuration-file)
- [Configuration Options](#configuration-options)
- [Property Types](#property-types)
- [User Identifier Strategies](#user-identifier-strategies)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

ClickSight is **schema-agnostic** - it works with any ClickHouse event table through a simple JSON configuration file (`schema.config.json`). This file tells ClickSight:

1. Where your data is (database and table)
2. How to map your columns to ClickSight's concepts
3. How to identify users
4. Where to find event properties

---

## Schema Configuration File

### Location

`schema.config.json` in the project root directory

### Basic Structure

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "your_database",
    "table": "your_events_table"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
      "timestamp": "timestamp",
      "date": "date",
      "user_id": "user_id",
      "device_id": "device_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "single",
      "column": "user_id"
    },
    "properties": {
      "type": "flat",
      "columns": ["property1", "property2", "..."]
    }
  }
}
```

---

## Configuration Options

### 1. ClickHouse Connection

```json
"clickhouse": {
  "database": "analytics",
  "table": "events"
}
```

- **database**: Your ClickHouse database name
- **table**: Your events table name (without database prefix)

### 2. Column Mapping

Map your actual column names to ClickSight's expected fields:

```json
"columns": {
  "event_name": "event_type",      // Your column → ClickSight field
  "timestamp": "event_time",        // Timestamp column
  "date": "event_date",             // Date column (for partitioning)
  "user_id": "customer_id",         // User ID column
  "device_id": "anonymous_id",      // Device/anonymous ID column
  "session_id": "session_uuid"      // Session ID column
}
```

**Required fields:**

- `event_name` - Name of the event (e.g., "page_view", "purchase")
- `timestamp` - Event timestamp (DateTime or DateTime64)
- `date` - Event date (Date type, used for partitioning)

**Optional fields:**

- `user_id` - Authenticated user identifier
- `device_id` - Anonymous/device identifier
- `session_id` - Session identifier

---

## Property Types

ClickSight supports two property storage patterns:

### Option 1: Flat Columns (Recommended)

Each property is a separate column in your table.

**Table Structure:**

```sql
CREATE TABLE events (
  event_name String,
  timestamp DateTime,
  date Date,
  user_id String,
  -- Properties as individual columns
  page_url String,
  product_id String,
  price Float64,
  category String
)
```

**Configuration:**

```json
"properties": {
  "type": "flat",
  "columns": [
    "page_url",
    "product_id",
    "price",
    "category"
  ]
}
```

**Pros:**

- ✅ Better query performance
- ✅ Easier to index
- ✅ Type-safe
- ✅ Recommended for production

### Option 2: JSON Properties

Properties stored in a JSON column.

**Table Structure:**

```sql
CREATE TABLE events (
  event_name String,
  timestamp DateTime,
  date Date,
  user_id String,
  properties String  -- JSON string
)
```

**Configuration:**

```json
"properties": {
  "type": "json",
  "column": "properties"
}
```

**Pros:**

- ✅ Flexible schema
- ✅ Easy to add new properties
- ⚠️ Slower query performance

---

## User Identifier Strategies

ClickSight needs to identify unique users for metrics like "Unique Users" and funnel analysis.

### Strategy 1: Single Column

Use one column as the user identifier.

```json
"user_identifier": {
  "type": "single",
  "column": "user_id"
}
```

**When to use:**

- All users are authenticated
- You have a reliable user ID

### Strategy 2: Computed (Fallback)

Use user_id when available, fallback to device_id for anonymous users.

```json
"user_identifier": {
  "type": "computed",
  "expression": "if(user_id != '', user_id, device_id)"
}
```

**When to use:**

- Mix of authenticated and anonymous users
- Need to track users before and after login

### Strategy 3: Custom Expression

Any ClickHouse expression.

```json
"user_identifier": {
  "type": "computed",
  "expression": "coalesce(customer_id, session_id, device_fingerprint)"
}
```

**When to use:**

- Complex user identification logic
- Multiple fallback options

---

## Best Practices

### 1. Table Schema Recommendations

**Partitioning:**

```sql
PARTITION BY toYYYYMM(date)  -- Monthly partitions
-- OR
PARTITION BY date  -- Daily partitions (better for large datasets)
```

**Primary Key:**

```sql
ORDER BY (date, event_name, user_id, timestamp)
```

**Data Types:**

```sql
event_name LowCardinality(String)  -- For columns with <10K unique values
date Date
timestamp DateTime64(3)  -- Millisecond precision
user_id String
```

### 2. Performance Optimizations

**Use LowCardinality for:**

- `event_name` (usually <1000 unique events)
- Categorical properties (country, device_type, etc.)

**Add Indexes for:**

- Frequently filtered properties
- User identifiers

```sql
INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 1
INDEX idx_event_name event_name TYPE set(0) GRANULARITY 1
```

### 3. Property Naming

**Use consistent naming:**

- ✅ `page_url`, `product_id`, `user_email`
- ❌ `pageURL`, `ProductID`, `UserEmail`

**Prefix special properties:**

- `$os`, `$browser`, `$device_type` (system properties)
- `utm_source`, `utm_campaign` (marketing properties)

### 4. Data Quality

**Ensure:**

- No NULL values in required fields
- Consistent event naming
- Valid timestamps
- User IDs are stable (don't change over time)

---

## Complete Examples

### E-commerce Schema

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "analytics",
    "table": "ecommerce_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_type",
      "timestamp": "event_timestamp",
      "date": "event_date",
      "user_id": "customer_id",
      "device_id": "anonymous_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "computed",
      "expression": "if(customer_id != '', customer_id, anonymous_id)"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "product_id",
        "product_name",
        "category",
        "price",
        "quantity",
        "page_url",
        "referrer",
        "utm_source",
        "utm_campaign"
      ]
    }
  }
}
```

### SaaS Application Schema

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "product_analytics",
    "table": "app_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
      "timestamp": "server_timestamp",
      "date": "date",
      "user_id": "user_id",
      "device_id": "device_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "single",
      "column": "user_id"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "feature_name",
        "plan_type",
        "organization_id",
        "button_clicked",
        "page_name",
        "duration_ms",
        "$os",
        "$browser",
        "$device_type"
      ]
    }
  }
}
```

---

## Troubleshooting

### Issue: "Table not found"

**Cause:** Incorrect database or table name in configuration.

**Solution:**

```sql
-- Check your table exists
SHOW TABLES FROM your_database;

-- Verify table name matches config
SELECT * FROM your_database.your_table LIMIT 1;
```

### Issue: "Column not found"

**Cause:** Column mapping doesn't match actual table columns.

**Solution:**

```sql
-- List all columns in your table
DESCRIBE your_database.your_table;

-- Update schema.config.json with correct column names
```

### Issue: "No events showing up"

**Cause:** Date range filter not matching your data.

**Solution:**

```sql
-- Check date range of your data
SELECT
  min(date) as earliest_date,
  max(date) as latest_date
FROM your_database.your_table;

-- Adjust date range in ClickSight UI
```

### Issue: "Unique users count seems wrong"

**Cause:** User identifier configuration issue.

**Solution:**

```sql
-- Test your user identifier expression
SELECT
  count(*) as total_events,
  count(DISTINCT user_id) as unique_users,
  count(DISTINCT if(user_id != '', user_id, device_id)) as unique_with_fallback
FROM your_database.your_table
WHERE date >= today() - 7;

-- Update user_identifier in schema.config.json
```

### Issue: "Properties not showing in filters"

**Cause:** Properties not listed in configuration.

**Solution:**

1. Check `properties.columns` array in `schema.config.json`
2. Add missing property names
3. Restart the application
4. Click "Refresh Data" button in ClickSight

---

## Testing Your Configuration

After creating `schema.config.json`:

1. **Start ClickSight**

   ```bash
   npm run dev
   ```

2. **Check browser console** for schema loading logs:

   ```
   📋 Loading schema configuration
   ✅ Schema configuration loaded successfully
   ```

3. **Test in Events Explorer**

   - Navigate to Events page
   - Verify events are loading
   - Check that properties are visible

4. **Test in Insights**

   - Create a simple trend chart
   - Verify data appears
   - Test filtering by properties

5. **Test User Identification**
   ```sql
   -- Run this query in SQL Playground
   SELECT
     count(*) as total_events,
     count(DISTINCT <your_user_identifier_expression>) as unique_users
   FROM your_database.your_table
   WHERE date >= today() - 7;
   ```

---

## Next Steps

- See [Example Schemas](EXAMPLE_SCHEMAS.md) for more complete examples
- See [Feature Documentation](FEATURE_DOCUMENTATION.md) for feature guides
- See [README](../README.md) for deployment instructions

---

## Need Help?

- **GitHub Issues**: Report bugs or ask questions
- **GitHub Discussions**: Community support
- **Documentation**: Check other guides in `docs/` folder
