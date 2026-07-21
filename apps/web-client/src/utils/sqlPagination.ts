/**
 * Shared SQL pagination predicates.
 *
 * One source of truth for "does this query end in a user LIMIT" and "is it
 * safe to paginate". useQueryExecution and StreamingQueryService previously
 * each had their own version — the hook end-anchored, the service matching
 * `\bLIMIT\b` ANYWHERE — and the mismatch meant a subquery LIMIT put the UI
 * into streaming mode while the service refused to inject page bounds, so
 * every "page" re-ran and returned the full result set.
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
 * Statements that must never have LIMIT/OFFSET appended or be re-executed
 * for paging: DDL/DML and utility commands. First-keyword test, same
 * blocklist the service always used.
 */
const NON_PAGINATABLE_KEYWORD =
	/^(copy|insert|update|delete|merge|create|alter|drop|truncate|export|import|attach|detach|use|install|load|show|pragma|describe|explain|set|call|checkpoint|vacuum|analyze|begin|commit|rollback)$/i;

/**
 * First bare word of the statement, lowercased ('' when empty). Leading
 * line/block comments are stripped so `-- note\nSELECT ...` classifies as
 * "select", matching the service's long-standing behavior.
 */
export function getStatementKeyword(sql: string): string {
	const withoutLeadingComments = sql
		.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, "")
		.trim();
	const m = withoutLeadingComments.match(/^([a-zA-Z]+)/);
	return m ? m[1].toLowerCase() : "";
}

/**
 * Whether a statement is safe to execute repeatedly with LIMIT/OFFSET or to
 * materialise into a temp table for paging.
 *
 * Beyond the keyword blocklist, a WITH-prefixed statement whose body carries
 * DML (`WITH cte AS (...) INSERT INTO ...`) is excluded: it first-keyword
 * classifies as a query but re-executing it per page would repeat the write.
 * The containment test is deliberately coarse (a string literal mentioning
 * "insert into" also matches) — the failure mode is merely "no pagination",
 * which is always safe.
 */
export function isPaginatableStatement(sql: string): boolean {
	const keyword = getStatementKeyword(sql);
	if (NON_PAGINATABLE_KEYWORD.test(keyword)) return false;
	if (
		keyword === "with" &&
		/\b(insert|update|delete|merge)\s+(into\s+)?/i.test(sql)
	) {
		return false;
	}
	return true;
}
