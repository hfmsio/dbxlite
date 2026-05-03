-- Snowflake Cortex: in-warehouse AI/LLM functions
-- Snowflake · Cortex
--
-- Cortex runs LLM and embedding models on the Snowflake warehouse, so
-- text data never leaves your account. Token cost shows up on your
-- Snowflake bill. Requires: a warehouse running, and your role granted
-- USAGE on the SNOWFLAKE.CORTEX schema (default for most accounts).
--
-- For dbxlite's chat panel, switch the backend to "Snowflake Cortex":
-- it composes these calls for you. The SQL below shows the raw API.

-- ──────────────────────────────────────────────────────────────────────
-- 1. COMPLETE - chat-style text generation
-- ──────────────────────────────────────────────────────────────────────
SELECT SNOWFLAKE.CORTEX.COMPLETE(
    'claude-sonnet-4-6',
    'In one sentence, why is columnar storage faster for analytical queries?'
) AS answer;

-- Chat-array form: pass {role, content} messages for multi-turn conversation.
SELECT SNOWFLAKE.CORTEX.COMPLETE(
    'claude-sonnet-4-6',
    PARSE_JSON('[
        {"role": "system",    "content": "You are a SQL tutor. Answer in 2 sentences max."},
        {"role": "user",      "content": "When should I use a CTE vs a subquery?"}
    ]'),
    PARSE_JSON('{"max_tokens": 200, "temperature": 0.2}')
) AS answer;

-- ──────────────────────────────────────────────────────────────────────
-- 2. SENTIMENT - score text from -1 (negative) to +1 (positive)
-- ──────────────────────────────────────────────────────────────────────
WITH reviews AS (
    SELECT * FROM (VALUES
        (1, 'The package arrived two days late and the box was dented.'),
        (2, 'Decent product for the price, does what it says.'),
        (3, 'Stopped working after a week. Returning for a refund.'),
        (4, 'It is fine.'),
        (5, 'Excellent build quality and the support team was responsive.')
    ) AS t(id, review_text)
)
SELECT
    id,
    review_text,
    SNOWFLAKE.CORTEX.SENTIMENT(review_text) AS sentiment_score
FROM reviews
ORDER BY sentiment_score DESC;

-- ──────────────────────────────────────────────────────────────────────
-- 3. SUMMARIZE - long text -> short text
-- ──────────────────────────────────────────────────────────────────────
SELECT SNOWFLAKE.CORTEX.SUMMARIZE(
    'Snowflake is a cloud-native data platform that separates storage and ' ||
    'compute, letting users scale each independently. It supports ANSI SQL, ' ||
    'semi-structured data via VARIANT, time travel for point-in-time queries, ' ||
    'and zero-copy cloning for instant test environments. Recent additions ' ||
    'include Cortex (in-warehouse AI), Iceberg table support, and dynamic ' ||
    'tables for declarative pipelines.'
) AS summary;

-- ──────────────────────────────────────────────────────────────────────
-- 4. TRANSLATE
-- ──────────────────────────────────────────────────────────────────────
-- Supported language codes (Snowflake docs): en, fr, de, it, ja, ko,
-- pl, pt, ru, es, sv. Passing an unsupported code (e.g. 'ta' for
-- Tamil) does NOT error - Cortex silently produces output in whatever
-- language the model picks, which is rarely useful. Always check the
-- Snowflake Cortex docs for the current supported list.
SELECT
    SNOWFLAKE.CORTEX.TRANSLATE('The columnar engine reads only the columns you select.', 'en', 'fr') AS french,
    SNOWFLAKE.CORTEX.TRANSLATE('The columnar engine reads only the columns you select.', 'en', 'ja') AS japanese,
    SNOWFLAKE.CORTEX.TRANSLATE('The columnar engine reads only the columns you select.', 'en', 'es') AS spanish;

-- ──────────────────────────────────────────────────────────────────────
-- 5. CLASSIFY_TEXT - multi-class classification
-- ──────────────────────────────────────────────────────────────────────
SELECT
    ticket,
    SNOWFLAKE.CORTEX.CLASSIFY_TEXT(
        ticket,
        ['billing', 'technical', 'account', 'feature_request']
    ):label::TEXT AS category
FROM (VALUES
    ('I was charged twice for last month.'),
    ('Query times out after 30 seconds.'),
    ('Can you add a dark mode option?'),
    ('I forgot my password.')
) AS t(ticket);

-- ──────────────────────────────────────────────────────────────────────
-- 6. EMBED_TEXT - vector embeddings for similarity search
-- ──────────────────────────────────────────────────────────────────────
-- Embed a query and a few candidate documents, then rank by cosine similarity.
WITH docs AS (
    SELECT * FROM (VALUES
        (1, 'DuckDB is an in-process analytical database.'),
        (2, 'PostgreSQL is a row-oriented relational database.'),
        (3, 'Apache Arrow defines a columnar memory format.'),
        (4, 'A bicycle has two wheels and pedals.')
    ) AS t(doc_id, text)
),
query AS (
    SELECT 'columnar database for analytics' AS q
)
SELECT
    d.doc_id,
    d.text,
    VECTOR_COSINE_SIMILARITY(
        SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', d.text),
        SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', q.q)
    ) AS similarity
FROM docs d, query q
ORDER BY similarity DESC;

-- ──────────────────────────────────────────────────────────────────────
-- Notes
-- ──────────────────────────────────────────────────────────────────────
-- - Available models: see SHOW PARAMETERS LIKE '%CORTEX%' or Snowflake docs.
-- - Cost: each call consumes warehouse credits. Use small models when
--   possible; batch queries if you have many rows.
-- - Region availability: not all Cortex models are available in every
--   Snowflake region. Check CURRENT_REGION() vs the model's supported
--   regions in the docs.
