-- ============================================
-- DuckDB Data Types Comprehensive Test
-- ============================================
-- Run each query to verify data type handling
-- Tests include Arrow type mapping where applicable
-- ============================================

-- ============================================
-- SECTION 1: Integer Types
-- ============================================

SELECT
    1::TINYINT AS tinyint_val,
    127::TINYINT AS tinyint_max,
    (-128)::TINYINT AS tinyint_min,
    256::SMALLINT AS smallint_val,
    32767::SMALLINT AS smallint_max,
    65536::INTEGER AS integer_val,
    2147483647::INTEGER AS integer_max,
    4294967296::BIGINT AS bigint_val,
    9223372036854775807::BIGINT AS bigint_max,
    170141183460469231731687303715884105727::HUGEINT AS hugeint_val;

-- Unsigned integers
SELECT
    255::UTINYINT AS utinyint_max,
    65535::USMALLINT AS usmallint_max,
    4294967295::UINTEGER AS uinteger_max,
    18446744073709551615::UBIGINT AS ubigint_max;

-- ============================================
-- SECTION 2: Floating Point Types
-- ============================================

SELECT
    3.14::FLOAT AS float_val,
    3.14159265358979::DOUBLE AS double_val,
    1.7976931348623157E+308::DOUBLE AS double_max,
    2.2250738585072014E-308::DOUBLE AS double_min_positive,
    'inf'::DOUBLE AS infinity,
    '-inf'::DOUBLE AS neg_infinity,
    'nan'::DOUBLE AS not_a_number;

-- ============================================
-- SECTION 3: Decimal/Numeric Types
-- ============================================

SELECT
    123.45::DECIMAL(5,2) AS decimal_5_2,
    123456789.123456789::DECIMAL(18,9) AS decimal_18_9,
    -- Large decimals: use values within double precision (~15 significant digits)
    1234567890123.12345678901234::DECIMAL(38,20) AS decimal_38_20,
    -999.99::DECIMAL(5,2) AS decimal_negative;

-- ============================================
-- SECTION 4: String Types
-- ============================================

SELECT
    'Hello, World!' AS varchar_val,
    'Short'::VARCHAR(10) AS varchar_limited,
    ''::VARCHAR AS empty_string,
    'Unicode: 你好 🎉 émojis' AS unicode_string,
    'Line1
Line2
Line3' AS multiline_string,
    repeat('x', 1000) AS long_string;

-- ============================================
-- SECTION 5: Boolean Type
-- ============================================

SELECT
    TRUE AS bool_true,
    FALSE AS bool_false,
    NULL::BOOLEAN AS bool_null,
    1 > 0 AS bool_expr_true,
    1 < 0 AS bool_expr_false;

-- ============================================
-- SECTION 6: Date Types
-- ============================================

SELECT
    DATE '2024-12-10' AS date_val,
    DATE '1970-01-01' AS epoch_date,
    DATE '2099-12-31' AS future_date,
    DATE '1900-01-01' AS old_date,
    CURRENT_DATE AS current_date_val,
    DATE '2024-02-29' AS leap_day;

-- ============================================
-- SECTION 7: Time Types
-- ============================================

SELECT
    TIME '14:30:00' AS time_val,
    TIME '00:00:00' AS midnight,
    TIME '23:59:59' AS end_of_day,
    TIME '14:30:45.123456' AS time_with_microsec,
    CURRENT_TIME AS current_time_val;

-- ============================================
-- SECTION 8: Timestamp Types
-- ============================================

SELECT
    TIMESTAMP '2024-12-10 14:30:00' AS timestamp_val,
    TIMESTAMP '1970-01-01 00:00:00' AS epoch_timestamp,
    TIMESTAMP '2024-12-10 14:30:45.123456' AS timestamp_with_microsec,
    CURRENT_TIMESTAMP AS current_timestamp_val,
    NOW() AS now_func;

-- Timestamp with timezone
SELECT
    TIMESTAMPTZ '2024-12-10 14:30:00+00:00' AS utc_timestamp,
    TIMESTAMPTZ '2024-12-10 14:30:00-08:00' AS pst_timestamp,
    TIMESTAMPTZ '2024-12-10 14:30:00+05:30' AS ist_timestamp;

-- ============================================
-- SECTION 9: Interval Types (Arrow: Interval<MONTH_DAY_NANO>)
-- ============================================

SELECT
    INTERVAL '1 year' AS interval_year,
    INTERVAL '2 months' AS interval_months,
    INTERVAL '10 days' AS interval_days,
    INTERVAL '5 hours' AS interval_hours,
    INTERVAL '30 minutes' AS interval_minutes,
    INTERVAL '45 seconds' AS interval_seconds,
    INTERVAL '1 year 2 months 3 days 4 hours 5 minutes 6 seconds' AS interval_complex;

-- Interval arithmetic
SELECT
    DATE '2024-01-01' + INTERVAL '3 months' AS date_plus_interval,
    TIMESTAMP '2024-01-01 12:00:00' - INTERVAL '2 hours' AS timestamp_minus_interval,
    AGE(DATE '2024-12-10', DATE '2020-05-15') AS age_diff;

