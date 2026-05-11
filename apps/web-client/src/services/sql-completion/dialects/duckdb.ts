/**
 * DuckDB dialect additions on top of ANSI SQL.
 *
 * Sources:
 *   - DuckDB docs: https://duckdb.org/docs/sql/introduction
 *   - File-reading functions: `read_parquet`, `read_csv`, `read_json`
 *   - Struct / list / map helpers: `struct_pack`, `list_agg`, `unnest`
 *   - The `summarize` keyword (DuckDB-specific shortcut)
 *
 * Keep entries terse but useful: `detail` should help the user
 * disambiguate at-a-glance. Don't duplicate ANSI entries.
 */

import type { SQLCompletion } from "../static-completions";
import type { DialectSpec } from "./types";

const KEYWORDS: SQLCompletion[] = [
	{
		label: "QUALIFY",
		kind: 14,
		insertText: "QUALIFY ",
		detail: "Filter on window function (DuckDB)",
		documentation: "Filter rows by window-function result, like WHERE for window functions.",
	},
	{
		label: "USING SAMPLE",
		kind: 14,
		insertText: "USING SAMPLE ",
		detail: "Sample rows (DuckDB)",
		documentation: "Sample a subset of rows: `USING SAMPLE 10%` or `USING SAMPLE 1000 ROWS`.",
	},
	{
		label: "SUMMARIZE",
		kind: 14,
		insertText: "SUMMARIZE ",
		detail: "Quick column summary (DuckDB)",
		documentation: "Prefix any query/table to get min/max/avg/null-count per column.",
	},
	{
		label: "PIVOT",
		kind: 14,
		insertText: "PIVOT ",
		detail: "Pivot rows to columns (DuckDB)",
	},
	{
		label: "UNPIVOT",
		kind: 14,
		insertText: "UNPIVOT ",
		detail: "Unpivot columns to rows (DuckDB)",
	},
	{
		label: "ATTACH",
		kind: 14,
		insertText: "ATTACH '${1:db.duckdb}' AS ${2:db}",
		detail: "Attach a database (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "DETACH",
		kind: 14,
		insertText: "DETACH ${1:db}",
		detail: "Detach a database (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "INSTALL",
		kind: 14,
		insertText: "INSTALL ${1:extension}",
		detail: "Install a DuckDB extension",
		insertTextRules: 4,
	},
	{
		label: "LOAD",
		kind: 14,
		insertText: "LOAD ${1:extension}",
		detail: "Load a DuckDB extension",
		insertTextRules: 4,
	},
];

const FUNCTIONS: SQLCompletion[] = [
	{
		label: "READ_PARQUET",
		kind: 1,
		insertText: "READ_PARQUET('${1:path/to/file.parquet}')",
		detail: "Read Parquet file (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "READ_CSV",
		kind: 1,
		insertText: "READ_CSV('${1:path/to/file.csv}')",
		detail: "Read CSV file with auto-detect (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "READ_CSV_AUTO",
		kind: 1,
		insertText: "READ_CSV_AUTO('${1:path/to/file.csv}')",
		detail: "Read CSV with auto-detected schema (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "READ_JSON",
		kind: 1,
		insertText: "READ_JSON('${1:path/to/file.json}')",
		detail: "Read JSON file (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "READ_JSON_AUTO",
		kind: 1,
		insertText: "READ_JSON_AUTO('${1:path/to/file.json}')",
		detail: "Read JSON with auto-detected schema (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "GLOB",
		kind: 1,
		insertText: "GLOB('${1:path/*.parquet}')",
		detail: "Glob filesystem paths (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "STRUCT_PACK",
		kind: 1,
		insertText: "STRUCT_PACK(${1:field1} := ${2:value1})",
		detail: "Build a struct (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "LIST_AGG",
		kind: 1,
		insertText: "LIST_AGG(${1:column}, '${2:,}')",
		detail: "Concatenate values into a list (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "UNNEST",
		kind: 1,
		insertText: "UNNEST(${1:list_column})",
		detail: "Flatten a list/array into rows (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "GENERATE_SERIES",
		kind: 1,
		insertText: "GENERATE_SERIES(${1:start}, ${2:stop}, ${3:step})",
		detail: "Generate a numeric series (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "REGEXP_MATCHES",
		kind: 1,
		insertText: "REGEXP_MATCHES(${1:string}, '${2:pattern}')",
		detail: "Test regex match (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "STRING_SPLIT",
		kind: 1,
		insertText: "STRING_SPLIT(${1:string}, '${2:delimiter}')",
		detail: "Split a string into a list (DuckDB)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_AGG",
		kind: 1,
		insertText: "ARRAY_AGG(${1:column})",
		detail: "Aggregate values into an array (DuckDB)",
		insertTextRules: 4,
	},
];

export const DUCKDB_DIALECT: DialectSpec = {
	keywords: KEYWORDS,
	functions: FUNCTIONS,
};
