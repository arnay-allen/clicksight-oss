# ClickSight Feature Documentation

Complete guide to all ClickSight features with business value, use cases, and technical details.

---

## 1. Events Explorer

### What It Measures

Real-time event stream showing the last 100-500 events with full property inspection. Displays event name, timestamp, user ID, and contextual properties (city, state, country) for each event.

### Why It's Critical

**1. Real-Time Debugging**

- Verify events are being tracked correctly
- Inspect event properties and values
- Validate tracking implementation before analysis

**2. Data Quality Assurance**

- Spot missing or incorrect properties
- Identify data anomalies immediately
- Ensure consistent event naming

**3. User Journey Investigation**

- See actual user behavior in real-time
- Investigate specific user sessions
- Debug customer support issues

### Real-World Example

**Scenario:** Product team reports that "video_play" events are not showing up in Insights.

**Investigation using Events Explorer:**

1. Filter for "video_play" events in last 24 hours
2. Result: 0 events found
3. Check similar events: Find "video_started" instead
4. **Root cause:** Developer used wrong event name

**Business Impact:** Saved 2 hours of debugging, fixed tracking immediately instead of waiting for weekly sprint.

### Key Capabilities

- Load last 100-500 events ordered by timestamp
- Filter by event name, date range, and properties
- Expandable row details with three tabs:
  - **Pixel Properties:** Core tracking properties
  - **Your Properties:** Custom event properties
  - **All Properties:** Complete event payload
- JSON mode toggle for raw data inspection
- Client-side sorting by any column
- Property-based filtering with 15+ operators
- Pagination with "Load More" (100 events per page)

### Query Pattern

```sql
SELECT
  event_name,
  event_timestamp,
  user_id,
  city,
  state,
  country,
  properties
FROM your_events_table
WHERE event_date = today()
  AND event_name = 'app_open'
LIMIT 100
```

### Performance

- **Query time:** <500ms for 100 events
- **Page load:** <1 second with cached event names
- **Expandable rows:** <50ms to render properties

### Technical Innovation

- **Dynamic property tabs:** Automatically categorizes properties into "Pixel Properties" vs "Your Properties"
- **Client-side sorting:** No re-query needed, instant column sorting
- **Efficient pagination:** Loads 100 events at a time, prevents browser overload

---

## 2. Insights (Event Trends)

### What It Measures

Multi-metric trend analysis showing how events change over time. Supports 6 metric types: Total Events, Unique Users, Sum, Average, Min, Max. Can plot multiple events on the same chart with breakdown by up to 3 properties.

### Why It's Critical

**1. Product Performance Tracking**

- Monitor key metrics daily (DAU, MAU, feature usage)
- Identify growth trends or declines
- Measure feature adoption rates

**2. A/B Test Analysis**

- Compare metrics between test groups
- Validate feature impact on engagement
- Make data-driven product decisions

**3. Anomaly Detection**

- Spot sudden drops or spikes
- Investigate production issues
- Alert on unusual patterns

### Real-World Example

**Scenario:** Your company launches a new "Live Chat" feature on Oct 15th.

**Question:** Did it increase user engagement?

**Insights Analysis:**

```
Metric: Unique Users performing "chat_started"
Date Range: Oct 1-31
Granularity: Daily
Breakdown: None

Results:
- Oct 1-14 average: 2,500 users/day
- Oct 15-31 average: 4,200 users/day
- **Increase: 68%**
```

**Follow-up with Breakdown:**

```
Breakdown by: pixel_properties.cf_state

Top States (Oct 15-31):
- Rajasthan: 1,200 users/day (+85% vs pre-launch)
- Uttar Pradesh: 950 users/day (+72%)
- Bihar: 680 users/day (+55%)
```

**Business Impact:** Validated feature success, decided to invest in support improvements. Identified regional adoption patterns for targeted marketing.

### Key Capabilities

- **6 Metric Types:**
  - Total Events: `count(*)`
  - Unique Users: `uniq(pixel_properties_user_id)`
  - Sum: `sum(toFloat64OrZero(property))`
  - Average: `avg(toFloat64OrZero(property))`
  - Min: `min(toFloat64OrZero(property))`
  - Max: `max(toFloat64OrZero(property))`
- **Multi-event selection:** Plot up to 10 events on same chart
- **Date granularity:** Daily, Weekly, Monthly aggregation
- **Breakdown by properties:** Up to 3 properties combined
- **Advanced filters:** 15+ operators per data source
- **Export:** PNG, PDF, CSV formats
- **Save & Share:** Persist charts, share with team

### Query Pattern (with Breakdown)

```sql
SELECT
  ist_date,
  concat(
    JSONExtractString(pixel_properties, 'cf_country'), ' | ',
    JSONExtractString(pixel_properties, 'cf_state')
  ) as segment,
  uniq(pixel_properties_user_id) as value
FROM your_events_table
WHERE ist_date >= '2025-01-01'
  AND ist_date <= '2025-01-31'
  AND event_name = 'app_open'
  AND JSONExtractString(pixel_properties, 'cf_country') = 'India'
GROUP BY ist_date, segment
ORDER BY ist_date, value DESC
```

### Performance

