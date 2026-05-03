-- Window Functions Basics
-- DuckDB · Learn DuckDB
--
-- Window functions compute a value across a "window" of rows without
-- collapsing them like GROUP BY does. They're how you do ranking, running
-- totals, and "compare each row to its neighbours" without subqueries.

WITH sales AS (
    SELECT * FROM (VALUES
        (DATE '2026-01-01', 'widgets', 1200),
        (DATE '2026-02-01', 'widgets', 1500),
        (DATE '2026-03-01', 'widgets', 1800),
        (DATE '2026-04-01', 'widgets', 1700),
        (DATE '2026-01-01', 'gadgets',  800),
        (DATE '2026-02-01', 'gadgets',  950),
        (DATE '2026-03-01', 'gadgets', 1100),
        (DATE '2026-04-01', 'gadgets', 1400)
    ) AS t(month, product, revenue)
)
SELECT
    month,
    product,
    revenue,
    -- Running total per product
    SUM(revenue) OVER (PARTITION BY product ORDER BY month)        AS running_total,
    -- Previous month's revenue (LAG = look back N rows)
    LAG(revenue) OVER (PARTITION BY product ORDER BY month)        AS prev_month,
    -- Difference vs previous month
    revenue - LAG(revenue) OVER (PARTITION BY product ORDER BY month) AS month_over_month,
    -- Rank by revenue per product
    RANK() OVER (PARTITION BY product ORDER BY revenue DESC)       AS revenue_rank,
    -- 3-month moving average (current + 2 preceding)
    ROUND(AVG(revenue) OVER (
        PARTITION BY product ORDER BY month
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ), 0) AS rolling_avg_3mo,
    -- Each row's share of its product's total
    ROUND(
        100.0 * revenue / SUM(revenue) OVER (PARTITION BY product),
        1
    ) AS pct_of_product_total
FROM sales
ORDER BY product, month;

-- DuckDB-specific: QUALIFY filters by window-function results in one
-- statement (no need to wrap in a subquery).
SELECT *
FROM (VALUES
    (DATE '2026-01-01', 'widgets', 1200),
    (DATE '2026-02-01', 'widgets', 1500),
    (DATE '2026-03-01', 'widgets', 1800),
    (DATE '2026-04-01', 'widgets', 1700),
    (DATE '2026-01-01', 'gadgets',  800),
    (DATE '2026-02-01', 'gadgets',  950),
    (DATE '2026-03-01', 'gadgets', 1100),
    (DATE '2026-04-01', 'gadgets', 1400)
) AS s(month, product, revenue)
QUALIFY RANK() OVER (PARTITION BY product ORDER BY revenue DESC) <= 2
ORDER BY product, revenue DESC;
-- ^ Top 2 months by revenue per product.
