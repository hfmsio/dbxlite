-- TPC-H Sample Data - orders summary
-- Snowflake provides SNOWFLAKE_SAMPLE_DATA for free; available to most accounts.
-- Counts orders per market segment by year, with revenue.
--
-- If you don't see SNOWFLAKE_SAMPLE_DATA, run:
--   USE ROLE ACCOUNTADMIN;
--   GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE PUBLIC;
SELECT
  c.c_mktsegment AS segment,
  YEAR(o.o_orderdate) AS year,
  COUNT(*) AS order_count,
  ROUND(SUM(o.o_totalprice), 2) AS total_revenue,
  ROUND(AVG(o.o_totalprice), 2) AS avg_order_value
FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS o
JOIN SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER c
  ON o.o_custkey = c.c_custkey
WHERE o.o_orderdate BETWEEN '1995-01-01' AND '1997-12-31'
GROUP BY segment, year
ORDER BY year, total_revenue DESC;