- **Single metric, no breakdown:** <3 seconds for 500M events
- **Multi-event (5 events):** <5 seconds for 500M events
- **With breakdown (1 property):** <10 seconds for 500M events
- **With breakdown (3 properties):** <20 seconds for 500M events

### Technical Innovation

- **Dual-axis charts:** Plot different metric types (events + users) on same chart
- **Dynamic granularity:** Automatically suggests granularity based on date range
- **Efficient breakdown:** Uses `concat()` for multi-property segments, single GROUP BY
- **Property value suggestions:** Auto-complete filter values from recent data

---

## 3. Funnels

### What It Measures

Multi-step conversion tracking showing how many users progress through a sequence of events. Calculates conversion rates, drop-off rates, and time-to-convert for each step. Supports property-based filtering per step with AND/OR logic.

### Why It's Critical

**1. Conversion Optimization**

- Identify where users drop off
- Measure impact of UX changes
- Prioritize optimization efforts

**2. User Journey Understanding**

- See complete conversion paths
- Measure time between steps
- Segment by user properties

**3. Revenue Impact**

- Track purchase funnels
- Optimize checkout flow
- Reduce cart abandonment

### Real-World Example

**Scenario:** Your product team wants to optimize the user onboarding flow.

**Funnel Setup:**

```
Step 1: app_open (activation)
Step 2: profile_completed
Step 3: course_selected
Step 4: payment_initiated
Step 5: payment_success
```

**Results (7-day window):**

```
Step 1: 100,000 users (100%)
Step 2: 65,000 users (65% conversion, 35% drop-off)
Step 3: 48,000 users (74% conversion from Step 2, 48% overall)
Step 4: 28,000 users (58% conversion from Step 3, 28% overall)
Step 5: 22,000 users (79% conversion from Step 4, 22% overall)
```

**Key Insights:**

- **Biggest drop-off:** Step 1 → Step 2 (35% abandon after app open)
- **Payment success rate:** 79% (good, payment gateway working well)
- **Overall conversion:** 22% (industry benchmark: 15-20%)

**Action Taken:** Focus on onboarding (Step 1 → Step 2). Added tutorial video, improved first-time UX. Result: 35% drop-off reduced to 25% in next sprint.

**Business Impact:** 10% improvement in Step 2 conversion = 10,000 more users completing profile = 2,200 more paying customers (22% overall conversion) = $110K additional revenue (at $50 average subscription price).

### Key Capabilities

- **Multi-step funnels:** 2-10 steps
- **Sequential tracking:** Uses `windowFunnel()` for accurate user journeys
- **Property-based filtering:** Filter each step independently
- **AND/OR logic:** Combine multiple filters per step
- **Breakdown by properties:** Segment funnel by user attributes
- **Time windows:** Configurable conversion window (1-90 days)
- **Conversion metrics:** Rates, drop-offs, time-to-convert
- **Export:** PNG, PDF, CSV formats

### Query Pattern (Two-Phase Approach)

```sql
-- Phase 1: Identify users who completed each step
WITH
step1_users AS (
  SELECT DISTINCT
    if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id) as user_identifier,
    min(server_timestamp) as step1_time
  FROM your_events_table
  WHERE ist_date >= '2025-01-01'
    AND ist_date <= '2025-01-31'
    AND event_name = 'app_open'
  GROUP BY user_identifier
),
step2_users AS (
  SELECT DISTINCT
    s1.user_identifier,
    s1.step1_time,
    min(e.server_timestamp) as step2_time
  FROM step1_users s1
  JOIN your_events_table e
    ON s1.user_identifier = if(e.pixel_properties_user_id != '', e.pixel_properties_user_id, e.pixel_device_id)
  WHERE e.ist_date >= '2025-01-01'
    AND e.ist_date <= '2025-01-31'
    AND e.event_name = 'profile_completed'
    AND e.server_timestamp > s1.step1_time
    AND e.server_timestamp <= s1.step1_time + INTERVAL 7 DAY
  GROUP BY s1.user_identifier, s1.step1_time
)
SELECT
  'Step 1' as step_name,
  count(DISTINCT user_identifier) as user_count,
  100.0 as conversion_rate
FROM step1_users
UNION ALL
SELECT
  'Step 2' as step_name,
  count(DISTINCT user_identifier) as user_count,
  round(count(DISTINCT user_identifier) * 100.0 / (SELECT count(DISTINCT user_identifier) FROM step1_users), 2) as conversion_rate
FROM step2_users
```

### Performance

- **2-step funnel:** <5 seconds for 10M users
- **5-step funnel:** <10 seconds for 10M users
- **With breakdown:** <20 seconds for 10M users
- **Current (V1 schema):** 25-30 seconds (target: 10-15s with optimizations)

### Technical Innovation

- **Two-phase query:** Avoids `IN` clauses with 100K+ user IDs, scales to millions of users
- **Sequential JOINs:** Ensures correct step progression, no false positives
- **Efficient breakdown:** Single combined segment column, reduces query complexity
- **Property-aware filtering:** Supports complex filters per step without performance degradation

---

## 4. Retention Charts

### What It Measures

User retention visualization showing what percentage of users return after their first interaction. Displays retention curves over time (Day 1, 7, 14, 30, etc.) for cohorts of users.

### Why It's Critical

