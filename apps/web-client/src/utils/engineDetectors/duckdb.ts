/**
 * DuckDB Engine Detection Patterns
 *
 * Detects SQL patterns that indicate the query is intended for DuckDB.
 */

import type { EngineDetectorPlugin } from "../queryEngineDetector";

export const duckdbDetector: EngineDetectorPlugin = {
	engineId: "duckdb",
	patterns: [
		// File readers - highest confidence
		{
			regex: /\bread_csv\s*\(/i,
			signal: "read_csv() function",
			weight: 10,
		},
		{
			regex: /\bread_parquet\s*\(/i,
			signal: "read_parquet() function",
			weight: 10,
		},
		{
			regex: /\bread_json\s*\(/i,
			signal: "read_json() function",
			weight: 10,
		},
		{
			regex: /\bread_json_auto\s*\(/i,
			signal: "read_json_auto() function",
			weight: 10,
		},
		{
			regex: /\bread_csv_auto\s*\(/i,
			signal: "read_csv_auto() function",
			weight: 10,
		},

		// File path patterns in FROM clause
		{
			regex: /FROM\s+['"][\w./\\-]+\.(csv|parquet|json|jsonl|tsv)['"]/i,
			signal: "file path reference",
			weight: 10,
		},
		{
			regex: /FROM\s+['"]s3:\/\//i,
			signal: "S3 path reference",
			weight: 9,
		},
		{
			regex: /FROM\s+['"]https?:\/\//i,
			signal: "HTTP URL reference",
			weight: 8,
		},

		// DuckDB-specific statements
		{
			regex: /\bATTACH\s+['"]/i,
			signal: "ATTACH statement",
			weight: 10,
		},
		{
			regex: /\bDETACH\s+/i,
			signal: "DETACH statement",
			weight: 10,
		},
		{
			regex: /\bUSE\s+\w+\s*;/i,
			signal: "USE statement",
			weight: 8,
		},
		{
			regex: /\bCOPY\s+.+\s+TO\s+['"]/i,
			signal: "COPY TO statement",
			weight: 9,
		},

		// Column modifiers (DuckDB-specific syntax)
		{
			regex: /\bEXCLUDE\s*\(/i,
			signal: "EXCLUDE column modifier",
			weight: 9,
		},
		{
			regex: /\bREPLACE\s*\(/i,
			signal: "REPLACE column modifier",
			weight: 7,
		},
		{
			regex: /\bCOLUMNS\s*\(/i,
			signal: "COLUMNS() expression",
			weight: 9,
		},

		// DuckDB-specific functions
		{
			regex: /\blist_\w+\s*\(/i,
			signal: "list_* function",
			weight: 8,
		},
		{
			regex: /\bmap_\w+\s*\(/i,
			signal: "map_* function",
			weight: 7,
		},
		{
			regex: /\bstruct_\w+\s*\(/i,
			signal: "struct_* function",
			weight: 7,
		},
		{
			regex: /\brange\s*\(/i,
			signal: "range() function",
			weight: 5,
		},
		{
			regex: /\bunnest\s*\(\s*\[/i,
			signal: "unnest with array literal",
			weight: 6,
		},

		// Glob patterns
		{
			regex: /FROM\s+['"][^'"]*\*[^'"]*['"]/i,
			signal: "glob pattern in FROM",
			weight: 9,
		},

		// DuckDB extensions
		{
			regex: /\bINSTALL\s+\w+/i,
			signal: "INSTALL extension",
			weight: 10,
		},
		{
			regex: /\bLOAD\s+\w+/i,
			signal: "LOAD extension",
			weight: 8,
		},

		// DuckDB MACROs (user-defined functions)
		{
			regex: /\bCREATE\s+(OR\s+REPLACE\s+)?MACRO\b/i,
			signal: "CREATE MACRO statement",
			weight: 10,
		},

		// DuckDB QUALIFY clause
		{
			regex: /\bQUALIFY\b/i,
			signal: "QUALIFY clause",
			weight: 8,
		},

		// DuckDB PIVOT/UNPIVOT
		{
			regex: /\bPIVOT\s+\w+\s+ON\b/i,
			signal: "PIVOT statement",
			weight: 9,
		},
		{
			regex: /\bUNPIVOT\s+\w+\s+ON\b/i,
			signal: "UNPIVOT statement",
			weight: 9,
		},

		// DuckDB ASOF JOIN
		{
			regex: /\bASOF\s+JOIN\b/i,
			signal: "ASOF JOIN",
			weight: 10,
		},

		// DuckDB generate_series
		{
			regex: /\bgenerate_series\s*\(/i,
			signal: "generate_series() function",
			weight: 8,
		},

		// DuckDB TRY_CAST (different from BigQuery SAFE_CAST)
		{
			regex: /\bTRY_CAST\s*\(/i,
			signal: "TRY_CAST function",
			weight: 8,
		},
	],
};
