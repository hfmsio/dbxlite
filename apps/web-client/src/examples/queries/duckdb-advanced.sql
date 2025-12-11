-- ============================================
-- DuckDB Advanced Functions & Tricks
-- ============================================
-- Deep dive into powerful DuckDB features
-- that make complex queries simple!
-- ============================================

-- ============================================
-- 🚀 SETUP: Run this block first to create all sample tables
-- ============================================
-- Execute this entire block once, then run any query below independently.

CREATE OR REPLACE TEMP TABLE sales AS
SELECT * FROM (VALUES
    ('2024-01-01', 'Alice', 'Electronics', 1200),
    ('2024-01-01', 'Bob', 'Electronics', 800),
    ('2024-01-02', 'Alice', 'Clothing', 450),
    ('2024-01-02', 'Carol', 'Electronics', 1500),
    ('2024-01-03', 'Bob', 'Clothing', 300),
    ('2024-01-03', 'Alice', 'Electronics', 2000),
    ('2024-01-04', 'Carol', 'Clothing', 600),
    ('2024-01-04', 'David', 'Electronics', 950)
) AS t(sale_date, salesperson, category, amount);

CREATE OR REPLACE TEMP TABLE employees_hier AS
SELECT * FROM (VALUES
    (1, 'CEO', NULL),
    (2, 'CTO', 1),
    (3, 'CFO', 1),
    (4, 'Dev Lead', 2),
    (5, 'Dev 1', 4),
    (6, 'Dev 2', 4),
    (7, 'Accountant', 3)
) AS t(id, title, manager_id);

CREATE OR REPLACE TEMP TABLE stock_prices AS
SELECT * FROM (VALUES
    ('2024-01-01 09:30:00'::TIMESTAMP, 'AAPL', 150.00),
    ('2024-01-01 10:00:00'::TIMESTAMP, 'AAPL', 151.50),
    ('2024-01-01 10:30:00'::TIMESTAMP, 'AAPL', 149.75),
    ('2024-01-01 09:30:00'::TIMESTAMP, 'GOOG', 140.00),
    ('2024-01-01 10:15:00'::TIMESTAMP, 'GOOG', 142.00)
) AS t(ts, symbol, price);

CREATE OR REPLACE TEMP TABLE trades AS
SELECT * FROM (VALUES
    ('2024-01-01 09:45:00'::TIMESTAMP, 'AAPL', 100),
    ('2024-01-01 10:20:00'::TIMESTAMP, 'AAPL', 50),
    ('2024-01-01 10:00:00'::TIMESTAMP, 'GOOG', 75)
) AS t(trade_ts, symbol, quantity);

CREATE OR REPLACE TEMP TABLE agg_demo AS
SELECT * FROM (VALUES
    (1, 'A', 10.5, true,  7),
    (2, 'A', 20.0, false, 3),
    (3, 'B', 15.5, true,  5),
    (4, 'B', 25.0, true,  9),
    (5, 'B', 30.0, false, 1),
    (6, 'A', NULL, true,  6)
) AS t(id, grp, val, flag, bits);

-- ✅ Setup complete! Tables created: sales, employees_hier, stock_prices, trades, agg_demo

-- ============================================
-- SECTION 1: QUALIFY - Filter Window Results
-- ============================================
-- QUALIFY is like HAVING but for window functions
-- No subquery needed!

-- Get top 2 sales per category (no subquery!)
SELECT *, RANK() OVER (PARTITION BY category ORDER BY amount DESC) AS rank
FROM sales
QUALIFY rank <= 2;

-- ============================================
-- SECTION 2: Advanced Window Frames
-- ============================================