**1. Product-Market Fit Indicator**

- High retention = users find value
- Low retention = product issues
- Retention curve shape reveals engagement patterns

**2. Feature Impact Measurement**

- Compare retention before/after feature launch
- Validate product improvements
- Prioritize high-impact features

**3. Business Sustainability**

- Retention × LTV = revenue predictability
- High retention reduces CAC waste
- Enables long-term growth planning

### Real-World Example

**Scenario:** Your company launches "AI Assistant" feature in October.

**Question:** Did it improve user retention?

**Retention Analysis:**

```
Cohort: Sept 2025 (before AI feature)
Activation Event: app_open
Return Event: app_open
Retention Window: 30 days

Results:
- Day 1: 40%
- Day 7: 22%
- Day 14: 15%
- Day 30: 8%

Cohort: Oct 2025 (after AI feature)
Results:
- Day 1: 48% (+20%)
- Day 7: 30% (+36%)
- Day 14: 22% (+47%)
- Day 30: 15% (+87%)
```

**Business Impact:**

- Day 30 retention improved from 8% to 15% (87% increase)
- For 100K new users/month: 7,000 more retained users
- At $50 LTV per retained user: $350K additional revenue/month
- **Annual impact: $4.2M additional revenue**

### Key Capabilities

- **Configurable activation event:** Define what counts as "first use"
- **Configurable return event:** Define what counts as "returning"
- **Flexible retention periods:** Day 1, 3, 7, 14, 30, 60, 90
- **Cohort comparison:** Compare up to 5 cohorts on same chart
- **Retention curve visualization:** Line chart showing retention decay
- **Export:** PNG, PDF, CSV formats

### Query Pattern

```sql
WITH
cohort_users AS (
  SELECT DISTINCT
    pixel_properties_user_id,
    min(ist_date) as cohort_date
  FROM your_events_table
  WHERE event_name = 'app_open'
    AND ist_date >= '2025-01-01'
    AND ist_date <= '2025-01-31'
  GROUP BY pixel_properties_user_id
),
retention_events AS (
  SELECT
    c.cohort_date,
    c.pixel_properties_user_id,
    dateDiff('day', c.cohort_date, e.ist_date) as days_since
  FROM cohort_users c
  JOIN your_events_table e
    ON c.pixel_properties_user_id = e.pixel_properties_user_id
  WHERE e.event_name = 'app_open'
    AND e.ist_date > c.cohort_date
)
SELECT
  cohort_date,
  days_since,
  count(DISTINCT pixel_properties_user_id) as retained_users,
  round(count(DISTINCT pixel_properties_user_id) * 100.0 /
    (SELECT count(*) FROM cohort_users WHERE cohort_date = retention_events.cohort_date), 2) as retention_rate
FROM retention_events
WHERE days_since IN (1, 7, 14, 30)
GROUP BY cohort_date, days_since
ORDER BY cohort_date, days_since
SETTINGS max_execution_time = 600, max_rows_to_read = 1000000000
```

### Performance

- **1M users, 30-day retention:** <10 seconds
- **10M users, 90-day retention:** <30 seconds
- **Multiple cohorts (5):** <60 seconds

### Technical Innovation

- **Self-join optimization:** Uses CTE to pre-filter cohort users, reduces join size
- **Flexible event definitions:** Activation and return events can be different
- **Efficient date arithmetic:** Uses `dateDiff()` for fast day calculations

---

## 5. Cohort Analysis

### What It Measures

Retention heatmap tables showing retention percentages for multiple cohorts side-by-side. Each row is a cohort (e.g., users who signed up on Jan 1), each column is a retention day (Day 0, 1, 7, 14, 30), and cell colors indicate retention strength.

### Why It's Critical

**1. Pattern Recognition**

- Seasonal trends: Summer vs. winter cohorts
- Day-of-week effects: Monday vs. Friday signups
- Long-term trends: Improving or declining retention

**2. Feature Impact Analysis**

- Before/After comparison for feature launches
- A/B test validation across cohorts
- Regression detection (did recent change hurt retention?)

**3. Segmentation Insights**

- Geography: US vs. India retention
- Platform: iOS vs. Android
- Acquisition channel: Organic vs. paid

### Real-World Example

**Scenario:** Your product team notices declining DAU in November.

**Question:** Is this a seasonal dip or a product problem?

**Cohort Analysis:**

```
Cohort Period: Daily
Retention Window: 30 days
Date Range: Sept 1 - Nov 30

Heatmap Results:
Cohort      Size   Day 0  Day 7  Day 14  Day 30
Sept 1      10K    100%   28%    18%     10%
Sept 15     12K    100%   30%    20%     12%
Oct 1       15K    100%   32%    22%     14%
Oct 15      18K    100%   35%    25%     16%
Nov 1       20K    100%   38%    28%     18%
Nov 15      22K    100%   40%    30%     20%

Color Scale:
- Red (8-10%) → Yellow (15-20%) → Green (25-30%) → Dark Green (35-40%)
```

**Insight:** Retention is actually IMPROVING over time (Sept 10% → Nov 20% at Day 30). The declining DAU is due to seasonal acquisition drop, not retention issues.

