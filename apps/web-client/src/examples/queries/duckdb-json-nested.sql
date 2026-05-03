-- Nested JSON: extracting fields from JSON columns
-- DuckDB · Learn DuckDB
--
-- DuckDB has first-class JSON support. Use -> to drill into nested
-- objects, ->> to extract a TEXT value (without the surrounding quotes),
-- and json_extract / UNNEST to expand arrays into rows.

WITH events AS (
    SELECT * FROM (VALUES
        ('s1', '{"event": "click",    "page": "/home",     "tags": ["promo","ab_test"], "user": {"id": 42, "tier": "pro"}}'),
        ('s1', '{"event": "purchase", "page": "/checkout", "tags": ["paid"],            "user": {"id": 42, "tier": "pro"}, "amount": 49.99}'),
        ('s2', '{"event": "click",    "page": "/about",    "tags": [],                  "user": {"id": 99, "tier": "free"}}')
    ) AS t(session_id, payload_text)
)
SELECT
    session_id,
    -- Cast TEXT → JSON so the operators work
    payload_text::JSON ->> 'event'                          AS event,
    payload_text::JSON ->> 'page'                           AS page,
    -- Drill into a nested object
    payload_text::JSON -> 'user' ->> 'tier'                 AS tier,
    -- Cast a leaf value to a typed value
    CAST(payload_text::JSON ->> 'amount' AS DOUBLE)         AS amount,
    -- First element of an array
    payload_text::JSON -> 'tags' ->> 0                      AS first_tag,
    -- Length of an array
    json_array_length(payload_text::JSON -> 'tags')         AS num_tags
FROM events;

-- Aggregate by a nested field
SELECT
    payload_text::JSON -> 'user' ->> 'tier' AS tier,
    COUNT(*)                                AS event_count,
    SUM(CAST(payload_text::JSON ->> 'amount' AS DOUBLE)) AS revenue
FROM (VALUES
    ('s1', '{"event":"click",    "user":{"tier":"pro"}}'),
    ('s1', '{"event":"purchase", "user":{"tier":"pro"},  "amount": 49.99}'),
    ('s2', '{"event":"click",    "user":{"tier":"free"}}'),
    ('s3', '{"event":"purchase", "user":{"tier":"free"}, "amount":  9.99}')
) AS t(session_id, payload_text)
GROUP BY tier
ORDER BY revenue DESC NULLS LAST;

-- Unnest an array of tags into one row per tag.
-- Cast the JSON array to VARCHAR[] so UNNEST has a proper list to expand.
SELECT
    session_id,
    UNNEST(CAST(payload_text::JSON -> 'tags' AS VARCHAR[])) AS tag
FROM (VALUES
    ('s1', '{"tags":["promo","ab_test"]}'),
    ('s2', '{"tags":["paid","gift"]}')
) AS t(session_id, payload_text);

-- Read a remote JSON file directly. DuckDB auto-loads httpfs on first use.
-- Uncomment to try (large file):
-- SELECT * FROM 'https://raw.githubusercontent.com/duckdb/duckdb-data/main/data/json/example.json' LIMIT 5;
