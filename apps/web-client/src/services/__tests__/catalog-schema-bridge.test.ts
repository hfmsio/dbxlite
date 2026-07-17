import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
	CatalogInfo,
	ColumnInfo,
	TableMetadata,
} from "../../../../../packages/connectors/src/base";
import {
	__resetCatalogBridgeForTests,
	clearProviderState,
	getCatalogProviderSchemas,
	notifyCatalogsLoaded,
	notifyColumnsLoaded,
	notifyTablesLoaded,
	registerCatalogProvider,
	resetProviderData,
	subscribeToBridge,
} from "../catalog-schema-bridge";

const catalog = (id: string, name = id): CatalogInfo => ({
	id,
	name,
	type: "database",
});

const table = (
	id: string,
	name = id,
	catalogId?: string,
	schemaId?: string,
): TableMetadata => ({
	id,
	name,
	catalog: catalogId,
	schema: schemaId,
});

const column = (name: string, type = "VARCHAR"): ColumnInfo => ({
	name,
	type,
	nullable: true,
});

describe("catalog-schema-bridge", () => {
	beforeEach(() => {
		__resetCatalogBridgeForTests();
	});

	test("empty state produces empty snapshot", () => {
		const snap = getCatalogProviderSchemas();
		expect(snap.topLevelSources).toEqual([]);
		expect(snap.tables).toEqual([]);
	});

	test("notifyCatalogsLoaded surfaces top-level sources", () => {
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			catalog("DEV"),
			catalog("SNOWFLAKE_SAMPLE_DATA"),
		]);
		const snap = getCatalogProviderSchemas();
		expect(snap.topLevelSources.map((s) => s.name)).toEqual([
			"DEV",
			"SNOWFLAKE_SAMPLE_DATA",
		]);
		expect(snap.topLevelSources[0].sourceType).toBe("snowflake");
	});

	test("notifyTablesLoaded appears in snapshot with database+schema fields", () => {
		registerCatalogProvider("snowflake", "snowflake");
		notifyTablesLoaded("snowflake", "SNOWFLAKE_SAMPLE_DATA", "TPCH_SF1", [
			table("CUSTOMER", "CUSTOMER", "SNOWFLAKE_SAMPLE_DATA", "TPCH_SF1"),
			table("ORDERS", "ORDERS", "SNOWFLAKE_SAMPLE_DATA", "TPCH_SF1"),
		]);
		const snap = getCatalogProviderSchemas();
		expect(snap.tables.length).toBe(2);
		expect(snap.tables[0]).toEqual({
			name: "CUSTOMER",
			columns: [],
			databaseName: "SNOWFLAKE_SAMPLE_DATA",
			schemaName: "TPCH_SF1",
			sourceType: "snowflake",
		});
		expect(snap.tables[1].name).toBe("ORDERS");
	});

	test("notifyColumnsLoaded populates columns for the matching table", () => {
		registerCatalogProvider("snowflake", "snowflake");
		notifyTablesLoaded("snowflake", "SNOWFLAKE_SAMPLE_DATA", "TPCH_SF1", [
			table("CUSTOMER", "CUSTOMER"),
		]);
		// At this point columns are empty
		expect(getCatalogProviderSchemas().tables[0].columns).toEqual([]);

		notifyColumnsLoaded(
			"snowflake",
			"SNOWFLAKE_SAMPLE_DATA",
			"TPCH_SF1",
			"CUSTOMER",
			[
				column("C_CUSTKEY", "NUMBER"),
				column("C_NAME", "VARCHAR"),
				column("C_ADDRESS", "VARCHAR"),
			],
		);
		const snap = getCatalogProviderSchemas();
		expect(snap.tables[0].columns).toEqual([
			"C_CUSTKEY",
			"C_NAME",
			"C_ADDRESS",
		]);
	});

	test("multiple providers do not cross-pollinate", () => {
		registerCatalogProvider("snowflake", "snowflake");
		registerCatalogProvider("bigquery", "bigquery");

		notifyCatalogsLoaded("snowflake", [catalog("DEV")]);
		notifyCatalogsLoaded("bigquery", [catalog("my-project")]);

		notifyTablesLoaded("snowflake", "DEV", "PUBLIC", [
			table("orders", "orders"),
		]);
		notifyTablesLoaded("bigquery", "my-project", "analytics", [
			table("events", "events"),
		]);

		const snap = getCatalogProviderSchemas();
		const sfTable = snap.tables.find((t) => t.name === "orders");
		const bqTable = snap.tables.find((t) => t.name === "events");
		expect(sfTable?.sourceType).toBe("snowflake");
		expect(bqTable?.sourceType).toBe("bigquery");
		expect(snap.topLevelSources.find((s) => s.name === "DEV")?.sourceType).toBe(
			"snowflake",
		);
		expect(
			snap.topLevelSources.find((s) => s.name === "my-project")?.sourceType,
		).toBe("bigquery");
	});

	test("clearProviderState removes everything for one provider only", () => {
		registerCatalogProvider("snowflake", "snowflake");
		registerCatalogProvider("bigquery", "bigquery");
		notifyTablesLoaded("snowflake", "DEV", "PUBLIC", [table("foo", "foo")]);
		notifyTablesLoaded("bigquery", "proj", "ds", [table("bar", "bar")]);

		clearProviderState("snowflake");

		const snap = getCatalogProviderSchemas();
		expect(snap.tables.find((t) => t.name === "foo")).toBeUndefined();
		expect(snap.tables.find((t) => t.name === "bar")).toBeDefined();
	});

	test("resetProviderData drops loaded data but keeps registration", () => {
		// The refresh path: provider is still connected, so its sourceType
		// must survive and later notifies must not fall back to "snowflake".
		registerCatalogProvider("bigquery", "bigquery");
		notifyCatalogsLoaded("bigquery", [catalog("proj")]);
		notifyTablesLoaded("bigquery", "proj", "ds", [table("old", "old")]);
		notifyColumnsLoaded("bigquery", "proj", "ds", "old", [column("c1")]);

		resetProviderData("bigquery");

		const empty = getCatalogProviderSchemas();
		expect(empty.tables).toEqual([]);
		expect(empty.topLevelSources).toEqual([]);

		// Registration survived: data loaded after the reset is still tagged
		// bigquery rather than the defensive snowflake default.
		notifyTablesLoaded("bigquery", "proj", "ds", [table("fresh", "fresh")]);
		const snap = getCatalogProviderSchemas();
		expect(snap.tables.map((t) => t.name)).toEqual(["fresh"]);
		expect(snap.tables[0].sourceType).toBe("bigquery");
	});

	test("resetProviderData touches only the named provider", () => {
		registerCatalogProvider("snowflake", "snowflake");
		registerCatalogProvider("bigquery", "bigquery");
		notifyTablesLoaded("snowflake", "DEV", "PUBLIC", [table("keep", "keep")]);
		notifyTablesLoaded("bigquery", "proj", "ds", [table("drop", "drop")]);

		resetProviderData("bigquery");

		const snap = getCatalogProviderSchemas();
		expect(snap.tables.map((t) => t.name)).toEqual(["keep"]);
	});

	test("resetProviderData on an unknown provider is a no-op", () => {
		expect(() => resetProviderData("never-registered")).not.toThrow();
		expect(getCatalogProviderSchemas().tables).toEqual([]);
	});

	test("subscribe receives a callback on each mutation, unsubscribe stops it", () => {
		const cb = vi.fn();
		const unsubscribe = subscribeToBridge(cb);

		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [catalog("X")]);
		notifyTablesLoaded("snowflake", "X", "S", [table("t1", "t1")]);
		notifyColumnsLoaded("snowflake", "X", "S", "t1", [column("c1")]);
		expect(cb).toHaveBeenCalledTimes(3); // catalogs, tables, columns

		unsubscribe();
		notifyTablesLoaded("snowflake", "X", "S", [table("t2", "t2")]);
		// Still 3; subscriber detached.
		expect(cb).toHaveBeenCalledTimes(3);
	});

	test("notify without prior register still works (defensive fallback)", () => {
		// Don't call registerCatalogProvider first.
		notifyTablesLoaded("unregistered", "DB", "S", [table("t", "t")]);
		const snap = getCatalogProviderSchemas();
		expect(snap.tables.length).toBe(1);
		// Defaults to snowflake sourceType per the bridge's fallback.
		expect(snap.tables[0].sourceType).toBe("snowflake");
	});

	test("re-registering a provider updates its sourceType", () => {
		registerCatalogProvider("test", "snowflake");
		notifyCatalogsLoaded("test", [catalog("A")]);
		expect(
			getCatalogProviderSchemas().topLevelSources[0].sourceType,
		).toBe("snowflake");

		registerCatalogProvider("test", "bigquery");
		// State preserved, sourceType swapped
		expect(
			getCatalogProviderSchemas().topLevelSources[0].sourceType,
		).toBe("bigquery");
	});
});
