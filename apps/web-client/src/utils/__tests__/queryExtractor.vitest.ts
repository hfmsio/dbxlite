import { describe, expect, test } from "vitest";
import { extractQueryAtCursor } from "../queryExtractor";

describe("extractQueryAtCursor", () => {
	describe("basic functionality", () => {
		test("should return selected text when provided", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			const result = extractQueryAtCursor(fullText, 0, "SELECT 1");
			expect(result).toBe("SELECT 1");
		});

		test("should strip comments from selected text", () => {
			const fullText = "SELECT * FROM table1";
			const result = extractQueryAtCursor(fullText, 0, "SELECT 1 -- comment");
			expect(result).toBe("SELECT 1");
		});

		test("should return single statement when no semicolons", () => {
			const fullText = "SELECT * FROM users";
			const result = extractQueryAtCursor(fullText, 5);
			expect(result).toBe("SELECT * FROM users");
		});

		test("should handle empty input", () => {
			const result = extractQueryAtCursor("", 0);
			expect(result).toBe("");
		});

		test("should handle whitespace only input", () => {
			const result = extractQueryAtCursor("   \n  ", 2);
			expect(result).toBe("");
		});
	});

	describe("cursor in middle of statement", () => {
		test("should return first statement when cursor is in first statement", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			// Cursor at position 7 ("FROM")
			const result = extractQueryAtCursor(fullText, 7);
			expect(result).toBe("SELECT * FROM table1");
		});

		test("should return second statement when cursor is in second statement", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			// Position: "SELECT * FROM table1; SELECT * FROM table2;"
			//           0         1         2         3         4
			//           0123456789012345678901234567890123456789012345
			// Second query starts at position 22
			const result = extractQueryAtCursor(fullText, 30);
			expect(result).toBe("SELECT * FROM table2");
		});
	});

	describe("cursor at statement boundaries - THE BUG FIX", () => {
		// This is the main scenario that was broken
		test("should return first statement when cursor is ON the semicolon", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			// Position: "SELECT * FROM table1; SELECT * FROM table2;"
			//           0         1         2
			//           012345678901234567890123...
			// Semicolon after first query is at position 20
			const result = extractQueryAtCursor(fullText, 20);
			expect(result).toBe("SELECT * FROM table1");
		});

		test("should return first statement when cursor is immediately after semicolon", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			// Position 21 is immediately after the semicolon
			const result = extractQueryAtCursor(fullText, 21);
			expect(result).toBe("SELECT * FROM table1");
		});

		test("should return second statement when cursor is at start of second statement text", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			// Position breakdown: "SELECT * FROM table1; SELECT * FROM table2;"
			//                      0         1         2         3         4
			//                      01234567890123456789012345678901234567890123
			// Position 21 is the space after semicolon
			// Position 22 is 'S' of second SELECT - this is AT the text, so returns query 2
			const result = extractQueryAtCursor(fullText, 22);
			// At the text start, we return that query
			expect(result).toBe("SELECT * FROM table2");
		});
	});

	describe("cursor at end of file", () => {
		test("should return last statement when cursor is at end after last semicolon", () => {
			const fullText = "SELECT 1; SELECT 2;";
			const result = extractQueryAtCursor(fullText, 19);
			expect(result).toBe("SELECT 2");
		});

		test("should return last statement when cursor is past last semicolon with trailing whitespace", () => {
			const fullText = "SELECT 1; SELECT 2;   ";
			const result = extractQueryAtCursor(fullText, 22);
			expect(result).toBe("SELECT 2");
		});

		test("should return statement when cursor is at end without trailing semicolon", () => {
			const fullText = "SELECT 1; SELECT 2";
			const result = extractQueryAtCursor(fullText, 18);
			expect(result).toBe("SELECT 2");
		});
	});

	describe("cursor at beginning of file", () => {
		test("should return first statement when cursor is at position 0", () => {
			const fullText = "SELECT * FROM table1; SELECT * FROM table2;";
			const result = extractQueryAtCursor(fullText, 0);
			expect(result).toBe("SELECT * FROM table1");
		});
	});

	describe("multiple statements with various spacing", () => {
		test("should handle statements with newlines between them", () => {
			const fullText = `SELECT 1;

SELECT 2;`;
			// Cursor at start of second SELECT
			const result = extractQueryAtCursor(fullText, 17);
			expect(result).toBe("SELECT 2");
		});

		test("should handle statements on same line with spaces", () => {
			const fullText = "SELECT 1;   SELECT 2;   SELECT 3;";
			// Cursor in spaces after first semicolon
			const result = extractQueryAtCursor(fullText, 10);
			expect(result).toBe("SELECT 1");
		});

		test("should handle three statements correctly", () => {
			const fullText = "SELECT 1; SELECT 2; SELECT 3;";

			// Cursor in first
			expect(extractQueryAtCursor(fullText, 3)).toBe("SELECT 1");
			// Cursor in second
			expect(extractQueryAtCursor(fullText, 14)).toBe("SELECT 2");
			// Cursor in third
			expect(extractQueryAtCursor(fullText, 24)).toBe("SELECT 3");
		});
	});

	describe("statements with comments", () => {
		test("should strip single-line comments", () => {
			const fullText = "SELECT 1 -- this is a comment";
			const result = extractQueryAtCursor(fullText, 5);
			expect(result).toBe("SELECT 1");
		});

		test("should strip multi-line comments", () => {
			const fullText = "SELECT /* comment */ 1";
			const result = extractQueryAtCursor(fullText, 5);
			expect(result).toBe("SELECT  1");
		});

		test("should handle semicolon in comment (not treated as delimiter)", () => {
			// Note: current implementation does split on semicolon even in comments
			// This test documents current behavior - a more robust parser would be needed
			// to properly handle semicolons inside comments/strings
			const fullText = "SELECT 1 -- comment with; semicolon";
			const result = extractQueryAtCursor(fullText, 5);
			// Current behavior: splits on semicolon, but comment stripping removes "-- comment with"
			expect(result).toBe("SELECT 1");
		});
	});

	describe("edge cases", () => {
		test("should handle single statement with semicolon", () => {
			const fullText = "SELECT 1;";
			const result = extractQueryAtCursor(fullText, 4);
			expect(result).toBe("SELECT 1");
		});

		test("should handle cursor exactly on semicolon of single statement", () => {
			const fullText = "SELECT 1;";
			// Semicolon is at position 8
			const result = extractQueryAtCursor(fullText, 8);
			expect(result).toBe("SELECT 1");
		});

		test("should handle multiple semicolons in a row", () => {
			const fullText = "SELECT 1;;SELECT 2";
			// Empty part between semicolons should be ignored
			const result = extractQueryAtCursor(fullText, 0);
			expect(result).toBe("SELECT 1");
		});

		test("should handle leading whitespace", () => {
			const fullText = "   SELECT 1; SELECT 2;";
			const result = extractQueryAtCursor(fullText, 0);
			// Cursor is in leading whitespace before first query
			// Should fall through to first statement
			expect(result).toBe("SELECT 1");
		});
	});

	describe("real-world scenarios", () => {
		test("should handle CTE query", () => {
			const fullText = `WITH cte AS (SELECT 1 AS id)
SELECT * FROM cte;`;
			const result = extractQueryAtCursor(fullText, 10);
			expect(result).toContain("WITH cte AS");
			expect(result).toContain("SELECT * FROM cte");
		});

		test("should handle cursor at end after typing semicolon", () => {
			// User types: "SELECT * FROM users;" and presses Cmd+Enter with cursor after semicolon
			const fullText = "SELECT * FROM users;";
			const result = extractQueryAtCursor(fullText, 20);
			expect(result).toBe("SELECT * FROM users");
		});

		test("should handle multiple queries with cursor after first", () => {
			// User has two queries, finishes typing first with semicolon, cursor right after
			const fullText = "SELECT * FROM users; SELECT * FROM orders;";
			// Cursor right after first semicolon (position 20)
			const result = extractQueryAtCursor(fullText, 20);
			expect(result).toBe("SELECT * FROM users");
		});
	});
});
