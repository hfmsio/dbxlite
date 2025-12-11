-- Type Handling Tests for dbxlite
-- Execute each statement one by one to verify type conversions work correctly
-- Look for: NaN, undefined, [object Object], or incorrect values
--
-- This tests the fixes made for Arrow IPC type handling including:
-- - HUGEINT/UHUGEINT (Uint32Array)
-- - BIGINT/UBIGINT (BigInt64Array/BigUint64Array)
-- - FLOAT/DOUBLE (Float32Array/Float64Array)
-- - Decimal precision
-- - Complex types (LIST, STRUCT, MAP)

-- ============================================
-- 1. HUGEINT (128-bit signed) - The original bug
-- ============================================

-- CRITICAL TEST: This was the original NaN bug
-- SUM returns HUGEINT which Arrow represents as Uint32Array(4)
SELECT SUM(amount) as total FROM (VALUES (100), (200), (55)) AS t(amount);
-- Expected: 355 (NOT NaN!)

-- HUGEINT with negative values
SELECT SUM(x) FROM (VALUES (100), (-50), (25)) AS t(x);
-- Expected: 75

-- Large HUGEINT (should return as string to preserve precision)
SELECT 170141183460469231731687303715884105727::HUGEINT as max_hugeint;
-- Expected: "170141183460469231731687303715884105727" (as string)

-- Negative large HUGEINT
SELECT -170141183460469231731687303715884105726::HUGEINT as large_negative;
-- Expected: "-170141183460469231731687303715884105726" (as string)

-- ============================================
-- 2. BIGINT (64-bit signed)
-- ============================================

SELECT 9223372036854775807::BIGINT as max_bigint;
-- Expected: "9223372036854775807" (as string, exceeds JS safe integer)

SELECT -9223372036854775808::BIGINT as min_bigint;
-- Expected: "-9223372036854775808" (as string)

SELECT 9007199254740991::BIGINT as max_safe_int;
-- Expected: 9007199254740991 (as number, within JS safe range)

SELECT SUM(x)::BIGINT FROM (VALUES (1000000000000), (2000000000000)) AS t(x);
-- Expected: 3000000000000

-- ============================================
-- 3. UBIGINT (64-bit unsigned)
-- ============================================

SELECT 18446744073709551615::UBIGINT as max_ubigint;
-- Expected: "18446744073709551615" (as string)

SELECT 9007199254740991::UBIGINT as safe_ubigint;
-- Expected: 9007199254740991 (as number)

-- ============================================
-- 4. DECIMAL / NUMERIC
-- ============================================

SELECT 19.99::DECIMAL(10,2) as price;
-- Expected: 19.99

SELECT SUM(price) FROM (VALUES (19.99), (29.99), (9.99)) AS t(price);
-- Expected: 59.97

SELECT AVG(amount)::DECIMAL(10,2) FROM (VALUES (100), (200), (300)) AS t(amount);
-- Expected: 200.00

-- High precision decimal
SELECT 123456789.123456789::DECIMAL(18,9) as high_precision;
-- Expected: 123456789.123456789

-- ============================================
-- 5. FLOAT / REAL (32-bit)
-- ============================================

SELECT 3.14159::REAL as pi_float;
-- Expected: ~3.14159 (may have slight precision loss)

SELECT CAST(1.0/3.0 AS REAL) as one_third;
-- Expected: ~0.333333

-- ============================================
-- 6. DOUBLE (64-bit)
-- ============================================

SELECT 3.141592653589793::DOUBLE as pi_double;
-- Expected: 3.141592653589793

SELECT 1e308::DOUBLE as large_double;
-- Expected: 1e+308

SELECT 1e-308::DOUBLE as small_double;
-- Expected: 1e-308

-- ============================================
-- 7. INTEGER types (smaller)
-- ============================================

SELECT 127::TINYINT as max_tinyint;
-- Expected: 127

SELECT 32767::SMALLINT as max_smallint;
-- Expected: 32767

SELECT 2147483647::INTEGER as max_int;
-- Expected: 2147483647

-- Unsigned variants
SELECT 255::UTINYINT as max_utinyint;
-- Expected: 255

SELECT 65535::USMALLINT as max_usmallint;
-- Expected: 65535

SELECT 4294967295::UINTEGER as max_uint;
-- Expected: 4294967295

-- ============================================
-- 8. Aggregation functions (comprehensive)
-- ============================================

-- Create test data
CREATE OR REPLACE TABLE agg_test AS
SELECT * FROM (VALUES
  (1, 100.50, 'A'),
  (2, 200.75, 'B'),
  (3, 150.25, 'A'),
  (4, 300.00, 'B'),
  (5, 250.50, 'A')
) AS t(id, amount, category);

