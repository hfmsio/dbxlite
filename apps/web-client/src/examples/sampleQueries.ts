import duckdbTemp from "./queries/duckdb-temp-table.sql?raw";
import duckdbSeries from "./queries/duckdb-generate-series.sql?raw";
import duckdbTutorial from "./queries/duckdb-tutorial.sql?raw";
import duckdbAdvanced from "./queries/duckdb-advanced.sql?raw";
import duckdbExtensions from "./queries/duckdb-extensions.sql?raw";
import duckdbCommunity from "./queries/duckdb-community.sql?raw";
import duckdbDatatypes from "./queries/duckdb-datatypes-test.sql?raw";
import wikiParquet from "./queries/wikipedia-parquet.sql?raw";
import covidCsv from "./queries/covid-csv.sql?raw";
import populationCsv from "./queries/population-csv.sql?raw";
import babyNamesCsv from "./queries/baby-names-csv.sql?raw";
import remoteDatasets from "./queries/remote-datasets.sql?raw";
import advancedAnalytics from "./queries/advanced-analytics.sql?raw";
import bigqueryAdvanced from "./queries/bigquery-advanced.sql?raw";
import bigqueryDatatypes from "./queries/bigquery-datatypes-test.sql?raw";

export interface SampleQuery {
	id: string;
	label: string;
	sql: string;
	hint?: string;
	connector?: "duckdb" | "bigquery";
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
		description: "Simple examples to get started with DuckDB",
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
		description: "Master DuckDB features step by step",
		color: "#3B82F6",
		iconType: "zap",
		examples: [
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
			{
				id: "duckdb-datatypes",
				label: "Data Types Test",
				hint: "All types: integers, floats, intervals, arrays, structs, maps, JSON & more",
				sql: duckdbDatatypes.trim(),
				connector: "duckdb",
			},
		],
	},
	// 4. Real-World Analytics - Advanced analytical queries
	{
		id: "analytics",
		label: "Real-World Analytics",
		description: "Production-ready analytical patterns",
		color: "#14B8A6",
		iconType: "bar-chart",
		examples: [
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
				hint: "Uber's hex geospatial, fuzzy string matching",
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
				id: "bigquery-datatypes",
				label: "Data Types Test",
				hint: "All types: integers, floats, arrays, structs, JSON, geography & more",
				sql: bigqueryDatatypes.trim(),
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
