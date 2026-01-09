-- ============================================
-- BigQuery Advanced Functions & Features
-- ============================================
-- Comprehensive examples using self-contained data
-- No external tables required - just run each query!
-- ============================================

-- ============================================
-- SECTION 1: Arrays - Creation & Operations
-- ============================================

-- Array creation methods
SELECT
    [1, 2, 3, 4, 5] AS literal_array,
    ARRAY<STRING>['apple', 'banana', 'cherry'] AS typed_array,
    GENERATE_ARRAY(1, 10) AS generated_1_to_10,
    GENERATE_ARRAY(0, 100, 10) AS by_tens,
    GENERATE_ARRAY(1.5, 5.5, 0.5) AS float_array;

-- Array functions
SELECT
    ARRAY_LENGTH([1, 2, 3, 4, 5]) AS arr_length,
    ARRAY_TO_STRING(['a', 'b', 'c'], '-') AS joined,
    ARRAY_REVERSE([1, 2, 3]) AS reversed,
    ARRAY_CONCAT([1, 2], [3, 4], [5]) AS concatenated,
    [1, 2, 3][OFFSET(0)] AS first_element,
    [1, 2, 3][ORDINAL(1)] AS also_first,
    [1, 2, 3][SAFE_OFFSET(10)] AS safe_null;

-- Array aggregation
WITH sales AS (
    SELECT 'Electronics' AS category, 'Laptop' AS product, 1200 AS price UNION ALL
    SELECT 'Electronics', 'Phone', 800 UNION ALL
    SELECT 'Electronics', 'Tablet', 500 UNION ALL
    SELECT 'Clothing', 'Shirt', 50 UNION ALL
    SELECT 'Clothing', 'Pants', 80
)
SELECT
    category,
    ARRAY_AGG(product) AS all_products,
    ARRAY_AGG(product ORDER BY price DESC) AS products_by_price,
    ARRAY_AGG(DISTINCT category) AS distinct_cats,
    ARRAY_AGG(product LIMIT 2) AS top_2_products
FROM sales
GROUP BY category;

-- ============================================
-- SECTION 2: UNNEST - Flatten Arrays to Rows
-- ============================================

-- Basic UNNEST
SELECT num
FROM UNNEST([10, 20, 30, 40, 50]) AS num;

-- UNNEST with offset (position)
SELECT
    element,
    offset AS position_0based,
    offset + 1 AS position_1based
FROM UNNEST(['a', 'b', 'c', 'd']) AS element WITH OFFSET AS offset;

-- UNNEST in FROM clause with other columns
WITH data AS (
    SELECT 'Alice' AS name, ['Python', 'SQL', 'Spark'] AS skills UNION ALL
    SELECT 'Bob', ['Java', 'Scala', 'Kafka']
)
SELECT
    name,
    skill
FROM data, UNNEST(skills) AS skill;

-- Cross join UNNEST for combinations
SELECT
    letter,
    number
FROM
    UNNEST(['A', 'B', 'C']) AS letter,
    UNNEST([1, 2, 3]) AS number
ORDER BY letter, number;

-- ============================================
-- SECTION 3: STRUCTs - Composite Types
-- ============================================

-- Create and access structs
SELECT
    STRUCT('John' AS name, 30 AS age, 'NYC' AS city) AS person,
    STRUCT('John', 30, 'NYC') AS anonymous_struct,
    STRUCT('John' AS name, 30 AS age).name AS extracted_name,
    STRUCT('John' AS name, 30 AS age).age AS extracted_age;

-- Array of structs
WITH employees AS (
    SELECT [
        STRUCT('Alice' AS name, 'Engineering' AS dept, 120000 AS salary),
        STRUCT('Bob', 'Sales', 90000),
        STRUCT('Carol', 'Engineering', 130000),
        STRUCT('David', 'Marketing', 85000)
    ] AS team
)
SELECT
    emp.name,
    emp.dept,
    emp.salary
FROM employees, UNNEST(team) AS emp
WHERE emp.salary > 100000;

-- Nested structs
SELECT
    STRUCT(
        'Order123' AS order_id,
        STRUCT('Alice' AS name, 'alice@example.com' AS email) AS customer,
        [
            STRUCT('Widget' AS product, 2 AS qty, 25.00 AS price),
            STRUCT('Gadget', 1, 75.00)
        ] AS items
    ) AS order_data;

-- ============================================
-- SECTION 4: Window Functions
-- ============================================

