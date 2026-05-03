-- Snowflake Time Travel
-- Snowflake · Time Travel
--
-- Query a table as it was at a past point in time, using OFFSET (seconds
-- ago) or TIMESTAMP. Works on any user-created table - Snowflake retains
-- history for the table's DATA_RETENTION_TIME_IN_DAYS (default 1 day on
-- Standard, up to 90 on Enterprise+).
--
-- BEFORE YOU START: pick a database (and schema) via the topbar
-- chips - Snowflake's SQL API rejects CREATE TABLE without a database
-- namespace, even for TEMPORARY tables. Any database you have CREATE
-- privileges on works (your personal database `USER$<YOU>` is a safe
-- default if your account provisions one).
--
-- IMPORTANT: SNOWFLAKE_SAMPLE_DATA.* tables have retention = 0 days
-- (Snowflake doesn't carry history on free shared data). Time travel on
-- those always fails with "data is not available for table…". This
-- example uses a temp table you own so retention is guaranteed.
--
-- HOW TO RUN: dbxlite sends one statement per request, so run each
-- numbered step separately by placing your cursor on it and pressing
-- Cmd/Ctrl+Enter.

-- ──────────────────────────────────────────────────────────────────────
-- Step 1 · Create the table with starting data (single statement via CTAS)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TEMPORARY TABLE tt_demo (id, name, score) AS
SELECT * FROM VALUES
    (1, 'Alice', 100),
    (2, 'Bob',    85),
    (3, 'Carol',  92);

-- ──────────────────────────────────────────────────────────────────────
-- Step 2 · Wait ~10 seconds, then mutate (run each one once)
-- ──────────────────────────────────────────────────────────────────────
UPDATE tt_demo SET score = 999 WHERE id = 1;

DELETE FROM tt_demo WHERE id = 3;

-- ──────────────────────────────────────────────────────────────────────
-- Step 3 · Compare current state to a past snapshot via AT (OFFSET)
-- ──────────────────────────────────────────────────────────────────────
-- Adjust the OFFSET seconds to a moment between Step 1 and Step 2.
SELECT 'current'                 AS state, COUNT(*) AS rows, SUM(score) AS total_score FROM tt_demo
UNION ALL
SELECT '15 seconds ago',          COUNT(*),       SUM(score)            FROM tt_demo AT (OFFSET => -15)
ORDER BY state DESC;

-- ──────────────────────────────────────────────────────────────────────
-- Step 4 · AT an absolute TIMESTAMP
-- ──────────────────────────────────────────────────────────────────────
SELECT * FROM tt_demo
AT (TIMESTAMP => DATEADD(second, -10, CURRENT_TIMESTAMP()))
ORDER BY id;

-- ──────────────────────────────────────────────────────────────────────
-- Step 5 · CLONE from a past state - "undo" without a restore
-- ──────────────────────────────────────────────────────────────────────
-- Zero-copy: the clone shares storage with the original until something
-- changes.
CREATE OR REPLACE TEMPORARY TABLE tt_demo_recovered
CLONE tt_demo AT (OFFSET => -15);

SELECT * FROM tt_demo_recovered ORDER BY id;

-- ──────────────────────────────────────────────────────────────────────
-- Notes
-- ──────────────────────────────────────────────────────────────────────
-- - Standard edition: max 1 day retention. Enterprise+: up to 90 days.
--     ALTER TABLE my_table SET DATA_RETENTION_TIME_IN_DAYS = 7;
-- - "Data is not available" means OFFSET / TIMESTAMP is past the
--   retention window OR before the table existed. Try a smaller offset.
-- - AT (STATEMENT => '<query_id>') is a third anchor (state right after
--   that query). Useful for "undo this UPDATE" - find the query ID in
--   QUERY_HISTORY or with LAST_QUERY_ID() in the same session. The SQL
--   API uses a fresh session per request so LAST_QUERY_ID() across
--   requests doesn't carry; copy the ID from query history instead.
