-- Generate numbers 1..12 and label quarters
WITH nums AS (
  SELECT generate_series AS month_num
  FROM generate_series(1, 12)
)
SELECT
  month_num,
  CASE
    WHEN month_num <= 3 THEN 'Q1'
    WHEN month_num <= 6 THEN 'Q2'
    WHEN month_num <= 9 THEN 'Q3'
    ELSE 'Q4'
  END AS quarter,
  month_num * month_num AS squared
FROM nums
ORDER BY month_num;
