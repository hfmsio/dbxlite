/**
 * Snowflake Engine Detection Patterns
 *
 * Detects SQL patterns that indicate the query is intended for Snowflake.
 *
 * Weights are tuned with care:
 *   - 10 = unambiguous Snowflake-only signal (e.g. @stage, USE WAREHOUSE)
 *   - 9  = strong signal but shared with one or two other dialects
 *   - 7-8 = useful signal but may overlap with DuckDB/Postgres in some forms
 *   - 4-6 = soft signal, only contributes when other signals are present
 *
 * QUALIFY is weight 9 (not 10) because DuckDB also supports it.
 */

import type { EngineDetectorPlugin } from "../queryEngineDetector"

export const snowflakeDetector: EngineDetectorPlugin = {
	engineId: "snowflake",
	patterns: [
		// Stage references (most distinctive Snowflake pattern). Definitive:
		// @stage / @%table syntax and USE WAREHOUSE/ROLE parse on no other engine.
		{ regex: /@[\w]+(?:\/[\w./]+)?/, signal: "@stage reference", weight: 10, definitive: true },
		{ regex: /@%[\w]+/, signal: "@%table stage reference", weight: 10, definitive: true },

		// Snowflake-specific session statements
		{ regex: /\bUSE\s+WAREHOUSE\s+\w+/i, signal: "USE WAREHOUSE statement", weight: 10, definitive: true },
		{ regex: /\bUSE\s+ROLE\s+\w+/i, signal: "USE ROLE statement", weight: 10, definitive: true },
		{ regex: /\bUSE\s+DATABASE\s+\w+/i, signal: "USE DATABASE statement", weight: 8 },
		{ regex: /\bUSE\s+SCHEMA\s+\w+/i, signal: "USE SCHEMA statement", weight: 8 },

		// COPY INTO (Snowflake data loading)
		{ regex: /\bCOPY\s+INTO\s+[@\w.]+\s+FROM\b/i, signal: "COPY INTO ... FROM", weight: 10 },
		{ regex: /\bCOPY\s+INTO\s+\w+\s*\([^)]+\)\s+FROM/i, signal: "COPY INTO with column list", weight: 10 },

		// PUT/GET (Snowflake file transfer)
		{ regex: /\bPUT\s+file:\/\//i, signal: "PUT file command", weight: 10 },
		{ regex: /\bGET\s+@\w+/i, signal: "GET @stage command", weight: 10 },

		// Clone operations
		{
			regex: /\bCREATE\s+(OR\s+REPLACE\s+)?(TRANSIENT\s+)?(TABLE|DATABASE|SCHEMA)\s+[\w.]+\s+CLONE\b/i,
			signal: "CREATE ... CLONE",
			weight: 10,
		},

		// Time travel
		{ regex: /\bAT\s*\(\s*TIMESTAMP\s*=>/i, signal: "AT(TIMESTAMP =>) time travel", weight: 10 },
		{ regex: /\bAT\s*\(\s*OFFSET\s*=>/i, signal: "AT(OFFSET =>) time travel", weight: 10 },
		{ regex: /\bAT\s*\(\s*STATEMENT\s*=>/i, signal: "AT(STATEMENT =>) time travel", weight: 10 },
		{ regex: /\bBEFORE\s*\(\s*STATEMENT\s*=>/i, signal: "BEFORE(STATEMENT =>) time travel", weight: 10 },

		// QUALIFY (also supported by DuckDB → weight 9, not 10)
		{ regex: /\bQUALIFY\s+/i, signal: "QUALIFY clause", weight: 9 },

		// Variant / semi-structured data functions
		{ regex: /\bPARSE_JSON\s*\(/i, signal: "PARSE_JSON function", weight: 9 },
		{ regex: /\bTRY_PARSE_JSON\s*\(/i, signal: "TRY_PARSE_JSON function", weight: 10 },
		{ regex: /\bFLATTEN\s*\(/i, signal: "FLATTEN function", weight: 8 },
		{ regex: /\bLATERAL\s+FLATTEN\s*\(/i, signal: "LATERAL FLATTEN", weight: 10 },
		{ regex: /\bGET_PATH\s*\(/i, signal: "GET_PATH function", weight: 9 },
		{ regex: /\bOBJECT_CONSTRUCT\s*\(/i, signal: "OBJECT_CONSTRUCT function", weight: 9 },
		{ regex: /\bARRAY_CONSTRUCT\s*\(/i, signal: "ARRAY_CONSTRUCT function", weight: 9 },
		{ regex: /\bARRAY_AGG\s*\(/i, signal: "ARRAY_AGG function", weight: 6 },
		{ regex: /\bOBJECT_AGG\s*\(/i, signal: "OBJECT_AGG function", weight: 8 },

		// Variant column access via colon path
		{ regex: /\w+:\w+(?::\w+)*/, signal: "colon path notation (variant access)", weight: 7 },

		// Snowflake-specific casts
		{ regex: /::\s*VARIANT\b/i, signal: "::VARIANT cast", weight: 10 },
		{ regex: /::\s*OBJECT\b/i, signal: "::OBJECT cast", weight: 9 },

		// Snowflake-specific functions
		{ regex: /\bIFF\s*\(/i, signal: "IFF function", weight: 8 },
		{ regex: /\bNULLIFZERO\s*\(/i, signal: "NULLIFZERO function", weight: 10 },
		{ regex: /\bZEROIFNULL\s*\(/i, signal: "ZEROIFNULL function", weight: 10 },
		{ regex: /\bTRY_TO_NUMBER\s*\(/i, signal: "TRY_TO_NUMBER function", weight: 9 },
		{ regex: /\bTRY_TO_DATE\s*\(/i, signal: "TRY_TO_DATE function", weight: 9 },
		{ regex: /\bTRY_TO_TIMESTAMP\s*\(/i, signal: "TRY_TO_TIMESTAMP function", weight: 9 },
		{ regex: /\bTO_VARIANT\s*\(/i, signal: "TO_VARIANT function", weight: 10 },
		{ regex: /\bTO_OBJECT\s*\(/i, signal: "TO_OBJECT function", weight: 9 },
		{ regex: /\bTO_ARRAY\s*\(/i, signal: "TO_ARRAY function", weight: 8 },
		{ regex: /\bSTRTOK\s*\(/i, signal: "STRTOK function", weight: 8 },
		{ regex: /\bSTRTOK_TO_ARRAY\s*\(/i, signal: "STRTOK_TO_ARRAY function", weight: 10 },
		{ regex: /\bCONVERT_TIMEZONE\s*\(/i, signal: "CONVERT_TIMEZONE function", weight: 8 },

		// MATCH_RECOGNIZE
		{ regex: /\bMATCH_RECOGNIZE\s*\(/i, signal: "MATCH_RECOGNIZE clause", weight: 10 },

		// Sampling
		{ regex: /\bSAMPLE\s*\(\s*\d+\s*(ROWS|PERCENT)?\s*\)/i, signal: "SAMPLE clause", weight: 7 },
		{ regex: /\bTABLESAMPLE\s+(SYSTEM|BERNOULLI)\s*\(/i, signal: "TABLESAMPLE SYSTEM/BERNOULLI", weight: 8 },

		// Streams and tasks
		{ regex: /\bCREATE\s+(OR\s+REPLACE\s+)?STREAM\b/i, signal: "CREATE STREAM", weight: 10 },
		{ regex: /\bCREATE\s+(OR\s+REPLACE\s+)?TASK\b/i, signal: "CREATE TASK", weight: 10 },

		// DDL options
		{ regex: /\bTRANSIENT\s+TABLE\b/i, signal: "TRANSIENT TABLE", weight: 9 },
		{ regex: /\bDATA_RETENTION_TIME_IN_DAYS\s*=/i, signal: "DATA_RETENTION_TIME_IN_DAYS", weight: 10 },

		// Three-part name (also legal in SQL Server, hence low weight)
		{ regex: /\b\w+\.\w+\.\w+\b(?!\s*\()/, signal: "database.schema.table pattern", weight: 4 },

		// Double-quoted three-part name — Snowflake's identifier-quoting style
		// (Postgres also allows this, but in dbxlite's universe — DuckDB,
		// BigQuery, Snowflake — only Snowflake uses this form by default).
		{
			regex: /"[^"]+"\."[^"]+"\."[^"]+"/,
			signal: 'double-quoted three-part name',
			weight: 8,
		},

		// Result scanning
		{ regex: /\bRESULT_SCAN\s*\(/i, signal: "RESULT_SCAN function", weight: 10 },

		// UDFs
		{
			regex: /\bLANGUAGE\s+(JAVASCRIPT|PYTHON|JAVA|SCALA)\b/i,
			signal: "LANGUAGE clause for UDF",
			weight: 9,
		},
	],
}
