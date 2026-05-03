-- Monthly Cohort Retention
-- DuckDB · Real-World Analytics
--
-- Group users by signup month, then track what fraction came back in
-- each subsequent month. Standard SaaS / consumer analytics pattern.

WITH activity AS (
    -- Synthetic: user_id, activity_date.
    SELECT * FROM (VALUES
        (1, DATE '2026-01-05'),
        (1, DATE '2026-01-20'),
        (1, DATE '2026-02-10'),
        (1, DATE '2026-03-15'),
        (2, DATE '2026-01-10'),
        (2, DATE '2026-02-15'),
        (3, DATE '2026-01-22'),
        (4, DATE '2026-02-01'),
        (4, DATE '2026-02-25'),
        (4, DATE '2026-03-05'),
        (4, DATE '2026-04-12'),
        (5, DATE '2026-02-18'),
        (6, DATE '2026-03-08'),
        (6, DATE '2026-04-02'),
        (7, DATE '2026-03-22'),
        (8, DATE '2026-04-15')
    ) AS t(user_id, activity_date)
),
-- Each user's cohort = month of their first activity.
cohort AS (
    SELECT
        user_id,
        DATE_TRUNC('month', MIN(activity_date)) AS cohort_month
    FROM activity
    GROUP BY user_id
),
-- Combine activity with cohort, computing the month-offset.
activity_with_cohort AS (
    SELECT
        a.user_id,
        c.cohort_month,
        DATE_TRUNC('month', a.activity_date)                              AS active_month,
        DATE_DIFF('month', c.cohort_month, DATE_TRUNC('month', a.activity_date)) AS months_since_signup
    FROM activity a
    JOIN cohort   c USING (user_id)
),
-- Active users per (cohort_month, months_since_signup) cell.
counts AS (
    SELECT
        cohort_month,
        months_since_signup,
        COUNT(DISTINCT user_id) AS active_users
    FROM activity_with_cohort
    GROUP BY cohort_month, months_since_signup
)
SELECT
    cohort_month,
    months_since_signup,
    active_users,
    -- Cohort size at month 0 - the denominator for retention %
    FIRST_VALUE(active_users) OVER (
        PARTITION BY cohort_month ORDER BY months_since_signup
    ) AS cohort_size,
    ROUND(
        100.0 * active_users / FIRST_VALUE(active_users) OVER (
            PARTITION BY cohort_month ORDER BY months_since_signup
        ),
        1
    ) AS retention_pct
FROM counts
ORDER BY cohort_month, months_since_signup;