-- RANGE vs ROWS vs GROUPS frames
SELECT
    sale_date::DATE AS sale_date,
    salesperson,
    amount,
    -- ROWS: exact row count
    SUM(amount) OVER (ORDER BY sale_date::DATE ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS sum_rows,
    -- RANGE: by value range (same dates grouped)
    SUM(amount) OVER (ORDER BY sale_date::DATE RANGE BETWEEN INTERVAL 1 DAY PRECEDING AND CURRENT ROW) AS sum_range,
    -- Moving average with EXCLUDE
    AVG(amount) OVER (ORDER BY sale_date::DATE ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING EXCLUDE CURRENT ROW) AS avg_exclude_current
FROM sales;

-- ============================================
-- SECTION 3: GROUPING SETS, CUBE, ROLLUP
-- ============================================

-- Multiple grouping levels in one query
SELECT
    COALESCE(category, '** ALL **') AS category,
    COALESCE(salesperson, '** ALL **') AS salesperson,
    SUM(amount) AS total,
    GROUPING(category) AS is_category_total,
    GROUPING(salesperson) AS is_person_total
FROM sales
GROUP BY GROUPING SETS (
    (category, salesperson),  -- Detail
    (category),               -- Category subtotal
    (salesperson),            -- Person subtotal
    ()                        -- Grand total
)
ORDER BY GROUPING(category), GROUPING(salesperson), category, salesperson;

-- CUBE: all combinations (2^n groupings)
SELECT category, salesperson, SUM(amount)
FROM sales
GROUP BY CUBE (category, salesperson);

-- ROLLUP: hierarchical (n+1 groupings)
SELECT category, salesperson, SUM(amount)
FROM sales
GROUP BY ROLLUP (category, salesperson);

-- ============================================
-- SECTION 4: List/Array Functions
-- ============================================

SELECT
    -- Create lists
    [1, 2, 3, 4, 5] AS basic_list,
    LIST_VALUE(10, 20, 30) AS from_values,
    RANGE(1, 10) AS range_list,
    GENERATE_SERIES(1, 5) AS series,

    -- List operations
    LIST_APPEND([1,2,3], 4) AS appended,
    LIST_PREPEND(0, [1,2,3]) AS prepended,
    LIST_CONCAT([1,2], [3,4]) AS concatenated,
    LIST_REVERSE([1,2,3,4,5]) AS reversed,
    LIST_SORT([3,1,4,1,5,9,2,6]) AS sorted,
    LIST_DISTINCT([1,1,2,2,3,3]) AS distinct_vals,
    LIST_SLICE([1,2,3,4,5], 2, 4) AS sliced,

    -- Aggregations on lists
    LIST_SUM([1,2,3,4,5]) AS sum_list,
    LIST_AVG([1,2,3,4,5]) AS avg_list,
    LIST_MIN([3,1,4,1,5]) AS min_list,
    LIST_MAX([3,1,4,1,5]) AS max_list;

-- List comprehension with transforms
SELECT
    [x * 2 FOR x IN [1,2,3,4,5]] AS doubled,
    [x FOR x IN [1,2,3,4,5,6,7,8,9,10] IF x % 2 = 0] AS evens_only,
    [x * x FOR x IN RANGE(1, 6)] AS squares,
    LIST_FILTER([1,2,3,4,5,6], x -> x > 3) AS filtered,
    LIST_TRANSFORM([1,2,3,4], x -> x * 10) AS transformed;

-- ============================================
-- SECTION 5: MAP Operations
-- ============================================

SELECT
    -- Create maps
    MAP {'a': 1, 'b': 2, 'c': 3} AS basic_map,
    MAP_FROM_ENTRIES([('x', 10), ('y', 20)]) AS from_entries,

    -- Map operations
    MAP {'a': 1, 'b': 2}['a'] AS map_access,
    MAP_KEYS(MAP {'a': 1, 'b': 2, 'c': 3}) AS keys,
    MAP_VALUES(MAP {'a': 1, 'b': 2, 'c': 3}) AS vals,
    MAP_ENTRIES(MAP {'a': 1, 'b': 2}) AS entries,
    ELEMENT_AT(MAP {'x': 100, 'y': 200}, 'x') AS element,
    CARDINALITY(MAP {'a': 1, 'b': 2, 'c': 3}) AS map_size;

-- ============================================
-- SECTION 6: Advanced String Functions
-- ============================================

SELECT
    -- Regex operations
    REGEXP_MATCHES('hello123world', '\d+') AS has_digits,
    REGEXP_EXTRACT('Price: $123.45', '[\d.]+') AS extracted_number,
    REGEXP_EXTRACT_ALL('a1b2c3d4', '\d') AS all_digits,
    REGEXP_REPLACE('hello   world', '\s+', ' ') AS normalized,
    STRING_SPLIT_REGEX('a,b-c:d', '[,\-:]') AS split_multi,

    -- String manipulation
    REPEAT('ab', 3) AS repeated,
    REVERSE('hello') AS reversed,
    TRANSLATE('hello', 'elo', '310') AS translated,
    LPAD('42', 5, '0') AS left_padded,
    FORMAT('{} + {} = {}', 1, 2, 3) AS formatted;

-- String aggregation (separate query)
SELECT STRING_AGG(x, ' - ' ORDER BY x) AS aggregated
FROM (VALUES ('apple'), ('banana'), ('cherry')) AS t(x);

-- ============================================
-- SECTION 7: Advanced Date/Time
-- ============================================

SELECT
    -- Date generation
    GENERATE_SERIES(DATE '2024-01-01', DATE '2024-01-07', INTERVAL 1 DAY) AS date_series,

    -- Date parts
    DATE_PART(['year', 'month', 'day'], DATE '2024-06-15') AS parts_array,
    DATE_DIFF('day', DATE '2024-01-01', DATE '2024-12-31') AS days_diff,
    DATE_TRUNC('week', TIMESTAMP '2024-06-15 14:30:00') AS week_start,

    -- Date formatting (DuckDB: strftime(timestamp, format))
    STRFTIME(CURRENT_TIMESTAMP::TIMESTAMP, '%Y-%m-%d %H:%M:%S') AS formatted_ts,
    STRPTIME('2024-06-15', '%Y-%m-%d') AS parsed_date,

    -- Time zones
    CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York' AS ny_time,

    -- Special values
    CURRENT_DATE AS today,
    CURRENT_DATE + INTERVAL 30 DAY AS in_30_days,
    LAST_DAY(DATE '2024-02-15') AS feb_last_day,
    MAKE_DATE(2024, 12, 25) AS christmas;

-- ============================================
-- SECTION 8: UNNEST & LATERAL
-- ============================================

-- UNNEST: expand arrays to rows
SELECT
    name,
    UNNEST(skills) AS skill
FROM (VALUES
    ('Alice', ['Python', 'SQL', 'Spark']),
    ('Bob', ['Java', 'Scala'])
) AS t(name, skills);

-- UNNEST with position using generate_series
WITH arr AS (SELECT ['a', 'b', 'c', 'd'] AS vals)
SELECT
    vals[i] AS val,
    i AS position
FROM arr, generate_series(1, LEN(vals)) AS t(i);

-- LATERAL join: correlated subqueries made easy
WITH products AS (
    SELECT * FROM (VALUES
        (1, 'Laptop', [1000, 1100, 1050]),
        (2, 'Phone', [500, 520, 480, 510])
    ) AS t(id, name, price_history)
)
SELECT
    p.name,
    p.price_history[i] AS price,
    i AS price_index
FROM products p, generate_series(1, LEN(p.price_history)) AS gs(i);

-- ============================================
-- SECTION 9: Recursive CTEs
-- ============================================

-- Generate Fibonacci sequence
WITH RECURSIVE fib(n, a, b) AS (
    SELECT 1, 0::BIGINT, 1::BIGINT
    UNION ALL
    SELECT n + 1, b, a + b
    FROM fib
    WHERE n < 20
)
SELECT n, a AS fibonacci FROM fib;

-- Hierarchical data (org chart) - uses employees_hier table from setup

WITH RECURSIVE org_tree AS (
    SELECT id, title, manager_id, 0 AS level, title AS path
    FROM employees_hier WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.title, e.manager_id, t.level + 1, t.path || ' > ' || e.title
    FROM employees_hier e
    JOIN org_tree t ON e.manager_id = t.id
)
SELECT REPEAT('  ', level) || title AS org_chart, level, path
FROM org_tree
ORDER BY path;

-- ============================================
-- SECTION 10: PIVOT / UNPIVOT
-- ============================================

-- Pivot example (rows to columns)
PIVOT sales
ON category
USING SUM(amount)
GROUP BY salesperson
ORDER BY salesperson;

-- Unpivot example (columns to rows)
WITH wide_data AS (
    SELECT 'Q1' AS quarter, 100 AS jan, 120 AS feb, 90 AS mar
    UNION ALL
    SELECT 'Q2', 130, 140, 150
)
UNPIVOT wide_data
ON jan, feb, mar
INTO NAME month VALUE amount;

-- ============================================
-- SECTION 11: ASOF Joins (Time-series)
-- ============================================
-- Uses stock_prices and trades tables from setup

-- ASOF join: find price at or before trade time
SELECT
    t.trade_ts,
    t.symbol,
    t.quantity,
    p.price AS price_at_trade,
    t.quantity * p.price AS trade_value
FROM trades t
ASOF JOIN stock_prices p
    ON t.symbol = p.symbol
    AND t.trade_ts >= p.ts;

-- ============================================
-- SECTION 12: SAMPLE & Approximate Functions
-- ============================================

-- Random sampling methods
SELECT * FROM sales USING SAMPLE 50%;                    -- 50% of rows
SELECT * FROM sales USING SAMPLE 2 ROWS;                 -- exactly 2 rows (reservoir)
SELECT * FROM sales USING SAMPLE 50 PERCENT (bernoulli); -- Bernoulli sampling

-- Approximate distinct count (HyperLogLog)
SELECT APPROX_COUNT_DISTINCT(salesperson) FROM sales;

-- Approximate quantiles
SELECT
    APPROX_QUANTILE(amount, 0.5) AS median,
    APPROX_QUANTILE(amount, [0.25, 0.5, 0.75]) AS quartiles
FROM sales;

-- ============================================
-- SECTION 13: EXCLUDE & REPLACE in SELECT
-- ============================================

-- Select all except specific columns
SELECT * EXCLUDE (sale_date)
FROM sales;

-- Replace column with expression
SELECT * REPLACE (amount * 1.1 AS amount)
FROM sales;

-- Combine both
SELECT * EXCLUDE (sale_date) REPLACE (UPPER(salesperson) AS salesperson)
FROM sales;

-- ============================================
-- SECTION 14: MACROS (Custom Functions)
-- ============================================

-- Create a scalar macro
CREATE OR REPLACE MACRO double_it(x) AS x * 2;
CREATE OR REPLACE MACRO greet(name) AS 'Hello, ' || name || '!';
CREATE OR REPLACE MACRO div_or_null(a, b) AS CASE WHEN b = 0 THEN NULL ELSE a / b END;

SELECT
    double_it(21) AS doubled,
    greet('DuckDB') AS greeting,
    div_or_null(10, 0) AS null_on_zero,
    div_or_null(10, 2) AS normal_result;

-- Table macro (generates rows)
CREATE OR REPLACE MACRO range_table(start_val, end_val) AS TABLE
    SELECT UNNEST(RANGE(start_val, end_val + 1)) AS n;

SELECT * FROM range_table(1, 5);

-- Get top 3 sales directly (macros can't take table refs)
SELECT * FROM sales ORDER BY amount DESC LIMIT 3;

-- ============================================
-- SECTION 15: Error Handling & Coalesce
-- ============================================

SELECT
    -- Null handling
    COALESCE(NULL, NULL, 'default') AS first_non_null,
    NULLIF(5, 5) AS null_if_equal,
    IFNULL(NULL, 'fallback') AS if_null,
    -- Ternary logic with CASE
    CASE WHEN NULL IS NULL THEN 'is_null' ELSE 'has_val' END AS null_check,

    -- Try operations (return NULL on error)
    TRY_CAST('abc' AS INTEGER) AS safe_cast,
    TRY_CAST('123' AS INTEGER) AS valid_cast;

-- ============================================
-- SECTION 16: JSON Advanced
-- ============================================

WITH json_data AS (
    SELECT '{
        "users": [
            {"name": "Alice", "scores": [95, 87, 92]},
            {"name": "Bob", "scores": [78, 85, 90]}
        ],
        "metadata": {"version": 2, "active": true}
    }'::JSON AS doc
)
SELECT
    -- Path extraction
    doc -> 'users' -> 0 -> 'name' AS first_user,
    doc ->> '$.users[*].name' AS all_names,
    JSON_EXTRACT(doc, '$.users[0].scores[0]') AS first_score,
    JSON_EXTRACT_STRING(doc, '$.metadata.version') AS version,

    -- JSON manipulation
    JSON_KEYS(doc) AS top_keys,
    JSON_TYPE(doc -> 'users') AS users_type,
    JSON_ARRAY_LENGTH(doc -> 'users') AS user_count,
    JSON_VALID('{"valid": true}') AS is_valid
FROM json_data;

-- ============================================
-- SECTION 26: Comprehensive Aggregation Functions
-- ============================================
-- DuckDB supports 50+ aggregate functions!
-- Uses agg_demo table from setup.

-- ============================================
-- Basic Aggregates (COUNT, SUM, AVG, MIN, MAX)
-- ============================================
SELECT
    grp,
    COUNT(*) AS count_all,
    COUNT(val) AS count_non_null,
    SUM(val) AS total,
    AVG(val) AS average,
    MIN(val) AS minimum,
    MAX(val) AS maximum
FROM agg_demo
GROUP BY grp;

-- ============================================
-- Statistical Aggregates
-- ============================================
SELECT
    -- Variance & Standard Deviation
    VAR_POP(val) AS variance_population,
    VAR_SAMP(val) AS variance_sample,
    STDDEV_POP(val) AS stddev_population,
    STDDEV_SAMP(val) AS stddev_sample,

    -- Covariance
    COVAR_POP(val, id) AS covariance_population,
    COVAR_SAMP(val, id) AS covariance_sample,

    -- Correlation
    CORR(val, id) AS correlation,

    -- Distribution shape
    SKEWNESS(val) AS skewness,
    KURTOSIS(val) AS kurtosis,

    -- Entropy (information theory)
    ENTROPY(val) AS entropy
FROM agg_demo
WHERE val IS NOT NULL;

-- ============================================
-- Median, Mode, Quantiles & Percentiles
-- ============================================
SELECT
    -- Central tendency
    MEDIAN(val) AS median_val,
    MODE(grp) AS most_common_group,

    -- Quantiles (exact)
    QUANTILE_CONT(val, 0.5) AS quantile_50_continuous,
    QUANTILE_DISC(val, 0.5) AS quantile_50_discrete,
    QUANTILE_CONT(val, [0.25, 0.5, 0.75]) AS quartiles,

    -- Percentiles (same as quantiles, just x100)
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY val) AS p95,
    PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY val) AS p95_discrete,

    -- Median Absolute Deviation (robust dispersion)
    MAD(val) AS median_absolute_deviation
