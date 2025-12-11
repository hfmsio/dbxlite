-- ============================================
-- BigQuery Data Types Comprehensive Test
-- ============================================
-- Run each query to verify data type handling
-- All queries are self-contained with literals
-- ============================================

-- ============================================
-- SECTION 1: Integer Types
-- ============================================

SELECT
    1 AS int64_val,
    9223372036854775807 AS int64_max,
    -9223372036854775808 AS int64_min,
    0 AS zero_int;

-- ============================================
-- SECTION 2: Floating Point Types
-- ============================================

SELECT
    3.14 AS float64_val,
    1.7976931348623157E+308 AS float64_max,
    2.2250738585072014E-308 AS float64_min_positive,
    CAST('inf' AS FLOAT64) AS infinity,
    CAST('-inf' AS FLOAT64) AS neg_infinity,
    CAST('nan' AS FLOAT64) AS not_a_number,
    IEEE_DIVIDE(1, 0) AS div_by_zero_inf;

-- ============================================
-- SECTION 3: Numeric/Decimal Types
-- ============================================

SELECT
    NUMERIC '123.456789' AS numeric_val,
    NUMERIC '-999999999999999999999999999.999999999' AS numeric_min,
    NUMERIC '999999999999999999999999999.999999999' AS numeric_max,
    BIGNUMERIC '12345678901234567890.12345678901234567890' AS bignumeric_val;

-- ============================================
-- SECTION 4: String Types
-- ============================================

SELECT
    'Hello, World!' AS string_val,
    '' AS empty_string,
    'Unicode: 你好 🎉 émojis' AS unicode_string,
    '''Line1
Line2
Line3''' AS multiline_string,
    REPEAT('x', 100) AS repeated_string,
    CONCAT('Hello', ' ', 'BigQuery') AS concat_result;

-- ============================================
-- SECTION 5: Bytes Type
-- ============================================

SELECT
    b'Hello' AS bytes_literal,
    b'\x48\x65\x6c\x6c\x6f' AS bytes_hex,
    CAST('Hello' AS BYTES) AS string_to_bytes,
    LENGTH(b'Hello') AS bytes_length;

-- ============================================
-- SECTION 6: Boolean Type
-- ============================================

SELECT
    TRUE AS bool_true,
    FALSE AS bool_false,
    CAST(NULL AS BOOL) AS bool_null,
    1 > 0 AS bool_expr_true,
    1 < 0 AS bool_expr_false,
    NOT TRUE AS bool_not,
    TRUE AND FALSE AS bool_and,
    TRUE OR FALSE AS bool_or;

-- ============================================
-- SECTION 7: Date Type
-- ============================================

SELECT
    DATE '2024-12-10' AS date_val,
    DATE '1970-01-01' AS epoch_date,
    DATE '2099-12-31' AS future_date,
    CURRENT_DATE() AS current_date_val,
    DATE '2024-02-29' AS leap_day,
    DATE_ADD(DATE '2024-01-01', INTERVAL 30 DAY) AS date_add_result,
    DATE_DIFF(DATE '2024-12-31', DATE '2024-01-01', DAY) AS days_diff;

-- ============================================
-- SECTION 8: Time Type
-- ============================================

SELECT
    TIME '14:30:00' AS time_val,
    TIME '00:00:00' AS midnight,
    TIME '23:59:59' AS end_of_day,
    TIME '14:30:45.123456' AS time_with_microsec,
    CURRENT_TIME() AS current_time_val,
    TIME_ADD(TIME '10:00:00', INTERVAL 2 HOUR) AS time_add_result;

-- ============================================
-- SECTION 9: Datetime Type
-- ============================================

SELECT
    DATETIME '2024-12-10 14:30:00' AS datetime_val,
    DATETIME '1970-01-01 00:00:00' AS epoch_datetime,
    DATETIME '2024-12-10 14:30:45.123456' AS datetime_with_microsec,
    CURRENT_DATETIME() AS current_datetime_val,
    DATETIME_ADD(DATETIME '2024-01-01 12:00:00', INTERVAL 1 MONTH) AS datetime_add_result;