WITH sales AS (
    SELECT DATE '2024-01-01' AS sale_date, 'Alice' AS rep, 'Electronics' AS category, 1200 AS amount UNION ALL
    SELECT DATE '2024-01-01', 'Bob', 'Electronics', 800 UNION ALL
    SELECT DATE '2024-01-02', 'Alice', 'Clothing', 450 UNION ALL
    SELECT DATE '2024-01-02', 'Carol', 'Electronics', 1500 UNION ALL
    SELECT DATE '2024-01-03', 'Bob', 'Clothing', 300 UNION ALL
    SELECT DATE '2024-01-03', 'Alice', 'Electronics', 2000
)
SELECT
    sale_date,
    rep,
    category,
    amount,
    -- Ranking functions
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS row_num,
    RANK() OVER (PARTITION BY category ORDER BY amount DESC) AS rank,
    DENSE_RANK() OVER (PARTITION BY category ORDER BY amount DESC) AS dense_rank,
    PERCENT_RANK() OVER (PARTITION BY category ORDER BY amount) AS pct_rank,
    NTILE(3) OVER (ORDER BY amount) AS tercile,

    -- Navigation functions
    LAG(amount) OVER (PARTITION BY rep ORDER BY sale_date) AS prev_amount,
    LEAD(amount) OVER (PARTITION BY rep ORDER BY sale_date) AS next_amount,
    FIRST_VALUE(amount) OVER (PARTITION BY category ORDER BY amount DESC) AS category_max,
    LAST_VALUE(amount) OVER (PARTITION BY category ORDER BY amount DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS category_min,
    NTH_VALUE(amount, 2) OVER (PARTITION BY category ORDER BY amount DESC) AS second_highest,

    -- Aggregations
    SUM(amount) OVER (PARTITION BY category) AS category_total,
    AVG(amount) OVER (PARTITION BY rep ORDER BY sale_date ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS moving_avg,
    COUNT(*) OVER () AS total_rows
FROM sales;

-- ============================================
-- SECTION 5: Date & Time Functions
-- ============================================

-- Date generation and manipulation
SELECT
    CURRENT_DATE() AS today,
    CURRENT_TIMESTAMP() AS now,
    CURRENT_DATETIME() AS datetime_now,
    DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY) AS in_30_days,
    DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH) AS last_month,
    DATE_DIFF(DATE '2024-12-31', DATE '2024-01-01', DAY) AS days_in_year,
    DATE_TRUNC(CURRENT_DATE(), MONTH) AS month_start,
    LAST_DAY(DATE '2024-02-15') AS feb_last_day;

-- Date parts extraction
SELECT
    EXTRACT(YEAR FROM DATE '2024-06-15') AS year,
    EXTRACT(MONTH FROM DATE '2024-06-15') AS month,
    EXTRACT(DAY FROM DATE '2024-06-15') AS day,
    EXTRACT(DAYOFWEEK FROM DATE '2024-06-15') AS dow_sun1,
    EXTRACT(WEEK FROM DATE '2024-06-15') AS week_num,
    EXTRACT(QUARTER FROM DATE '2024-06-15') AS quarter,
    EXTRACT(DAYOFYEAR FROM DATE '2024-06-15') AS day_of_year;

-- Date formatting and parsing
SELECT
    FORMAT_DATE('%Y-%m-%d', CURRENT_DATE()) AS iso_date,
    FORMAT_DATE('%B %d, %Y', DATE '2024-12-25') AS long_format,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS formatted_ts,
    PARSE_DATE('%Y%m%d', '20241225') AS parsed_date,
    PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', '2024-12-25 14:30:00') AS parsed_ts;

-- Date arrays and sequences
SELECT
    day
FROM UNNEST(GENERATE_DATE_ARRAY(DATE '2024-01-01', DATE '2024-01-07')) AS day;

-- Timestamp arithmetic
SELECT
    TIMESTAMP_ADD(TIMESTAMP '2024-01-01 12:00:00', INTERVAL 2 HOUR) AS plus_2h,
    TIMESTAMP_DIFF(TIMESTAMP '2024-01-02 00:00:00', TIMESTAMP '2024-01-01 00:00:00', HOUR) AS hours_diff,
    DATETIME_TRUNC(DATETIME '2024-06-15 14:35:22', HOUR) AS truncated;

-- ============================================
-- SECTION 6: String Functions
-- ============================================

