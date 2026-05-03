-- Aggregations: GROUP BY, COUNT, SUM, AVG, MIN, MAX
-- DuckDB · Getting Started
--
-- Aggregate functions reduce many rows to one summary row per group.
-- Uses inline VALUES so no external data is needed.

WITH sales AS (
    SELECT * FROM (VALUES
        ('north', 'widgets',   12,  5.99),
        ('north', 'gadgets',    7,  9.50),
        ('north', 'widgets',    4,  5.99),
        ('south', 'widgets',   22,  5.99),
        ('south', 'gadgets',   11,  9.50),
        ('south', 'sprockets',  5, 12.00),
        ('east',  'widgets',    9,  5.99),
        ('east',  'sprockets',  3, 12.00),
        ('west',  'gadgets',   14,  9.50)
    ) AS t(region, product, units, unit_price)
)
SELECT
    region,
    COUNT(*)                AS line_items,
    SUM(units)              AS total_units,
    SUM(units * unit_price) AS revenue,
    ROUND(AVG(unit_price), 2) AS avg_unit_price,
    MIN(units)              AS smallest_order,
    MAX(units)              AS largest_order
FROM sales
GROUP BY region
ORDER BY revenue DESC;

-- ROLLUP adds subtotals + a grand total in one query.
SELECT
    COALESCE(region, '- all regions') AS region,
    COALESCE(product, '- all products') AS product,
    SUM(units * unit_price) AS revenue
FROM (VALUES
    ('north', 'widgets', 12, 5.99),
    ('north', 'gadgets',  7, 9.50),
    ('south', 'widgets', 22, 5.99),
    ('south', 'gadgets', 11, 9.50),
    ('east',  'widgets',  9, 5.99),
    ('west',  'gadgets', 14, 9.50)
) AS t(region, product, units, unit_price)
GROUP BY ROLLUP (region, product)
ORDER BY region NULLS LAST, product NULLS LAST;

-- FILTER lets you compute conditional aggregates without subqueries.
SELECT
    region,
    SUM(units * unit_price) FILTER (WHERE product = 'widgets')   AS widget_revenue,
    SUM(units * unit_price) FILTER (WHERE product = 'gadgets')   AS gadget_revenue,
    SUM(units * unit_price) FILTER (WHERE product = 'sprockets') AS sprocket_revenue,
    SUM(units * unit_price)                                      AS total_revenue
FROM (VALUES
    ('north', 'widgets',   12,  5.99),
    ('north', 'gadgets',    7,  9.50),
    ('south', 'widgets',   22,  5.99),
    ('south', 'sprockets',  5, 12.00),
    ('east',  'widgets',    9,  5.99)
) AS t(region, product, units, unit_price)
GROUP BY region
ORDER BY total_revenue DESC;
