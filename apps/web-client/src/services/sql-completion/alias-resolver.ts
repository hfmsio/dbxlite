/**
 * Resolve table aliases from a SQL query.
 *
 * Verbatim move from `lib/sqlCompletions.ts`. Phase 1 preserves the
 * existing regex-based implementation. Phase 3b will use the resolved
 * alias map to filter column suggestions to FROM-clause-scoped tables.
 */

/**
 * Table alias mapping from SQL query.
 */
export interface TableAlias {
	alias: string;
	tableName: string;
	databaseName?: string;
	schemaName?: string;
	/** True if this alias references a CTE (no schema available). */
	isCTE?: boolean;
}

/**
 * Parse table aliases from a SQL query.
 *
 * Matches patterns:
 *   - `FROM table AS alias`
 *   - `FROM table alias`
 *   - `FROM db.table AS alias`
 *   - `FROM db.schema.table alias`
 *   - `JOIN table AS alias ON ...`
 *   - `, table AS alias` (comma-separated in FROM clause)
 *
 * @param sql       The SQL query to parse.
 * @param cteNames  Optional set of CTE names; aliases pointing at a CTE
 *                  get `isCTE: true` so callers can avoid trying to
 *                  resolve columns for them.
 */
export function parseTableAliases(
	sql: string,
	cteNames?: Set<string>,
): TableAlias[] {
	const aliases: TableAlias[] = [];

	// Pattern to match table references with optional aliases.
	// Matches: FROM/JOIN/comma [db.][schema.]table [AS] alias
	// Three forms of table reference are recognised:
	//   1. Backtick-quoted (BigQuery): `project.dataset.table`
	//   2. Single-quoted file paths (DuckDB): 'data/foo-bar.parquet'
	//      — these can contain hyphens, slashes, and dots in the
	//      extension, none of which the bare-identifier form accepts.
	//   3. Bare identifiers with optional dot-qualification: db.schema.table
	// The alias group carries a negative lookahead for reserved keywords. The
	// `,\s*` branch also fires on projection-list commas, so `SELECT a, b FROM`
	// matches `, b` — without the lookahead the alias group would swallow the
	// following `FROM` (recording a phantom `{tableName: b, alias: FROM}` AND
	// consuming the FROM so the real `FROM orders o` never matches). Refusing a
	// keyword in the alias slot both drops the phantom and leaves the clause
	// boundary intact for the next iteration.
	const tableRefPattern =
		/(?:\b(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN)\s+|,\s*)(`[^`]+`|'[^']+'|[\w.]+)(?:\s+(?:AS\s+)?(?!(?:FROM|SELECT|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|ON|USING|AND|OR|ORDER|GROUP|BY|HAVING|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT|INTO|VALUES)\b)(\w+))?/gi;

	let match: RegExpExecArray | null;

	while ((match = tableRefPattern.exec(sql)) !== null) {
		const fullTableRef = match[1];
		const alias = match[2];

		// Skip if no alias provided
		if (!alias) continue;

		// Skip SQL keywords that might match as aliases. The `,\s*` branch of
		// the pattern also fires on projection-list commas, so a query like
		// `SELECT a, b FROM orders o` matches `, b FROM` and would otherwise
		// record `{tableName: "b", alias: "FROM"}`. FROM/SELECT and the other
		// clause starters below are reserved words that can never be a real
		// unquoted alias, so excluding them only removes false positives.
		const upperAlias = alias.toUpperCase();
		if (
			[
				"SELECT",
				"FROM",
				"WHERE",
				"JOIN",
				"INNER",
				"LEFT",
				"RIGHT",
				"FULL",
				"CROSS",
				"ON",
				"USING",
				"AND",
				"OR",
				"ORDER",
				"GROUP",
				"HAVING",
				"LIMIT",
				"OFFSET",
				"UNION",
				"EXCEPT",
				"INTERSECT",
				"INTO",
				"VALUES",
			].includes(upperAlias)
		) {
			continue;
		}

		// Parse the table reference.
		//
		// Three categories that should NOT be split on dots:
		//   1. Single-quoted refs ('foo-bar.parquet') — opaque file paths.
		//   2. Backtick-quoted refs are split (BigQuery `project.dataset.table`).
		//   3. Bare identifiers ending in a known file extension (xx112.parquet,
		//      data.csv): the trailing dot belongs to the extension, not to a
		//      qualifier. dbxlite's schema stores these under the full filename
		//      (e.g. `xx112.parquet`), so splitting produces a `db.table` shape
		//      that no schema entry matches.
		const FILE_EXTENSION =
			/\.(parquet|csv|tsv|json|jsonl|ndjson|xlsx|xls|arrow|feather)$/i;
		const isFilePath =
			fullTableRef.startsWith("'") ||
			(!fullTableRef.startsWith("`") && FILE_EXTENSION.test(fullTableRef));
		const cleanRef = fullTableRef.replace(/[`']/g, "");
		const parts = isFilePath ? [cleanRef] : cleanRef.split(".");

		const tableName = parts[parts.length - 1];
		const result: TableAlias = {
			alias,
			tableName,
			// Mark as CTE if the table name matches a CTE definition
			isCTE: cteNames?.has(tableName) ?? false,
		};

		if (parts.length === 2) {
			// db.table or schema.table
			result.databaseName = parts[0];
		} else if (parts.length >= 3) {
			// db.schema.table (or project.dataset.table for BigQuery)
			result.databaseName = parts[0];
			result.schemaName = parts[1];
		}

		aliases.push(result);
	}

	return aliases;
}