-- Basic string operations
SELECT
    CONCAT('Hello', ' ', 'World') AS concatenated,
    ARRAY_TO_STRING(['2024', '01', '15'], '-') AS with_separator,
    LENGTH('BigQuery') AS str_length,
    BYTE_LENGTH('BigQuery') AS byte_len,
    UPPER('bigquery') AS upper_case,
    LOWER('BIGQUERY') AS lower_case,
    INITCAP('hello world') AS title_case,
    REVERSE('BigQuery') AS reversed,
    REPEAT('ab', 3) AS repeated;

-- Substring and position
SELECT
    SUBSTR('BigQuery', 1, 3) AS first_3,
    SUBSTR('BigQuery', 4) AS from_4th,
    LEFT('BigQuery', 3) AS left_3,
    RIGHT('BigQuery', 5) AS right_5,
    STRPOS('BigQuery', 'Query') AS position,
    STARTS_WITH('BigQuery', 'Big') AS starts_big,
    ENDS_WITH('BigQuery', 'Query') AS ends_query,
    STRPOS('BigQuery SQL', 'Query') > 0 AS has_match;

-- Trimming and padding
SELECT
    TRIM('  hello  ') AS trimmed,
    LTRIM('xxhelloxx', 'x') AS left_trim,
    RTRIM('xxhelloxx', 'x') AS right_trim,
    LPAD('42', 5, '0') AS left_padded,
    RPAD('42', 5, '0') AS right_padded;

-- String splitting and replacement
SELECT
    SPLIT('a,b,c,d', ',') AS split_array,
    REPLACE('Hello World', 'World', 'BigQuery') AS replaced,
    TRANSLATE('hello', 'elo', '310') AS translated;

-- ============================================
-- SECTION 7: Regular Expressions
-- ============================================

SELECT
    REGEXP_CONTAINS('hello123', r'\d+') AS has_digits,
    REGEXP_EXTRACT('Price: $123.45', r'[\d.]+') AS extracted_number,
    REGEXP_EXTRACT_ALL('a1b2c3d4', r'\d') AS all_digits,
    REGEXP_REPLACE('hello   world', r'\s+', ' ') AS normalized,
    REGEXP_INSTR('abc123def', r'\d+') AS digit_position,
    REGEXP_SUBSTR('email: test@example.com here', r'[\w.]+@[\w.]+') AS extracted_email;

-- Extract multiple parts (BigQuery allows only 1 capture group per REGEXP_EXTRACT)
SELECT
    REGEXP_EXTRACT('John Doe, Age 30', r'(\w+)\s+\w+') AS first_name,
    REGEXP_EXTRACT('John Doe, Age 30', r'\w+\s+(\w+)') AS last_name,
    REGEXP_EXTRACT('John Doe, Age 30', r'Age\s+(\d+)') AS age;

-- ============================================
-- SECTION 8: JSON Functions
-- ============================================

-- JSON creation and extraction
SELECT
    JSON '{"name": "Alice", "age": 30}' AS json_literal,
    TO_JSON(STRUCT('Bob' AS name, 25 AS age)) AS struct_to_json,
    JSON_VALUE('{"name": "Alice", "age": 30}', '$.name') AS name_value,
    JSON_QUERY('{"items": [1, 2, 3]}', '$.items') AS items_array,
    JSON_QUERY_ARRAY('{"items": [1, 2, 3]}', '$.items') AS items_as_array;

-- Complex JSON operations
WITH json_data AS (
    SELECT JSON '{"users": [{"name": "Alice", "scores": [95, 87, 92]}, {"name": "Bob", "scores": [78, 85, 90]}], "metadata": {"version": 2, "active": true}}' AS doc
)
SELECT
    JSON_VALUE(doc, '$.users[0].name') AS first_user,
    JSON_VALUE(doc, '$.metadata.version') AS version,
    JSON_QUERY(doc, '$.users[0].scores') AS first_user_scores,
    JSON_TYPE(JSON_QUERY(doc, '$.users')) AS users_type,
    ARRAY_LENGTH(JSON_QUERY_ARRAY(doc, '$.users')) AS user_count
FROM json_data;

-- JSON object construction
SELECT
    JSON_OBJECT('name', 'Alice', 'age', 30) AS constructed,
    JSON_ARRAY(1, 2, 3, 'four') AS json_arr,
    JSON_SET(JSON '{"a": 1}', '$.b', 2) AS with_new_key;

-- ============================================
-- SECTION 9: Aggregate Functions
-- ============================================