-- Basic aggregations
SELECT
  SUM(amount) as sum_amt,
  AVG(amount) as avg_amt,
  MIN(amount) as min_amt,
  MAX(amount) as max_amt,
  COUNT(*) as cnt
FROM agg_test;
-- Expected: sum=1002.00, avg=200.40, min=100.50, max=300.00, cnt=5

-- Group by aggregation
SELECT
  category,
  SUM(amount) as total,
  AVG(amount) as average
FROM agg_test
GROUP BY category
ORDER BY category;
-- Expected: A: 501.25, 167.08; B: 500.75, 250.375

-- ============================================
-- 9. Complex types (LIST, STRUCT, MAP)
-- ============================================

SELECT [1, 2, 3, 4, 5] as int_list;
-- Expected: [1, 2, 3, 4, 5]

SELECT {'name': 'Alice', 'age': 30} as person_struct;
-- Expected: {name: "Alice", age: 30}

SELECT MAP {'a': 1, 'b': 2} as simple_map;
-- Expected: [{key: "a", value: 1}, {key: "b", value: 2}]

-- Nested structures
SELECT [{'x': 1}, {'x': 2}] as list_of_structs;
-- Expected: [{x: 1}, {x: 2}]

-- ============================================
-- 10. Edge cases
-- ============================================

-- NULL handling
SELECT SUM(x) FROM (VALUES (100), (NULL), (200)) AS t(x);
-- Expected: 300 (NULL ignored)

-- Empty result
SELECT SUM(x) FROM (VALUES (1)) AS t(x) WHERE false;
-- Expected: NULL

-- Division that might cause issues
SELECT 1.0 / 3.0 as division_result;
-- Expected: 0.3333... (not NaN)

-- Zero division (should be NULL or error, not NaN in result)
SELECT CASE WHEN 1=0 THEN 1/0 ELSE 0 END as safe_div;
-- Expected: 0

-- ============================================
-- 11. BLOB / Binary
-- ============================================

SELECT '\x48454C4C4F'::BLOB as hello_blob;
-- Expected: 0x48454c4c4f (or similar hex representation)

-- ============================================
-- 12. UHUGEINT (128-bit unsigned)
-- ============================================

SELECT 340282366920938463463374607431768211455::UHUGEINT as max_uhugeint;
-- Expected: "340282366920938463463374607431768211455" (as string)

SELECT 1000000000000000000000000000::UHUGEINT as large_uhugeint;
-- Expected: large number as string

-- ============================================
-- 13. Date and Time types
-- ============================================

SELECT DATE '2024-12-11' as test_date;
-- Expected: "2024-12-11" or Date object

SELECT TIME '14:30:00' as test_time;
-- Expected: "14:30:00"

SELECT TIMESTAMP '2024-12-11 14:30:00' as test_timestamp;
-- Expected: ISO timestamp string

SELECT CURRENT_DATE as today;
-- Expected: Current date

SELECT CURRENT_TIMESTAMP as now;
-- Expected: Current timestamp

-- ============================================
-- 14. Interval types
-- ============================================

SELECT INTERVAL '1 year 2 months' as year_month_interval;
-- Expected: "1y 2mo" or similar

SELECT INTERVAL '3 days 4 hours 30 minutes' as day_time_interval;
-- Expected: "3d 4h 30m" or similar

SELECT INTERVAL '1 hour 30 minutes 45 seconds' as time_interval;
-- Expected: "1h 30m 45s" or similar

SELECT DATE '2024-12-31' - DATE '2024-01-01' as date_diff;
-- Expected: 365 (days)

-- ============================================
-- 15. Boolean
-- ============================================

SELECT true as bool_true, false as bool_false;
-- Expected: true, false

SELECT 1 > 0 as comparison_true, 1 < 0 as comparison_false;
-- Expected: true, false

SELECT BOOL_AND(x) as all_true FROM (VALUES (true), (true), (true)) AS t(x);
-- Expected: true

SELECT BOOL_OR(x) as any_true FROM (VALUES (false), (true), (false)) AS t(x);
-- Expected: true

-- ============================================
-- 16. UUID
-- ============================================

SELECT uuid() as random_uuid;
-- Expected: UUID string like "550e8400-e29b-41d4-a716-446655440000"

SELECT '550e8400-e29b-41d4-a716-446655440000'::UUID as parsed_uuid;
-- Expected: "550e8400-e29b-41d4-a716-446655440000"

-- ============================================
-- 17. ENUM types (Dictionary in Arrow)
-- ============================================

CREATE TYPE mood AS ENUM ('happy', 'sad', 'neutral');
SELECT 'happy'::mood as happy_mood;
-- Expected: "happy" (NOT [object Object])

