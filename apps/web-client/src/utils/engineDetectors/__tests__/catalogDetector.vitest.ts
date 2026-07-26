/**
 * Tests for catalog-aware DuckDB detection — the fix for a bare db.schema.table
 * (e.g. hits.main.hits100k) being sent to a still-active BigQuery connector.
 */
import { describe, expect, it } from "vitest";
import type { DataSource } from "../../../types/data-source";
import { duckdbCatalogNames, referencesKnownDuckDB } from "../catalogDetector";

const duckdbDatabase = (attachedAs: string, tables: string[]): DataSource =>
	({
		id: attachedAs,
		name: attachedAs,
		type: "duckdb",
		attachedAs,
		schemas: [
			{ name: "main", tables: tables.map((t) => ({ name: t, columns: [] })) },
		],
	}) as unknown as DataSource;

const fileSource = (name: string, tableName?: string): DataSource =>
	({ id: name, name, type: "parquet", tableName }) as unknown as DataSource;

const bigqueryConnection = (): DataSource =>
	({ id: "bq", name: "BigQuery", type: "connection" }) as unknown as DataSource;

describe("duckdbCatalogNames", () => {
	it("collects database, schema and table names from a DuckDB source", () => {
		const names = duckdbCatalogNames([duckdbDatabase("hits", ["hits100k"])]);
		expect(names.has("hits")).toBe(true);
		expect(names.has("main")).toBe(true);
		expect(names.has("hits100k")).toBe(true);
	});

	it("collects the virtual table name from a file source", () => {
		const names = duckdbCatalogNames([fileSource("sales.parquet", "sales")]);
		expect(names.has("sales")).toBe(true);
	});

	it("ignores cloud connections", () => {
		expect(duckdbCatalogNames([bigqueryConnection()]).size).toBe(0);
	});

	it("lowercases names for case-insensitive matching", () => {
		const names = duckdbCatalogNames([duckdbDatabase("Hits", ["Hits100K"])]);
		expect(names.has("hits")).toBe(true);
		expect(names.has("hits100k")).toBe(true);
	});
});

describe("referencesKnownDuckDB", () => {
	const names = duckdbCatalogNames([duckdbDatabase("hits", ["hits100k"])]);

	it("matches a bare database.schema.table on the leading qualifier", () => {
		// The exact failing query.
		expect(
			referencesKnownDuckDB("SELECT * FROM hits.main.hits100k;", names),
		).toBe(true);
	});

	it("matches an unqualified known table name", () => {
		expect(referencesKnownDuckDB("SELECT * FROM hits100k", names)).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(
			referencesKnownDuckDB("SELECT * FROM HITS.MAIN.HITS100K", names),
		).toBe(true);
	});

	it("matches a JOIN target too", () => {
		expect(
			referencesKnownDuckDB(
				"SELECT * FROM t JOIN hits.main.hits100k USING (id)",
				names,
			),
		).toBe(true);
	});

	it("does not match an unrelated BigQuery table", () => {
		expect(referencesKnownDuckDB("SELECT * FROM myproj.ds.orders", names)).toBe(
			false,
		);
	});

	it("ignores a match inside a comment", () => {
		expect(
			referencesKnownDuckDB("SELECT 1 -- FROM hits.main.hits100k", names),
		).toBe(false);
	});

	it("returns false when nothing is attached", () => {
		expect(
			referencesKnownDuckDB("SELECT * FROM hits.main.hits100k", new Set()),
		).toBe(false);
	});
});
