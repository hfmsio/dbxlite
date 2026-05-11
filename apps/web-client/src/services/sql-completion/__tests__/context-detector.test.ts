import { describe, expect, test } from "vitest";
import {
	detectSQLContext,
	getContextualCompletions,
} from "../context-detector";

/**
 * NOTE on pre-existing bug discovered through these tests:
 *
 * `detectSQLContext` calls `.trim()` on its input before testing the
 * regexes — but every context-detecting regex (`fromJoin`, `select`,
 * `where`, `groupBy`, `orderBy`, etc.) requires `\s+$` (trailing
 * whitespace) to match. After the trim, no input ever has trailing
 * whitespace, so none of these patterns ever fire. The function
 * effectively always returns `"all"`.
 *
 * Phase 1 is byte-faithful: tests assert the actual current behavior.
 * Phase 4 will fix this alongside the other regex-vs-real-parsing bugs
 * (the CTE multi-CTE-with-nested-SELECT issue at `cte-extractor.ts`).
 */
describe("detectSQLContext", () => {
	test("returns 'all' for empty input", () => {
		expect(detectSQLContext("")).toBe("all");
	});

	test("returns 'all' for partial keyword that hasn't terminated a clause", () => {
		expect(detectSQLContext("SEL")).toBe("all");
	});

	test("returns 'all' after FROM (preexisting bug: trim removes trailing space)", () => {
		// Aspirationally: should be "table". Actually: trim() strips the trailing
		// space that the regex requires. Phase 4 fixes the trim/regex mismatch.
		expect(detectSQLContext("SELECT * FROM ")).toBe("all");
	});

	test("returns 'all' after JOIN (same trim/regex mismatch)", () => {
		expect(detectSQLContext("SELECT * FROM users JOIN ")).toBe("all");
	});

	test("returns 'all' after INSERT INTO / UPDATE / DELETE FROM (same)", () => {
		expect(detectSQLContext("INSERT INTO ")).toBe("all");
		expect(detectSQLContext("UPDATE ")).toBe("all");
		expect(detectSQLContext("DELETE FROM ")).toBe("all");
	});

	test("returns 'all' after SELECT (same trim/regex mismatch)", () => {
		expect(detectSQLContext("SELECT ")).toBe("all");
	});

	test("returns 'all' after SELECT DISTINCT (same)", () => {
		expect(detectSQLContext("SELECT DISTINCT ")).toBe("all");
	});

	test("returns 'all' after WHERE (same)", () => {
		expect(detectSQLContext("SELECT * FROM t WHERE ")).toBe("all");
	});

	test("returns 'all' after AND / OR continuation (same)", () => {
		expect(detectSQLContext("SELECT * FROM t WHERE x = 1 AND ")).toBe("all");
		expect(detectSQLContext("SELECT * FROM t WHERE x = 1 OR ")).toBe("all");
	});

	test("returns 'all' after ORDER BY / GROUP BY / HAVING / SET / ON (same)", () => {
		expect(detectSQLContext("SELECT * FROM t ORDER BY ")).toBe("all");
		expect(detectSQLContext("SELECT * FROM t GROUP BY ")).toBe("all");
		expect(detectSQLContext("SELECT * FROM t GROUP BY a HAVING ")).toBe("all");
		expect(detectSQLContext("UPDATE t SET ")).toBe("all");
		expect(detectSQLContext("SELECT * FROM a JOIN b ON ")).toBe("all");
	});

	test("returns 'column' after a comma — these regexes use `,\\s*$` so survive the trim", () => {
		// The `selectAfterComma`, `orderByAfterComma`, and `groupByAfterComma`
		// patterns terminate with `,\s*$` (zero-or-more trailing whitespace),
		// so they DO match after trim() removes the trailing space. These are
		// the only context branches that currently work.
		expect(detectSQLContext("SELECT id, ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t ORDER BY a, ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t GROUP BY a, ")).toBe("column");
	});

	test("returns 'all' after FROM <table> with trailing space (same)", () => {
		expect(detectSQLContext("SELECT * FROM users ")).toBe("all");
	});

	test("is case-insensitive in input handling (still always returns 'all')", () => {
		expect(detectSQLContext("select * from t where ")).toBe("all");
		expect(detectSQLContext("Select Distinct ")).toBe("all");
	});
});

describe("getContextualCompletions", () => {
	// Because detectSQLContext always returns "all", the getContextualCompletions
	// function effectively always falls through to the default branch
	// (`getAllSQLCompletions`), regardless of cursor position. These tests
	// document that current reality.

	test("returns full catalog for FROM context (because detector returns 'all')", () => {
		const result = getContextualCompletions("SELECT * FROM ", "SELECT * FROM ");
		expect(result.length).toBeGreaterThan(50);
		expect(result.some((c) => c.label === "SELECT")).toBe(true);
	});

	test("returns full catalog for column context (same reason)", () => {
		const result = getContextualCompletions("SELECT ", "SELECT ");
		expect(result.length).toBeGreaterThan(50);
		expect(result.some((c) => c.label === "COUNT")).toBe(true);
	});

	test("returns full catalog for keyword-after-FROM context (same reason)", () => {
		const result = getContextualCompletions(
			"SELECT * FROM users ",
			"SELECT * FROM users ",
		);
		expect(result.length).toBeGreaterThan(50);
	});

	test("returns full catalog for default 'all' context (correctly)", () => {
		const result = getContextualCompletions("", "");
		expect(result.length).toBeGreaterThan(50);
		expect(result.some((c) => c.label === "SELECT")).toBe(true);
		expect(result.some((c) => c.label === "COUNT")).toBe(true);
	});
});