**Business Decision:** Don't panic about DAU. Focus on acquisition campaigns, not product fixes. Saved engineering team 2 weeks of unnecessary debugging.

### Key Capabilities

- **Cohort period:** Daily, Weekly, Monthly
- **Retention window:** Days 1-30, Weeks 1-12, Months 1-6
- **Heatmap visualization:** Color-coded retention percentages
- **Cohort size display:** Shows cohort size for context
- **Configurable events:** Custom activation and return events
- **Export:** PNG, PDF, CSV formats

### Query Pattern

```sql
WITH
cohort_users AS (
  SELECT
    pixel_properties_user_id,
    toStartOfDay(min(ist_date)) as cohort_date
  FROM your_events_table
  WHERE event_name = 'app_open'
    AND ist_date >= '2025-01-01'
    AND ist_date <= '2025-01-31'
  GROUP BY pixel_properties_user_id
),
retention_matrix AS (
  SELECT
    c.cohort_date,
    dateDiff('day', c.cohort_date, e.ist_date) as days_since,
    count(DISTINCT e.pixel_properties_user_id) as retained_users
  FROM cohort_users c
  JOIN your_events_table e
    ON c.pixel_properties_user_id = e.pixel_properties_user_id
  WHERE e.event_name = 'app_open'
    AND e.ist_date >= c.cohort_date
  GROUP BY c.cohort_date, days_since
)
SELECT
  cohort_date,
  count(DISTINCT pixel_properties_user_id) as cohort_size,
  days_since,
  retained_users,
  round(retained_users * 100.0 / cohort_size, 2) as retention_rate
FROM retention_matrix
JOIN cohort_users USING (cohort_date)
GROUP BY cohort_date, days_since, retained_users
ORDER BY cohort_date, days_since
SETTINGS max_execution_time = 600, max_rows_to_read = 1000000000
```

### Performance

- **1M users, 30 cohorts, 30-day window:** <15 seconds
- **10M users, 30 cohorts, 90-day window:** <60 seconds

### Technical Innovation

- **Efficient matrix generation:** Single query produces entire heatmap
- **Color-coded visualization:** Ant Design's heatmap component with custom color scale
- **Responsive design:** Horizontal scroll for large cohort tables

---

## 6. User Path Analysis

### What It Measures

Sankey diagram visualization of common user journeys showing the most frequent sequences of events. Displays flow from one event to another with proportional widths indicating user volume.

### Why It's Critical

**1. User Journey Understanding**

- Discover actual user behavior (vs. intended flow)
- Identify unexpected paths
- Optimize navigation and UX

**2. Drop-Off Analysis**

- See where users exit the flow
- Identify friction points
- Prioritize UX improvements

**3. Feature Discovery**

- Find popular feature combinations
- Identify power user patterns
- Inform product roadmap

### Real-World Example

**Scenario:** Your company wants to understand how users navigate the app after opening it.

**Path Analysis Setup:**

```
Start Event: app_open
End Event: None (all paths)
Path Depth: 5 steps
Number of Paths: Top 20
Excluded Events: API_TIME_TAKEN, app_update_handler
```

**Results:**

```
Top 5 Paths (out of 15,000 users):

1. app_open → page_loaded → button_clicked → drawer_loaded → course_selected
   Users: 6,699 (44.1%)

2. app_open → page_loaded → button_clicked → video_play → video_complete
   Users: 2,615 (17.2%)

3. app_open → page_loaded → search_initiated → search_results → content_clicked
   Users: 2,097 (13.8%)

4. app_open → page_loaded → bottom_tab_clicked → profile_viewed → settings_opened
   Users: 775 (5.1%)

5. app_open → notification_clicked → content_viewed → video_play → video_complete
   Users: 669 (4.4%)
```

**Insights:**

- **44% of users** follow the "browse courses" path (page_loaded → drawer_loaded)
- **17% of users** immediately engage with video content
- **14% of users** use search as primary discovery method
- **Unexpected:** Only 5% visit profile/settings (low engagement with personalization)

**Action Taken:**

1. Optimize course browsing UX (44% of users)
2. Improve search prominence (only 14% using it)
3. Add profile completion prompts (increase 5% engagement)

**Business Impact:** Increased course selection rate by 12% in next sprint by optimizing the dominant path.

### Key Capabilities

- **Sankey diagram:** Visual flow representation
- **Tree view:** Hierarchical path breakdown
- **Table view:** Detailed path statistics
- **Configurable depth:** 2-10 steps
- **Start/End event filtering:** Focus on specific journeys
- **Event exclusion:** Remove noise events (API calls, heartbeats)
- **Top N paths:** Show most common journeys (10-50)
- **Export:** PNG, CSV formats

### Query Pattern (Memory-Optimized)

