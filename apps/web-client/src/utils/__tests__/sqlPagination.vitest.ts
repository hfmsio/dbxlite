import { describe, expect, it } from "vitest";
import {
	getStatementKeyword,
	getTrailingLimit,
	isPaginatableStatement,
} from "../sqlPagination";

describe("getTrailingLimit", () => {
	it("matches a LIMIT that ends the statement", () => {
		expect(getTrailingLimit("SELECT * FROM t LIMIT 100")).toBe(100);
		expect(getTrailingLimit("SELECT * FROM t LIMIT 100;")).toBe(100);
		expect(getTrailingLimit("SELECT * FROM t limit 5 ;  ")).toBe(5);
	});

	it("does NOT match a LIMIT inside a subquery or CTE", () => {
		// This exact mismatch (service matched anywhere, hook matched trailing)
		// made every page of such queries return the full result set.
		expect(
			getTrailingLimit("SELECT * FROM (SELECT * FROM t LIMIT 5) x JOIN big USING (id)"),
		).toBeUndefined();
		expect(
			getTrailingLimit("WITH a AS (SELECT 1 LIMIT 3) SELECT * FROM a, big"),
		).toBeUndefined();
	});

	it("returns undefined when there is no LIMIT", () => {
		expect(getTrailingLimit("SELECT * FROM t")).toBeUndefined();
	});
});

describe("getStatementKeyword", () => {
	it("classifies plain and comment-prefixed statements", () => {
		expect(getStatementKeyword("SELECT 1")).toBe("select");
		expect(getStatementKeyword("-- note\nSELECT 1")).toBe("select");
		expect(getStatementKeyword("/* x */ INSERT INTO t VALUES (1)")).toBe(
			"insert",
		);
		expect(getStatementKeyword("")).toBe("");
	});
});

describe("isPaginatableStatement", () => {
	it("allows plain SELECTs and WITH-SELECTs", () => {
		expect(isPaginatableStatement("SELECT * FROM t")).toBe(true);
		expect(
			isPaginatableStatement("WITH a AS (SELECT 1) SELECT * FROM a"),
		).toBe(true);
	});

	it("rejects DDL/DML and utility statements", () => {
		for (const sql of [
			"INSERT INTO t VALUES (1)",
			"UPDATE t SET a = 1",
			"DELETE FROM t",
			"CREATE TABLE x AS SELECT 1",
			"EXPLAIN SELECT 1",
			"SHOW TABLES",
			"COPY t TO 'f.csv'",
		]) {
			expect(isPaginatableStatement(sql), sql).toBe(false);
		}
	});

	it("rejects WITH-prefixed DML (the repeated-INSERT-per-page bug)", () => {
		expect(
			isPaginatableStatement(
				"WITH src AS (SELECT * FROM staging) INSERT INTO target SELECT * FROM src",
			),
		).toBe(false);
		expect(
			isPaginatableStatement(
				"WITH x AS (SELECT 1) UPDATE t SET a = 1 FROM x",
			),
		).toBe(false);
	});
});
