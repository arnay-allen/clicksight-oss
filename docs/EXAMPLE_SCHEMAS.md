# Example Schemas

This document provides ready-to-use schema configurations for common use cases. Copy and adapt these examples to your needs.

## Table of Contents

- [E-commerce Platform](#e-commerce-platform)
- [SaaS Application](#saas-application)
- [Mobile App Analytics](#mobile-app-analytics)
- [Marketing Website](#marketing-website)
- [Gaming Platform](#gaming-platform)

---

## E-commerce Platform

### Use Case

Track customer journeys from browsing to purchase, analyze cart abandonment, measure product performance.

### ClickHouse Table Schema

```sql
CREATE TABLE analytics.ecommerce_events
(
    event_name LowCardinality(String),
    event_timestamp DateTime64(3),
    event_date Date,

    -- User identification
    customer_id String,
    anonymous_id String,
    session_id String,

    -- Product properties
    product_id String,
    product_name String,
    product_category LowCardinality(String),
    product_price Float64,
    product_quantity UInt32,

    -- Order properties
    order_id String,
    order_total Float64,
    payment_method LowCardinality(String),

    -- Page properties
    page_url String,
    page_title String,
    referrer String,

    -- Marketing properties
    utm_source LowCardinality(String),
    utm_medium LowCardinality(String),
    utm_campaign String,

    -- Device properties
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    country LowCardinality(String)
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_name, customer_id, event_timestamp);
```

### ClickSight Configuration

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "analytics",
    "table": "ecommerce_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
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
        "product_category",
        "product_price",
        "product_quantity",
        "order_id",
        "order_total",
        "payment_method",
        "page_url",
        "page_title",
        "referrer",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "device_type",
        "browser",
        "os",
        "country"
      ]
    }
  }
}
```

### Common Events

- `product_viewed`
- `product_added_to_cart`
- `cart_viewed`
- `checkout_started`
- `payment_info_entered`
- `order_completed`

### Example Funnels

1. **Purchase Funnel**: product_viewed → product_added_to_cart → checkout_started → order_completed
2. **Cart Abandonment**: product_added_to_cart → cart_viewed → checkout_started (track drop-off)

---

## SaaS Application

### Use Case

Monitor feature adoption, track user engagement, analyze onboarding funnels, measure retention.

### ClickHouse Table Schema

```sql
CREATE TABLE product_analytics.app_events
(
    event_name LowCardinality(String),
    server_timestamp DateTime64(3),
    event_date Date,

    -- User identification
    user_id String,
    organization_id String,
    session_id String,

    -- Feature properties
    feature_name LowCardinality(String),
    feature_category LowCardinality(String),
    action_type LowCardinality(String),

    -- User properties
    plan_type LowCardinality(String),
    user_role LowCardinality(String),
    signup_date Date,

    -- Page/screen properties
    page_name LowCardinality(String),
    screen_name LowCardinality(String),
    button_clicked String,

    -- Performance properties
    duration_ms UInt32,
    api_response_time_ms UInt32,
    error_message String,

    -- Device properties
    os LowCardinality(String),
    browser LowCardinality(String),
    device_type LowCardinality(String),
    app_version String
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_name, user_id, server_timestamp);
```

### ClickSight Configuration

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
      "date": "event_date",
      "user_id": "user_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "single",
      "column": "user_id"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "organization_id",
        "feature_name",
        "feature_category",
        "action_type",
        "plan_type",
        "user_role",
        "signup_date",
        "page_name",
        "screen_name",
        "button_clicked",
        "duration_ms",
        "api_response_time_ms",
        "error_message",
        "os",
        "browser",
        "device_type",
        "app_version"
      ]
    }
  }
}
```

### Common Events

- `user_signed_up`
- `onboarding_started`
- `feature_activated`
- `project_created`
- `invite_sent`
- `upgrade_clicked`
- `subscription_upgraded`

### Example Funnels

1. **Onboarding**: user_signed_up → onboarding_started → project_created → invite_sent
2. **Upgrade**: feature_activated → upgrade_clicked → subscription_upgraded

---

## Mobile App Analytics

### Use Case

Track in-app behavior, measure feature usage, analyze user journeys, monitor performance.

### ClickHouse Table Schema

```sql
CREATE TABLE mobile_analytics.app_events
(
    event_name LowCardinality(String),
    event_timestamp DateTime64(3),
    event_date Date,

    -- User identification
    user_id String,
    device_id String,
    session_id String,

    -- App properties
    app_version String,
    app_build String,
    screen_name LowCardinality(String),
    previous_screen LowCardinality(String),

    -- Device properties
    device_model String,
    os_name LowCardinality(String),
    os_version String,
    device_manufacturer LowCardinality(String),

    -- Network properties
    connection_type LowCardinality(String),
    carrier String,

    -- Location properties
    country LowCardinality(String),
    city String,
    timezone String,

    -- Performance properties
    screen_load_time_ms UInt32,
    api_call_duration_ms UInt32,
    crash_free_session Bool,

    -- Custom properties (JSON for flexibility)
    custom_properties String
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_name, user_id, event_timestamp);
```

### ClickSight Configuration

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "mobile_analytics",
    "table": "app_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
      "timestamp": "event_timestamp",
      "date": "event_date",
      "user_id": "user_id",
      "device_id": "device_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "computed",
      "expression": "if(user_id != '', user_id, device_id)"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "app_version",
        "app_build",
        "screen_name",
        "previous_screen",
        "device_model",
        "os_name",
        "os_version",
        "device_manufacturer",
        "connection_type",
        "carrier",
        "country",
        "city",
        "timezone",
        "screen_load_time_ms",
        "api_call_duration_ms",
        "crash_free_session"
      ]
    }
  }
}
```

### Common Events

- `app_opened`
- `screen_viewed`
- `button_tapped`
- `feature_used`
- `push_notification_received`
- `push_notification_opened`
- `in_app_purchase_completed`

### Example Funnels

1. **Activation**: app_opened → screen_viewed → feature_used
2. **Purchase**: feature_used → in_app_purchase_started → in_app_purchase_completed

---

## Marketing Website

### Use Case

Track visitor behavior, measure campaign effectiveness, analyze conversion paths.

### ClickHouse Table Schema

```sql
CREATE TABLE marketing.website_events
(
    event_name LowCardinality(String),
    event_timestamp DateTime64(3),
    event_date Date,

    -- User identification
    visitor_id String,
    user_id String,
    session_id String,

    -- Page properties
    page_url String,
    page_path String,
    page_title String,
    referrer String,

    -- Campaign properties
    utm_source LowCardinality(String),
    utm_medium LowCardinality(String),
    utm_campaign String,
    utm_term String,
    utm_content String,

    -- Form properties
    form_id String,
    form_name String,
    field_name String,

    -- CTA properties
    cta_text String,
    cta_position String,

    -- Device properties
    device_type LowCardinality(String),
    browser LowCardinality(String),
    browser_version String,
    os LowCardinality(String),

    -- Location properties
    country LowCardinality(String),
    region String,
    city String,

    -- Engagement properties
    scroll_depth UInt8,
    time_on_page_seconds UInt32
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_name, visitor_id, event_timestamp);
```

### ClickSight Configuration

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "marketing",
    "table": "website_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
      "timestamp": "event_timestamp",
      "date": "event_date",
      "user_id": "user_id",
      "device_id": "visitor_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "computed",
      "expression": "if(user_id != '', user_id, visitor_id)"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "page_url",
        "page_path",
        "page_title",
        "referrer",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "form_id",
        "form_name",
        "field_name",
        "cta_text",
        "cta_position",
        "device_type",
        "browser",
        "browser_version",
        "os",
        "country",
        "region",
        "city",
        "scroll_depth",
        "time_on_page_seconds"
      ]
    }
  }
}
```