WITH numbers AS (
    SELECT num FROM UNNEST([1, 2, 3, 4, 5, 5, NULL, 10]) AS num
)
SELECT
    COUNT(*) AS count_all,
    COUNT(num) AS count_non_null,
    COUNTIF(num > 3) AS count_greater_3,
    SUM(num) AS total,
    AVG(num) AS average,
    MIN(num) AS minimum,
    MAX(num) AS maximum,
    ANY_VALUE(num) AS any_val,
    LOGICAL_OR(num > 5) AS any_over_5,
    LOGICAL_AND(num > 0) AS all_positive,
    STRING_AGG(CAST(num AS STRING), ', ' ORDER BY num) AS all_nums_str,
    ARRAY_AGG(num IGNORE NULLS ORDER BY num) AS sorted_array
FROM numbers;

-- Statistical aggregates
WITH data AS (
    SELECT val FROM UNNEST([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) AS val
)
SELECT
    STDDEV(val) AS std_dev,
    STDDEV_POP(val) AS std_dev_pop,
    VARIANCE(val) AS variance,
    VAR_POP(val) AS var_pop,
    CORR(val, val * 2 + 5) AS correlation,
    COVAR_SAMP(val, val * 2) AS covariance
FROM data;

-- ============================================
-- SECTION 10: Approximate Aggregates
-- ============================================

WITH data AS (
    SELECT id FROM UNNEST(GENERATE_ARRAY(1, 10000)) AS id
)
SELECT
    APPROX_COUNT_DISTINCT(id) AS approx_distinct,
    APPROX_QUANTILES(id, 4) AS quartiles,
    APPROX_TOP_COUNT(MOD(id, 10), 3) AS top_3_remainders,
    APPROX_TOP_SUM(MOD(id, 10), id, 3) AS top_3_by_sum
FROM data;

-- ============================================
-- SECTION 11: Conditional Expressions
-- ============================================

SELECT
    -- CASE expressions
    CASE WHEN 5 > 3 THEN 'yes' ELSE 'no' END AS simple_case,
    CASE 2
        WHEN 1 THEN 'one'
        WHEN 2 THEN 'two'
        ELSE 'other'
    END AS value_case,

    -- Null handling
    COALESCE(NULL, NULL, 'default') AS first_non_null,
    IFNULL(NULL, 'fallback') AS if_null,
    NULLIF(5, 5) AS null_if_equal,
    IF(10 > 5, 'greater', 'lesser') AS if_expr,

    -- Safe operations
    SAFE_DIVIDE(10, 0) AS safe_div_zero,
    SAFE_DIVIDE(10, 2) AS safe_div_normal,
    SAFE_CAST('abc' AS INT64) AS safe_cast_fail,
    SAFE_CAST('123' AS INT64) AS safe_cast_ok;

-- ============================================
-- SECTION 12: GROUPING SETS, ROLLUP, CUBE
-- ============================================

WITH sales AS (
    SELECT 'Electronics' AS category, 'NYC' AS region, 1000 AS amount UNION ALL
    SELECT 'Electronics', 'LA', 1200 UNION ALL
    SELECT 'Clothing', 'NYC', 500 UNION ALL
    SELECT 'Clothing', 'LA', 600
)
-- ROLLUP for hierarchical totals
SELECT
    COALESCE(category, 'ALL') AS category,
    COALESCE(region, 'ALL') AS region,
    SUM(amount) AS total
FROM sales
GROUP BY ROLLUP(category, region)
ORDER BY category NULLS LAST, region NULLS LAST;

-- CUBE for all combinations
WITH sales AS (
    SELECT 'Electronics' AS category, 'NYC' AS region, 1000 AS amount UNION ALL
    SELECT 'Electronics', 'LA', 1200 UNION ALL
    SELECT 'Clothing', 'NYC', 500 UNION ALL
    SELECT 'Clothing', 'LA', 600
)
SELECT
    category,
    region,
    SUM(amount) AS total,
    GROUPING(category) AS cat_grouping,
    GROUPING(region) AS reg_grouping
FROM sales
GROUP BY CUBE(category, region);

-- ============================================
-- SECTION 13: PIVOT & UNPIVOT
-- ============================================

-- PIVOT: rows to columns
WITH sales AS (
    SELECT 'Q1' AS quarter, 'Electronics' AS category, 1000 AS amount UNION ALL
    SELECT 'Q1', 'Clothing', 500 UNION ALL
    SELECT 'Q2', 'Electronics', 1200 UNION ALL
    SELECT 'Q2', 'Clothing', 600
)
SELECT * FROM sales
PIVOT(SUM(amount) FOR category IN ('Electronics', 'Clothing'));

-- UNPIVOT: columns to rows
WITH wide AS (
    SELECT 'Q1' AS quarter, 100 AS jan, 120 AS feb, 90 AS mar UNION ALL
    SELECT 'Q2', 130, 140, 150
)
SELECT * FROM wide
UNPIVOT(amount FOR month IN (jan, feb, mar));

-- ============================================
-- SECTION 14: Recursive CTEs
-- ============================================

-- Generate Fibonacci sequence
WITH RECURSIVE fib AS (
    SELECT 1 AS n, CAST(0 AS INT64) AS a, CAST(1 AS INT64) AS b
    UNION ALL
    SELECT n + 1, b, a + b
    FROM fib
    WHERE n < 20
)
SELECT n, a AS fibonacci FROM fib;

-- Hierarchical data (org chart)
WITH RECURSIVE org AS (
    -- Base case: CEO (no manager)
    SELECT 'CEO' AS title, CAST(NULL AS STRING) AS manager, 0 AS level, 'CEO' AS path
    UNION ALL
    -- Recursive: employees with managers
    SELECT
        e.title,
        e.manager,
        o.level + 1,
        CONCAT(o.path, ' > ', e.title)
    FROM (
        SELECT 'CTO' AS title, 'CEO' AS manager UNION ALL
        SELECT 'CFO', 'CEO' UNION ALL
        SELECT 'Dev Lead', 'CTO' UNION ALL
        SELECT 'Dev 1', 'Dev Lead' UNION ALL
        SELECT 'Dev 2', 'Dev Lead' UNION ALL
        SELECT 'Accountant', 'CFO'
    ) e
    JOIN org o ON e.manager = o.title
)
SELECT
    CONCAT(REPEAT('  ', level), title) AS org_chart,
    level,
    path
FROM org
ORDER BY path;

-- ============================================
-- SECTION 15: Table Functions
-- ============================================

-- Generate timestamp array
SELECT ts
FROM UNNEST(GENERATE_TIMESTAMP_ARRAY(
    TIMESTAMP '2024-01-01 00:00:00',
    TIMESTAMP '2024-01-01 06:00:00',
    INTERVAL 1 HOUR
)) AS ts;

-- Generate date array with custom step
SELECT d
FROM UNNEST(GENERATE_DATE_ARRAY(
    DATE '2024-01-01',
    DATE '2024-12-31',
    INTERVAL 1 MONTH
)) AS d;

-- ============================================
-- SECTION 16: Geography Functions
-- ============================================

-- Create and manipulate geography
SELECT
    ST_GEOGPOINT(-122.4194, 37.7749) AS sf_point,
    ST_DISTANCE(
        ST_GEOGPOINT(-122.4194, 37.7749),  -- San Francisco
        ST_GEOGPOINT(-118.2437, 34.0522)   -- Los Angeles
    ) AS distance_meters,
    ST_DISTANCE(
        ST_GEOGPOINT(-122.4194, 37.7749),
        ST_GEOGPOINT(-118.2437, 34.0522)
    ) / 1609.34 AS distance_miles;

-- Geography from text
SELECT
    ST_GEOGFROMTEXT('POINT(-122.4194 37.7749)') AS point_from_wkt,
    ST_GEOGFROMTEXT('LINESTRING(-122.4194 37.7749, -118.2437 34.0522)') AS line,
    ST_ASTEXT(ST_GEOGPOINT(-122.4194, 37.7749)) AS point_to_wkt;

-- ============================================
-- SECTION 17: Advanced Techniques
-- ============================================

-- Deduplication with ROW_NUMBER
WITH duplicates AS (
    SELECT 1 AS id, 'Alice' AS name, TIMESTAMP '2024-01-01 10:00:00' AS updated_at UNION ALL
    SELECT 1, 'Alice', TIMESTAMP '2024-01-02 10:00:00' UNION ALL
    SELECT 2, 'Bob', TIMESTAMP '2024-01-01 10:00:00'
),
ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn
    FROM duplicates
)
SELECT id, name, updated_at
FROM ranked
WHERE rn = 1;