FROM agg_demo
WHERE val IS NOT NULL;

-- ============================================
-- Approximate Aggregates (for large datasets)
-- ============================================
SELECT
    -- Approximate count distinct (HyperLogLog)
    APPROX_COUNT_DISTINCT(grp) AS approx_distinct,

    -- Approximate quantiles (T-Digest)
    APPROX_QUANTILE(val, 0.5) AS approx_median,
    APPROX_QUANTILE(val, [0.1, 0.5, 0.9]) AS approx_percentiles,

    -- Reservoir sampling quantile
    RESERVOIR_QUANTILE(val, 0.5, 100) AS reservoir_median
FROM agg_demo
WHERE val IS NOT NULL;

-- ============================================
-- ARG_MIN / ARG_MAX - Return value at min/max
-- ============================================
-- "Which row has the min/max?" - very useful!
SELECT
    grp,
    ARG_MIN(id, val) AS id_with_min_val,
    ARG_MAX(id, val) AS id_with_max_val,
    MIN(val) AS min_val,
    MAX(val) AS max_val
FROM agg_demo
WHERE val IS NOT NULL
GROUP BY grp;

-- ============================================
-- Boolean Aggregates
-- ============================================
SELECT
    grp,
    BOOL_AND(flag) AS all_true,
    BOOL_OR(flag) AS any_true,
    COUNT(*) FILTER (WHERE flag) AS count_true,
    EVERY(flag) AS every_alias  -- Same as BOOL_AND
