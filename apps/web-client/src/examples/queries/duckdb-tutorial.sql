-- ============================================
-- DuckDB Feature Tour & Learning Guide
-- ============================================
-- This comprehensive example demonstrates key
-- DuckDB features. Run sections individually
-- or execute all at once to explore!
-- ============================================

-- ============================================
-- SECTION 1: Creating & Populating Tables
-- ============================================

-- Create a sample employees table
CREATE OR REPLACE TEMP TABLE employees AS
SELECT * FROM (VALUES
    (1, 'Alice', 'Engineering', 95000, '2020-03-15'),
    (2, 'Bob', 'Engineering', 88000, '2021-06-01'),
    (3, 'Carol', 'Marketing', 72000, '2019-11-20'),
    (4, 'David', 'Marketing', 68000, '2022-01-10'),
    (5, 'Eve', 'Sales', 82000, '2020-08-05'),
    (6, 'Frank', 'Sales', 79000, '2021-03-22'),
    (7, 'Grace', 'Engineering', 105000, '2018-05-14'),
    (8, 'Henry', 'HR', 65000, '2022-09-01'),
    (9, 'Iris', 'Engineering', 92000, '2021-11-15'),
    (10, 'Jack', 'Sales', 87000, '2020-02-28')
) AS t(id, name, department, salary, hire_date);

-- Create a sample projects table
CREATE OR REPLACE TEMP TABLE projects AS
SELECT * FROM (VALUES
    (101, 'Website Redesign', 'Marketing', '2024-01-01', '2024-06-30'),
    (102, 'API v2', 'Engineering', '2024-02-15', '2024-08-15'),
    (103, 'Mobile App', 'Engineering', '2024-03-01', '2024-12-31'),
    (104, 'Sales Dashboard', 'Sales', '2024-01-15', '2024-04-30'),
    (105, 'Hiring Portal', 'HR', '2024-04-01', '2024-07-31')
) AS t(project_id, project_name, department, start_date, end_date);

-- ============================================
-- SECTION 2: Window Functions
-- ============================================

-- Rank employees by salary within each department
SELECT
    name,
    department,
    salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank,
    DENSE_RANK() OVER (ORDER BY salary DESC) AS company_rank,
    salary - LAG(salary) OVER (PARTITION BY department ORDER BY salary) AS diff_from_prev
FROM employees
ORDER BY department, salary DESC;

-- ============================================
-- SECTION 3: Common Table Expressions (CTEs)
-- ============================================

-- Calculate department statistics using CTEs
WITH dept_stats AS (
    SELECT
        department,
        COUNT(*) AS emp_count,
        AVG(salary) AS avg_salary,
        MIN(salary) AS min_salary,
        MAX(salary) AS max_salary
    FROM employees
    GROUP BY department
),
dept_ranked AS (
    SELECT
        *,
        RANK() OVER (ORDER BY avg_salary DESC) AS salary_rank
    FROM dept_stats
)
SELECT
    department,
    emp_count,
    ROUND(avg_salary, 2) AS avg_salary,
    min_salary || ' - ' || max_salary AS salary_range,
    salary_rank
FROM dept_ranked
ORDER BY salary_rank;

-- ============================================
-- SECTION 4: Date/Time Functions
-- ============================================

SELECT
    name,
    hire_date::DATE AS hired,
    DATE_PART('year', CURRENT_DATE) - DATE_PART('year', hire_date::DATE) AS years_employed,
    DATE_TRUNC('month', hire_date::DATE) AS hire_month,
    DAYNAME(hire_date::DATE) AS hired_day,
    AGE(CURRENT_DATE, hire_date::DATE) AS tenure
FROM employees
ORDER BY hire_date;

-- ============================================
-- SECTION 5: String Functions
-- ============================================

SELECT
    name,
    UPPER(department) AS dept_upper,
    LEFT(name, 1) || '.' || department AS code,
    LENGTH(name) AS name_length,
    CONCAT_WS(' | ', name, department, salary::VARCHAR) AS combined,
    REGEXP_REPLACE(name, '[aeiou]', '*', 'gi') AS vowels_masked
FROM employees
LIMIT 5;

-- ============================================
-- SECTION 6: Aggregations with FILTER
-- ============================================

SELECT
    department,
    COUNT(*) AS total_employees,
    COUNT(*) FILTER (WHERE salary > 80000) AS high_earners,
    ROUND(AVG(salary) FILTER (WHERE salary > 80000), 2) AS avg_high_salary,
    SUM(salary) AS total_payroll,
    ROUND(100.0 * COUNT(*) FILTER (WHERE salary > 80000) / COUNT(*), 1) AS pct_high_earners
FROM employees
GROUP BY department
ORDER BY pct_high_earners DESC;

-- ============================================
-- SECTION 7: PIVOT / UNPIVOT (DuckDB 0.9+)
-- ============================================

-- Pivot: department salaries as columns
PIVOT employees
ON department
USING SUM(salary)
ORDER BY 1;

-- ============================================
-- SECTION 8: List & Struct Types
-- ============================================

SELECT
    department,
    LIST(name ORDER BY salary DESC) AS employees_by_salary,
    LIST(salary ORDER BY salary DESC) AS salaries,
    {'count': COUNT(*), 'total': SUM(salary), 'avg': ROUND(AVG(salary))} AS stats
FROM employees
GROUP BY department;

-- ============================================
-- SECTION 9: generate_series & UNNEST
-- ============================================

-- Generate date series for 2024
SELECT
    date::DATE AS date,
    DAYNAME(date) AS day_name,
    WEEKOFYEAR(date) AS week_num,
    MONTHNAME(date) AS month_name
FROM generate_series(
    DATE '2024-01-01',
    DATE '2024-01-14',
    INTERVAL 1 DAY
) AS t(date);

-- ============================================
-- SECTION 10: JSON Operations
-- ============================================

WITH json_data AS (
    SELECT '{"name": "Test", "values": [1, 2, 3], "nested": {"a": 10}}' AS json_col
)
SELECT
    json_col::JSON ->> 'name' AS name,
    json_col::JSON -> 'values' AS values_array,
    json_col::JSON -> 'nested' ->> 'a' AS nested_value,
    json_array_length(json_col::JSON -> 'values') AS array_len
FROM json_data;

-- ============================================
-- FINAL: Summary Dashboard Query
-- ============================================

SELECT
    '📊 Company Overview' AS report,
    (SELECT COUNT(*) FROM employees) AS total_employees,
    (SELECT COUNT(DISTINCT department) FROM employees) AS departments,
    (SELECT ROUND(AVG(salary)) FROM employees) AS avg_salary,
    (SELECT MAX(salary) FROM employees) AS top_salary,
    (SELECT COUNT(*) FROM projects) AS active_projects;
