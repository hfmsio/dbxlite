-- RFM Segmentation: Recency, Frequency, Monetary scoring
-- DuckDB · Real-World Analytics
--
-- Each customer gets a 1–5 score on three dimensions:
--   R - how recently they last ordered (lower days = higher score)
--   F - how many orders they've placed
--   M - how much they've spent
-- Combined scores route customers into segments (champion, at risk, …).
-- The classic e-commerce / subscription marketing model.

WITH orders AS (
    -- Synthetic: customer_id, order_date, amount
    SELECT * FROM (VALUES
        (1, DATE '2026-04-15',  250.00),
        (1, DATE '2026-03-20',  180.00),
        (1, DATE '2026-02-10',   95.00),
        (2, DATE '2026-04-28', 1200.00),
        (2, DATE '2026-04-15',  800.00),
        (2, DATE '2026-04-01',  600.00),
        (3, DATE '2025-11-10',   50.00),
        (4, DATE '2026-04-20',  450.00),
        (5, DATE '2025-08-05',   75.00),
        (5, DATE '2025-09-15',   60.00),
        (6, DATE '2026-04-30',   90.00),
        (7, DATE '2026-04-10',  220.00),
        (7, DATE '2026-03-15',  180.00),
        (8, DATE '2026-01-08',  500.00),
        (9, DATE '2026-04-25',   30.00),
        (10, DATE '2026-04-29', 1800.00),
        (10, DATE '2026-04-01', 1500.00),
        (10, DATE '2026-03-15',  900.00)
    ) AS t(customer_id, order_date, amount)
),
-- Reference date for "recency" - pretend today is 2026-05-01.
rfm_raw AS (
    SELECT
        customer_id,
        DATE_DIFF('day', MAX(order_date), DATE '2026-05-01') AS recency_days,
        COUNT(*)    AS frequency,
        SUM(amount) AS monetary
    FROM orders
    GROUP BY customer_id
),
-- NTILE(5) buckets customers into 5 quintiles. For recency, smaller is
-- better (fewer days since last order), so we invert (6 - score).
rfm_scored AS (
    SELECT
        customer_id,
        recency_days,
        frequency,
        monetary,
        6 - NTILE(5) OVER (ORDER BY recency_days) AS r_score,
        NTILE(5) OVER (ORDER BY frequency)        AS f_score,
        NTILE(5) OVER (ORDER BY monetary)         AS m_score
    FROM rfm_raw
)
SELECT
    customer_id,
    recency_days,
    frequency,
    monetary,
    r_score, f_score, m_score,
    CASE
        WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'champion'
        WHEN r_score >= 4 AND f_score <= 2                  THEN 'new customer'
        WHEN r_score <= 2 AND f_score >= 3 AND m_score >= 3 THEN 'at risk'
        WHEN r_score <= 2                                   THEN 'lost / dormant'
        ELSE                                                     'regular'
    END AS segment
FROM rfm_scored
ORDER BY r_score DESC, m_score DESC;
