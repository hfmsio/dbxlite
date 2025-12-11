/**
 * SQL Sanitizer Tests
 * Comprehensive tests for SQL injection prevention utilities
 */

import { describe, expect, it } from "vitest";
import {
	buildAttachSQL,
	buildDetachSQL,
	buildSelectFromFile,
	buildWhereEquals,
	buildWhereLike,
	escapeIdentifier,
	escapeLikePattern,
	escapeStringLiteral,
} from "./sqlSanitizer";

describe("sqlSanitizer", () => {
	describe("escapeIdentifier", () => {
		it("wraps simple identifiers in double quotes", () => {
			expect(escapeIdentifier("users")).toBe('"users"');
			expect(escapeIdentifier("my_table")).toBe('"my_table"');
			expect(escapeIdentifier("Column1")).toBe('"Column1"');
		});

		it("escapes embedded double quotes by doubling them", () => {
			expect(escapeIdentifier('my"table')).toBe('"my""table"');
			expect(escapeIdentifier('"quoted"')).toBe('"""quoted"""');
			expect(escapeIdentifier('a"b"c')).toBe('"a""b""c"');
		});

		it("handles spaces and special characters", () => {
			expect(escapeIdentifier("my table")).toBe('"my table"');
			expect(escapeIdentifier("table-name")).toBe('"table-name"');
			expect(escapeIdentifier("table.name")).toBe('"table.name"');
			expect(escapeIdentifier("table@name")).toBe('"table@name"');
		});

		it("prevents SQL injection in identifiers", () => {
			// Classic SQL injection attempt
			const injection1 = '; DROP TABLE users; --';
			expect(escapeIdentifier(injection1)).toBe('"; DROP TABLE users; --"');

			// Double quote escape attempt - the " becomes "", then wrapped in outer ""
			const injection2 = '"; DROP TABLE users; --';
			expect(escapeIdentifier(injection2)).toBe('"""; DROP TABLE users; --"');

			// The escaped value when used as identifier is safe:
			// The entire string including the injection becomes one quoted identifier
		});

		it("handles empty strings", () => {
			expect(escapeIdentifier("")).toBe('""');
		});

		it("handles unicode characters", () => {
			expect(escapeIdentifier("表")).toBe('"表"');
			expect(escapeIdentifier("tëst")).toBe('"tëst"');
			expect(escapeIdentifier("emoji🎉table")).toBe('"emoji🎉table"');
		});

		it("handles numbers at start", () => {
			expect(escapeIdentifier("123table")).toBe('"123table"');
			expect(escapeIdentifier("2024_data")).toBe('"2024_data"');
		});
	});

	describe("escapeStringLiteral", () => {
		it("wraps simple strings in single quotes", () => {
			expect(escapeStringLiteral("hello")).toBe("'hello'");
			expect(escapeStringLiteral("world")).toBe("'world'");
		});

		it("escapes embedded single quotes by doubling them", () => {
			expect(escapeStringLiteral("O'Brien")).toBe("'O''Brien'");
			expect(escapeStringLiteral("it's")).toBe("'it''s'");
			expect(escapeStringLiteral("'quoted'")).toBe("'''quoted'''");
			expect(escapeStringLiteral("a'b'c")).toBe("'a''b''c'");
		});

		it("handles file paths", () => {
			expect(escapeStringLiteral("/path/to/file.csv")).toBe(
				"'/path/to/file.csv'",
			);
			expect(escapeStringLiteral("C:\\Users\\data.csv")).toBe(
				"'C:\\Users\\data.csv'",
			);
		});

		it("prevents SQL injection in string literals", () => {
			// Classic SQL injection attempt
			const injection1 = "'; DROP TABLE users; --";
			expect(escapeStringLiteral(injection1)).toBe("'''; DROP TABLE users; --'");

			// Multiple quotes injection - each ' becomes '', then wrapped in outer ''
			// Input: '' OR '1'='1 (4 single quotes in input)
			// Each ' -> '' gives: '''' OR ''1''=''1
			// Wrapped: ''''' OR ''1''=''1'
			const injection2 = "'' OR '1'='1";
			expect(escapeStringLiteral(injection2)).toBe("''''' OR ''1''=''1'");
		});

		it("handles empty strings", () => {
			expect(escapeStringLiteral("")).toBe("''");
		});

		it("handles unicode and special characters", () => {
			expect(escapeStringLiteral("日本語")).toBe("'日本語'");
			expect(escapeStringLiteral("tëst")).toBe("'tëst'");
			expect(escapeStringLiteral("emoji🎉")).toBe("'emoji🎉'");
		});

		it("handles newlines and tabs", () => {
			expect(escapeStringLiteral("line1\nline2")).toBe("'line1\nline2'");
			expect(escapeStringLiteral("col1\tcol2")).toBe("'col1\tcol2'");
		});
	});

	describe("buildAttachSQL", () => {
		it("builds basic read-only ATTACH statement", () => {
			expect(buildAttachSQL("test.duckdb", "mydb")).toBe(
				`ATTACH 'test.duckdb' AS "mydb" (READ_ONLY)`,
			);
		});

		it("builds read-write ATTACH statement", () => {
			expect(buildAttachSQL("test.duckdb", "mydb", false)).toBe(
				`ATTACH 'test.duckdb' AS "mydb"`,
			);
		});

		it("escapes file paths with special characters", () => {
			expect(buildAttachSQL("path/to/my'db.duckdb", "mydb")).toBe(
				`ATTACH 'path/to/my''db.duckdb' AS "mydb" (READ_ONLY)`,
			);
		});

		it("escapes aliases with special characters", () => {
			expect(buildAttachSQL("test.duckdb", 'my"db')).toBe(
				`ATTACH 'test.duckdb' AS "my""db" (READ_ONLY)`,
			);
		});

		it("prevents SQL injection in file path", () => {
			const maliciousPath = "'; DROP TABLE users; --";
			expect(buildAttachSQL(maliciousPath, "mydb")).toBe(
				`ATTACH '''; DROP TABLE users; --' AS "mydb" (READ_ONLY)`,
			);
		});

		it("prevents SQL injection in alias", () => {
			const maliciousAlias = '"; DROP TABLE users; --';
			expect(buildAttachSQL("test.duckdb", maliciousAlias)).toBe(
				`ATTACH 'test.duckdb' AS """; DROP TABLE users; --" (READ_ONLY)`,
			);
		});

		it("handles spaces in paths and aliases", () => {
			expect(buildAttachSQL("my data/file.duckdb", "my database")).toBe(
				`ATTACH 'my data/file.duckdb' AS "my database" (READ_ONLY)`,
			);
		});
	});

	describe("buildDetachSQL", () => {
		it("builds basic DETACH statement", () => {
			expect(buildDetachSQL("mydb")).toBe(`DETACH "mydb"`);
		});

		it("escapes aliases with special characters", () => {
			expect(buildDetachSQL('my"db')).toBe(`DETACH "my""db"`);
			expect(buildDetachSQL("my db")).toBe(`DETACH "my db"`);
		});

		it("prevents SQL injection in alias", () => {
			const maliciousAlias = '"; DROP TABLE users; --';
			expect(buildDetachSQL(maliciousAlias)).toBe(
				`DETACH """; DROP TABLE users; --"`,
			);
		});
	});

	describe("buildSelectFromFile", () => {
		it("builds basic SELECT from file", () => {
			expect(buildSelectFromFile("data.csv")).toBe(`SELECT * FROM 'data.csv'`);
		});

		it("builds SELECT with LIMIT", () => {
			expect(buildSelectFromFile("data.csv", 100)).toBe(
				`SELECT * FROM 'data.csv' LIMIT 100`,
			);
		});

		it("builds SELECT with LIMIT 0", () => {
			expect(buildSelectFromFile("data.csv", 0)).toBe(
				`SELECT * FROM 'data.csv' LIMIT 0`,
			);
		});

		it("escapes file paths with special characters", () => {
			expect(buildSelectFromFile("user's data.csv")).toBe(
				`SELECT * FROM 'user''s data.csv'`,
			);
		});

		it("prevents SQL injection in file path", () => {
			const maliciousPath = "'; DROP TABLE users; --";
			expect(buildSelectFromFile(maliciousPath)).toBe(
				`SELECT * FROM '''; DROP TABLE users; --'`,
			);
		});

		it("handles undefined limit", () => {
			expect(buildSelectFromFile("data.csv", undefined)).toBe(
				`SELECT * FROM 'data.csv'`,
			);
		});
	});

	describe("buildWhereEquals", () => {
		it("builds basic WHERE equals clause", () => {
			expect(buildWhereEquals("name", "test")).toBe(`"name" = 'test'`);
		});

		it("escapes column names", () => {
			expect(buildWhereEquals('col"name', "value")).toBe(
				`"col""name" = 'value'`,
			);
		});

		it("escapes values with quotes", () => {
			expect(buildWhereEquals("name", "O'Brien")).toBe(`"name" = 'O''Brien'`);
		});

		it("prevents SQL injection in column name", () => {
			expect(buildWhereEquals('"; DROP TABLE users; --', "value")).toBe(
				`"""; DROP TABLE users; --" = 'value'`,
			);
		});

		it("prevents SQL injection in value", () => {
			expect(buildWhereEquals("name", "'; DROP TABLE users; --")).toBe(
				`"name" = '''; DROP TABLE users; --'`,
			);
		});
	});

	describe("buildWhereLike", () => {
		it("builds basic WHERE LIKE clause", () => {
			expect(buildWhereLike("name", "%test%")).toBe(`"name" LIKE '%test%'`);
		});

		it("escapes column names", () => {
			expect(buildWhereLike('col"name', "%value%")).toBe(
				`"col""name" LIKE '%value%'`,
			);
		});

		it("escapes patterns with quotes", () => {
			expect(buildWhereLike("name", "%O'Brien%")).toBe(
				`"name" LIKE '%O''Brien%'`,
			);
		});

		it("prevents SQL injection", () => {
			expect(buildWhereLike("name", "'; DROP TABLE users; --%")).toBe(
				`"name" LIKE '''; DROP TABLE users; --%'`,
			);
		});
	});

	describe("escapeLikePattern", () => {
		it("returns simple strings unchanged", () => {
			expect(escapeLikePattern("hello")).toBe("hello");
			expect(escapeLikePattern("test123")).toBe("test123");
		});

		it("escapes percent wildcard", () => {
			expect(escapeLikePattern("100%")).toBe("100\\%");
			expect(escapeLikePattern("%test%")).toBe("\\%test\\%");
		});

		it("escapes underscore wildcard", () => {
			expect(escapeLikePattern("file_name")).toBe("file\\_name");
			expect(escapeLikePattern("_test_")).toBe("\\_test\\_");
		});

		it("escapes backslashes", () => {
			expect(escapeLikePattern("path\\to\\file")).toBe("path\\\\to\\\\file");
		});

		it("escapes all special characters together", () => {
			expect(escapeLikePattern("100%_test\\path")).toBe(
				"100\\%\\_test\\\\path",
			);
		});

		it("handles empty strings", () => {
			expect(escapeLikePattern("")).toBe("");
		});
	});

	describe("real-world attack scenarios", () => {
		it("blocks classic SQL injection in database attach", () => {
			// Attacker tries to inject SQL via filename
			const maliciousFile = "x' AS x; DROP TABLE users; ATTACH 'y";
			const sql = buildAttachSQL(maliciousFile, "db");
			// The entire malicious string becomes a literal, can't break out
			// The ' characters are escaped to '' so the injection cannot execute
			expect(sql).toBe(
				`ATTACH 'x'' AS x; DROP TABLE users; ATTACH ''y' AS "db" (READ_ONLY)`,
			);
			// The string "DROP TABLE users;" appears but it's inside a quoted string literal,
			// not executable SQL. The single quotes are doubled, making it safe.
			expect(sql.startsWith("ATTACH '")).toBe(true);
			expect(sql).toContain("'' AS x"); // The quote was escaped
		});

		it("blocks union-based injection", () => {
			const maliciousValue = "' UNION SELECT * FROM passwords --";
			const sql = `SELECT * FROM users WHERE name = ${escapeStringLiteral(maliciousValue)}`;
			expect(sql).toBe(
				`SELECT * FROM users WHERE name = ''' UNION SELECT * FROM passwords --'`,
			);
		});

		it("blocks comment-based injection", () => {
			const maliciousValue = "admin'--";
			const sql = `SELECT * FROM users WHERE name = ${escapeStringLiteral(maliciousValue)}`;
			expect(sql).toBe(`SELECT * FROM users WHERE name = 'admin''--'`);
		});

		it("blocks double-encoding attacks on identifiers", () => {
			// Attacker tries to double-encode quotes
			// Input: """; DROP TABLE users; -- (3 double quotes at start)
			const maliciousIdentifier = '"""; DROP TABLE users; --';
			const escaped = escapeIdentifier(maliciousIdentifier);
			// Each " becomes "", so """ becomes """"""
			// Then wrapped in outer "": """""""; DROP TABLE users; --"
			expect(escaped).toBe('"""""""; DROP TABLE users; --"');
		});

		it("handles realistic filenames with quotes", () => {
			// Real file: user's "data" report.csv
			const filename = `user's "data" report.csv`;
			const sql = buildSelectFromFile(filename);
			expect(sql).toBe(`SELECT * FROM 'user''s "data" report.csv'`);
		});

		it("handles database aliases derived from filenames", () => {
			// Filename: my-project's data (2024).duckdb
			// After generateDatabaseAlias: my_project_s_data__2024_
			const alias = "my_project_s_data__2024_";
			const sql = buildAttachSQL("my-project's data (2024).duckdb", alias);
			expect(sql).toBe(
				`ATTACH 'my-project''s data (2024).duckdb' AS "my_project_s_data__2024_" (READ_ONLY)`,
			);
		});
	});

	describe("edge cases", () => {
		it("handles very long strings", () => {
			const longString = "a".repeat(10000);
			expect(escapeStringLiteral(longString)).toBe(`'${longString}'`);
		});

		it("handles strings with only special characters", () => {
			expect(escapeStringLiteral("'''")).toBe("''''''''");
			expect(escapeIdentifier('"""')).toBe('""""""""');
		});

		it("handles null bytes (should be preserved)", () => {
			const withNull = "before\0after";
			expect(escapeStringLiteral(withNull)).toBe(`'before\0after'`);
		});

		it("handles CRLF line endings", () => {
			const withCRLF = "line1\r\nline2";
			expect(escapeStringLiteral(withCRLF)).toBe(`'line1\r\nline2'`);
		});
	});
});