```sql
WITH
-- Step 1: Get users who performed start event
relevant_users AS (
  SELECT DISTINCT
    if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id) as user_identifier
  FROM your_events_table
  WHERE ist_date >= '2025-01-01'
    AND ist_date <= '2025-01-31'
    AND event_name = 'app_open'
),

-- Step 2: Get ordered events for relevant users
ordered_events AS (
  SELECT
    if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id) as user_identifier,
    event_name,
    server_timestamp,
    row_number() OVER (PARTITION BY user_identifier ORDER BY server_timestamp) as rn,
    lagInFrame(event_name) OVER (PARTITION BY user_identifier ORDER BY server_timestamp) as prev_event
  FROM your_events_table
  WHERE ist_date >= '2025-01-01'
    AND ist_date <= '2025-01-31'
    AND event_name NOT IN ('API_TIME_TAKEN', 'app_update_handler')
    AND if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id) IN (SELECT user_identifier FROM relevant_users)
),

-- Step 3: Deduplicate consecutive events
deduplicated_events AS (
  SELECT
    user_identifier,
    event_name,
    server_timestamp
  FROM ordered_events
  WHERE (rn = 1 OR event_name != prev_event)
    AND event_name != ''
),

-- Step 4: Group into sequences
deduplicated_sequences AS (
  SELECT
    user_identifier,
    arrayMap(x -> x.1, arraySort(x -> x.2, groupArray((event_name, server_timestamp)))) as clean_sequence
  FROM deduplicated_events
  GROUP BY user_identifier
  HAVING length(clean_sequence) >= 2
),

-- Step 5: Extract path segments
path_segments AS (
  SELECT
    user_identifier,
    arraySlice(clean_sequence, 1, 5) as sequence
  FROM deduplicated_sequences
  WHERE length(sequence) >= 2
)

SELECT
  sequence,
  count(*) as user_count,
  round((count(*) / (SELECT count(DISTINCT user_identifier) FROM path_segments)) * 100, 2) as percentage
FROM path_segments
GROUP BY sequence
ORDER BY user_count DESC
LIMIT 20
SETTINGS max_execution_time = 600, max_rows_to_read = 1000000000
```

### Performance

- **1M users, 5-step paths:** <5 seconds
- **10M users, 5-step paths:** <30 seconds
- **With end event filter:** <10 seconds (early filtering)

### Technical Innovation

- **Memory-efficient deduplication:** Uses `lagInFrame` window function instead of array operations
- **Position-aware nodes:** Handles cyclic paths (A → B → A) by treating each occurrence as distinct
- **Client-side safety:** Additional deduplication and filtering to prevent Sankey diagram errors
- **Three visualization modes:** Sankey (visual), Tree (hierarchical), Table (detailed)

---

## 7. SQL Playground

### What It Measures

Custom SQL query execution with Monaco editor, syntax highlighting, and results table. Allows analysts to write ad-hoc queries beyond the UI's capabilities.

### Why It's Critical

**1. Power User Flexibility**

- Write custom queries not supported by UI
- Combine multiple data sources
- Perform complex aggregations

**2. Data Exploration**

- Investigate edge cases
- Validate UI results
- Prototype new analyses

**3. Export & Integration**

- Extract data for external tools
- Create custom reports
- Integrate with BI tools

### Real-World Example

**Scenario:** Product manager wants to find "power users" who performed >50 events in last 7 days AND watched >5 videos.

**UI Limitation:** Insights can't combine multiple event types with complex conditions.

**SQL Playground Solution:**

```sql
WITH
user_events AS (
  SELECT
    pixel_properties_user_id,
    count(*) as total_events,
    countIf(event_name = 'video_play') as video_plays
  FROM your_events_table
  WHERE ist_date >= today() - 7
    AND pixel_properties_user_id != ''
  GROUP BY pixel_properties_user_id
)
SELECT
  pixel_properties_user_id,
  total_events,
  video_plays
FROM user_events
WHERE total_events > 50
  AND video_plays > 5
ORDER BY total_events DESC
LIMIT 100
```

**Results:** Found 2,847 power users. Exported to CSV for targeted email campaign.

**Business Impact:** Sent personalized "Premium Features" email to power users. 18% conversion rate (512 upgrades) = $25,600 additional revenue (at $50 upgrade price).

### Key Capabilities

- **Monaco Editor:** VS Code-like editing experience
- **SQL syntax highlighting:** Color-coded SQL keywords
- **Query validation:** SELECT-only enforcement
- **Results table:** Paginated, sortable results
- **Export:** CSV, JSON formats
- **Query history:** Last 10 queries saved (future enhancement)
- **Query templates:** Pre-built queries for common analyses (future enhancement)
- **Audit logging:** All queries logged to `clicksight.sql_playground_audit`

### Query Pattern (Audit Logging)

```sql
-- User's custom query (example)
SELECT
  event_name,
  count(*) as event_count,
  uniq(pixel_properties_user_id) as unique_users
FROM your_events_table
WHERE ist_date >= today() - 30
GROUP BY event_name
ORDER BY event_count DESC
LIMIT 20

-- Audit log entry (automatic)
INSERT INTO clicksight.sql_playground_audit (
  user_id,
  query_text,
  execution_time_ms,
  rows_returned,
  status,
  error_message
) VALUES (
  'user@example.com',
  'SELECT event_name, count(*) as event_count...',
  1234,
  20,
  'success',
  NULL
)
```

### Performance

- **Query execution:** Depends on user query (30-second timeout)
- **Results rendering:** <500ms for 10,000 rows
- **Export:** <1 second for 10,000 rows

### Technical Innovation

- **Security enforcement:** Regex validation prevents non-SELECT queries
- **Resource limits:** 30-second timeout, 10,000 row limit
- **Audit trail:** Complete query history for compliance and debugging
- **Monaco integration:** Full IDE experience in browser

