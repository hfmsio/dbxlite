-- Window functions + QUALIFY (Snowflake's distinctive WHERE-after-window)
-- Top 3 customers by total spend per market segment, using TPC-H sample data.
SELECT
  c.c_mktsegment           AS segment,
  c.c_name                 AS customer,
  SUM(o.o_totalprice)      AS total_spend,
  RANK() OVER (
    PARTITION BY c.c_mktsegment
    ORDER BY SUM(o.o_totalprice) DESC
  )                        AS rank_in_segment,
  ROUND(
    100 * SUM(o.o_totalprice) /
    SUM(SUM(o.o_totalprice)) OVER (PARTITION BY c.c_mktsegment),
    2
  )                        AS pct_of_segment
FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER c
JOIN SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS o
  ON c.c_custkey = o.o_custkey
WHERE o.o_orderdate >= '1996-01-01'
GROUP BY c.c_mktsegment, c.c_name
QUALIFY rank_in_segment <= 3   -- only Snowflake/DuckDB support this
ORDER BY segment, rank_in_segment;