FROM agg_demo
GROUP BY grp;

-- ============================================
-- Bitwise Aggregates
-- ============================================
SELECT
    grp,
    BIT_AND(bits) AS bitwise_and,
    BIT_OR(bits) AS bitwise_or,
    BIT_XOR(bits) AS bitwise_xor
FROM agg_demo
GROUP BY grp;

-- ============================================
-- PRODUCT - Multiply all values
-- ============================================
SELECT
    grp,
    PRODUCT(val) AS product_of_vals,
    PRODUCT(id) AS product_of_ids
FROM agg_demo
WHERE val IS NOT NULL
GROUP BY grp;

-- ============================================
-- Geometric Mean
-- ============================================
SELECT
    GEOMETRIC_MEAN(val) AS geo_mean,
    -- Equivalent manual calculation:
    EXP(AVG(LN(val))) AS geo_mean_manual
FROM agg_demo
WHERE val IS NOT NULL AND val > 0;

-- ============================================
-- HISTOGRAM - Distribution buckets
-- ============================================
SELECT
    HISTOGRAM(val) AS value_histogram,
    HISTOGRAM(grp) AS group_histogram
FROM agg_demo;

-- ============================================
-- Linear Regression Functions (REGR_*)
-- ============================================
SELECT
    REGR_SLOPE(val, id) AS slope,
    REGR_INTERCEPT(val, id) AS intercept,
    REGR_R2(val, id) AS r_squared,
    REGR_COUNT(val, id) AS regr_count,
    REGR_AVGX(val, id) AS avg_x,
    REGR_AVGY(val, id) AS avg_y,
    REGR_SXX(val, id) AS sum_sq_x,
    REGR_SYY(val, id) AS sum_sq_y,
    REGR_SXY(val, id) AS sum_product_xy
