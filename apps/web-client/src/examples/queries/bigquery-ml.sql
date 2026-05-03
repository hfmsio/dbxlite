-- BigQuery ML: train and use ML models in SQL
-- BigQuery · ML
--
-- BigQuery ML lets you train models with CREATE MODEL and predict with
-- ML.PREDICT - all in SQL. Recent versions also support remote LLMs
-- via ML.GENERATE_TEXT (Gemini) once a remote model is configured.
--
-- The training queries below scan public datasets. Always check the
-- estimated bytes in dbxlite's cost preview before running CREATE MODEL.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Logistic regression: predict whether a flight is late
-- ──────────────────────────────────────────────────────────────────────
-- Trains on the public `flights` sample (~few-MB scan). Replace
-- `your_project.your_dataset` with one you own and have BQ ML enabled in.
CREATE OR REPLACE MODEL `your_project.your_dataset.flight_late_model`
OPTIONS(
    MODEL_TYPE = 'LOGISTIC_REG',
    INPUT_LABEL_COLS = ['is_late']
) AS
SELECT
    IF(arrival_delay > 15, 1, 0) AS is_late,
    departure_airport,
    arrival_airport,
    EXTRACT(DAYOFWEEK FROM departure_time) AS day_of_week,
    EXTRACT(HOUR      FROM departure_time) AS hour_of_day,
    departure_delay
FROM `bigquery-public-data.samples.flights`
WHERE arrival_delay IS NOT NULL
  AND departure_delay IS NOT NULL
LIMIT 100000;

-- Evaluate the trained model
SELECT * FROM ML.EVALUATE(
    MODEL `your_project.your_dataset.flight_late_model`,
    (SELECT
        IF(arrival_delay > 15, 1, 0) AS is_late,
        departure_airport, arrival_airport,
        EXTRACT(DAYOFWEEK FROM departure_time) AS day_of_week,
        EXTRACT(HOUR      FROM departure_time) AS hour_of_day,
        departure_delay
     FROM `bigquery-public-data.samples.flights`
     WHERE arrival_delay IS NOT NULL
     LIMIT 10000)
);

-- Predict on new rows
SELECT * FROM ML.PREDICT(
    MODEL `your_project.your_dataset.flight_late_model`,
    (SELECT
        'JFK' AS departure_airport,
        'LAX' AS arrival_airport,
        3     AS day_of_week,
        17    AS hour_of_day,
        5     AS departure_delay)
);

-- ──────────────────────────────────────────────────────────────────────
-- 2. K-means clustering on London bicycle hires
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE MODEL `your_project.your_dataset.bike_clusters`
OPTIONS(MODEL_TYPE = 'KMEANS', NUM_CLUSTERS = 4) AS
SELECT
    EXTRACT(HOUR FROM start_date) AS start_hour,
    duration,
    bike_id
FROM `bigquery-public-data.london_bicycles.cycle_hire`
WHERE duration BETWEEN 60 AND 7200
LIMIT 50000;

-- See which cluster each row belongs to
SELECT cluster_id, COUNT(*) AS rides, AVG(start_hour) AS avg_hour
FROM ML.PREDICT(
    MODEL `your_project.your_dataset.bike_clusters`,
    (SELECT
        EXTRACT(HOUR FROM start_date) AS start_hour,
        duration,
        bike_id
     FROM `bigquery-public-data.london_bicycles.cycle_hire`
     WHERE duration BETWEEN 60 AND 7200
     LIMIT 50000)
)
GROUP BY cluster_id
ORDER BY cluster_id;

-- ──────────────────────────────────────────────────────────────────────
-- 3. ML.GENERATE_TEXT - Gemini through a BQ remote model
-- ──────────────────────────────────────────────────────────────────────
-- Requires one-time setup:
--   1. Create a Cloud connection (BigLake CONNECTION) for Vertex AI.
--   2. CREATE MODEL my_dataset.gemini_pro REMOTE WITH CONNECTION ...
--      OPTIONS (ENDPOINT = 'gemini-pro').
-- Once configured, you can generate text inline:
SELECT
    ml_generate_text_result['candidates'][0]['content']['parts'][0]['text'] AS summary
FROM ML.GENERATE_TEXT(
    MODEL `your_project.your_dataset.gemini_pro`,
    (SELECT 'Summarize this product review in one sentence: ' ||
            'The app is great but it crashes on large queries.' AS prompt),
    STRUCT(0.2 AS temperature, 200 AS max_output_tokens)
);

-- ──────────────────────────────────────────────────────────────────────
-- 4. Forecasting with ARIMA_PLUS
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE MODEL `your_project.your_dataset.taxi_forecast`
OPTIONS(
    MODEL_TYPE       = 'ARIMA_PLUS',
    TIME_SERIES_TIMESTAMP_COL = 'pickup_date',
    TIME_SERIES_DATA_COL      = 'trip_count'
) AS
SELECT
    DATE(pickup_datetime) AS pickup_date,
    COUNT(*)              AS trip_count
FROM `bigquery-public-data.new_york_taxi_trips.tlc_yellow_trips_2019`
GROUP BY pickup_date
ORDER BY pickup_date;

-- 30-day forecast
SELECT *
FROM ML.FORECAST(
    MODEL `your_project.your_dataset.taxi_forecast`,
    STRUCT(30 AS horizon, 0.95 AS confidence_level)
);

-- ──────────────────────────────────────────────────────────────────────
-- Notes
-- ──────────────────────────────────────────────────────────────────────
-- - CREATE MODEL is billed by training data scanned (often >1 TB on full
--   public datasets). Always LIMIT or filter aggressively in this app.
-- - Use BQ Studio's cost preview before each training run.
-- - ML.PREDICT is free (after model is trained).
-- - Remote models (ML.GENERATE_TEXT) bill against your Vertex AI quota,
--   not BQ slots - separate cost track.
