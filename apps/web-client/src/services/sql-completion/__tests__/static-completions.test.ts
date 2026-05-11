import { describe, expect, test } from "vitest";
import {
	getAllSQLCompletions,
	SQL_FUNCTIONS,
	SQL_KEYWORDS,
	SQL_SNIPPETS,
} from "../static-completions";

describe("static SQL completion catalogs", () => {
	test("SQL_KEYWORDS contains canonical clauses", () => {
		const labels = SQL_KEYWORDS.map((k) => k.label);
		for (const must of [
			"SELECT",
			"FROM",
			"WHERE",
			"JOIN",
			"GROUP BY",
			"ORDER BY",
			"WITH",
		]) {
			expect(labels).toContain(must);
		}
	});

	test("SQL_FUNCTIONS contains canonical aggregate and string functions", () => {
		const labels = SQL_FUNCTIONS.map((f) => f.label);
		for (const must of ["COUNT", "SUM", "AVG", "UPPER", "LOWER", "COALESCE"]) {
			expect(labels).toContain(must);
		}
	});

	test("SQL_SNIPPETS contains the expected templates", () => {
		const labels = SQL_SNIPPETS.map((s) => s.label);
		expect(labels).toContain("select-basic");
		expect(labels).toContain("select-cte");
		expect(labels).toContain("case-when");
	});

	test("every entry has label and insertText fields", () => {
		for (const c of [...SQL_KEYWORDS, ...SQL_FUNCTIONS, ...SQL_SNIPPETS]) {
			expect(typeof c.label).toBe("string");
			expect(c.label.length).toBeGreaterThan(0);
			expect(typeof c.insertText).toBe("string");
		}
	});

	test("getAllSQLCompletions concatenates all three catalogs", () => {
		const all = getAllSQLCompletions();
		expect(all.length).toBe(
			SQL_KEYWORDS.length + SQL_FUNCTIONS.length + SQL_SNIPPETS.length,
		);
	});

	test("snippet entries declare insertTextRules for tab-stop expansion", () => {
		// Snippets use insertTextRules: 4 (Monaco's InsertAsSnippet) so the
		// `${1:placeholder}` syntax is honored. Verify the data shape stays
		// correct after the move.
		for (const s of SQL_SNIPPETS) {
			expect(s.insertTextRules).toBe(4);
		}
	});
});