-- ============================================
-- SECTION 10: Timestamp Type (with timezone)
-- ============================================

SELECT
    TIMESTAMP '2024-12-10 14:30:00 UTC' AS timestamp_utc,
    TIMESTAMP '2024-12-10 14:30:00-08:00' AS timestamp_pst,
    TIMESTAMP '2024-12-10 14:30:00+05:30' AS timestamp_ist,
    CURRENT_TIMESTAMP() AS current_timestamp_val,
    TIMESTAMP_ADD(TIMESTAMP '2024-01-01 00:00:00 UTC', INTERVAL 1 HOUR) AS timestamp_add_result,
    TIMESTAMP_DIFF(TIMESTAMP '2024-01-02 00:00:00 UTC', TIMESTAMP '2024-01-01 00:00:00 UTC', HOUR) AS hours_diff;

-- ============================================
-- SECTION 11: Interval Type
-- ============================================

SELECT
    INTERVAL 1 YEAR AS interval_year,
    INTERVAL 2 MONTH AS interval_month,
    INTERVAL 10 DAY AS interval_day,
    INTERVAL 5 HOUR AS interval_hour,
    INTERVAL 30 MINUTE AS interval_minute,
    INTERVAL 45 SECOND AS interval_second,
    DATE '2024-01-01' + INTERVAL 3 MONTH AS date_plus_interval;

-- ============================================
-- SECTION 12: Array Types (REPEATED mode)
-- ============================================

-- Integer arrays
SELECT
    [1, 2, 3, 4, 5] AS int_array,
    GENERATE_ARRAY(1, 10) AS generated_1_to_10,
    GENERATE_ARRAY(0, 100, 10) AS by_tens,
    [] AS empty_array,
    [NULL, 1, NULL, 2] AS array_with_nulls;

-- String arrays
SELECT
    ['apple', 'banana', 'cherry'] AS string_array,
    ARRAY<STRING>['hello', 'world'] AS typed_string_array;

-- Float arrays
SELECT
    [1.1, 2.2, 3.3] AS float_array,
    GENERATE_ARRAY(1.5, 5.5, 0.5) AS float_range;

-- Boolean arrays
SELECT
    [TRUE, FALSE, TRUE] AS bool_array;

-- Date arrays
SELECT
    [DATE '2024-01-01', DATE '2024-06-15', DATE '2024-12-31'] AS date_array,
    GENERATE_DATE_ARRAY(DATE '2024-01-01', DATE '2024-01-07') AS week_dates;

-- Array operations
SELECT
    ARRAY_LENGTH([1, 2, 3, 4, 5]) AS arr_length,
    ARRAY_CONCAT([1, 2], [3, 4], [5]) AS concat_arrays,
    ARRAY_REVERSE([1, 2, 3]) AS reversed,
    [1, 2, 3][OFFSET(0)] AS first_element_offset,
    [1, 2, 3][ORDINAL(1)] AS first_element_ordinal,
    [1, 2, 3][SAFE_OFFSET(10)] AS safe_out_of_bounds,
    ARRAY_TO_STRING(['a', 'b', 'c'], '-') AS joined;

-- ============================================
-- SECTION 13: Struct Types
-- ============================================

SELECT
    STRUCT('Alice' AS name, 30 AS age) AS simple_struct,
    STRUCT('Bob', 25, 'NYC') AS anonymous_struct,
    STRUCT('Alice' AS name, 30 AS age).name AS extracted_name,
    STRUCT('Alice' AS name, 30 AS age).age AS extracted_age;

-- Nested structs
SELECT
    STRUCT(
        'Order123' AS order_id,
        STRUCT('Alice' AS name, 'alice@example.com' AS email) AS customer,
        100.50 AS total
    ) AS nested_struct;

-- Array of structs
SELECT
    [
        STRUCT('Alice' AS name, 30 AS age),
        STRUCT('Bob', 25),
        STRUCT('Carol', 35)
    ] AS struct_array;

-- ============================================
-- SECTION 14: JSON Type
-- ============================================

