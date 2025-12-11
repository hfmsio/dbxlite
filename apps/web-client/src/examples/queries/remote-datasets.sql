-- ============================================
-- Remote Datasets: Query Public Data Directly
-- ============================================
-- DuckDB can query CSV files directly from URLs!
-- These datasets work in the browser (CORS-friendly).

-- ============================================
-- 1. DIAMONDS: 54K Diamond Prices (ggplot2)
-- ============================================
-- Classic dataset for price analysis

-- Preview the data
SELECT * FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
LIMIT 10;

-- Price distribution by cut quality
SELECT
    cut,
    COUNT(*) AS count,
    ROUND(AVG(price), 2) AS avg_price,
    MIN(price) AS min_price,
    MAX(price) AS max_price,
    ROUND(STDDEV(price), 2) AS std_dev
FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
GROUP BY cut
ORDER BY avg_price DESC;

-- Top 10 most expensive diamonds
SELECT carat, cut, color, clarity, price
FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
ORDER BY price DESC
LIMIT 10;

-- Price per carat by clarity (which clarity is best value?)
SELECT
    clarity,
    COUNT(*) AS count,
    ROUND(AVG(price / carat), 2) AS avg_price_per_carat
FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
GROUP BY clarity
ORDER BY avg_price_per_carat DESC;

-- ============================================
-- 2. TITANIC: Survival Analysis (891 passengers)
-- ============================================
-- Famous dataset - who survived the disaster?

-- Preview passenger data
SELECT survived, pclass, sex, age, fare, embarked, class, embark_town
FROM 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv'
LIMIT 10;

-- Survival rate by class and sex
SELECT
    class,
    sex,
    COUNT(*) AS passengers,
    SUM(survived) AS survived,
    ROUND(100.0 * SUM(survived) / COUNT(*), 1) AS survival_rate_pct
FROM 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv'
GROUP BY class, sex
ORDER BY class, sex;

-- Age distribution of survivors vs non-survivors
SELECT
    CASE
        WHEN age < 18 THEN 'Child (<18)'
        WHEN age < 40 THEN 'Adult (18-39)'
        WHEN age < 60 THEN 'Middle (40-59)'
        ELSE 'Senior (60+)'
    END AS age_group,
    COUNT(*) AS total,
    SUM(survived) AS survived,
    ROUND(100.0 * SUM(survived) / COUNT(*), 1) AS survival_rate_pct
FROM 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv'
WHERE age IS NOT NULL
GROUP BY 1
ORDER BY survival_rate_pct DESC;

-- Fare statistics by embarkation port
SELECT
    embark_town,
    COUNT(*) AS passengers,
    ROUND(AVG(fare), 2) AS avg_fare,
    ROUND(MEDIAN(fare), 2) AS median_fare
FROM 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv'
WHERE embark_town IS NOT NULL
GROUP BY embark_town
ORDER BY avg_fare DESC;

-- ============================================
-- 3. GAPMINDER: World Development (1952-2007)
-- ============================================
-- Life expectancy, population, GDP across countries

-- Preview country data
SELECT * FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
LIMIT 10;

-- Countries with highest life expectancy in 2007
SELECT country, continent, lifeExp, pop, gdpPercap
FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
WHERE year = 2007
ORDER BY lifeExp DESC
LIMIT 15;

-- Life expectancy improvement over time by continent
SELECT
    continent,
    ROUND(AVG(CASE WHEN year = 1952 THEN lifeExp END), 1) AS life_exp_1952,
    ROUND(AVG(CASE WHEN year = 2007 THEN lifeExp END), 1) AS life_exp_2007,
    ROUND(AVG(CASE WHEN year = 2007 THEN lifeExp END) -
          AVG(CASE WHEN year = 1952 THEN lifeExp END), 1) AS improvement
FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
GROUP BY continent
ORDER BY improvement DESC;

-- Population growth: largest countries over time
SELECT
    country,
    MAX(CASE WHEN year = 1952 THEN pop END) AS pop_1952,
    MAX(CASE WHEN year = 2007 THEN pop END) AS pop_2007,
    ROUND(100.0 * (MAX(CASE WHEN year = 2007 THEN pop END) -
                   MAX(CASE WHEN year = 1952 THEN pop END)) /
          NULLIF(MAX(CASE WHEN year = 1952 THEN pop END), 0), 1) AS growth_pct
FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
GROUP BY country
HAVING MAX(CASE WHEN year = 2007 THEN pop END) > 100000000
ORDER BY pop_2007 DESC;

-- GDP per capita ranking changes
WITH ranked AS (
    SELECT
        country,
        year,
        gdpPercap,
        RANK() OVER (PARTITION BY year ORDER BY gdpPercap DESC) AS gdp_rank
    FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
    WHERE year IN (1952, 2007)
)
SELECT
    r1.country,
    r1.gdp_rank AS rank_1952,
    r2.gdp_rank AS rank_2007,
    r1.gdp_rank - r2.gdp_rank AS rank_improvement
FROM ranked r1
JOIN ranked r2 ON r1.country = r2.country
WHERE r1.year = 1952 AND r2.year = 2007
ORDER BY rank_improvement DESC
LIMIT 10;

-- ============================================
-- 4. BONUS: Combine Datasets
-- ============================================
-- You can query multiple remote files in one query!

-- Compare dataset sizes
SELECT 'Diamonds' AS dataset, COUNT(*) AS rows
FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
UNION ALL
SELECT 'Titanic', COUNT(*)
FROM 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv'
UNION ALL
SELECT 'Gapminder', COUNT(*)
FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv';