FROM agg_demo
WHERE val IS NOT NULL;

-- ============================================
-- List/Array Aggregates
-- ============================================
SELECT
    grp,
    LIST(val) AS all_vals,
    LIST(val ORDER BY val DESC) AS vals_sorted,
    ARRAY_AGG(DISTINCT val) AS distinct_vals,
    ARRAY_AGG(val) FILTER (WHERE val > 15) AS filtered_vals
FROM agg_demo
GROUP BY grp;

-- ============================================
-- String Aggregates
-- ============================================
SELECT
    grp,
    STRING_AGG(CAST(val AS VARCHAR), ', ') AS vals_csv,
    STRING_AGG(CAST(val AS VARCHAR), ', ' ORDER BY val) AS vals_sorted,
    LISTAGG(CAST(val AS VARCHAR), ' | ') AS vals_piped
FROM agg_demo
WHERE val IS NOT NULL
GROUP BY grp;

-- ============================================
-- First/Last/Any Value
-- ============================================
SELECT
    grp,
    FIRST(val) AS first_val,
    FIRST(val ORDER BY id DESC) AS first_by_id_desc,
    LAST(val) AS last_val,
    ANY_VALUE(val) AS any_val,  -- Arbitrary non-null
    ARBITRARY(val) AS arbitrary_val  -- Alias for ANY_VALUE
