/**
 * Extract CTE (Common Table Expression) names from a SQL query.
 *
 * Verbatim move from `lib/sqlCompletions.ts`. Phase 1 preserves the
 * existing regex-based implementation including its known limitation:
 * the lazy `.+?` lookahead terminates at the first nested `SELECT`
 * inside a CTE body, so multi-CTE queries with nested SELECTs miss
 * subsequent CTE names. Phase 4 replaces this with a parenthesis-depth
 * walker that finds top-level CTE boundaries.
 */

/**
 * Parse CTE names from a SQL query.
 *
 * Matches: `WITH name AS (...), name2 AS (...)`. Returns the set of
 * CTE names defined in the query.
 */
export function parseCTENames(sql: string): Set<string> {
	const cteNames = new Set<string>();

	// Match WITH clause and extract CTE names
	// Pattern: WITH name AS (...), name2 AS (...)
	// Need to handle nested parentheses in CTE body
	const withMatch = sql.match(
		/\bWITH\s+(?:RECURSIVE\s+)?(.+?)(?=\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/is,
	);

	if (!withMatch) return cteNames;

	const withClause = withMatch[1];

	// Extract CTE names: "name AS (" pattern.
	// We look for identifier followed by AS and opening paren.
	const ctePattern = /(\w+)\s+AS\s*\(/gi;
	let match: RegExpExecArray | null;

	while ((match = ctePattern.exec(withClause)) !== null) {
		const cteName = match[1];
		// Skip if it looks like a SQL keyword
		const upperName = cteName.toUpperCase();
		if (
			!["SELECT", "INSERT", "UPDATE", "DELETE", "WITH", "FROM", "WHERE"].includes(
				upperName,
			)
		) {
			cteNames.add(cteName);
		}
	}

	return cteNames;
}
