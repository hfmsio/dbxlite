-- ============================================
-- DuckDB WASM Extensions
-- ============================================
-- Extensions auto-load when you use their functions.
-- These 4 extensions unlock powerful capabilities!

-- ============================================
-- 1. TPC-H: Instant Realistic Data
-- ============================================
-- Generate industry-standard benchmark data with ONE command!

LOAD tpch;
CALL dbgen(sf = 0.01);  -- Creates 8 tables with realistic data

-- Now you have: customer, orders, lineitem, part, supplier, partsupp, nation, region
SHOW TABLES;

-- Instant analytics on generated data
SELECT
    n_name AS nation,
    COUNT(DISTINCT c_custkey) AS customers,
    SUM(o_totalprice) AS total_revenue
FROM customer
JOIN nation ON c_nationkey = n_nationkey
JOIN orders ON c_custkey = o_custkey
GROUP BY n_name
ORDER BY total_revenue DESC
LIMIT 5;

-- ============================================
-- 2. Full-Text Search: Search Like Google
-- ============================================

LOAD fts;

-- Create searchable documents
CREATE OR REPLACE TEMP TABLE docs AS
SELECT * FROM (VALUES
    (1, 'DuckDB Tutorial', 'Learn DuckDB for fast analytical queries in your browser'),
    (2, 'Python Data Science', 'Use Python with pandas and DuckDB for data analysis'),
    (3, 'SQL Window Functions', 'Master advanced SQL window functions for analytics'),
    (4, 'Machine Learning Intro', 'Introduction to machine learning with Python'),
    (5, 'DuckDB vs Postgres', 'Comparing DuckDB analytical performance to PostgreSQL')
) AS t(id, title, body);

-- Create search index
PRAGMA create_fts_index('docs', 'id', 'title', 'body', overwrite=1);

-- Search! Returns ranked results by relevance
SELECT id, title, fts_main_docs.match_bm25(id, 'DuckDB') AS relevance
FROM docs WHERE relevance IS NOT NULL
ORDER BY relevance DESC;

-- Phrase search
SELECT title, fts_main_docs.match_bm25(id, '"window functions"') AS score
FROM docs WHERE score IS NOT NULL;

-- ============================================
-- 3. Spatial: GIS in Your Browser
-- ============================================

LOAD spatial;

-- Create city locations
CREATE OR REPLACE TEMP TABLE cities AS
SELECT name, ST_Point(lon, lat) AS location, pop FROM (VALUES
    ('San Francisco', -122.42, 37.77, 874961),
    ('New York', -74.01, 40.71, 8336817),
    ('Los Angeles', -118.24, 34.05, 3979576),
    ('Chicago', -87.63, 41.88, 2693976),
    ('Seattle', -122.33, 47.61, 737015)
) AS t(name, lon, lat, pop);

-- Distance between cities (in coordinate units)
SELECT
    a.name AS from_city,
    b.name AS to_city,
    ROUND(ST_Distance(a.location, b.location), 2) AS distance
FROM cities a, cities b
WHERE a.name = 'San Francisco' AND a.name != b.name
ORDER BY distance;

-- Export to GeoJSON (paste into geojson.io to visualize!)
SELECT name, pop, ST_AsGeoJSON(location) AS geojson FROM cities;

-- Find cities in a bounding box
SELECT name FROM cities
WHERE ST_Within(location, ST_MakeEnvelope(-125, 35, -115, 50));

-- ============================================
-- 4. JSON: Parse Any API Response
-- ============================================

-- Extract nested data
SELECT
    JSON_EXTRACT('{"user": {"name": "Alice", "scores": [95, 87, 92]}}', '$.user.name') AS name,
    JSON_EXTRACT('{"user": {"name": "Alice", "scores": [95, 87, 92]}}', '$.user.scores[0]') AS first_score;

-- Unnest JSON arrays to rows
SELECT
    json_data->>'$.name' AS name,
    (json_data->>'$.age')::INT AS age
FROM (
    SELECT UNNEST(FROM_JSON(
        '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]',
        '["JSON"]'
    )) AS json_data
);

-- Build JSON from query results
WITH sales AS (
    SELECT 'Electronics' AS category, 1500 AS revenue UNION ALL
    SELECT 'Clothing', 800
)
SELECT JSON_GROUP_ARRAY(JSON_OBJECT('cat', category, 'rev', revenue)) AS json_report
FROM sales;

-- ============================================
-- BONUS: More DuckDB Magic (No Extension Needed)
-- ============================================

-- DISTINCT ON: First row per group (beats ROW_NUMBER!)
WITH cities AS (
    SELECT * FROM (VALUES
        ('USA', 'New York', 8336817),
        ('USA', 'Los Angeles', 3979576),
        ('Japan', 'Tokyo', 13960000),
        ('Japan', 'Osaka', 2691000),
        ('UK', 'London', 8982000),
        ('UK', 'Birmingham', 1141816)
    ) AS t(country, city, population)
)
SELECT DISTINCT ON(country) country, city, population
FROM cities
ORDER BY country, population DESC;

-- Glob patterns: Query all matching files at once
-- SELECT * FROM 'data/*.csv';
-- SELECT * FROM 'logs/2024-*.parquet';

-- Generate UUIDs
SELECT uuid() AS id1, uuid() AS id2, uuid() AS id3;

-- Hash functions for data integrity
SELECT
    MD5('hello world') AS md5_hash,
    SHA256('hello world') AS sha256_hash,
    HASH('hello world') AS duckdb_hash;

-- Generate random data
SELECT
    RANDOM() AS random_float,
    (RANDOM() * 100)::INT AS random_0_100,
    UUID() AS random_uuid,
    LIST_VALUE('red','green','blue')[1 + (RANDOM()*3)::INT] AS random_color
FROM generate_series(1, 5);

-- Bit manipulation
SELECT
    5 & 3 AS bit_and,      -- 101 & 011 = 001 = 1
    5 | 3 AS bit_or,       -- 101 | 011 = 111 = 7
    5 ^ 3 AS bit_xor,      -- 101 ^ 011 = 110 = 6
    5 << 2 AS left_shift,  -- 5 * 4 = 20
    20 >> 2 AS right_shift; -- 20 / 4 = 5

-- Bar chart in SQL! (ASCII visualization)
WITH data AS (
    SELECT * FROM (VALUES
        ('Mon', 45), ('Tue', 62), ('Wed', 38),
        ('Thu', 71), ('Fri', 55), ('Sat', 89), ('Sun', 67)
    ) AS t(day, sales)
)
SELECT day, sales, BAR(sales, 0, 100, 30) AS chart
FROM data;

-- VARINT: Arbitrary precision integers (no overflow!)
SELECT
    170141183460469231731687303715884105727::HUGEINT AS max_hugeint,
    1234567890123456789012345678901234567890::VARINT AS huge_number;

-- Regex extraction and replacement
SELECT
    REGEXP_EXTRACT('Price: $123.45', '[\d.]+') AS price,
    REGEXP_REPLACE('hello   world', '\s+', '_') AS normalized,
    REGEXP_MATCHES('abc123', '\d+') AS has_digits;

-- ============================================
-- Check Available Extensions
-- ============================================

SELECT extension_name, loaded, description
FROM duckdb_extensions()
WHERE extension_name IN ('tpch', 'fts', 'spatial', 'json', 'parquet')
ORDER BY extension_name;