---

## 8. Property Explorer

### What It Measures

Event property discovery showing all available properties, their data types, top values, distributions, and statistics. Helps analysts understand what data is available for filtering and segmentation.

### Why It's Critical

**1. Data Discovery**

- Find available properties without documentation
- Understand property value distributions
- Identify useful segmentation dimensions

**2. Query Building**

- See actual property values before filtering
- Validate property names and formats
- Reduce trial-and-error in analysis

**3. Data Quality Monitoring**

- Spot missing or null values
- Identify data anomalies
- Ensure consistent property usage

### Real-World Example

**Scenario:** Analyst wants to segment users by "subscription tier" but doesn't know the property name or possible values.

**Property Explorer Investigation:**

1. Search for "tier" in property list
2. Find property: `subscription_tier`
3. View top values:
   ```
   Premium: 45,000 users (35%)
   Pro: 38,000 users (30%)
   Basic: 25,000 users (20%)
   Free: 12,000 users (10%)
   Trial: 6,000 users (5%)
   ```
4. Data type: String
5. Null/Empty: 2% of events

**Action:** Use `subscription_tier` in Insights breakdown to analyze engagement by tier.

**Business Impact:** Discovered Premium users have 2x higher feature adoption rate. Created targeted upgrade campaigns for Pro users. Result: 25% increase in Premium conversions.

### Key Capabilities

- **Property search:** Filter properties by name
- **Data type detection:** String, Numeric, Date, Boolean
- **Top 10 values:** Most common values with counts
- **Unique user counts:** How many users have each value
- **Null/Empty analysis:** Missing data percentage
- **Numeric distributions:** Histogram for numeric properties
- **Date range analysis:** Min/max dates for date properties
- **Export:** CSV format for property catalog

### Query Pattern (Top Values)

```sql
SELECT
  subscription_tier as value,
  count(*) as event_count,
  uniq(pixel_properties_user_id) as unique_users,
  round(count(*) * 100.0 / (SELECT count(*) FROM your_events_table WHERE ist_date >= today() - 7), 2) as percentage
FROM your_events_table
WHERE ist_date >= today() - 7
  AND value != ''
GROUP BY value
ORDER BY event_count DESC
LIMIT 10
```

### Performance

- **Property list:** <1 second (cached)
- **Top values:** <2 seconds for 7-day window
- **Numeric distribution:** <3 seconds for histogram

### Technical Innovation

- **Auto-detection:** Infers data type from property values
- **Efficient sampling:** Uses recent data (7 days) for fast analysis
- **Caching:** Property list cached for instant loading

---

## 9. Dashboards

### What It Measures

Multi-chart dashboard builder with drag-and-drop layout. Combines multiple saved charts (Insights, Funnels, Retention, Cohorts) into a single view for executive reporting and team monitoring.

### Why It's Critical

**1. Executive Reporting**

- Single view of key metrics
- No need to open multiple charts
- Shareable with stakeholders

**2. Team Alignment**

- Shared metrics across team
- Consistent definitions
- Real-time updates

**3. Monitoring & Alerts**

- Track multiple metrics simultaneously
- Spot correlations between metrics
- Quick anomaly detection

### Real-World Example

**Scenario:** Product leadership wants a weekly "User Engagement Dashboard" for Monday morning reviews.

**Dashboard Setup:**

```
Dashboard Name: User Engagement - Weekly Review
Charts:
1. DAU Trend (Insights): Unique users performing "app_open" (last 30 days)
2. Video Engagement (Insights): Total "video_play" events (last 30 days)
3. Onboarding Funnel (Funnel): app_open → profile_completed → course_selected
4. 7-Day Retention (Retention): Day 1, 3, 7 retention for last 4 weeks
5. Top Features (Insights): Top 10 events by unique users (last 7 days)
6. Geographic Distribution (Insights): Unique users by state (last 7 days)
```

**Usage:**

- Shared with 15 team members (view access)
- Viewed every Monday at 9 AM
- Exported as PDF for leadership meeting

**Business Impact:**

- Saved 30 minutes per week (vs. opening 6 separate charts)
- Faster decision-making (all metrics in one view)
- Improved team alignment (everyone sees same data)

### Key Capabilities

- **Drag-and-drop layout:** `react-grid-layout` for flexible positioning
- **Multi-chart support:** Combine Insights, Funnels, Retention, Cohorts
- **Live data:** Charts update with real data (not static screenshots)
- **Sharing:** Share with team members (view/edit permissions)
- **Export:** PDF, PNG, CSV (all charts)
- **Responsive design:** Adapts to screen size
- **Chart navigation:** Click chart to open in full analysis page

### Query Pattern (Dashboard Loading)

```sql
-- Load dashboard metadata
SELECT
  id,
  name,
  description,
  layout,
  chart_ids,
  created_by,
  created_at,
  updated_at
FROM clicksight.dashboards
WHERE id = 'dashboard_123'
  AND is_deleted = 0

-- Load each chart's configuration
SELECT
  id,
  name,
  chart_type,
  config
FROM clicksight.saved_charts
WHERE id IN ('chart_1', 'chart_2', 'chart_3')
  AND is_deleted = 0

-- Execute each chart's query in parallel
-- (Insights, Funnels, Retention queries as per chart config)
```

