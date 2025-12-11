/**
 * BigQuery Engine Detection Patterns
 *
 * Detects SQL patterns that indicate the query is intended for BigQuery.
 */

import type { EngineDetectorPlugin } from "../queryEngineDetector";

export const bigqueryDetector: EngineDetectorPlugin = {
	engineId: "bigquery",
	patterns: [
		// Backtick-quoted identifiers (most distinctive BQ pattern)
		{
			regex: /`[\w-]+\.[\w-]+\.[\w-]+`/,
			signal: "backtick project.dataset.table",
			weight: 10,
		},
		{
			regex: /`[\w-]+\.[\w-]+`/,
			signal: "backtick dataset.table",
			weight: 8,
		},

		// Project-qualified names with hyphens (GCP project naming)
		{
			regex: /\b[\w]+-[\w]+-\d+\.[\w-]+\.[\w-]+\b/,
			signal: "project-id.dataset.table pattern",
			weight: 9,
		},

		// BigQuery-specific SAFE_ functions
		{
			regex: /\bSAFE_DIVIDE\s*\(/i,
			signal: "SAFE_DIVIDE function",
			weight: 10,
		},
		{
			regex: /\bSAFE_CAST\s*\(/i,
			signal: "SAFE_CAST function",
			weight: 10,
		},
		{
			regex: /\bSAFE_MULTIPLY\s*\(/i,
			signal: "SAFE_MULTIPLY function",
			weight: 10,
		},
		{
			regex: /\bSAFE_NEGATE\s*\(/i,
			signal: "SAFE_NEGATE function",
			weight: 10,
		},
		{
			regex: /\bSAFE_ADD\s*\(/i,
			signal: "SAFE_ADD function",
			weight: 10,
		},
		{
			regex: /\bSAFE_SUBTRACT\s*\(/i,
			signal: "SAFE_SUBTRACT function",
			weight: 10,
		},

		// BigQuery date/time functions
		{
			regex: /\bPARSE_DATE\s*\(/i,
			signal: "PARSE_DATE function",
			weight: 8,
		},
		{
			regex: /\bFORMAT_DATE\s*\(/i,
			signal: "FORMAT_DATE function",
			weight: 8,
		},
		{
			regex: /\bPARSE_TIMESTAMP\s*\(/i,
			signal: "PARSE_TIMESTAMP function",
			weight: 8,
		},
		{
			regex: /\bFORMAT_TIMESTAMP\s*\(/i,
			signal: "FORMAT_TIMESTAMP function",
			weight: 8,
		},
		{
			regex: /\bDATE_TRUNC\s*\(/i,
			signal: "DATE_TRUNC function",
			weight: 6,
		},

		// BigQuery array/struct generation
		{
			regex: /\bGENERATE_ARRAY\s*\(/i,
			signal: "GENERATE_ARRAY function",
			weight: 9,
		},
		{
			regex: /\bGENERATE_DATE_ARRAY\s*\(/i,
			signal: "GENERATE_DATE_ARRAY function",
			weight: 9,
		},
		{
			regex: /\bGENERATE_TIMESTAMP_ARRAY\s*\(/i,
			signal: "GENERATE_TIMESTAMP_ARRAY function",
			weight: 9,
		},

		// BigQuery type constructors
		{
			regex: /\bSTRUCT\s*</i,
			signal: "STRUCT<> type constructor",
			weight: 8,
		},
		{
			regex: /\bARRAY\s*</i,
			signal: "ARRAY<> type constructor",
			weight: 8,
		},

		// BigQuery-specific clauses
		{
			regex: /\bFOR\s+SYSTEM_TIME\s+AS\s+OF\b/i,
			signal: "FOR SYSTEM_TIME AS OF (time travel)",
			weight: 10,
		},
		{
			regex: /\bPARTITION\s+BY\s+_PARTITIONDATE\b/i,
			signal: "_PARTITIONDATE pseudo-column",
			weight: 10,
		},
		{
			regex: /\b_TABLE_SUFFIX\b/i,
			signal: "_TABLE_SUFFIX wildcard table",
			weight: 10,
		},
		{
			regex: /\b_PARTITIONTIME\b/i,
			signal: "_PARTITIONTIME pseudo-column",
			weight: 10,
		},

		// BigQuery ML
		{
			regex: /\bCREATE\s+(OR\s+REPLACE\s+)?MODEL\b/i,
			signal: "CREATE MODEL (BQML)",
			weight: 10,
		},
		{
			regex: /\bML\.\w+\s*\(/i,
			signal: "ML.* function (BQML)",
			weight: 10,
		},

		// BigQuery scripting
		{
			regex: /\bDECLARE\s+\w+\s+(DEFAULT|INT64|STRING|BOOL)/i,
			signal: "DECLARE with BigQuery types",
			weight: 8,
		},

		// BigQuery geography
		{
			regex: /\bST_\w+\s*\(/i,
			signal: "ST_* geography function",
			weight: 6,
		},

		// BigQuery-specific options
		{
			regex: /\bOPTIONS\s*\(/i,
			signal: "OPTIONS clause",
			weight: 5,
		},
	],
};
