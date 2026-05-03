import duckdbTemp from "./queries/duckdb-temp-table.sql?raw";
import duckdbSeries from "./queries/duckdb-generate-series.sql?raw";
import duckdbAggregations from "./queries/duckdb-aggregations.sql?raw";
import duckdbJoins from "./queries/duckdb-joins.sql?raw";
import duckdbWindowBasics from "./queries/duckdb-window-basics.sql?raw";
import duckdbJsonNested from "./queries/duckdb-json-nested.sql?raw";
import duckdbTutorial from "./queries/duckdb-tutorial.sql?raw";
import duckdbAdvanced from "./queries/duckdb-advanced.sql?raw";
import duckdbExtensions from "./queries/duckdb-extensions.sql?raw";
import duckdbCommunity from "./queries/duckdb-community.sql?raw";
import cohortAnalysis from "./queries/cohort-analysis.sql?raw";
import rfmSegmentation from "./queries/rfm-segmentation.sql?raw";
import duckdbIcebergDelta from "./queries/duckdb-iceberg-delta.sql?raw";
import duckdbFederation from "./queries/duckdb-federation.sql?raw";
import bigqueryMl from "./queries/bigquery-ml.sql?raw";
import snowflakeCortex from "./queries/snowflake-cortex.sql?raw";
// duckdb-datatypes-test.sql, bigquery-datatypes-test.sql, and
// snowflake-datatypes-test.sql are kept on disk as internal grid-render
// regression checks but no longer surfaced in the user-facing Examples
// grid — they're diagnostic dumps, not learning material.
import wikiParquet from "./queries/wikipedia-parquet.sql?raw";
import covidCsv from "./queries/covid-csv.sql?raw";
import populationCsv from "./queries/population-csv.sql?raw";
import babyNamesCsv from "./queries/baby-names-csv.sql?raw";
import remoteDatasets from "./queries/remote-datasets.sql?raw";
import advancedAnalytics from "./queries/advanced-analytics.sql?raw";
import bigqueryAdvanced from "./queries/bigquery-advanced.sql?raw";
import snowflakeTpchSummary from "./queries/snowflake-tpch-summary.sql?raw";
import snowflakeSemiStructured from "./queries/snowflake-semi-structured.sql?raw";
import snowflakeWindowFunctions from "./queries/snowflake-window-functions.sql?raw";
import snowflakeTimeTravel from "./queries/snowflake-time-travel.sql?raw";

export interface SampleQuery {
	id: string;
	label: string;
	sql: string;
	hint?: string;
	connector?: "duckdb" | "bigquery" | "snowflake";
}

export interface ExampleGroup {
	id: string;
	label: string;
	description?: string;
	examples: SampleQuery[];
	defaultExpanded?: boolean;
	color: string;
	iconType: "graduation" | "zap" | "globe" | "cloud" | "package" | "bar-chart";
}