FROM agg_demo
GROUP BY grp;

-- ============================================
-- FSUM / FAVG - Higher precision aggregates
-- ============================================
-- FSUM/FAVG use Kahan (compensated) summation to reduce
-- floating-point rounding errors. In practice, DuckDB's
-- standard SUM/AVG are already very accurate, so differences
-- are rarely visible. These exist for edge cases and compatibility.
SELECT
    SUM(val) AS regular_sum,
    FSUM(val) AS precise_sum,
    AVG(val) AS regular_avg,
    FAVG(val) AS precise_avg
FROM agg_demo;

-- ============================================
-- Aggregate Modifiers: FILTER, ORDER BY, DISTINCT
-- ============================================
SELECT
    grp,
    -- FILTER: conditional aggregation
    SUM(val) FILTER (WHERE flag = true) AS sum_where_flag,
    COUNT(*) FILTER (WHERE val > 15) AS count_big_vals,

    -- ORDER BY inside aggregate
    ARRAY_AGG(val ORDER BY val DESC) AS ordered_list,
    STRING_AGG(CAST(id AS VARCHAR), '-' ORDER BY id) AS ordered_ids,

    -- DISTINCT
    COUNT(DISTINCT val) AS distinct_count,
    SUM(DISTINCT val) AS distinct_sum
