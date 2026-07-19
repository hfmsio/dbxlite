/**
 * Snowflake dialect additions on top of ANSI SQL.
 *
 * Highlights:
 *   - `QUALIFY` (filter window-function results without a subquery)
 *   - `IFF` (compact CASE for two-branch conditionals)
 *   - `OBJECT_CONSTRUCT`, `PARSE_JSON`, `LATERAL FLATTEN` (VARIANT handling)
 *   - `LISTAGG`, `APPROX_TOP_K`, `APPROX_COUNT_DISTINCT`
 *   - `SNOWFLAKE.CORTEX.*` AI functions
 *   - Time-travel: `AT(TIMESTAMP => ...)`, `BEFORE(TIMESTAMP => ...)`
 */

import type { SQLCompletion } from "../static-completions";
import type { DialectSpec } from "./types";

const KEYWORDS: SQLCompletion[] = [
	{
		label: "QUALIFY",
		kind: 14,
		insertText: "QUALIFY ",
		detail: "Filter on window function (Snowflake)",
		documentation: "Filter rows after a window function, like WHERE for window-function results.",
	},
	{
		label: "LATERAL FLATTEN",
		kind: 14,
		insertText: "LATERAL FLATTEN(input => ${1:variant_column})",
		detail: "Flatten a VARIANT/array (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "SAMPLE",
		kind: 14,
		insertText: "SAMPLE (${1:10}) ",
		detail: "Sample rows (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "TABLESAMPLE",
		kind: 14,
		insertText: "TABLESAMPLE (${1:10}) ",
		detail: "Sample rows (Snowflake, alias for SAMPLE)",
		insertTextRules: 4,
	},
	{
		label: "AT",
		kind: 14,
		insertText: "AT (TIMESTAMP => '${1:2026-01-01 00:00:00}')",
		detail: "Time-travel: query historical state (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "BEFORE",
		kind: 14,
		insertText: "BEFORE (TIMESTAMP => '${1:2026-01-01 00:00:00}')",
		detail: "Time-travel: query state just before timestamp (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "PIVOT",
		kind: 14,
		insertText: "PIVOT (${1:agg_func}(${2:col}) FOR ${3:pivot_col} IN (${4:values}))",
		detail: "Pivot rows to columns (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "UNPIVOT",
		kind: 14,
		insertText: "UNPIVOT (${1:value_col} FOR ${2:name_col} IN (${3:cols}))",
		detail: "Unpivot columns to rows (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "RLIKE",
		kind: 14,
		insertText: "RLIKE ",
		detail: "Regex match (Snowflake)",
	},
];

const FUNCTIONS: SQLCompletion[] = [
	{
		label: "IFF",
		kind: 1,
		insertText: "IFF(${1:condition}, ${2:true_value}, ${3:false_value})",
		detail: "Two-branch conditional (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "TRY_CAST",
		kind: 1,
		insertText: "TRY_CAST(${1:value} AS ${2:type})",
		detail: "Safe cast, returns NULL on failure (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "TRY_PARSE_JSON",
		kind: 1,
		insertText: "TRY_PARSE_JSON(${1:string})",
		detail: "Parse JSON, return NULL on failure (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "PARSE_JSON",
		kind: 1,
		insertText: "PARSE_JSON(${1:string})",
		detail: "Parse JSON string to VARIANT (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "OBJECT_CONSTRUCT",
		kind: 1,
		insertText: "OBJECT_CONSTRUCT('${1:key}', ${2:value})",
		detail: "Build an OBJECT VARIANT (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "OBJECT_KEYS",
		kind: 1,
		insertText: "OBJECT_KEYS(${1:variant})",
		detail: "Return keys of an OBJECT VARIANT (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_CONSTRUCT",
		kind: 1,
		insertText: "ARRAY_CONSTRUCT(${1:value1}, ${2:value2})",
		detail: "Build an ARRAY (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "ARRAY_SIZE",
		kind: 1,
		insertText: "ARRAY_SIZE(${1:array})",
		detail: "Length of an ARRAY (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "LISTAGG",
		kind: 1,
		insertText: "LISTAGG(${1:column}, '${2:,}')",
		detail: "Concatenate values into a delimited string (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "APPROX_TOP_K",
		kind: 1,
		insertText: "APPROX_TOP_K(${1:column}, ${2:k})",
		detail: "Approximate top-K values (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "APPROX_COUNT_DISTINCT",
		kind: 1,
		insertText: "APPROX_COUNT_DISTINCT(${1:column})",
		detail: "HyperLogLog distinct count (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "MEDIAN",
		kind: 1,
		insertText: "MEDIAN(${1:column})",
		detail: "Median value (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "MODE",
		kind: 1,
		insertText: "MODE(${1:column})",
		detail: "Most frequent value (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "REGEXP_LIKE",
		kind: 1,
		insertText: "REGEXP_LIKE(${1:string}, '${2:pattern}')",
		detail: "Regex match (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "REGEXP_SUBSTR",
		kind: 1,
		insertText: "REGEXP_SUBSTR(${1:string}, '${2:pattern}')",
		detail: "Extract regex match (Snowflake)",
		insertTextRules: 4,
	},
	{
		label: "SNOWFLAKE.CORTEX.COMPLETE",
		kind: 1,
		insertText: "SNOWFLAKE.CORTEX.COMPLETE('${1:llama3.1-70b}', '${2:prompt}')",
		detail: "LLM completion (Snowflake Cortex)",
		insertTextRules: 4,
	},
	{
		label: "SNOWFLAKE.CORTEX.SENTIMENT",
		kind: 1,
		insertText: "SNOWFLAKE.CORTEX.SENTIMENT(${1:text_column})",
		detail: "Sentiment analysis (Snowflake Cortex)",
		insertTextRules: 4,
	},
	{
		label: "SNOWFLAKE.CORTEX.SUMMARIZE",
		kind: 1,
		insertText: "SNOWFLAKE.CORTEX.SUMMARIZE(${1:text_column})",
		detail: "Text summarization (Snowflake Cortex)",
		insertTextRules: 4,
	},
	{
		label: "SNOWFLAKE.CORTEX.TRANSLATE",
		kind: 1,
		insertText: "SNOWFLAKE.CORTEX.TRANSLATE(${1:text}, '${2:en}', '${3:fr}')",
		detail: "Translate text (Snowflake Cortex)",
		insertTextRules: 4,
	},
];

export const SNOWFLAKE_DIALECT: DialectSpec = {
	keywords: KEYWORDS,
	functions: FUNCTIONS,
};
