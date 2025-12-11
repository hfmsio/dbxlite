-- ============================================
-- DuckDB Community Extensions
-- ============================================
-- Install from community repository, then LOAD to use.
-- Note: Not all community extensions are available for WASM yet.

-- ============================================
-- 1. H3: Uber's Hexagonal Geospatial Indexing
-- ============================================
-- Perfect for location analytics, ride-sharing, delivery zones

INSTALL h3 FROM community;
LOAD h3;

-- Convert lat/lng to H3 cell (resolution 9 = ~175m hexagons)
SELECT
    h3_latlng_to_cell(37.7749, -122.4194, 9) AS sf_h3_cell,
    h3_latlng_to_cell(40.7128, -74.0060, 9) AS nyc_h3_cell,
    h3_latlng_to_cell(34.0522, -118.2437, 9) AS la_h3_cell;

-- Get cell boundary as lat/lng pairs
SELECT h3_cell_to_boundary_wkt(h3_latlng_to_cell(37.7749, -122.4194, 9)) AS hex_boundary;

-- Find neighboring cells (ring of hexagons)
SELECT UNNEST(h3_grid_ring(h3_latlng_to_cell(37.7749, -122.4194, 7), 1)) AS neighbor_cells;

-- Distance between H3 cells
SELECT h3_grid_distance(
    h3_latlng_to_cell(37.7749, -122.4194, 7),
    h3_latlng_to_cell(37.8044, -122.2712, 7)  -- Oakland
) AS hex_distance;

-- Resolution info
SELECT
    h3_get_resolution(h3_latlng_to_cell(37.7749, -122.4194, 9)) AS resolution,
    h3_cell_to_latlng(h3_latlng_to_cell(37.7749, -122.4194, 9)) AS center_point;

-- ============================================
-- 2. Rapidfuzz: Fuzzy String Matching
-- ============================================
-- Find similar strings, typo-tolerant search

INSTALL rapidfuzz FROM community;
LOAD rapidfuzz;

-- Simple similarity ratio (0-100)
SELECT
    rapidfuzz_ratio('hello world', 'hello world') AS exact_match,
    rapidfuzz_ratio('hello world', 'helo wrold') AS typos,
    rapidfuzz_ratio('hello world', 'goodbye') AS different;

-- Partial ratio (substring matching)
SELECT
    rapidfuzz_partial_ratio('hello', 'hello world') AS partial,
    rapidfuzz_partial_ratio('world', 'hello world') AS partial2;

-- Fuzzy search in data
WITH products AS (
    SELECT * FROM (VALUES
        ('iPhone 15 Pro Max'),
        ('iPhone 15 Pro'),
        ('iPhone 15'),
        ('Samsung Galaxy S24'),
        ('Google Pixel 8')
    ) AS t(name)
)
SELECT name, rapidfuzz_ratio('iphone 15 pro', LOWER(name)) AS score
FROM products
WHERE rapidfuzz_ratio('iphone 15 pro', LOWER(name)) > 50
ORDER BY score DESC;

-- Token sort ratio (order-independent matching)
SELECT
    rapidfuzz_token_sort_ratio('New York City', 'City New York') AS reordered,
    rapidfuzz_token_sort_ratio('John Smith', 'Smith John') AS name_flip;

-- ============================================
-- Check Loaded Extensions
-- ============================================

SELECT extension_name, loaded
FROM duckdb_extensions()
WHERE loaded = true
ORDER BY extension_name;
