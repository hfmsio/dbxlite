-- Iceberg & Delta Lake: read open-table formats from object storage
-- DuckDB · Lakehouse
--
-- Both Iceberg and Delta Lake are open table formats. They sit on top
-- of Parquet files in object storage and add metadata for ACID, time
-- travel, and schema evolution. DuckDB has extensions for both.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ Compatibility                                                        │
-- ├──────────────────────────────────┬────────────┬──────────────────────┤
-- │ Feature                          │ WASM mode  │ Server mode          │
-- ├──────────────────────────────────┼────────────┼──────────────────────┤
-- │ iceberg_scan (basic reads)       │ 1.31+      │ Yes                  │
-- │ iceberg snapshot time-travel     │ Limited    │ Yes                  │
-- │ iceberg REST/Glue/Unity catalog  │ No         │ Yes                  │
-- │ delta_scan                       │ No         │ Yes                  │
-- │ httpfs (S3 / GCS / Azure)        │ Yes        │ Yes                  │
-- └──────────────────────────────────┴────────────┴──────────────────────┘
--
-- If a query below fails with "extension not loadable" or similar, you
-- are in WASM mode. Switch to Server mode to get the full feature set:
--
--   1. Run dbxlite locally so DuckDB can fetch the UI:
--        pnpm install && pnpm dev
--   2. In another terminal:
--        export ui_remote_url="http://localhost:5174"
--        duckdb -unsigned -ui
--   3. Open http://localhost:4213 - you're in Server mode now (header
--      badge changes to "Server"). Re-run this query.

-- ──────────────────────────────────────────────────────────────────────
-- Iceberg                                          [WASM 1.31+ · Server ✓]
-- ──────────────────────────────────────────────────────────────────────
INSTALL iceberg;
LOAD iceberg;
INSTALL httpfs;
LOAD httpfs;

-- Read an Iceberg table from local disk (table = a directory with
-- metadata/ and data/ subfolders).
SELECT *
FROM iceberg_scan('/path/to/your/iceberg/table')
LIMIT 100;

-- Read an Iceberg table from S3 (set the region first).
SET s3_region = 'us-east-1';
-- Set credentials if needed. Or use IAM-attached env credentials when
-- running locally:
--   SET s3_access_key_id = '…';
--   SET s3_secret_access_key = '…';

SELECT *
FROM iceberg_scan('s3://your-bucket/path/to/iceberg-table')
LIMIT 100;

-- Time travel: query an Iceberg table at a specific snapshot ID.
SELECT *
FROM iceberg_scan(
    's3://your-bucket/path/to/iceberg-table',
    snapshot_id_at_time => '2026-01-15T00:00:00'::TIMESTAMP
)
LIMIT 100;

-- Inspect an Iceberg table's metadata
SELECT * FROM iceberg_metadata('/path/to/your/iceberg/table');
SELECT * FROM iceberg_snapshots('/path/to/your/iceberg/table');

-- ──────────────────────────────────────────────────────────────────────
-- Delta Lake                                                [Server only]
-- ──────────────────────────────────────────────────────────────────────
-- The delta extension isn't in the WASM bundle as of duckdb-wasm 1.32.
-- These queries error in WASM with "extension not found" - switch to
-- Server mode (see header).
INSTALL delta;
LOAD delta;

-- Read a Delta table from local disk
SELECT *
FROM delta_scan('/path/to/your/delta/table')
LIMIT 100;

-- Read a Delta table from S3
SELECT *
FROM delta_scan('s3://your-bucket/path/to/delta-table')
LIMIT 100;

-- Read from Azure Data Lake Storage (set credentials first).
-- SET azure_storage_account_name = 'mystorage';
-- SET azure_storage_account_key = '…';
-- SELECT * FROM delta_scan('abfss://container@mystorage.dfs.core.windows.net/path');

-- ──────────────────────────────────────────────────────────────────────
-- Cross-format: join Iceberg with a local CSV
-- ──────────────────────────────────────────────────────────────────────
-- Lakehouse formats integrate with everything else DuckDB can read.
-- Example: enrich Iceberg fact rows with a small lookup CSV.
--
-- WITH facts AS (
--     SELECT * FROM iceberg_scan('s3://bucket/sales-iceberg')
-- ),
-- product_lookup AS (
--     SELECT * FROM 'file:///data/products.csv'
-- )
-- SELECT
--     p.category,
--     COUNT(*)            AS line_items,
--     SUM(f.amount)       AS revenue
-- FROM facts f
-- JOIN product_lookup p ON f.product_id = p.id
-- GROUP BY p.category
-- ORDER BY revenue DESC;

-- ──────────────────────────────────────────────────────────────────────
-- Notes
-- ──────────────────────────────────────────────────────────────────────
-- - Both extensions are read-only today. Writes go through Spark, Trino,
--   or the catalog's own write path.
-- - Catalog (REST/Glue/Unity) auth: Iceberg supports REST catalog spec
--   via `iceberg_catalog` (see DuckDB docs); set up takes a connection
--   string + credentials.
-- - Bundle size: each extension adds a few MB to the WASM payload, so
--   they only load on first use.