FROM agg_demo
GROUP BY grp;

-- ============================================
-- Aggregate Summary: Quick Reference Table
-- ============================================
-- This query doesn't run - it's a reference!
/*
| Category     | Functions                                          |
|--------------|---------------------------------------------------|
| Basic        | COUNT, SUM, AVG, MIN, MAX                          |
| Statistical  | VAR_POP/SAMP, STDDEV_POP/SAMP, COVAR_*, CORR       |
| Distribution | SKEWNESS, KURTOSIS, ENTROPY                        |
| Central      | MEDIAN, MODE, QUANTILE_*, PERCENTILE_*             |
| Robust       | MAD (median absolute deviation)                    |
| Approximate  | APPROX_COUNT_DISTINCT, APPROX_QUANTILE             |
| ArgMin/Max   | ARG_MIN, ARG_MAX                                   |
| Boolean      | BOOL_AND, BOOL_OR, EVERY                           |
| Bitwise      | BIT_AND, BIT_OR, BIT_XOR                           |
| Math         | PRODUCT, GEOMETRIC_MEAN, FSUM, FAVG                |
| Regression   | REGR_SLOPE, REGR_INTERCEPT, REGR_R2, etc.          |
| Array/List   | LIST, ARRAY_AGG, HISTOGRAM                         |
| String       | STRING_AGG, LISTAGG                                |
| Selection    | FIRST, LAST, ANY_VALUE, ARBITRARY                  |
*/

-- ============================================
-- FINAL: Putting It All Together
-- ============================================

-- Complex analytical query combining multiple features
WITH daily_stats AS (
    SELECT
        sale_date,
        category,
        SUM(amount) AS daily_total,
        LIST(salesperson ORDER BY amount DESC) AS top_sellers
    FROM sales
    GROUP BY ALL
),
ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY daily_total DESC) AS day_rank,
        daily_total - LAG(daily_total) OVER (PARTITION BY category ORDER BY sale_date) AS vs_prev_day
    FROM daily_stats
)
SELECT
    sale_date,
    category,
    daily_total,
    top_sellers[1] AS best_seller,
    day_rank,
    COALESCE(vs_prev_day, 0) AS change,
    CASE
        WHEN vs_prev_day > 0 THEN '📈'
        WHEN vs_prev_day < 0 THEN '📉'
        ELSE '➡️'
    END AS trend
FROM ranked
WHERE day_rank <= 2  -- Use WHERE since day_rank is pre-computed in CTE
ORDER BY category, sale_date;

-- ============================================
-- SECTION 17: COLUMNS Expression (Dynamic Column Selection)
-- ============================================

-- COLUMNS() selects columns matching a regex pattern
SELECT COLUMNS('.*') FROM (SELECT 1 AS a, 2 AS b, 3 AS c);

-- Select only columns matching pattern
SELECT COLUMNS('user.*') FROM (
    SELECT 1 AS user_id, 'Alice' AS user_name, 'test' AS other_col
);

-- Apply aggregate to all columns
SELECT MIN(x), MIN(y), MIN(z), MAX(x), MAX(y), MAX(z)
FROM (SELECT 10 AS x, 20 AS y, 30 AS z);

-- EXCLUDE specific columns (use column names, not COLUMNS())
SELECT * EXCLUDE (user_id, created_at)
FROM (SELECT 1 AS user_id, 'test' AS name, NOW() AS created_at);

