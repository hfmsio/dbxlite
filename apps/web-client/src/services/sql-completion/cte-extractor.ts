/**
 * Extract CTE (Common Table Expression) names from a SQL query.
 *
 * A parenthesis-depth walker that finds each `name AS (` at the top level
 * of the WITH clause. This replaces the earlier lazy-regex version, whose
 * `.+?` lookahead terminated at the first nested `SELECT` inside a CTE
 * body and so missed every CTE after the first in a multi-CTE query.
 */

/** Reserved words that can pattern-match `name AS (` but are never CTE names. */
const RESERVED_CTE_NAMES = new Set([
	"SELECT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"MERGE",
	"WITH",
	"FROM",
	"WHERE",
	"AS",
]);

/** A top-level token from this set means the main statement has begun. */
const WITH_TERMINATORS = new Set([
	"SELECT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"MERGE",
]);

/**
 * Parse CTE names from a SQL query.
 *
 * Handles `WITH name AS (...), name2 AS (...)` with arbitrarily nested
 * parentheses and SELECTs inside each body, RECURSIVE, and case variation.
 * Names are recognised as soon as they're declared, so an in-progress
 * `WITH a AS (` (the user still typing the body) already reports `a` —
 * which is what autocomplete wants.
 */
export function parseCTENames(sql: string): Set<string> {
	const cteNames = new Set<string>();

	const head = /\bWITH\s+(?:RECURSIVE\s+)?/i.exec(sql);
	if (!head) return cteNames;

	// Sticky regexes anchored at the cursor position keep this O(n) — no
	// per-character slicing of the (possibly large) prefix.
	const cteRe = /([A-Za-z_]\w*)\s+AS\s*\(/iy;
	const wordRe = /[A-Za-z_]\w*/y;

	const n = sql.length;
	let i = head.index + head[0].length;
	let depth = 0;

	while (i < n) {
		const ch = sql[i];

		// Skip quoted strings / identifiers so parens or keywords inside them
		// don't affect depth or get mistaken for a CTE.
		if (ch === "'" || ch === '"' || ch === "`") {
			i++;
			while (i < n && sql[i] !== ch) i++;
			i++; // closing quote (or past end for an unterminated string)
			continue;
		}
		if (ch === "(") {
			depth++;
			i++;
			continue;
		}
		if (ch === ")") {
			if (depth > 0) depth--;
			i++;
			continue;
		}

		if (depth === 0) {
			// `name AS (` at the top level declares a CTE.
			cteRe.lastIndex = i;
			const cte = cteRe.exec(sql);
			if (cte) {
				if (!RESERVED_CTE_NAMES.has(cte[1].toUpperCase())) {
					cteNames.add(cte[1]);
				}
				i = cteRe.lastIndex; // past the opening paren...
				depth++; // ...which opens the CTE body
				continue;
			}
			// The main statement keyword at the top level ends the WITH list.
			wordRe.lastIndex = i;
			const word = wordRe.exec(sql);
			if (word && WITH_TERMINATORS.has(word[0].toUpperCase())) break;
		}

		i++;
	}

	return cteNames;
}