### Performance

- **Dashboard load:** <2 seconds (parallel chart queries)
- **Chart rendering:** <500ms per chart
- **Export (PDF):** <5 seconds for 6 charts
- **Export (CSV):** <3 seconds for 6 charts

### Technical Innovation

- **Parallel query execution:** All charts load simultaneously
- **Efficient layout:** `react-grid-layout` with responsive breakpoints
- **Smart caching:** Chart configs cached, data fetched fresh
- **Export optimization:** Single-page PDF with all charts

---

## 10. Saved Charts & Sharing

### What It Measures

Chart persistence and collaboration features allowing users to save analysis configurations, share with team members, and maintain a library of frequently-used reports.

### Why It's Critical

**1. Analysis Reusability**

- Save complex configurations
- Avoid rebuilding queries
- Maintain analysis consistency

**2. Team Collaboration**

- Share insights with colleagues
- Standardize metrics across team
- Enable self-service analytics

**3. Historical Tracking**

- Track metric changes over time
- Compare to previous periods
- Maintain audit trail

### Real-World Example

**Scenario:** Data analyst creates a complex funnel analysis for user onboarding with 5 steps and multiple filters.

**Without Saved Charts:**

- Rebuild funnel every time: 5 minutes
- Risk of configuration errors
- Can't share with team

**With Saved Charts:**

1. Build funnel once: 5 minutes
2. Save as "User Onboarding Funnel"
3. Share with 10 team members
4. Anyone can load in 2 seconds
5. Consistent analysis across team

**Business Impact:**

- Saved 50 minutes per week (10 people × 5 minutes)
- Reduced errors (consistent configuration)
- Faster decision-making (instant access)

### Key Capabilities

- **Save any chart type:** Insights, Funnels, Retention, Cohorts
- **Dynamic date ranges:** "Last 7 days" updates automatically
- **Sharing:** Share with specific users (view/edit permissions)
- **Permission management:** Owner can revoke access
- **Chart library:** "My Charts" and "Shared With Me" tabs
- **Update or Save As:** Modify existing chart or create new version
- **Soft delete:** Charts can be restored if accidentally deleted
- **Export:** PNG, PDF, CSV from saved charts

### Query Pattern (Save Chart)

```sql
-- Save chart configuration
INSERT INTO clicksight.saved_charts (
  id,
  name,
  description,
  chart_type,
  config,
  created_by,
  created_at,
  updated_at,
  is_deleted
) VALUES (
  'chart_abc123',
  'User Onboarding Funnel',
  'Tracks user progression from app open to payment',
  'funnel',
  '{"steps":[{"event":"app_open"},{"event":"profile_completed"}],"dateRange":"last_7_days"}',
  'analyst@example.com',
  now(),
  now(),
  0
)

-- Share chart with team
INSERT INTO clicksight.chart_shares (
  chart_id,
  shared_with_user_id,
  permission,
  shared_by,
  shared_at
) VALUES (
  'chart_abc123',
  'pm@example.com',
  'view',
  'analyst@example.com',
  now()
)
```

### Performance

- **Save chart:** <100ms
- **Load chart:** <200ms
- **Load chart list:** <500ms (cached)
- **Share chart:** <100ms

### Technical Innovation

- **Dynamic date ranges:** Uses `dayjs` for relative date calculations
- **JSON configuration:** Flexible schema for any chart type
- **Efficient sharing:** Separate table for permissions, not duplicating charts
- **Soft delete:** `is_deleted` flag preserves data for recovery

---

## 11. Advanced Filters

### What It Measures

Powerful data segmentation with 15+ filter operators supporting string matching, numeric comparisons, date ranges, null checks, and list operations (IN, NOT IN).

### Why It's Critical

**1. Precise Segmentation**

- Filter to exact user cohorts
- Exclude noise and outliers
- Focus on relevant data

**2. Complex Analysis**

- Combine multiple conditions (AND/OR)
- Support edge cases
- Handle missing data

**3. Data Quality**

- Filter out test data
- Exclude internal users
- Validate data completeness

### Real-World Example

**Scenario:** Product manager wants to analyze "video engagement for paid users in California who watched >30 minute videos."

**Filter Setup:**

```
Event: video_play
Date Range: Last 30 days

Filters (AND logic):
1. pixel_properties.subscription_status = "paid"
2. pixel_properties.cf_state = "Rajasthan"
3. duration > 1800 (30 minutes in seconds)
4. pixel_properties_user_id IS NOT EMPTY (exclude anonymous)
```

**Results:**

- 12,450 users matched criteria
- Average video duration: 42 minutes
- Top video category: "JEE Physics"

**Business Impact:** Identified high-engagement paid users. Created "Advanced Physics" course targeting this segment. Result: 850 enrollments at $150 = $127,500 revenue.

### Key Capabilities

**String Operators:**

- `equals`, `not_equals`
- `contains`, `not_contains`
- `starts_with`, `ends_with`
- `regex` (pattern matching)
- `in`, `not_in` (list matching)

**Numeric Operators:**