-- EXCLUDE with pattern matching using regex
SELECT * EXCLUDE (user_id)
FROM (SELECT 1 AS user_id, 'Alice' AS user_name, 'test' AS email);

-- ============================================
-- SECTION 18: FROM-First Syntax (DuckDB Unique)
-- ============================================

-- Implicit SELECT * (shortest possible query)
FROM sales LIMIT 5;

-- FROM first with explicit columns
FROM sales SELECT salesperson, SUM(amount) GROUP BY 1;

-- Chained operations without SELECT
FROM sales WHERE amount > 100 ORDER BY amount DESC LIMIT 3;

-- ============================================
-- SECTION 19: UNION BY NAME
-- ============================================

-- Smart column matching regardless of order
SELECT 'A' AS letter, 1 AS num
UNION BY NAME
SELECT 2 AS num, 'B' AS letter;

-- Handle missing columns gracefully
SELECT 1 AS a, 2 AS b, 3 AS c
UNION BY NAME
SELECT 10 AS a, 20 AS d;  -- b,c will be NULL, d added

-- ============================================
-- SECTION 20: FILTER Clause on Aggregates
-- ============================================

-- Conditional aggregation without CASE
SELECT
    COUNT(*) AS total_sales,
    COUNT(*) FILTER (WHERE amount > 100) AS big_sales,
    SUM(amount) FILTER (WHERE category = 'Electronics') AS electronics_revenue,
    AVG(amount) FILTER (WHERE salesperson = 'Alice') AS alice_avg,
    COUNT(DISTINCT salesperson) FILTER (WHERE amount > 50) AS active_sellers
FROM sales;

-- ============================================
-- SECTION 21: SUMMARIZE & DESCRIBE
-- ============================================

-- Instant statistics for any table
SUMMARIZE sales;

-- Table structure
DESCRIBE sales;

-- Show all tables
SHOW TABLES;

-- Show all DuckDB functions matching pattern
SELECT * FROM duckdb_functions() WHERE function_name LIKE '%json%' LIMIT 10;

-- ============================================
-- SECTION 22: Friendly SQL Shortcuts
-- ============================================

-- GROUP BY ALL: auto-group by all non-aggregated columns
SELECT
    category,
    salesperson,
    SUM(amount) AS total,
    COUNT(*) AS cnt
FROM sales
GROUP BY ALL;

-- ORDER BY ALL: sort by all columns left-to-right
SELECT DISTINCT category, salesperson
FROM sales
ORDER BY ALL;

-- SELECT * with column reordering
SELECT category, * EXCLUDE (category) FROM sales LIMIT 3;

-- ============================================
-- SECTION 23: Positional Joins
-- ============================================

-- Join by row position, not keys
WITH
    names AS (SELECT * FROM (VALUES ('Alice'), ('Bob'), ('Carol')) AS t(name)),
    ages AS (SELECT * FROM (VALUES (30), (25), (35)) AS t(age))
SELECT * FROM names POSITIONAL JOIN ages;

-- ============================================
-- SECTION 24: Aggregate with ORDER BY
-- ============================================

-- Ordered aggregation
SELECT
    category,
    STRING_AGG(salesperson, ', ' ORDER BY amount DESC) AS sellers_by_revenue,
    FIRST(salesperson ORDER BY amount DESC) AS top_seller,
    LAST(salesperson ORDER BY sale_date) AS most_recent_seller,
    LIST(amount ORDER BY amount DESC)[:3] AS top_3_amounts
FROM sales
GROUP BY category;

-- ============================================
-- SECTION 25: System Introspection
-- ============================================

-- Current DuckDB version and settings
SELECT version();
SELECT * FROM duckdb_settings() WHERE name LIKE '%memory%';

-- Query profiling
EXPLAIN ANALYZE SELECT * FROM sales WHERE amount > 100;

-- List installed extensions
SELECT * FROM duckdb_extensions();

-- Database size info
SELECT * FROM pragma_database_size();
