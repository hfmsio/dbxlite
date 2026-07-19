/**
 * BigQuery dialect additions on top of ANSI SQL.
 *
 * Highlights:
 *   - `STRUCT<...>` / `ARRAY<...>` type literals
 *   - `UNNEST WITH OFFSET`
 *   - `EXCEPT (col1, col2)` to exclude columns from SELECT *
 *   - `_TABLE_SUFFIX` wildcard for table sharding
 *   - `SAFE.foo()` / `SAFE_CAST` / `SAFE_DIVIDE` null-on-failure variants
 *   - `FORMAT_DATE` / `GENERATE_DATE_ARRAY` / `TIMESTAMP_ADD` / `JSON_QUERY`
 */

import type { SQLCompletion } from "../static-completions";
import type { DialectSpec } from "./types";

const KEYWORDS: SQLCompletion[] = [
	{
		label: "EXCEPT",
		kind: 14,
		insertText: "EXCEPT (${1:col_to_exclude})",
		detail: "Exclude columns from SELECT * (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "REPLACE",
		kind: 14,
		insertText: "REPLACE (${1:expr} AS ${2:col})",
		detail: "Replace columns in SELECT * (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "QUALIFY",
		kind: 14,
		insertText: "QUALIFY ",
		detail: "Filter on window function (BigQuery)",
	},
	{
		label: "UNNEST",
		kind: 14,
		insertText: "UNNEST(${1:array_column})",
		detail: "Flatten an ARRAY into rows (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "WITH OFFSET",
		kind: 14,
		insertText: "WITH OFFSET AS ${1:idx}",
		detail: "Capture position when UNNESTing (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "PIVOT",
		kind: 14,
		insertText: "PIVOT (${1:agg}(${2:col}) FOR ${3:pivot_col} IN (${4:values}))",
		detail: "Pivot rows to columns (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "UNPIVOT",
		kind: 14,
		insertText: "UNPIVOT (${1:value_col} FOR ${2:name_col} IN (${3:cols}))",
		detail: "Unpivot columns to rows (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "TABLESAMPLE",
		kind: 14,
		insertText: "TABLESAMPLE SYSTEM (${1:10} PERCENT)",
		detail: "Sample rows (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "_TABLE_SUFFIX",
		kind: 14,
		insertText: "_TABLE_SUFFIX",
		detail: "Wildcard-table partition pseudo-column (BigQuery)",
	},
];

const FUNCTIONS: SQLCompletion[] = [
	{
		label: "SAFE_CAST",
		kind: 1,
		insertText: "SAFE_CAST(${1:value} AS ${2:type})",
		detail: "Cast, NULL on failure (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "SAFE_DIVIDE",
		kind: 1,
		insertText: "SAFE_DIVIDE(${1:numerator}, ${2:denominator})",
		detail: "Divide, NULL on divide-by-zero (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "IF",
		kind: 1,
		insertText: "IF(${1:condition}, ${2:true_value}, ${3:false_value})",
		detail: "Two-branch conditional (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "IFNULL",
		kind: 1,
		insertText: "IFNULL(${1:value}, ${2:default})",
		detail: "Replace NULL with default (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_AGG",
		kind: 1,
		insertText: "ARRAY_AGG(${1:column})",
		detail: "Aggregate to an ARRAY (BigQuery; supports ORDER BY, LIMIT)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_TO_STRING",
		kind: 1,
		insertText: "ARRAY_TO_STRING(${1:array}, '${2:,}')",
		detail: "Join array elements with delimiter (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_LENGTH",
		kind: 1,
		insertText: "ARRAY_LENGTH(${1:array})",
		detail: "Length of an ARRAY (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "STRUCT",
		kind: 1,
		insertText: "STRUCT(${1:value} AS ${2:field})",
		detail: "Build a STRUCT with named fields (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "GENERATE_ARRAY",
		kind: 1,
		insertText: "GENERATE_ARRAY(${1:start}, ${2:end})",
		detail: "Generate a numeric array (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "GENERATE_DATE_ARRAY",
		kind: 1,
		insertText: "GENERATE_DATE_ARRAY('${1:2026-01-01}', '${2:2026-12-31}')",
		detail: "Generate date array (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "GENERATE_TIMESTAMP_ARRAY",
		kind: 1,
		insertText: "GENERATE_TIMESTAMP_ARRAY('${1:2026-01-01}', '${2:2026-12-31}', INTERVAL ${3:1} DAY)",
		detail: "Generate timestamp array (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "FORMAT_DATE",
		kind: 1,
		insertText: "FORMAT_DATE('${1:%Y-%m-%d}', ${2:date_column})",
		detail: "Format date with strftime pattern (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "FORMAT_TIMESTAMP",
		kind: 1,
		insertText: "FORMAT_TIMESTAMP('${1:%Y-%m-%d %H:%M:%S}', ${2:ts_column})",
		detail: "Format timestamp (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "PARSE_DATE",
		kind: 1,
		insertText: "PARSE_DATE('${1:%Y-%m-%d}', ${2:string})",
		detail: "Parse a date string (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "PARSE_TIMESTAMP",
		kind: 1,
		insertText: "PARSE_TIMESTAMP('${1:%Y-%m-%d %H:%M:%S}', ${2:string})",
		detail: "Parse a timestamp string (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "TIMESTAMP_ADD",
		kind: 1,
		insertText: "TIMESTAMP_ADD(${1:ts}, INTERVAL ${2:1} ${3:HOUR})",
		detail: "Add interval to timestamp (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "TIMESTAMP_DIFF",
		kind: 1,
		insertText: "TIMESTAMP_DIFF(${1:ts1}, ${2:ts2}, ${3:HOUR})",
		detail: "Difference between two timestamps (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "DATE_TRUNC",
		kind: 1,
		insertText: "DATE_TRUNC(${1:date}, ${2:WEEK})",
		detail: "Truncate to granularity (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "JSON_QUERY",
		kind: 1,
		insertText: "JSON_QUERY(${1:json}, '${2:$.path}')",
		detail: "Extract JSON value (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "JSON_VALUE",
		kind: 1,
		insertText: "JSON_VALUE(${1:json}, '${2:$.path}')",
		detail: "Extract scalar JSON value (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "REGEXP_CONTAINS",
		kind: 1,
		insertText: "REGEXP_CONTAINS(${1:string}, r'${2:pattern}')",
		detail: "Regex match (BigQuery)",
		insertTextRules: 4,
	},
	{
		label: "REGEXP_EXTRACT",
		kind: 1,
		insertText: "REGEXP_EXTRACT(${1:string}, r'${2:pattern}')",
		detail: "Extract first regex match (BigQuery)",
		insertTextRules: 4,
	},
];

export const BIGQUERY_DIALECT: DialectSpec = {
	keywords: KEYWORDS,
	functions: FUNCTIONS,
};