- `equals`, `not_equals`
- `greater_than`, `less_than`
- `greater_than_or_equal`, `less_than_or_equal`
- `between` (range)

**Date Operators:**

- `before`, `after`
- `between` (date range)
- `is_today`, `is_yesterday`
- `is_last_7_days`, `is_last_30_days`

**Null Checks:**

- `is_empty` (null or empty string)
- `is_not_empty` (has value)

**Logic:**

- AND/OR combination
- Per-step filtering (Funnels)
- Global filtering (Insights)

### Query Pattern (Complex Filter)

```sql
SELECT
  event_name,
  count(*) as event_count,
  uniq(pixel_properties_user_id) as unique_users
FROM your_events_table
WHERE ist_date >= today() - 30
  AND ist_date <= today()
  -- String filter
  AND JSONExtractString(pixel_properties, 'subscription_status') = 'paid'
  -- String filter (case-insensitive)
  AND lower(JSONExtractString(pixel_properties, 'cf_state')) = 'rajasthan'
  -- Numeric filter
  AND toFloat64OrZero(duration) > 1800
  -- Null check
  AND pixel_properties_user_id != ''
  AND pixel_properties_user_id IS NOT NULL
GROUP BY event_name
ORDER BY event_count DESC
```

### Performance

- **Single filter:** <10ms overhead
- **Multiple filters (5):** <50ms overhead
- **Complex filters (10+):** <100ms overhead
- **Indexed properties:** <100ms (bloom_filter)

### Technical Innovation

- **Type-aware filtering:** Automatically applies correct ClickHouse function (`toFloat64OrZero`, `lower`, etc.)
- **Property value suggestions:** Auto-complete from recent data
- **Case-insensitive by default:** Uses `lower()` for string comparisons
- **Efficient IN/NOT IN:** Converts to ClickHouse tuple syntax for performance

---

## Summary: Feature Value Matrix

| Feature               | Primary Use Case        | Key Metric              | Typical Users       | Usage Frequency |
| --------------------- | ----------------------- | ----------------------- | ------------------- | --------------- |
| **Events Explorer**   | Debugging & QA          | Data quality            | Engineers, QA       | Daily           |
| **Insights**          | Trend analysis          | DAU, MAU, feature usage | PMs, Analysts       | Daily           |
| **Funnels**           | Conversion optimization | Conversion rates        | PMs, Growth         | Weekly          |
| **Retention**         | Product-market fit      | Retention curves        | PMs, Leadership     | Weekly          |
| **Cohort Analysis**   | Pattern recognition     | Retention heatmap       | Analysts, PMs       | Monthly         |
| **User Paths**        | Journey optimization    | Common paths            | UX, PMs             | Monthly         |
| **SQL Playground**    | Ad-hoc analysis         | Custom queries          | Analysts, Engineers | Weekly          |
| **Property Explorer** | Data discovery          | Property catalog        | Analysts, New users | As needed       |
| **Dashboards**        | Executive reporting     | Multi-metric view       | Leadership, Teams   | Daily           |
| **Saved Charts**      | Collaboration           | Chart library           | All users           | Daily           |
| **Advanced Filters**  | Precise segmentation    | Filtered results        | Analysts, PMs       | Daily           |

---

## Performance Benchmarks (Production Scale)

**Dataset:** 16.9B rows, 4.41TB compressed, 58.48TB uncompressed

| Feature              | Query Complexity | Current Performance | Target Performance |
| -------------------- | ---------------- | ------------------- | ------------------ |
| Events Explorer      | Low              | <500ms              | <500ms ✅          |
| Insights (Single)    | Medium           | <3s                 | <3s ✅             |
| Insights (Breakdown) | High             | <10s                | <10s ✅            |
| Funnels (2-step)     | Medium           | 25-30s              | 10-15s 🎯          |
| Funnels (5-step)     | High             | 25-30s              | 10-15s 🎯          |
| Retention            | High             | <10s                | <10s ✅            |
| Cohort Analysis      | Very High        | <15s                | <15s ✅            |
| User Paths           | Very High        | <30s                | <30s ✅            |
| SQL Playground       | Variable         | <30s                | <30s ✅            |
| Property Explorer    | Low              | <2s                 | <2s ✅             |
| Dashboards           | High             | <2s                 | <2s ✅             |

**Note:** 🎯 = Optimization target for Phase 2A (V1 query improvements)

---

## Technical Architecture Highlights

**Frontend-Only Design:**

- Zero backend infrastructure
- Direct ClickHouse queries over HTTPS
- Stateless, horizontally scalable

**Query Optimization:**

- CTEs for complex logic
- Window functions for deduplication
- Materialized columns (V2 schema)
- Efficient indexing (bloom filters, set indices)

**Caching Strategy:**

- `sessionStorage` for dropdown data
- Persistent until manual refresh
- Reduces redundant queries

**Security:**

- Google OAuth authentication
- ClickHouse RBAC authorization
- Query validation (SELECT-only)
- Audit logging for compliance

**Export Capabilities:**

- PNG/PDF: `html2canvas` + `jspdf`
- CSV: Client-side generation
- Dashboard export: Multi-chart PDF/CSV

---

**Last Updated:** January 2025  
**Version:** 1.0  
**Maintained By:** ClickSight Community