### Common Events

- `page_viewed`
- `cta_clicked`
- `form_started`
- `form_field_completed`
- `form_submitted`
- `signup_completed`
- `demo_requested`

### Example Funnels

1. **Lead Generation**: page_viewed → cta_clicked → form_started → form_submitted
2. **Demo Request**: page_viewed → demo_requested → signup_completed

---

## Gaming Platform

### Use Case

Track player behavior, measure engagement, analyze monetization, monitor game performance.

### ClickHouse Table Schema

```sql
CREATE TABLE gaming.player_events
(
    event_name LowCardinality(String),
    event_timestamp DateTime64(3),
    event_date Date,

    -- Player identification
    player_id String,
    device_id String,
    session_id String,

    -- Game properties
    game_version String,
    level_number UInt16,
    level_name String,
    game_mode LowCardinality(String),

    -- Player properties
    player_level UInt16,
    player_xp UInt32,
    total_playtime_hours Float32,

    -- Monetization properties
    currency_type LowCardinality(String),
    currency_amount Float64,
    item_id String,
    item_name String,
    item_category LowCardinality(String),
    transaction_id String,

    -- Performance properties
    fps UInt8,
    load_time_ms UInt32,
    crash_occurred Bool,

    -- Device properties
    platform LowCardinality(String),
    device_model String,
    os_version String,

    -- Social properties
    friend_count UInt16,
    guild_id String
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_name, player_id, event_timestamp);
```

