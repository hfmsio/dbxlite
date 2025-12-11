import { describe, expect, test } from "vitest";
import {
	buildSortedSQL,
	cleanSqlTrailingSemicolon,
	compareValues,
	getPageFromSortedRows,
	hasLimitClause,
	hasOrderByClause,
	sortRows,
} from "../sortUtils";

describe("sortUtils", () => {
	describe("compareValues", () => {
		test("should return -1 when a < b", () => {
			expect(compareValues(1, 2)).toBe(-1);
			expect(compareValues("apple", "banana")).toBe(-1);
		});

		test("should return 1 when a > b", () => {
			expect(compareValues(2, 1)).toBe(1);
			expect(compareValues("banana", "apple")).toBe(1);
		});

		test("should return 0 when a === b", () => {
			expect(compareValues(1, 1)).toBe(0);
			expect(compareValues("apple", "apple")).toBe(0);
		});

		test("should sort null values to the end (return 1)", () => {
			expect(compareValues(null, "apple")).toBe(1);
			expect(compareValues(null, 1)).toBe(1);
			expect(compareValues(null, 0)).toBe(1);
		});

		test("should sort undefined values to the end (return 1)", () => {
			expect(compareValues(undefined, "apple")).toBe(1);
			expect(compareValues(undefined, 1)).toBe(1);
		});

		test("should return -1 when b is null/undefined", () => {
			expect(compareValues("apple", null)).toBe(-1);
			expect(compareValues(1, undefined)).toBe(-1);
		});

		test("should handle numeric comparisons correctly", () => {
			expect(compareValues(10, 2)).toBe(1); // numeric, not string
			expect(compareValues(-5, 0)).toBe(-1);
			expect(compareValues(0, 0)).toBe(0);
		});

		test("should handle date comparisons", () => {
			const date1 = new Date("2024-01-01");
			const date2 = new Date("2024-12-31");
			expect(compareValues(date1, date2)).toBe(-1);
			expect(compareValues(date2, date1)).toBe(1);
		});
	});

	describe("sortRows", () => {
		const testData = [
			{ id: 3, name: "Charlie", age: 30 },
			{ id: 1, name: "Alice", age: 25 },
			{ id: 2, name: "Bob", age: 35 },
		];

		test("should sort by string column ascending", () => {
			const sorted = sortRows(testData, "name", "asc");
			expect(sorted.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
		});

		test("should sort by string column descending", () => {
			const sorted = sortRows(testData, "name", "desc");
			expect(sorted.map((r) => r.name)).toEqual(["Charlie", "Bob", "Alice"]);
		});

		test("should sort by numeric column ascending", () => {
			const sorted = sortRows(testData, "id", "asc");
			expect(sorted.map((r) => r.id)).toEqual([1, 2, 3]);
		});

		test("should sort by numeric column descending", () => {
			const sorted = sortRows(testData, "age", "desc");
			expect(sorted.map((r) => r.age)).toEqual([35, 30, 25]);
		});

		test("should not mutate original array", () => {
			const original = [...testData];
			sortRows(testData, "name", "asc");
			expect(testData).toEqual(original);
		});

		test("should handle null values (sort to end in ascending)", () => {
			const dataWithNulls = [
				{ id: 1, value: "b" },
				{ id: 2, value: null },
				{ id: 3, value: "a" },
			];
			const sortedAsc = sortRows(dataWithNulls, "value", "asc");
			expect(sortedAsc.map((r) => r.value)).toEqual(["a", "b", null]);
		});

		test("should handle null values (sort to beginning in descending due to comparison negation)", () => {
			const dataWithNulls = [
				{ id: 1, value: "b" },
				{ id: 2, value: null },
				{ id: 3, value: "a" },
			];
			const sortedDesc = sortRows(dataWithNulls, "value", "desc");
			// In descending, the comparison is negated, so nulls end up at the beginning
			expect(sortedDesc[0].value).toBe(null);
			expect(sortedDesc.map((r) => r.value)).toEqual([null, "b", "a"]);
		});

		test("should handle empty array", () => {
			const sorted = sortRows([], "name", "asc");
			expect(sorted).toEqual([]);
		});

		test("should handle single item array", () => {
			const singleItem = [{ name: "Alice" }];
			const sorted = sortRows(singleItem, "name", "asc");
			expect(sorted).toEqual([{ name: "Alice" }]);
		});
	});

	describe("hasOrderByClause", () => {
		test("should detect ORDER BY clause", () => {
			expect(hasOrderByClause("SELECT * FROM t ORDER BY id")).toBe(true);
			expect(hasOrderByClause("SELECT * FROM t order by id")).toBe(true);
			expect(hasOrderByClause("SELECT * FROM t ORDER  BY id")).toBe(true);
		});

		test("should return false when no ORDER BY", () => {
			expect(hasOrderByClause("SELECT * FROM t")).toBe(false);
			expect(hasOrderByClause("SELECT * FROM orders")).toBe(false); // 'orders' table name
		});

		test("should detect ORDER BY in complex queries", () => {
			expect(
				hasOrderByClause("SELECT * FROM t WHERE x > 1 ORDER BY id ASC"),
			).toBe(true);
			expect(
				hasOrderByClause(`
        SELECT a, b, c
        FROM table1
        JOIN table2 ON t1.id = t2.id
        ORDER BY a DESC
      `),
			).toBe(true);
		});
	});

	describe("hasLimitClause", () => {
		test("should detect LIMIT clause", () => {
			expect(hasLimitClause("SELECT * FROM t LIMIT 10")).toBe(true);
			expect(hasLimitClause("SELECT * FROM t limit 100")).toBe(true);
		});

		test("should return false when no LIMIT", () => {
			expect(hasLimitClause("SELECT * FROM t")).toBe(false);
			expect(hasLimitClause("SELECT limited FROM t")).toBe(false); // 'limited' column
		});

		test("should handle LIMIT with OFFSET", () => {
			expect(hasLimitClause("SELECT * FROM t LIMIT 10 OFFSET 20")).toBe(true);
		});
	});

	describe("cleanSqlTrailingSemicolon", () => {
		test("should remove single trailing semicolon", () => {
			expect(cleanSqlTrailingSemicolon("SELECT * FROM t;")).toBe(
				"SELECT * FROM t",
			);
		});

		test("should remove multiple trailing semicolons", () => {
			expect(cleanSqlTrailingSemicolon("SELECT * FROM t;;;")).toBe(
				"SELECT * FROM t",
			);
		});

		test("should handle no trailing semicolon", () => {
			expect(cleanSqlTrailingSemicolon("SELECT * FROM t")).toBe(
				"SELECT * FROM t",
			);
		});

		test("should trim whitespace", () => {
			expect(cleanSqlTrailingSemicolon("  SELECT * FROM t;  ")).toBe(
				"SELECT * FROM t",
			);
		});

		test("should not remove semicolons in the middle", () => {
			expect(cleanSqlTrailingSemicolon("SELECT ';' FROM t")).toBe(
				"SELECT ';' FROM t",
			);
		});
	});

	describe("buildSortedSQL", () => {
		test("should return base SQL when sortColumn is null", () => {
			const sql = "SELECT * FROM users";
			expect(buildSortedSQL(sql, null, "asc")).toBe(sql);
		});

		test("should append ORDER BY for simple query", () => {
			const sql = "SELECT * FROM users";
			const result = buildSortedSQL(sql, "name", "asc");
			expect(result).toBe('SELECT * FROM users ORDER BY "name" ASC');
		});

		test("should handle descending sort", () => {
			const sql = "SELECT * FROM users";
			const result = buildSortedSQL(sql, "age", "desc");
			expect(result).toBe('SELECT * FROM users ORDER BY "age" DESC');
		});

		test("should wrap query with existing ORDER BY in subquery", () => {
			const sql = "SELECT * FROM users ORDER BY created_at";
			const result = buildSortedSQL(sql, "name", "asc");
			expect(result).toContain("SELECT * FROM (");
			expect(result).toContain(') AS sorted_data ORDER BY "name" ASC');
		});

		test("should wrap query with LIMIT and remove inner LIMIT", () => {
			const sql = "SELECT * FROM users LIMIT 100";
			const result = buildSortedSQL(sql, "name", "asc");
			expect(result).toContain("SELECT * FROM (");
			expect(result).not.toContain("LIMIT 100");
			expect(result).toContain(') AS sorted_data ORDER BY "name" ASC');
		});

		test("should remove trailing semicolon", () => {
			const sql = "SELECT * FROM users;";
			const result = buildSortedSQL(sql, "name", "asc");
			expect(result).toBe('SELECT * FROM users ORDER BY "name" ASC');
		});

		test("should escape column names with quotes", () => {
			const sql = "SELECT * FROM users";
			const result = buildSortedSQL(sql, 'user"name', "asc");
			expect(result).toContain('"user""name"'); // escaped double quote
		});
	});

	describe("getPageFromSortedRows", () => {
		const testData = [
			{ id: 5, name: "Eve" },
			{ id: 3, name: "Charlie" },
			{ id: 1, name: "Alice" },
			{ id: 4, name: "David" },
			{ id: 2, name: "Bob" },
		];

		test("should return first page", () => {
			const page = getPageFromSortedRows(testData, 0, 2, null, "asc");
			expect(page.length).toBe(2);
			expect(page[0].id).toBe(5);
			expect(page[1].id).toBe(3);
		});

		test("should return second page", () => {
			const page = getPageFromSortedRows(testData, 1, 2, null, "asc");
			expect(page.length).toBe(2);
			expect(page[0].id).toBe(1);
			expect(page[1].id).toBe(4);
		});

		test("should return partial last page", () => {
			const page = getPageFromSortedRows(testData, 2, 2, null, "asc");
			expect(page.length).toBe(1);
			expect(page[0].id).toBe(2);
		});

		test("should sort before pagination when sortColumn is provided", () => {
			const page = getPageFromSortedRows(testData, 0, 2, "name", "asc");
			expect(page.map((r) => r.name)).toEqual(["Alice", "Bob"]);
		});

		test("should sort descending before pagination", () => {
			const page = getPageFromSortedRows(testData, 0, 2, "id", "desc");
			expect(page.map((r) => r.id)).toEqual([5, 4]);
		});

		test("should handle empty array", () => {
			const page = getPageFromSortedRows([], 0, 10, "name", "asc");
			expect(page).toEqual([]);
		});

		test("should handle page beyond data range", () => {
			const page = getPageFromSortedRows(testData, 10, 2, null, "asc");
			expect(page).toEqual([]);
		});
	});
});
