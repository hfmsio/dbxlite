/**
 * Rewrite bare `.xlsx` file references in user SQL to an explicit
 * `read_xlsx(..., all_varchar=true)` call.
 *
 * Why: `SELECT * FROM 'foo.xlsx'` goes through DuckDB's default replacement
 * scan, which sniffs each column's type from an early sample of rows. A column
 * that looks numeric near the top but holds text further down (a `reason` /
 * `notes` field) is typed DOUBLE and then fails mid-read with
 * "Could not convert string ... to DOUBLE". Reading with `all_varchar=true`
 * keeps every cell as text, so the query always succeeds; users cast the
 * genuinely-numeric columns as needed. This matches the all_varchar policy the
 * rest of the xlsx code (buildReadXlsxCall) already applies to sheet reads.
 *
 * Only files DuckDB has actually registered as xlsx sources are rewritten, and
 * only in FROM/JOIN/comma position, so an unrelated string literal that happens
 * to equal a filename is left alone.
 */

import type { DataSource } from "../types/data-source";

function escapeForRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteXlsxReferences(
	sql: string,
	dataSources: DataSource[],
): string {
	const refs = dataSources
		.filter((d) => d.type === "xlsx" && d.filePath)
		.map((d) => d.filePath as string);
	if (refs.length === 0) return sql;

	let out = sql;
	for (const ref of refs) {
		// Match the file used as a source: right after FROM / JOIN / a comma,
		// as a single-quoted literal. The lookahead avoids touching a reference
		// that is already inside a read_xlsx(...) call (its literal is preceded
		// by `(`, not a clause keyword).
		const re = new RegExp(
			`((?:\\bFROM\\b|\\bJOIN\\b|,)\\s*)'${escapeForRegex(ref)}'`,
			"gi",
		);
		out = out.replace(
			re,
			`$1read_xlsx('${ref.replace(/'/g, "''")}', all_varchar=true)`,
		);
	}
	return out;
}
