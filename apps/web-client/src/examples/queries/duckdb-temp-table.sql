-- Create a temp table from inline values
CREATE OR REPLACE TEMP TABLE sales AS
SELECT * FROM (
  VALUES
    ('2024-01-01', 'West', 120),
    ('2024-01-02', 'West', 95),
    ('2024-01-01', 'East', 200),
    ('2024-01-02', 'East', 155)
) AS t(order_date, region, amount);

-- Summarize totals by region
SELECT
  region,
  SUM(amount) AS total_amount,
  AVG(amount) AS avg_amount
FROM sales
GROUP BY region
ORDER BY total_amount DESC;
