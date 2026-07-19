import { describe, expect, test } from "vitest";
import {
	detectSQLContext,
	getContextualCompletions,
} from "../context-detector";

/**
 * The clause patterns are anchored with `\s+$` (cursor just after a keyword
 * and space). The detector must NOT trim its input, or the trailing space is
 * lost and every pattern misses — the old bug that made this always return
 * "all" and leak the whole dialect keyword list (ATTACH, DETACH, …) into the
 * FROM/SELECT/WHERE positions.
 */
describe("detectSQLContext", () => {
	test("returns 'all' for empty input", () => {
		expect(detectSQLContext("")).toBe("all");
	});

	test("returns 'all' for partial keyword that hasn't terminated a clause", () => {
		expect(detectSQLContext("SEL")).toBe("all");
	});

	test("returns 'table' immediately after FROM", () => {
		expect(detectSQLContext("SELECT * FROM ")).toBe("table");
	});

	test("returns 'table' after JOIN", () => {
		expect(detectSQLContext("SELECT * FROM users JOIN ")).toBe("table");
	});

	test("returns 'table' after INSERT INTO / UPDATE / DELETE FROM", () => {
		expect(detectSQLContext("INSERT INTO ")).toBe("table");
		expect(detectSQLContext("UPDATE ")).toBe("table");
		expect(detectSQLContext("DELETE FROM ")).toBe("table");
	});

	test("returns 'column' after SELECT", () => {
		expect(detectSQLContext("SELECT ")).toBe("column");
	});

	test("returns 'column' after SELECT DISTINCT", () => {
		expect(detectSQLContext("SELECT DISTINCT ")).toBe("column");
	});

	test("returns 'column' after WHERE", () => {
		expect(detectSQLContext("SELECT * FROM t WHERE ")).toBe("column");
	});

	test("returns 'column' after AND / OR continuation", () => {
		expect(detectSQLContext("SELECT * FROM t WHERE x = 1 AND ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t WHERE x = 1 OR ")).toBe("column");
	});

	test("returns 'column' after ORDER BY / GROUP BY / HAVING / SET / ON", () => {
		expect(detectSQLContext("SELECT * FROM t ORDER BY ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t GROUP BY ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t GROUP BY a HAVING ")).toBe("column");
		expect(detectSQLContext("UPDATE t SET ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM a JOIN b ON ")).toBe("column");
	});

	test("returns 'column' after a comma in a projection / ORDER BY / GROUP BY list", () => {
		expect(detectSQLContext("SELECT id, ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t ORDER BY a, ")).toBe("column");
		expect(detectSQLContext("SELECT * FROM t GROUP BY a, ")).toBe("column");
	});

	test("returns 'keyword' after FROM <table> and a trailing space", () => {
		// Table already typed; the next thing is a clause keyword (WHERE, JOIN…).
		expect(detectSQLContext("SELECT * FROM users ")).toBe("keyword");
	});

	test("is case-insensitive", () => {
		expect(detectSQLContext("select * from t where ")).toBe("column");
		expect(detectSQLContext("select * from ")).toBe("table");
		expect(detectSQLContext("Select Distinct ")).toBe("column");
	});
});

describe("getContextualCompletions", () => {
	test("returns no keywords/functions in FROM (table) context — only tables belong there", () => {
		// This is the ATTACH/DETACH regression: table context must be empty so
		// the provider shows only table names after FROM.
		const result = getContextualCompletions("SELECT * FROM ", "SELECT * FROM ");
		expect(result).toEqual([]);
	});

	test("returns functions but not clause keywords in column context", () => {
		const result = getContextualCompletions("SELECT ", "SELECT ");
		expect(result.some((c) => c.label === "COUNT")).toBe(true);
		expect(result.some((c) => c.label === "SELECT")).toBe(false);
		expect(result.some((c) => c.label === "FROM")).toBe(false);
	});

	test("returns clause keywords after FROM <table> (keyword context)", () => {
		const result = getContextualCompletions(
			"SELECT * FROM users ",
			"SELECT * FROM users ",
		);
		const labels = result.map((c) => c.label);
		expect(labels).toContain("WHERE");
		expect(labels.some((l) => l.includes("JOIN"))).toBe(true);
		// Not the whole catalog — statement keywords like SELECT don't belong here.
		expect(labels).not.toContain("SELECT");
	});

	test("returns the full catalog at the start of a query (all context)", () => {
		const result = getContextualCompletions("", "");
		expect(result.length).toBeGreaterThan(50);
		expect(result.some((c) => c.label === "SELECT")).toBe(true);
		expect(result.some((c) => c.label === "COUNT")).toBe(true);
	});
});