-- Gap and island detection
WITH events AS (
    SELECT DATE '2024-01-01' AS event_date UNION ALL
    SELECT DATE '2024-01-02' UNION ALL
    SELECT DATE '2024-01-03' UNION ALL
    SELECT DATE '2024-01-06' UNION ALL
    SELECT DATE '2024-01-07' UNION ALL
    SELECT DATE '2024-01-10'
),
with_groups AS (
    SELECT
        event_date,
        DATE_DIFF(event_date, DATE '2024-01-01', DAY) AS day_num,
        ROW_NUMBER() OVER (ORDER BY event_date) AS rn,
        DATE_DIFF(event_date, DATE '2024-01-01', DAY) - ROW_NUMBER() OVER (ORDER BY event_date) AS grp
    FROM events
)
SELECT
    MIN(event_date) AS island_start,
    MAX(event_date) AS island_end,
    COUNT(*) AS consecutive_days
FROM with_groups
GROUP BY grp
ORDER BY island_start;

-- Running total with reset
WITH transactions AS (
    SELECT 'A' AS account, DATE '2024-01-01' AS dt, 100 AS amount UNION ALL
    SELECT 'A', DATE '2024-01-02', 50 UNION ALL
    SELECT 'A', DATE '2024-01-03', -200 UNION ALL  -- Reset trigger
    SELECT 'A', DATE '2024-01-04', 75 UNION ALL
    SELECT 'B', DATE '2024-01-01', 200 UNION ALL
    SELECT 'B', DATE '2024-01-02', 150
)
SELECT
    account,
    dt,
    amount,
    SUM(amount) OVER (PARTITION BY account ORDER BY dt) AS running_total
