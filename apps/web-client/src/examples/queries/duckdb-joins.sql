-- Joins: INNER, LEFT, FULL OUTER
-- DuckDB · Getting Started
--
-- Joins combine rows from multiple tables on a relationship between them.
-- Different join types decide what to do with non-matching rows.

WITH users AS (
    SELECT * FROM (VALUES
        (1, 'Alice'),
        (2, 'Bob'),
        (3, 'Carol'),
        (4, 'Dave')
    ) AS t(user_id, name)
),
orders AS (
    SELECT * FROM (VALUES
        (101, 1,  50.00),
        (102, 1,  30.00),
        (103, 2,  75.00),
        (104, 5,  99.00)   -- order belongs to a user we don't know about
    ) AS t(order_id, user_id, total)
)
-- INNER JOIN: only rows with a match on both sides.
-- Carol and Dave drop out (no orders); order 104 drops out (no user).
SELECT u.name, o.order_id, o.total
FROM users u
INNER JOIN orders o ON u.user_id = o.user_id
ORDER BY u.name, o.order_id;

-- LEFT JOIN: every row from the left table, NULLs where the right side
-- has no match. Carol and Dave appear with NULL orders.
SELECT u.name, o.order_id, o.total
FROM (VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave')) u(user_id, name)
LEFT JOIN (VALUES (101,1,50.00),(102,1,30.00),(103,2,75.00),(104,5,99.00))
    o(order_id, user_id, total)
ON u.user_id = o.user_id
ORDER BY u.name, o.order_id NULLS LAST;

-- FULL OUTER JOIN: every row from both sides. Order 104 (orphan) shows
-- up with NULL name; Carol and Dave show up with NULL order data.
SELECT u.name, o.order_id, o.total
FROM (VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave')) u(user_id, name)
FULL OUTER JOIN (VALUES (101,1,50.00),(102,1,30.00),(103,2,75.00),(104,5,99.00))
    o(order_id, user_id, total)
ON u.user_id = o.user_id
ORDER BY u.name NULLS LAST, o.order_id NULLS LAST;

-- Aggregation after a join: revenue per user, including users with no
-- orders. COALESCE replaces NULL totals with 0.
SELECT
    u.name,
    COUNT(o.order_id)        AS num_orders,
    COALESCE(SUM(o.total), 0) AS total_spent
FROM (VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave')) u(user_id, name)
LEFT JOIN (VALUES (101,1,50.00),(102,1,30.00),(103,2,75.00))
    o(order_id, user_id, total)
ON u.user_id = o.user_id
GROUP BY u.name
ORDER BY total_spent DESC;
