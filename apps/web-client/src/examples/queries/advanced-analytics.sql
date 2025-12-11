-- World Development Analytics Dashboard
-- Demonstrates: Multi-level CTEs, Window Functions, LAG, RANK, PERCENTILE, YoY Analysis
-- Dataset: Gapminder (country development indicators 1952-2007)

-- ============================================================
-- PART 1: Country Growth Analysis with Year-over-Year Trends
-- ============================================================

WITH base_metrics AS (
    -- Load and calculate derived metrics
    SELECT
        country,
        continent,
        year,
        pop AS population,
        lifeExp AS life_expectancy,
        gdpPercap AS gdp_per_capita,
        pop * gdpPercap AS total_gdp
    FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
),
with_growth AS (
    -- Add year-over-year growth calculations using LAG
    SELECT
        *,
        LAG(population) OVER (PARTITION BY country ORDER BY year) AS prev_pop,
        LAG(gdp_per_capita) OVER (PARTITION BY country ORDER BY year) AS prev_gdp,
        LAG(life_expectancy) OVER (PARTITION BY country ORDER BY year) AS prev_life_exp
    FROM base_metrics
),
growth_rates AS (
    -- Calculate growth rates and changes
    SELECT
        country,
        continent,
        year,
        population,
        life_expectancy,
        gdp_per_capita,
        total_gdp,
        CASE WHEN prev_pop > 0
            THEN ROUND(100.0 * (population - prev_pop) / prev_pop, 2)
            ELSE NULL
        END AS pop_growth_pct,
        CASE WHEN prev_gdp > 0
            THEN ROUND(100.0 * (gdp_per_capita - prev_gdp) / prev_gdp, 2)
            ELSE NULL
        END AS gdp_growth_pct,
        ROUND(life_expectancy - COALESCE(prev_life_exp, life_expectancy), 2) AS life_exp_change
    FROM with_growth
),
ranked AS (
    -- Rank countries within each continent by GDP per capita
    SELECT
        *,
        RANK() OVER (PARTITION BY continent, year ORDER BY gdp_per_capita DESC) AS gdp_rank,
        RANK() OVER (PARTITION BY continent, year ORDER BY life_expectancy DESC) AS health_rank,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gdp_per_capita)
            OVER (PARTITION BY continent, year) AS continent_median_gdp
    FROM growth_rates
)
SELECT
    year,
    continent,
    country,
    population,
    ROUND(life_expectancy, 1) AS life_exp,
    ROUND(gdp_per_capita, 0) AS gdp_pc,
    pop_growth_pct || '%' AS pop_growth,
    gdp_growth_pct || '%' AS gdp_growth,
    life_exp_change AS life_chg,
    '#' || gdp_rank AS gdp_rank,
    '#' || health_rank AS health_rank,
    CASE
        WHEN gdp_per_capita > continent_median_gdp * 1.5 THEN 'Above'
        WHEN gdp_per_capita < continent_median_gdp * 0.5 THEN 'Below'
        ELSE 'Average'
    END AS vs_median
FROM ranked
WHERE year >= 1990
  AND gdp_rank <= 5
ORDER BY year DESC, continent, gdp_rank
LIMIT 30;


-- ============================================================
-- PART 2: Continental Summary with Percentiles
-- ============================================================

WITH continental_stats AS (
    SELECT
        continent,
        year,
        COUNT(DISTINCT country) AS countries,
        SUM(pop) AS total_pop,
        ROUND(AVG(lifeExp), 1) AS avg_life_exp,
        ROUND(AVG(gdpPercap), 0) AS avg_gdp,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY gdpPercap), 0) AS gdp_p25,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY gdpPercap), 0) AS gdp_median,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gdpPercap), 0) AS gdp_p75,
        ROUND(MIN(lifeExp), 1) AS min_life_exp,
        ROUND(MAX(lifeExp), 1) AS max_life_exp
    FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
    GROUP BY continent, year
),
with_trends AS (
    SELECT
        *,
        LAG(avg_life_exp) OVER (PARTITION BY continent ORDER BY year) AS prev_life_exp,
        LAG(avg_gdp) OVER (PARTITION BY continent ORDER BY year) AS prev_gdp,
        FIRST_VALUE(total_pop) OVER (PARTITION BY continent ORDER BY year) AS base_pop
    FROM continental_stats
)
SELECT
    year,
    continent,
    countries,
    total_pop,
    ROUND(100.0 * total_pop / base_pop, 0) || '%' AS pop_index,
    avg_life_exp,
    ROUND(avg_life_exp - COALESCE(prev_life_exp, avg_life_exp), 1) AS life_chg,
    avg_gdp,
    gdp_p25 || ' / ' || gdp_median || ' / ' || gdp_p75 AS "p25/p50/p75",
    min_life_exp || '-' || max_life_exp AS life_range
FROM with_trends
WHERE year IN (1952, 1977, 2007)
ORDER BY year, continent;


-- ============================================================
-- PART 3: Top Improvers - Biggest Life Expectancy Gains
-- ============================================================

WITH first_last AS (
    SELECT
        country,
        continent,
        MIN(year) AS first_year,
        MAX(year) AS last_year
    FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
    GROUP BY country, continent
),
improvements AS (
    SELECT
        f.country,
        f.continent,
        f.first_year,
        f.last_year,
        g1.lifeExp AS start_life_exp,
        g2.lifeExp AS end_life_exp,
        g1.gdpPercap AS start_gdp,
        g2.gdpPercap AS end_gdp,
        g1.pop AS start_pop,
        g2.pop AS end_pop
    FROM first_last f
    JOIN 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv' g1
        ON f.country = g1.country AND f.first_year = g1.year
    JOIN 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv' g2
        ON f.country = g2.country AND f.last_year = g2.year
)
SELECT
    country,
    continent,
    first_year || '-' || last_year AS period,
    ROUND(start_life_exp, 1) || ' → ' || ROUND(end_life_exp, 1) AS life_exp_journey,
    ROUND(end_life_exp - start_life_exp, 1) AS years_gained,
    ROUND(100.0 * (end_gdp - start_gdp) / start_gdp, 0) || '%' AS gdp_growth,
    ROUND(100.0 * (end_pop - start_pop) / start_pop, 0) || '%' AS pop_growth,
    RANK() OVER (ORDER BY end_life_exp - start_life_exp DESC) AS improvement_rank
FROM improvements
ORDER BY years_gained DESC
LIMIT 15;
