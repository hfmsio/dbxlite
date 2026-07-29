/**
 * Shared SQL pagination predicates.
 *
 * One source of truth for "does this query end in a user LIMIT" and "may we
 * append LIMIT/OFFSET to page it". useQueryExecution and StreamingQueryService
 * previously each had their own version — the hook end-anchored, the service
 * matching `\bLIMIT\b` ANYWHERE — and the mismatch meant a subquery LIMIT put
 * the UI into streaming mode while the service refused to inject page bounds,
 * so every "page" re-ran and returned the full result set.
 */

/**
 * The user's own LIMIT, if the statement ends with one (optionally followed
 * by whitespace/semicolons). A LIMIT inside a subquery or CTE deliberately
 * does NOT match — it doesn't bound the outer result.
 */
export function getTrailingLimit(sql: string): number | undefined {
	const m = sql.trim().match(/\bLIMIT\s+(\d+)\s*;*\s*$/i);
	return m ? Number.parseInt(m[1], 10) : undefined;
}

/**
 * Tokens that begin a top-level query expression which ACCEPTS a trailing
 * `LIMIT` clause. This is an allowlist on purpose, and the choice is the whole
 * design:
 *
 *   - Appending `LIMIT n OFFSET m` is only valid on a query expression, and the
 *     set of tokens that can start one is *closed* in the grammar (each entry
 *     verified against DuckDB). It does not grow the way a blocklist of every
 *     DDL / DML / PRAGMA / utility statement would — that set is open-ended, so
 *     a blocklist leaks (that is how `.tables` became `.tables LIMIT 100`).
 *   - The failure modes are asymmetric, which settles the direction. Miss a
 *     query head here → the statement simply isn't paginated (it still runs,
 *     bounded by the user's own LIMIT, the server row cap, or DuckDB's
 *     streaming). Miss a non-query in a blocklist → we corrupt valid input.
 *     "When unsure, don't paginate" is safe; "when unsure, paginate" is not.
 *
 * Deliberately excluded because they return rows but REJECT a trailing LIMIT:
 * TABLE, DESCRIBE, SUMMARIZE, SHOW, EXPLAIN, PRAGMA, CALL. They pass through
 * unbounded (server-capped) rather than being turned into a syntax error.
 */
const QUERY_EXPRESSION_HEADS = new Set([
	"select",
	"with",
	"from",
	"values",
	"pivot",
	"unpivot",
]);

/**
 * Strip any run of leading whitespace and line/block comments (in any order)
 * so classification looks at the first real token.
 */
function stripLeadingNoise(sql: string): string {
	return sql.replace(/^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "");
}

/**
 * First bare word of the statement, lowercased ('' when there isn't one).
 * Leading comments/whitespace and any leading `(` (parenthesized selects and
 * set operations like `(SELECT ...) UNION (SELECT ...)`) are stripped first, so
 * those classify by their inner query head.
 */
export function getStatementKeyword(sql: string): string {
	const head = stripLeadingNoise(sql).replace(/^\(+\s*/, "");
	const m = head.match(/^([a-zA-Z]+)/);
	return m ? m[1].toLowerCase() : "";
}

/**
 * Whether we may append LIMIT/OFFSET to page this statement (and, in WASM mode,
 * materialise it into a temp table for stable paging).
 *
 * The rule is a single structural question — "is this a query expression that
 * takes a trailing LIMIT?" — plus two carve-outs:
 *
 *   - Client meta-commands (`.tables`, `.schema`, `.mode`, ...) begin with `.`
 *     and are not SQL at all. One rule covers every dot-command, not a list.
 *   - `WITH cte AS (...) INSERT INTO ...` first-word classifies as a query but
 *     carries a write; re-executing it per page would repeat the write. The
 *     containment test is deliberately coarse (a string literal saying "insert
 *     into" also trips it) — the failure mode is merely "no pagination".
 */
export function isPaginatableStatement(sql: string): boolean {
	const body = stripLeadingNoise(sql);

	// Client dot-commands (.tables, .schema, .mode, ...) are never SQL queries;
	// appending LIMIT would corrupt them. One structural rule covers them all.
	if (body.startsWith(".")) return false;

	const keyword = getStatementKeyword(sql);
	if (!QUERY_EXPRESSION_HEADS.has(keyword)) return false;

	if (
		keyword === "with" &&
		/\b(insert|update|delete|merge)\s+(into\s+)?/i.test(sql)
	) {
		return false;
	}
	return true;
}
