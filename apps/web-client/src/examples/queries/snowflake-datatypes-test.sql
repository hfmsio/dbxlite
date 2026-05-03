-- Snowflake Data Types Test
-- Returns one row exercising every type Snowflake supports.
-- Use this to verify the dbxlite grid renders each type correctly.
--
-- Watch for:
--   • NUMBER with scale > 0 should preserve full precision (string)
--   • TIMESTAMP_LTZ/NTZ/TZ should render as actual dates, not epoch strings
--   • VARIANT/OBJECT/ARRAY should be browseable, not JSON-encoded strings
--   • NULLs should render as NULL marker, not "null" or empty
--   • Unicode and emoji should display correctly
SELECT
  -- ─── Integer family ──────────────────────────────────────────────
  42::TINYINT                              AS tinyint_col,
  32000::SMALLINT                          AS smallint_col,
  2147483647::INT                          AS int_col,
  9223372036854775807::BIGINT              AS bigint_col,
  CAST(123456 AS NUMBER(10, 0))            AS number_int,

  -- ─── Decimal / NUMBER with scale (preserved as string) ──────────
  CAST(12345.6789 AS NUMBER(38, 10))       AS number_high_precision,
  CAST(-999.99 AS DECIMAL(8, 2))           AS decimal_negative,
  CAST(0 AS NUMBER(38, 0))                 AS number_zero,

  -- ─── Float family ────────────────────────────────────────────────
  3.14159::FLOAT                           AS float_col,
  CAST(2.718281828 AS DOUBLE PRECISION)    AS double_col,
  CAST(1.5e-10 AS REAL)                    AS real_tiny,

  -- ─── String / text ───────────────────────────────────────────────
  'Hello, World!'::VARCHAR                 AS varchar_col,
  'Fixed'::CHAR(5)                         AS char_col,
  $$Has 'single' and "double" quotes$$     AS string_with_quotes,
  '日本語 · emoji 🐍 · Ω'                   AS string_unicode,

  -- ─── Binary ──────────────────────────────────────────────────────
  TO_BINARY('DEADBEEF', 'HEX')             AS binary_hex,

  -- ─── Boolean ─────────────────────────────────────────────────────
  TRUE::BOOLEAN                            AS bool_true,
  FALSE::BOOLEAN                           AS bool_false,

  -- ─── Date / time ─────────────────────────────────────────────────
  '2026-04-25'::DATE                       AS date_col,
  '14:30:45.123'::TIME                     AS time_col,
  '2026-04-25 14:30:45.987654321'::TIMESTAMP_NTZ  AS ts_ntz,
  '2026-04-25 14:30:45 -07:00'::TIMESTAMP_TZ      AS ts_tz_pacific,
  '2026-04-25 14:30:45'::TIMESTAMP_LTZ     AS ts_ltz,
  CURRENT_TIMESTAMP()                      AS ts_now,

  -- ─── Semi-structured ─────────────────────────────────────────────
  PARSE_JSON('{"name":"Ada","age":36,"tags":["sql","snowflake"]}') AS variant_obj,
  PARSE_JSON('[1, 2, "three", null, {"k":"v"}]')                   AS variant_arr,
  OBJECT_CONSTRUCT(
    'string', 'value',
    'number', 42,
    'nested', OBJECT_CONSTRUCT('a', 1, 'b', ARRAY_CONSTRUCT(1,2,3))
  )                                        AS object_nested,
  ARRAY_CONSTRUCT(1, 2.5, 'three', TRUE, NULL)                    AS array_mixed,

  -- ─── Geospatial (drop these if your account doesn't have them) ──
  TO_GEOGRAPHY('POINT(-122.35 37.55)')     AS geography_sf,
  TO_GEOMETRY('LINESTRING(0 0, 1 1, 2 0)') AS geometry_line,

  -- ─── NULL across types ───────────────────────────────────────────
  CAST(NULL AS NUMBER(10, 0))              AS null_number,
  CAST(NULL AS VARCHAR)                    AS null_varchar,
  CAST(NULL AS BOOLEAN)                    AS null_boolean,
  CAST(NULL AS DATE)                       AS null_date,
  CAST(NULL AS TIMESTAMP_LTZ)              AS null_ts_ltz,
  CAST(NULL AS VARIANT)                    AS null_variant
;
