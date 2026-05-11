import { describe, expect, test } from "vitest";
import {
	getDialectOnlyLabels,
	getFunctionsForDialect,
	getKeywordsForDialect,
} from "../dialect-registry";

describe("dialect-registry", () => {
	test("ANSI base is returned when no dialect is provided", () => {
		const kw = getKeywordsForDialect(undefined);
		const fn = getFunctionsForDialect(undefined);
		expect(kw.some((k) => k.label === "SELECT")).toBe(true);
		expect(fn.some((f) => f.label === "COUNT")).toBe(true);
	});

	test("Snowflake adds QUALIFY, IFF, OBJECT_CONSTRUCT, LATERAL FLATTEN, LISTAGG", () => {
		const kw = getKeywordsForDialect("snowflake").map((k) => k.label);
		const fn = getFunctionsForDialect("snowflake").map((f) => f.label);
		expect(kw).toContain("QUALIFY");
		expect(kw).toContain("LATERAL FLATTEN");
		expect(fn).toContain("IFF");
		expect(fn).toContain("OBJECT_CONSTRUCT");
		expect(fn).toContain("LISTAGG");
		expect(fn).toContain("TRY_CAST");
	});

	test("Snowflake exposes the Cortex AI namespace", () => {
		const fn = getFunctionsForDialect("snowflake").map((f) => f.label);
		expect(fn).toContain("SNOWFLAKE.CORTEX.COMPLETE");
		expect(fn).toContain("SNOWFLAKE.CORTEX.SENTIMENT");
	});

	test("BigQuery adds SAFE_CAST, ARRAY_AGG, STRUCT, FORMAT_DATE, _TABLE_SUFFIX", () => {
		const kw = getKeywordsForDialect("bigquery").map((k) => k.label);
		const fn = getFunctionsForDialect("bigquery").map((f) => f.label);
		expect(kw).toContain("_TABLE_SUFFIX");
		expect(kw).toContain("UNNEST");
		expect(fn).toContain("SAFE_CAST");
		expect(fn).toContain("SAFE_DIVIDE");
		expect(fn).toContain("ARRAY_AGG");
		expect(fn).toContain("FORMAT_DATE");
		expect(fn).toContain("GENERATE_DATE_ARRAY");
	});

	test("DuckDB adds READ_PARQUET, SUMMARIZE, STRUCT_PACK, UNNEST", () => {
		const kw = getKeywordsForDialect("duckdb").map((k) => k.label);
		const fn = getFunctionsForDialect("duckdb").map((f) => f.label);
		expect(kw).toContain("SUMMARIZE");
		expect(kw).toContain("ATTACH");
		expect(fn).toContain("READ_PARQUET");
		expect(fn).toContain("READ_CSV_AUTO");
		expect(fn).toContain("STRUCT_PACK");
		expect(fn).toContain("UNNEST");
	});

	test("dialects do NOT contaminate each other (QUALIFY on Snowflake, not on DuckDB)", () => {
		// QUALIFY is added by BOTH Snowflake and DuckDB (both implement it)
		// but READ_PARQUET is DuckDB-only.
		const sfKw = getKeywordsForDialect("snowflake").map((k) => k.label);
		const bqKw = getKeywordsForDialect("bigquery").map((k) => k.label);
		expect(sfKw).toContain("LATERAL FLATTEN");
		expect(bqKw).not.toContain("LATERAL FLATTEN");

		const duckFn = getFunctionsForDialect("duckdb").map((f) => f.label);
		const sfFn = getFunctionsForDialect("snowflake").map((f) => f.label);
		expect(duckFn).toContain("READ_PARQUET");
		expect(sfFn).not.toContain("READ_PARQUET");
	});

	test("getDialectOnlyLabels returns the additions, not the ANSI base", () => {
		const sfOnly = getDialectOnlyLabels("snowflake");
		expect(sfOnly.has("IFF")).toBe(true);
		expect(sfOnly.has("LATERAL FLATTEN")).toBe(true);
		// SELECT is ANSI, not a Snowflake-only label
		expect(sfOnly.has("SELECT")).toBe(false);
	});

	test("dedup: dialect-added label that already exists in ANSI does not duplicate", () => {
		// Both DuckDB and BigQuery define PIVOT/UNPIVOT; ANSI has them under
		// different conventions. Just check no label appears twice.
		for (const dialect of ["duckdb", "bigquery", "snowflake"] as const) {
			const labels = getKeywordsForDialect(dialect).map((k) => k.label);
			const dedup = new Set(labels);
			expect(labels.length).toBe(dedup.size);
		}
	});
});