### ClickSight Configuration

```json
{
  "version": "1.0",
  "clickhouse": {
    "database": "gaming",
    "table": "player_events"
  },
  "schema": {
    "columns": {
      "event_name": "event_name",
      "timestamp": "event_timestamp",
      "date": "event_date",
      "user_id": "player_id",
      "device_id": "device_id",
      "session_id": "session_id"
    },
    "user_identifier": {
      "type": "computed",
      "expression": "if(player_id != '', player_id, device_id)"
    },
    "properties": {
      "type": "flat",
      "columns": [
        "game_version",
        "level_number",
        "level_name",
        "game_mode",
        "player_level",
        "player_xp",
        "total_playtime_hours",
        "currency_type",
        "currency_amount",
        "item_id",
        "item_name",
        "item_category",
        "transaction_id",
        "fps",
        "load_time_ms",
        "crash_occurred",
        "platform",
        "device_model",
        "os_version",
        "friend_count",
        "guild_id"
      ]
    }
  }
}
```

### Common Events

- `game_started`
- `level_started`
- `level_completed`
- `level_failed`
- `item_purchased`
- `achievement_unlocked`
- `social_invite_sent`

### Example Funnels

1. **Level Progression**: level_started → level_completed → level_started (next level)
2. **Monetization**: game_started → item_viewed → item_purchased

---

## Using These Examples

### Step 1: Choose Your Schema

Pick the example closest to your use case.

### Step 2: Create Your Table

Run the SQL to create your ClickHouse table (modify as needed).

### Step 3: Configure ClickSight

Copy the JSON configuration to `schema.config.json` in your ClickSight root directory.

### Step 4: Set Environment Variables

```bash
cat > .env.local << EOF
VITE_CLICKHOUSE_URL=https://your-clickhouse-instance:8443
VITE_CLICKHOUSE_USER=your_username
VITE_CLICKHOUSE_PASSWORD=your_password
VITE_USE_LOWERCASE_COLUMNS=false
EOF
```

### Step 5: Start ClickSight

```bash
npm run dev
```

---

## Adapting Examples

### Adding Custom Properties

1. Add columns to your ClickHouse table
2. Add column names to `properties.columns` array in config
3. Restart ClickSight
4. Click "Refresh Data" button

### Changing User Identification

Update the `user_identifier` section:

```json
"user_identifier": {
  "type": "computed",
  "expression": "your_custom_expression"
}
```

### Using JSON Properties

If your table stores properties in JSON:

```json
"properties": {
  "type": "json",
  "column": "properties"
}
```

---

## Need More Help?

- See [Schema Setup Guide](SCHEMA_SETUP_GUIDE.md) for detailed configuration options
- See [Feature Documentation](FEATURE_DOCUMENTATION.md) for feature guides
- Open an issue on GitHub for specific questions

---

## Contributing Examples

Have a schema example to share? Please contribute!

1. Fork the repository
2. Add your example to this file
3. Submit a pull request

We especially welcome examples for:

- IoT/sensor data
- Financial services
- Healthcare
- Education platforms
- Media/streaming platforms