FROM transactions
ORDER BY account, dt;

-- ============================================
-- SECTION 18: Performance & Best Practices
-- ============================================

-- Use SAFE functions to avoid errors
SELECT
    SAFE_DIVIDE(10, 0) AS no_error,
    SAFE.PARSE_DATE('%Y-%m-%d', 'invalid') AS invalid_date,
    SAFE_CAST('not_a_number' AS INT64) AS bad_cast;

-- Efficient NULL handling
WITH data AS (
    SELECT 1 AS id, 'value' AS col UNION ALL
    SELECT 2, NULL UNION ALL
    SELECT 3, ''
)
SELECT
    id,
    col,
    col IS NULL AS is_null,
    col = '' AS is_empty,
    COALESCE(NULLIF(col, ''), 'default') AS null_or_empty_replaced
FROM data;

-- ============================================
-- SECTION 19: Useful Patterns
-- ============================================

-- Generate a calendar table
SELECT
    day AS date,
    EXTRACT(YEAR FROM day) AS year,
    EXTRACT(MONTH FROM day) AS month,
    EXTRACT(DAY FROM day) AS day_of_month,
    FORMAT_DATE('%A', day) AS day_name,
    EXTRACT(DAYOFWEEK FROM day) AS day_of_week,
    CASE WHEN EXTRACT(DAYOFWEEK FROM day) IN (1, 7) THEN TRUE ELSE FALSE END AS is_weekend,
    EXTRACT(WEEK FROM day) AS week_number,
    EXTRACT(QUARTER FROM day) AS quarter
FROM UNNEST(GENERATE_DATE_ARRAY(DATE '2024-01-01', DATE '2024-01-31')) AS day;

-- Sessionization (group events into sessions)
WITH events AS (
    SELECT 'user1' AS user_id, TIMESTAMP '2024-01-01 10:00:00' AS event_time UNION ALL
    SELECT 'user1', TIMESTAMP '2024-01-01 10:05:00' UNION ALL
    SELECT 'user1', TIMESTAMP '2024-01-01 10:07:00' UNION ALL
    SELECT 'user1', TIMESTAMP '2024-01-01 11:30:00' UNION ALL  -- New session (30+ min gap)
    SELECT 'user1', TIMESTAMP '2024-01-01 11:35:00'
),
with_gaps AS (
    SELECT
        *,
        TIMESTAMP_DIFF(event_time, LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time), MINUTE) AS minutes_since_last
    FROM events
),
with_session_start AS (
    SELECT
        *,
        CASE WHEN minutes_since_last IS NULL OR minutes_since_last > 30 THEN 1 ELSE 0 END AS is_session_start
    FROM with_gaps
)
SELECT
    user_id,
    event_time,
    SUM(is_session_start) OVER (PARTITION BY user_id ORDER BY event_time) AS session_id
FROM with_session_start;