export const exampleGroups: ExampleGroup[] = [
	// 1. Getting Started - Simple DuckDB intro (beginner friendly)
	{
		id: "getting-started",
		label: "Getting Started",
		description: "Temp tables, CTEs, basic SELECT and aggregation.",
		defaultExpanded: true,
		color: "#10B981",
		iconType: "graduation",
		examples: [
			{
				id: "duckdb-temp",
				label: "Create a Temp Table",
				hint: "Create a temp table and summarize totals",
				sql: duckdbTemp.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-series",
				label: "Generate Series",
				hint: "Use generate_series() to create data",
				sql: duckdbSeries.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-aggregations",
				label: "Aggregations",
				hint: "GROUP BY, COUNT, SUM, AVG, ROLLUP, FILTER — the basics every analyst uses daily",
				sql: duckdbAggregations.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-joins",
				label: "Joins",
				hint: "INNER, LEFT, FULL OUTER. Why each one drops or keeps non-matching rows",
				sql: duckdbJoins.trim(),
				connector: "duckdb",
			},
		],
	},
	// 2. Remote Data - Query remote files (shows DuckDB's httpfs power)
	{
		id: "remote-data",
		label: "Remote Data",
		description: "Query remote CSV and Parquet files via HTTP",
		color: "#8B5CF6",
		iconType: "globe",
		examples: [
			{
				id: "remote-datasets",
				label: "Diamonds, Titanic, Gapminder",
				hint: "3 classic datasets: analytics, survival, world development",
				sql: remoteDatasets.trim(),
				connector: "duckdb",
			},
			{
				id: "wikipedia",
				label: "Wikipedia Pageviews (Parquet)",
				hint: "Hugging Face dataset via DuckDB httpfs",
				sql: wikiParquet.trim(),
				connector: "duckdb",
			},
			{
				id: "covid",
				label: "COVID-19 Global Stats (CSV)",
				hint: "Our World in Data via DuckDB httpfs",
				sql: covidCsv.trim(),
				connector: "duckdb",
			},
			{
				id: "population",
				label: "World Population (CSV)",
				hint: "Historical data via DuckDB httpfs",
				sql: populationCsv.trim(),
				connector: "duckdb",
			},
			{
				id: "baby-names",
				label: "US Baby Names (CSV)",
				hint: "SSA data since 1880 via DuckDB httpfs",
				sql: babyNamesCsv.trim(),
				connector: "duckdb",
			},
		],
	},
	// 3. Learn DuckDB - Feature tutorials (intermediate)
	{
		id: "learn-duckdb",
		label: "Learn DuckDB",
		description: "Window functions, nested JSON, QUALIFY, ASOF joins, recursive CTEs.",
		color: "#3B82F6",
		iconType: "zap",
		examples: [
			{
				id: "duckdb-window-basics",
				label: "Window Functions",
				hint: "RANK, LAG, running totals, moving averages, QUALIFY",
				sql: duckdbWindowBasics.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-json-nested",
				label: "Nested JSON",
				hint: "->, ->>, json_extract, UNNEST — extract from nested objects and arrays",
				sql: duckdbJsonNested.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-feature-tour",
				label: "Feature Tour",
				hint: "150+ lines: CTEs, window functions, JSON, pivots & more",
				sql: duckdbTutorial.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-advanced",
				label: "Advanced Functions",
				hint: "500+ lines: QUALIFY, ASOF joins, recursive CTEs, COLUMNS expr & more",
				sql: duckdbAdvanced.trim(),
				connector: "duckdb",
			},
		],
	},
	// 4. Real-World Analytics - Advanced analytical queries
	{
		id: "analytics",
		label: "Real-World Analytics",
		description: "Cohorts, funnels, percentiles, time-series and other analytical patterns.",
		color: "#14B8A6",
		iconType: "bar-chart",
		examples: [
			{
				id: "cohort-analysis",
				label: "Cohort Retention",
				hint: "Group users by signup month, track who came back. Standard SaaS pattern",
				sql: cohortAnalysis.trim(),
				connector: "duckdb",
			},
			{
				id: "rfm-segmentation",
				label: "RFM Customer Segmentation",
				hint: "Recency / Frequency / Monetary scoring with NTILE — champions vs at-risk",
				sql: rfmSegmentation.trim(),
				connector: "duckdb",
			},
			{
				id: "advanced-analytics",
				label: "World Development Dashboard",
				hint: "150+ lines: Multi-level CTEs, LAG, RANK, PERCENTILE, YoY analysis",
				sql: advancedAnalytics.trim(),
				connector: "duckdb",
			},
		],
	},
	// 5. Extensions - Core + community packages
	{
		id: "extensions",
		label: "Extensions",
		description: "Core extensions + community packages",
		color: "#EC4899",
		iconType: "package",
		examples: [
			{
				id: "core-extensions",
				label: "Core: TPC-H, FTS, Spatial, JSON",
				hint: "Generate data, search text, GIS queries & more",
				sql: duckdbExtensions.trim(),
				connector: "duckdb",
			},
			{
				id: "community-extensions",
				label: "Community: H3 & Rapidfuzz",
				hint: "Uber's hex geospatial, fuzzy string matching (Server mode only — most community extensions don't have WASM builds)",
				sql: duckdbCommunity.trim(),
				connector: "duckdb",
			},
		],
	},
	// 6. BigQuery - Cloud data warehouse
	{
		id: "bigquery",
		label: "BigQuery",
		description: "Query Google BigQuery (requires auth)",
		color: "#F59E0B",
		iconType: "cloud",
		examples: [
			{
				id: "bigquery-advanced",
				label: "Advanced Functions",
				hint: "600+ lines: Arrays, STRUCTs, window functions, JSON, geography & more",
				sql: bigqueryAdvanced.trim(),
				connector: "bigquery",
			},
			{
				id: "bigquery-github",
				label: "GitHub Archive",
				hint: "GitHub events from bigquery-public-data",
				sql: `-- Query GitHub public dataset
SELECT
  type,
  COUNT(*) as event_count
FROM \`githubarchive.day.20231201\`
GROUP BY type
ORDER BY event_count DESC
LIMIT 10;`,
				connector: "bigquery",
			},
			{
				id: "bigquery-stackoverflow",
				label: "Stack Overflow",
				hint: "Top Python questions by views",
				sql: `-- Top Stack Overflow questions
SELECT
  tags,
  title,
  view_count,
  answer_count
FROM \`bigquery-public-data.stackoverflow.posts_questions\`
WHERE tags LIKE '%python%'
ORDER BY view_count DESC
LIMIT 20;`,
				connector: "bigquery",
			},
			{
				id: "bigquery-taxi",
				label: "NYC Taxi Trips",
				hint: "Yellow taxi trip analysis",
				sql: `-- NYC Yellow Taxi trips
SELECT
  EXTRACT(HOUR FROM pickup_datetime) as hour,
  COUNT(*) as trips,
  ROUND(AVG(trip_distance), 2) as avg_distance,
  ROUND(AVG(total_amount), 2) as avg_fare
FROM \`bigquery-public-data.new_york_taxi_trips.tlc_yellow_trips_2022\`
WHERE pickup_datetime BETWEEN '2022-01-01' AND '2022-01-07'
GROUP BY hour
ORDER BY hour;`,
				connector: "bigquery",
			},
			{
				id: "bigquery-ml",
				label: "BQ ML — Train & Predict",
				hint: "CREATE MODEL with logistic regression, k-means, ARIMA forecast, ML.GENERATE_TEXT",
				sql: bigqueryMl.trim(),
				connector: "bigquery",
			},
		],
	},
	// 7. Snowflake — Cloud data warehouse
	{
		id: "snowflake",
		label: "Snowflake",
		description: "Query Snowflake (requires auth)",
		color: "#29B5E8",
		iconType: "cloud",
		examples: [
			{
				id: "snowflake-tpch-summary",
				label: "TPC-H Sample — Orders by Segment",
				hint: "Aggregate orders/revenue per segment using SNOWFLAKE_SAMPLE_DATA",
				sql: snowflakeTpchSummary.trim(),
				connector: "snowflake",
			},
			{
				id: "snowflake-semi-structured",
				label: "VARIANT / OBJECT / ARRAY",
				hint: "PARSE_JSON, colon-path access, LATERAL FLATTEN — no external data needed",
				sql: snowflakeSemiStructured.trim(),
				connector: "snowflake",
			},
			{
				id: "snowflake-window-functions",
				label: "Window + QUALIFY",
				hint: "Top customers per segment using QUALIFY (Snowflake-distinctive)",
				sql: snowflakeWindowFunctions.trim(),
				connector: "snowflake",
			},
			{
				id: "snowflake-time-travel",
				label: "Time Travel",
				hint: "AT(OFFSET =>) and AT(TIMESTAMP =>) — query past states",
				sql: snowflakeTimeTravel.trim(),
				connector: "snowflake",
			},
			{
				id: "snowflake-cortex",
				label: "Cortex AI Functions",
				hint: "COMPLETE, SENTIMENT, SUMMARIZE, TRANSLATE, CLASSIFY_TEXT, EMBED — LLMs in SQL on your warehouse",
				sql: snowflakeCortex.trim(),
				connector: "snowflake",
			},
		],
	},
	// 8. Lakehouse & Federation - DuckDB cross-source patterns
	{
		id: "lakehouse",
		label: "Lakehouse & Federation",
		description: "Iceberg, Delta, and joining across sources in DuckDB",
		color: "#06B6D4",
		iconType: "package",
		examples: [
			{
				id: "duckdb-iceberg-delta",
				label: "Iceberg & Delta Lake",
				hint: "Read open-table formats from S3 / local disk; snapshot time-travel. Iceberg works in WASM 1.31+; Delta is Server mode only",
				sql: duckdbIcebergDelta.trim(),
				connector: "duckdb",
			},
			{
				id: "duckdb-federation",
				label: "Cross-source Federation",
				hint: "Join CSV + Parquet + ATTACHed DuckDB DBs (WASM ✓). Postgres / SQLite / MySQL scanners require Server mode (no TCP in browsers)",
				sql: duckdbFederation.trim(),
				connector: "duckdb",
			},
		],
	},
];

// Flat list for backward compatibility
export const sampleQueries: SampleQuery[] = exampleGroups.flatMap(g => g.examples);

/**
 * Get example by URL-friendly ID
 */
export function getExampleById(id: string): SampleQuery | undefined {
	for (const group of exampleGroups) {
		const example = group.examples.find(ex => ex.id === id);
		if (example) return example;
	}
	return undefined;
}