SELECT UNNEST(['happy', 'sad', 'neutral']::mood[]) as all_moods;
-- Expected: 3 rows with string values

DROP TYPE mood;

-- ============================================
-- 18. String types
-- ============================================

SELECT 'Hello World' as varchar_test;
-- Expected: "Hello World"

SELECT 'A'::CHAR(1) as char_test;
-- Expected: "A"

SELECT REPEAT('x', 1000) as long_string;
-- Expected: 1000 x's

-- ============================================
-- 19. Statistical aggregations
-- ============================================

SELECT
  STDDEV_SAMP(x) as std_dev,
  VAR_SAMP(x) as variance,
  STDDEV_POP(x) as std_dev_pop,
  VAR_POP(x) as var_pop
FROM (VALUES (10), (20), (30), (40), (50)) AS t(x);
-- Expected: numeric values (not NaN)

SELECT
  CORR(x, y) as correlation,
  COVAR_SAMP(x, y) as covariance
FROM (VALUES (1, 2), (2, 4), (3, 6), (4, 8)) AS t(x, y);
-- Expected: correlation ~1.0, covariance > 0

-- ============================================
-- 20. Percentile / Quantile
-- ============================================

SELECT
  QUANTILE_CONT(x, 0.5) as median,
  QUANTILE_CONT(x, 0.25) as q1,
  QUANTILE_CONT(x, 0.75) as q3
FROM (VALUES (10), (20), (30), (40), (50)) AS t(x);
-- Expected: median=30, q1=20, q3=40

SELECT MODE(x) as mode_value FROM (VALUES (1), (2), (2), (3), (2)) AS t(x);
-- Expected: 2

-- ============================================
-- 21. Bit operations
-- ============================================

SELECT BIT_AND(x) as bit_and_result FROM (VALUES (7), (3), (5)) AS t(x);
-- Expected: 1 (binary AND)

SELECT BIT_OR(x) as bit_or_result FROM (VALUES (1), (2), (4)) AS t(x);
-- Expected: 7 (binary OR)

SELECT BIT_XOR(x) as bit_xor_result FROM (VALUES (5), (3)) AS t(x);
-- Expected: 6 (binary XOR)

-- ============================================
-- 22. Window functions with types
-- ============================================

SELECT
  id,
  amount,
  SUM(amount) OVER (ORDER BY id) as running_sum,
  AVG(amount) OVER (ORDER BY id) as running_avg
FROM (VALUES (1, 100.0), (2, 200.0), (3, 150.0)) AS t(id, amount);
-- Expected: running totals, not NaN

-- ============================================
-- 23. CASE expressions with different types
-- ============================================

SELECT
  CASE WHEN x > 0 THEN x::DOUBLE ELSE 0.0 END as positive_double,
  CASE WHEN x > 0 THEN x::BIGINT ELSE 0 END as positive_bigint
FROM (VALUES (10), (-5), (20)) AS t(x);
-- Expected: proper type conversion

-- ============================================
-- 24. Nested aggregations
-- ============================================

SELECT LIST(x) as all_values FROM (VALUES (1), (2), (3), (4), (5)) AS t(x);
-- Expected: [1, 2, 3, 4, 5]

SELECT LIST(x ORDER BY x DESC) as sorted_desc FROM (VALUES (3), (1), (4), (1), (5)) AS t(x);
-- Expected: [5, 4, 3, 1, 1]

SELECT STRING_AGG(x, ', ') as concatenated FROM (VALUES ('a'), ('b'), ('c')) AS t(x);
-- Expected: "a, b, c"

-- ============================================
-- 25. Infinity and special float values
-- ============================================

SELECT 'infinity'::DOUBLE as pos_inf;
-- Expected: Infinity (or null if we filter it)

SELECT '-infinity'::DOUBLE as neg_inf;
-- Expected: -Infinity (or null if we filter it)

-- NaN handling (important test!)
SELECT 'nan'::DOUBLE as nan_value;
-- Expected: null (we convert NaN to null)

SELECT CASE WHEN isnan('nan'::DOUBLE) THEN 'is_nan' ELSE 'not_nan' END as nan_check;
-- Expected: "is_nan"

-- ============================================
-- 26. Multiple columns with mixed types
-- ============================================

SELECT
  1::TINYINT as tiny,
  1000::SMALLINT as small,
  1000000::INTEGER as medium,
  1000000000000::BIGINT as big,
  3.14::FLOAT as float_val,
  3.14159265359::DOUBLE as double_val,
  19.99::DECIMAL(10,2) as decimal_val,
  true as bool_val,
  'text' as string_val,
  DATE '2024-01-01' as date_val;
-- Expected: All types displayed correctly in one row

-- ============================================
-- 27. Cleanup
-- ============================================

DROP TABLE IF EXISTS agg_test;
