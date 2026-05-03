-- Cross-source Federation: join data across formats and locations
-- DuckDB · Lakehouse
--
-- DuckDB can read CSV, Parquet, JSON, Excel, and DuckDB databases - local
-- or remote - and JOIN across them as if they were one database. No ETL,
-- no staging tables. The query engine pushes filters down to each source
-- where it can.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ Compatibility                                                        │
-- ├──────────────────────────────────┬────────────┬──────────────────────┤
-- │ Pattern                          │ WASM mode  │ Server mode          │
-- ├──────────────────────────────────┼────────────┼──────────────────────┤
-- │ Remote CSV / Parquet / JSON      │ Yes        │ Yes                  │
-- │ Local file (uploaded handle)     │ Yes        │ Yes                  │
-- │ Local file (arbitrary path)      │ No         │ Yes                  │
-- │ Glob across many files (*.parq)  │ Limited    │ Yes                  │
-- │ ATTACH another .duckdb file      │ Yes        │ Yes                  │
-- │ ATTACH PostgreSQL (postgres ext) │ No         │ Yes                  │
-- │ ATTACH SQLite (sqlite ext)       │ No         │ Yes                  │
-- │ ATTACH MySQL (mysql ext)         │ No         │ Yes                  │
-- └──────────────────────────────────┴────────────┴──────────────────────┘
--
-- Sections marked Server-only below need DuckDB CLI. To switch to
-- Server mode without losing this UI:
--
--   1. Run dbxlite locally so DuckDB can fetch it:
--        pnpm install && pnpm dev
--   2. In another terminal:
--        export ui_remote_url="http://localhost:5174"
--        duckdb -unsigned -ui
--   3. Open http://localhost:4213 - header badge will say "Server".
--      Native filesystem + extension scanners are now available.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Local CSV joined to remote Parquet                  [WASM ✓ Server ✓]
-- ──────────────────────────────────────────────────────────────────────
-- Example pattern: we have product metadata in a small local CSV, and
-- transaction facts in a remote Parquet file. Join them in one query.
--
-- (Replace 'data/products.csv' with a real path on your machine.)
WITH products AS (
    -- Inline standin so this query runs without setup
    SELECT * FROM (VALUES
        (1, 'Widget',   'Hardware'),
        (2, 'Gadget',   'Hardware'),
        (3, 'Sprocket', 'Hardware'),
        (4, 'Notebook', 'Stationery')
    ) AS t(product_id, name, category)
),
-- Remote: a tiny demo Parquet served by DuckDB's CDN.
sales AS (
    SELECT *
    FROM 'https://blobs.duckdb.org/data/test.parquet'  -- replace with your URL
    LIMIT 0  -- guard: replace with real Parquet to actually run
)
SELECT
    p.category,
    COUNT(*) AS line_items
FROM products p
LEFT JOIN sales s ON p.product_id = s.product_id
GROUP BY p.category;

-- ──────────────────────────────────────────────────────────────────────
-- 2. ATTACH multiple DuckDB databases                    [WASM ✓ Server ✓]
-- ──────────────────────────────────────────────────────────────────────
-- Each ATTACH creates a separate logical database in the same session.
-- Query across them with the `db.schema.table` qualifier.
ATTACH 'analytics.duckdb' AS analytics (READ_ONLY);
ATTACH 'crm.duckdb'        AS crm        (READ_ONLY);

-- A user joining customer rows from the CRM with order facts from analytics
SELECT
    c.customer_id,
    c.name,
    COUNT(o.order_id) AS num_orders,
    SUM(o.total)      AS total_spent
FROM crm.main.customers c
LEFT JOIN analytics.main.orders o
    ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.name
ORDER BY total_spent DESC NULLS LAST
LIMIT 50;

-- Detach when done
DETACH analytics;
DETACH crm;

-- ──────────────────────────────────────────────────────────────────────
-- 3. ATTACH PostgreSQL via the postgres_scanner extension  [Server only]
-- ──────────────────────────────────────────────────────────────────────
-- Browsers can't open TCP sockets, so the postgres extension only loads
-- in Server mode. See the header for how to switch.
INSTALL postgres;
LOAD postgres;

ATTACH 'host=localhost port=5432 dbname=mydb user=me password=…' AS pg
    (TYPE postgres, READ_ONLY);

-- Now you can query the Postgres database as if it were local
SELECT * FROM pg.public.users LIMIT 10;

-- And join it with files
SELECT
    u.id, u.email,
    f.event_count
FROM pg.public.users u
JOIN 'file:///data/events_summary.parquet' f
    ON u.id = f.user_id
LIMIT 100;

DETACH pg;

-- ──────────────────────────────────────────────────────────────────────
-- 4. ATTACH SQLite                                         [Server only]
-- ──────────────────────────────────────────────────────────────────────
-- The sqlite extension reads a real SQLite file from disk, which the
-- browser sandbox can't do. Server mode required.
INSTALL sqlite;
LOAD sqlite;

ATTACH 'mydata.db' AS sqlite_db (TYPE sqlite, READ_ONLY);
SELECT * FROM sqlite_db.main.your_table LIMIT 10;
DETACH sqlite_db;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Glob across many Parquet files                       [Server only]
-- ──────────────────────────────────────────────────────────────────────
-- Parquet "tables" are often a directory of files (Hive-partitioned).
-- DuckDB reads them as a single relation with hive_partitioning=1.
-- WASM has no filesystem-glob; only registered file handles are visible.
SELECT
    year, month,
    COUNT(*) AS rows
FROM read_parquet(
    'file:///data/events/year=*/month=*/*.parquet',
    hive_partitioning = 1
)
GROUP BY year, month
ORDER BY year, month;

-- ──────────────────────────────────────────────────────────────────────
-- Notes
-- ──────────────────────────────────────────────────────────────────────
-- - WASM mode supports remote httpfs (CSV/Parquet/JSON over HTTP) and
--   ATTACH on local DuckDB files. The postgres / sqlite / mysql
--   scanners are Server-mode only.
-- - Prefer Parquet for federation - it's the format every engine reads
--   fastest with predicate pushdown intact.
-- - For BigQuery / Snowflake federation, use dbxlite's connector
--   dropdown (top of the editor) rather than the DuckDB ATTACH path.