-- ============================================
-- SECTION 10: Array/List Types (Arrow: List<T>)
-- ============================================

SELECT
    [1, 2, 3, 4, 5] AS int_array,
    ['apple', 'banana', 'cherry'] AS string_array,
    [1.1, 2.2, 3.3] AS float_array,
    [TRUE, FALSE, TRUE] AS bool_array,
    [DATE '2024-01-01', DATE '2024-06-15', DATE '2024-12-31'] AS date_array,
    [] AS empty_array,
    [NULL, 1, NULL, 2] AS array_with_nulls;

-- Note: Nested arrays like [[1,2],[3,4]] are not supported in DuckDB

-- Array functions
SELECT
    array_length([1, 2, 3, 4, 5]) AS arr_length,
    list_concat([1, 2], [3, 4]) AS concat_arrays,
    list_reverse([1, 2, 3]) AS reversed,
    [1, 2, 3][1] AS first_element,
    list_contains([1, 2, 3], 2) AS contains_2;

-- ============================================
-- SECTION 11: Struct Types (Arrow: Struct)
-- ============================================

SELECT
    {'name': 'Alice', 'age': 30} AS simple_struct,
    {'x': 1, 'y': 2, 'z': 3} AS coord_struct,
    {'nested': {'inner': 'value'}} AS nested_struct,
    -- Note: ROW() creates unnamed fields which Arrow doesn't fully support
    {'name': 'Bob', 'age': 25, 'city': 'NYC'} AS person_struct;

-- Struct field access
SELECT
    {'name': 'Alice', 'age': 30}.name AS struct_field_name,
    {'name': 'Alice', 'age': 30}.age AS struct_field_age;

-- ============================================
-- SECTION 12: Map Types (Arrow: Map<K,V>)
-- ============================================

SELECT
    MAP {'key1': 'value1', 'key2': 'value2'} AS string_map,
    MAP {1: 'one', 2: 'two', 3: 'three'} AS int_key_map,
    MAP {'a': 1.1, 'b': 2.2} AS string_float_map;

-- Map operations
SELECT
    MAP {'a': 1, 'b': 2}['a'] AS map_access,
    map_keys(MAP {'x': 1, 'y': 2}) AS map_keys_list,
    map_values(MAP {'x': 1, 'y': 2}) AS map_values_list;

-- ============================================
-- SECTION 13: UUID Type
-- ============================================

SELECT
    uuid() AS random_uuid,
    '550e8400-e29b-41d4-a716-446655440000'::UUID AS fixed_uuid,
    gen_random_uuid() AS gen_uuid;

-- ============================================
-- SECTION 14: BLOB/Binary Types
-- ============================================

SELECT
    '\x48656C6C6F'::BLOB AS hex_blob,
    'Hello'::BLOB AS string_to_blob,
    encode('Hello World') AS encoded_blob,
    octet_length('\x48656C6C6F'::BLOB) AS blob_length;

-- ============================================
-- SECTION 15: JSON Type
-- ============================================

SELECT
    '{"name": "Alice", "age": 30}'::JSON AS json_object,
    '[1, 2, 3, 4, 5]'::JSON AS json_array,
    '{"nested": {"key": "value"}}'::JSON AS nested_json,
    json_extract('{"name": "Alice"}', '$.name') AS json_extract_val;

-- ============================================
-- SECTION 16: Enum Type
-- ============================================

-- Create enum type
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');

SELECT 'happy'::mood AS enum_val;

-- Cleanup
DROP TYPE mood;

-- ============================================
-- SECTION 17: NULL Handling
-- ============================================

SELECT
    NULL::INTEGER AS null_int,
    NULL::VARCHAR AS null_string,
    NULL::DATE AS null_date,
    NULL::BOOLEAN AS null_bool,
    COALESCE(NULL, 'default') AS coalesce_val,
    NULLIF(1, 1) AS nullif_equal,
    NULLIF(1, 2) AS nullif_diff;

-- ============================================
-- SECTION 18: Special Values
-- ============================================

SELECT
    'inf'::FLOAT AS pos_infinity,
    '-inf'::FLOAT AS neg_infinity,
    'nan'::FLOAT AS nan_val,
    greatest(1, 2, 3, NULL) AS greatest_with_null,
    least(1, 2, 3, NULL) AS least_with_null;

-- ============================================
-- SECTION 19: Type Casting
-- ============================================

SELECT
    '123'::INTEGER AS string_to_int,
    123::VARCHAR AS int_to_string,
    '2024-12-10'::DATE AS string_to_date,
    1.5::INTEGER AS float_to_int,
    TRUE::INTEGER AS bool_to_int,
    1::BOOLEAN AS int_to_bool,
    '3.14'::DECIMAL(5,2) AS string_to_decimal;

-- ============================================
-- SECTION 20: Edge Cases & Limits
-- ============================================

SELECT
    '' AS empty_string,
    ' ' AS space_only,
    '   trimmed   ' AS needs_trim,
    0 AS zero_int,
    0.0 AS zero_float,
    -0.0 AS negative_zero,
    [] AS empty_list,
    {} AS empty_struct;
