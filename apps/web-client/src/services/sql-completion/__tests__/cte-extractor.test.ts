import { describe, expect, test } from "vitest";
import { parseCTENames } from "../cte-extractor";

describe("parseCTENames", () => {
	test("returns empty set for query without WITH", () => {
		expect(parseCTENames("SELECT * FROM users")).toEqual(new Set());
	});

	test("extracts a single CTE name", () => {
		const result = parseCTENames(
			"WITH recent AS (SELECT * FROM users WHERE created_at > NOW()) SELECT * FROM recent",
		);
		expect(result).toEqual(new Set(["recent"]));
	});

	test("extracts multiple CTE names from a flat WITH clause", () => {
		const result = parseCTENames(
			"WITH a AS (1), b AS (2), c AS (3) SELECT * FROM a, b, c",
		);
		expect(result).toEqual(new Set(["a", "b", "c"]));
	});

	test("handles RECURSIVE keyword", () => {
		const result = parseCTENames(
			"WITH RECURSIVE counter AS (SELECT 1) SELECT * FROM counter",
		);
		expect(result).toEqual(new Set(["counter"]));
	});

	test("is case-insensitive on the WITH keyword", () => {
		const result = parseCTENames(
			"with my_cte as (select 1) select * from my_cte",
		);
		expect(result).toEqual(new Set(["my_cte"]));
	});

	test("does not include SQL keywords that pattern-match the regex", () => {
		// The implementation explicitly skips SELECT, INSERT, etc. as CTE names
		// even if they would otherwise match. Defensive sanity check.
		const result = parseCTENames("WITH SELECT AS (1) SELECT * FROM SELECT");
		expect(result.has("SELECT")).toBe(false);
	});

	test("captures a CTE whose body has a nested SELECT (multiline)", () => {
		const sql = `
			WITH
				monthly_revenue AS (
					SELECT month, SUM(amount) AS total
					FROM sales
					GROUP BY month
				)
			SELECT * FROM monthly_revenue
		`;
		// The paren-depth walker reaches the top-level close paren regardless
		// of the SELECT inside the body — the case the old lazy regex missed.
		expect(parseCTENames(sql)).toEqual(new Set(["monthly_revenue"]));
	});

	test("captures multiple CTEs even when each body contains a SELECT", () => {
		// The exact bug: the old regex stopped at the first inner SELECT and
		// dropped `b`. The walker gets both.
		const result = parseCTENames(
			"WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a JOIN b",
		);
		expect(result).toEqual(new Set(["a", "b"]));
	});

	test("recognises a CTE name while its body is still being typed", () => {
		// Autocomplete wants `a` the moment it's declared, before the body or
		// the closing SELECT exist.
		expect(parseCTENames("WITH a AS (")).toEqual(new Set(["a"]));
	});

	test("extracts all CTE names with RECURSIVE alongside multiple CTEs", () => {
		const result = parseCTENames(
			"WITH RECURSIVE n AS (SELECT 1), m AS (SELECT 2) SELECT * FROM n, m",
		);
		expect(result).toEqual(new Set(["n", "m"]));
	});

	test("handles UPDATE/INSERT/DELETE as terminators", () => {
		const result = parseCTENames(
			"WITH staging AS (1) INSERT INTO target SELECT * FROM staging",
		);
		expect(result.has("staging")).toBe(true);
	});
});