SELECT
    JSON '{"name": "Alice", "age": 30}' AS json_object,
    JSON '[1, 2, 3, 4, 5]' AS json_array,
    JSON '{"nested": {"key": "value"}}' AS nested_json,
    JSON_VALUE('{"name": "Alice"}', '$.name') AS json_extracted,
    JSON_QUERY('{"items": [1, 2, 3]}', '$.items') AS json_query_result,
    TO_JSON(STRUCT('Bob' AS name, 25 AS age)) AS struct_to_json;

-- ============================================
-- SECTION 15: Geography Type
-- ============================================

SELECT
    ST_GEOGPOINT(-122.4194, 37.7749) AS sf_point,
    ST_GEOGFROMTEXT('POINT(-122.4194 37.7749)') AS point_from_wkt,
    ST_GEOGFROMTEXT('LINESTRING(-122.4194 37.7749, -118.2437 34.0522)') AS line,
    ST_ASTEXT(ST_GEOGPOINT(-122.4194, 37.7749)) AS point_to_wkt,
    ST_DISTANCE(
        ST_GEOGPOINT(-122.4194, 37.7749),
        ST_GEOGPOINT(-118.2437, 34.0522)
    ) AS distance_meters;

-- ============================================
-- SECTION 16: NULL Handling
-- ============================================

SELECT
    CAST(NULL AS INT64) AS null_int,
    CAST(NULL AS STRING) AS null_string,
    CAST(NULL AS DATE) AS null_date,
    CAST(NULL AS BOOL) AS null_bool,
    CAST(NULL AS ARRAY<INT64>) AS null_array,
    COALESCE(NULL, NULL, 'default') AS coalesce_val,
    IFNULL(NULL, 'fallback') AS ifnull_val,
    NULLIF(5, 5) AS nullif_equal,
    NULLIF(5, 3) AS nullif_diff,
    IF(TRUE, 'yes', NULL) AS if_with_null;

-- ============================================
-- SECTION 17: Type Casting
-- ============================================

SELECT
    CAST('123' AS INT64) AS string_to_int,
    CAST(123 AS STRING) AS int_to_string,
    CAST('2024-12-10' AS DATE) AS string_to_date,
    CAST(1.9 AS INT64) AS float_to_int,
    CAST(TRUE AS INT64) AS bool_to_int,
    CAST(1 AS BOOL) AS int_to_bool,
    CAST('3.14' AS NUMERIC) AS string_to_numeric,
    SAFE_CAST('abc' AS INT64) AS safe_cast_fail,
    SAFE_CAST('123' AS INT64) AS safe_cast_ok;

-- ============================================
-- SECTION 18: Special Values & Edge Cases
-- ============================================

SELECT
    '' AS empty_string,
    ' ' AS space_only,
    '   trimmed   ' AS needs_trim,
    0 AS zero_int,
    0.0 AS zero_float,
    -0.0 AS negative_zero,
    ARRAY<INT64>[] AS empty_typed_array;

-- Safe functions
SELECT
    SAFE_DIVIDE(10, 0) AS safe_div_zero,
    SAFE_DIVIDE(10, 2) AS safe_div_normal,
    SAFE.PARSE_DATE('%Y-%m-%d', 'invalid') AS safe_parse_fail,
    SAFE.PARSE_DATE('%Y-%m-%d', '2024-12-10') AS safe_parse_ok;

-- ============================================
-- SECTION 19: Complex Nested Types
-- ============================================

-- Array of arrays (nested)
SELECT
    [[1, 2], [3, 4], [5, 6]] AS nested_int_array,
    [['a', 'b'], ['c', 'd']] AS nested_string_array;

-- Struct with arrays
SELECT
    STRUCT(
        'user1' AS id,
        ['admin', 'editor'] AS roles,
        [STRUCT('home' AS type, '123 Main St' AS addr), STRUCT('work', '456 Office Blvd')] AS addresses
    ) AS complex_struct;

-- Array of structs with nested arrays
SELECT
    [
        STRUCT('Alice' AS name, [95, 87, 92] AS scores),
        STRUCT('Bob', [78, 85, 90])
    ] AS users_with_scores;
