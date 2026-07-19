/**
 * Provider integration tests.
 *
 * Exercises `createCompletionProvider(...)` end-to-end with stubbed Monaco
 * primitives so we can assert on the suggestions array. The pure helpers
 * (alias resolver, context detector, dialect registry, ranking) each have
 * their own unit tests. This file covers the closure that assembles them:
 *
 *   - the mode gate (off / lite / full)
 *   - the dialect dispatch into getContextualCompletions
 *   - the dot-completion path that only fires in `full`
 *   - schema-derived suggestions (top-level sources, columns)
 *   - the rank wrapper that emits sortText for Monaco
 *
 * Monaco's actual types are not required at runtime; we duck-type the
 * minimal shape the provider reads.
 */

import { afterEach, describe, expect, test } from "vitest";
import type { DataSource } from "../../../types/data-source";
import {
	__resetCatalogBridgeForTests,
	notifyCatalogsLoaded,
	notifyColumnsLoaded,
	notifyTablesLoaded,
	registerCatalogProvider,
} from "../../catalog-schema-bridge";
import { createCompletionProvider } from "../provider";

// ---------------------------------------------------------------------
// Fake Monaco / model primitives
// ---------------------------------------------------------------------

// Monaco's CompletionItemKind enum values that the provider emits. We
// only need the numeric values; the full enum is not imported here so
// the test stays Monaco-free.
const fakeMonaco = {
	languages: {
		CompletionItemKind: {
			Function: 1,
			Field: 4,
			Class: 5,
			Keyword: 14,
			Module: 18,
			Snippet: 27,
		},
	},
} as unknown as typeof import("monaco-editor");

interface FakeModelOpts {
	/** Full SQL text. Cursor is at the very end unless `cursorOffset` is set. */
	text: string;
	/** 0-based offset from the start of `text` where the cursor sits. */
	cursorOffset?: number;
}

function makeFakeModel(opts: FakeModelOpts) {
	const text = opts.text;
	const cursorOffset = opts.cursorOffset ?? text.length;
	const upToCursor = text.slice(0, cursorOffset);

	// Compute lineNumber / column (Monaco is 1-based) from cursorOffset.
	const linesBefore = upToCursor.split("\n");
	const lineNumber = linesBefore.length;
	const column = linesBefore[linesBefore.length - 1].length + 1;
	const lineContent = text.split("\n")[lineNumber - 1] ?? "";

	// Extract the "current word" Monaco-style: walk left from the cursor
	// while characters are word-like (\w).
	let wordStartColumn = column;
	for (let i = column - 1; i >= 1; i--) {
		const ch = lineContent.charAt(i - 1);
		if (/\w/.test(ch)) wordStartColumn = i;
		else break;
	}
	const word = lineContent.slice(wordStartColumn - 1, column - 1);

	return {
		getWordUntilPosition: () => ({
			word,
			startColumn: wordStartColumn,
			endColumn: column,
		}),
		getValueInRange: () => upToCursor,
		getValue: () => text,
		getLineContent: () => lineContent,
		__position: { lineNumber, column },
	};
}

function makeFakePosition(model: ReturnType<typeof makeFakeModel>) {
	return model.__position;
}

const fakeContext = {
	triggerKind: 0,
	triggerCharacter: undefined as string | undefined,
};

function dotContext() {
	return { triggerKind: 0, triggerCharacter: "." };
}

// ---------------------------------------------------------------------
// Data-source factories
// ---------------------------------------------------------------------

function fileDataSource(name: string, columns: string[]): DataSource {
	return {
		id: `ds-${name}`,
		name,
		type: "file",
		uploadedAt: new Date("2026-01-01T00:00:00Z"),
		columns: columns.map((c) => ({ name: c, type: "VARCHAR", nullable: true })),
	};
}

// ---------------------------------------------------------------------
// Provider factory helpers
// ---------------------------------------------------------------------

function makeProvider(opts: {
	mode: "off" | "lite" | "full";
	dataSources?: DataSource[];
	dialect?: "duckdb" | "bigquery" | "snowflake";
}) {
	return createCompletionProvider({
		getMode: () => opts.mode,
		getDataSources: () => opts.dataSources ?? [],
		getDialect: () => opts.dialect,
		monaco: fakeMonaco,
	});
}

// `provideCompletionItems` returns CompletionList or CompletionItem[] in
// Monaco's typings; in our code it always returns { suggestions: [...] }.
// Helper to assert that and return the array.
async function getSuggestions(
	provider: ReturnType<typeof createCompletionProvider>,
	model: ReturnType<typeof makeFakeModel>,
) {
	const result = await provider.provideCompletionItems!(
		model as unknown as Parameters<
			NonNullable<typeof provider.provideCompletionItems>
		>[0],
		makeFakePosition(model) as unknown as Parameters<
			NonNullable<typeof provider.provideCompletionItems>
		>[1],
		fakeContext as unknown as Parameters<
			NonNullable<typeof provider.provideCompletionItems>
		>[2],
		{} as unknown as Parameters<
			NonNullable<typeof provider.provideCompletionItems>
		>[3],
	);
	if (!result || Array.isArray(result)) return [];
	return result.suggestions ?? [];
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe("provider — mode gate", () => {
	test("'off' returns no suggestions regardless of context", async () => {
		const provider = makeProvider({
			mode: "off",
			dataSources: [fileDataSource("orders", ["id", "total"])],
			dialect: "duckdb",
		});
		const model = makeFakeModel({ text: "SELECT " });
		const suggestions = await getSuggestions(provider, model);
		expect(suggestions).toEqual([]);
	});

	test("'lite' returns dialect-scoped keyword/function suggestions", async () => {
		const provider = makeProvider({
			mode: "lite",
			dataSources: [],
			dialect: "snowflake",
		});
		const model = makeFakeModel({ text: "QUAL" });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("QUALIFY");
	});

	test("'full' returns the same dialect suggestions PLUS deeper integrations", async () => {
		const provider = makeProvider({
			mode: "full",
			dataSources: [fileDataSource("orders", ["id"])],
			dialect: "snowflake",
		});
		const model = makeFakeModel({ text: "QUAL" });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("QUALIFY");
	});
});

describe("provider — dialect dispatch", () => {
	test("Snowflake dialect surfaces IFF, LATERAL FLATTEN, LISTAGG", async () => {
		const provider = makeProvider({
			mode: "full",
			dialect: "snowflake",
		});
		const model = makeFakeModel({ text: "" });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("IFF");
		expect(labels).toContain("LATERAL FLATTEN");
		expect(labels).toContain("LISTAGG");
		// And does NOT contain BigQuery-only labels
		expect(labels).not.toContain("SAFE_DIVIDE");
	});

	test("BigQuery dialect surfaces SAFE_CAST, _TABLE_SUFFIX, FORMAT_DATE", async () => {
		const provider = makeProvider({
			mode: "full",
			dialect: "bigquery",
		});
		const model = makeFakeModel({ text: "" });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("SAFE_CAST");
		expect(labels).toContain("_TABLE_SUFFIX");
		expect(labels).toContain("FORMAT_DATE");
		// And does NOT contain Snowflake-only labels
		expect(labels).not.toContain("IFF");
		expect(labels).not.toContain("LATERAL FLATTEN");
	});

	test("DuckDB dialect surfaces READ_PARQUET, SUMMARIZE, STRUCT_PACK", async () => {
		const provider = makeProvider({
			mode: "full",
			dialect: "duckdb",
		});
		const model = makeFakeModel({ text: "" });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("READ_PARQUET");
		expect(labels).toContain("SUMMARIZE");
		expect(labels).toContain("STRUCT_PACK");
		// And does NOT contain Snowflake or BigQuery-only labels
		expect(labels).not.toContain("LATERAL FLATTEN");
		expect(labels).not.toContain("SAFE_DIVIDE");
	});
});

describe("provider — dot completion (full mode only)", () => {
	test("'full' resolves alias-dot to columns when schema has the table", async () => {
		const provider = makeProvider({
			mode: "full",
			dataSources: [fileDataSource("orders", ["order_id", "customer_id", "total"])],
			dialect: "duckdb",
		});
		const model = makeFakeModel({
			text: "SELECT * FROM orders o WHERE o.",
		});
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("order_id");
		expect(labels).toContain("customer_id");
		expect(labels).toContain("total");
	});

	test("'lite' suppresses alias-dot completion (no columns when typing x.)", async () => {
		const provider = makeProvider({
			mode: "lite",
			dataSources: [fileDataSource("orders", ["order_id", "customer_id"])],
			dialect: "duckdb",
		});
		const model = makeFakeModel({
			text: "SELECT * FROM orders o WHERE o.",
		});
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		// Lite skips dot resolution. Column names should NOT appear.
		expect(labels).not.toContain("order_id");
		expect(labels).not.toContain("customer_id");
	});
});

describe("provider — file-path quoting in insertText", () => {
	test("file-sourced top-level suggestion is single-quoted in insertText", async () => {
		const provider = makeProvider({
			mode: "full",
			dataSources: [fileDataSource("export-foo.parquet", ["id"])],
			dialect: "duckdb",
		});
		// Trigger the 'all' / FROM-suggestion path: provider fires on an empty
		// statement and includes top-level sources.
		const model = makeFakeModel({ text: "" });
		const suggestions = await getSuggestions(provider, model);
		const fileSuggestion = suggestions.find(
			(s) => s.label === "export-foo.parquet",
		);
		expect(fileSuggestion).toBeDefined();
		// insertText should be single-quoted so DuckDB accepts the hyphen.
		expect(fileSuggestion?.insertText).toBe("'export-foo.parquet'");
	});
});

describe("provider — Snowflake catalog bridge", () => {
	afterEach(() => __resetCatalogBridgeForTests());

	test("alias-dot resolves columns sourced from the catalog bridge (Snowflake)", async () => {
		// Simulate the explorer having loaded CUSTOMER's tables + columns
		// for SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "SNOWFLAKE_SAMPLE_DATA", name: "SNOWFLAKE_SAMPLE_DATA", type: "database" },
		]);
		notifyTablesLoaded("snowflake", "SNOWFLAKE_SAMPLE_DATA", "TPCH_SF1", [
			{
				id: "CUSTOMER",
				name: "CUSTOMER",
				catalog: "SNOWFLAKE_SAMPLE_DATA",
				schema: "TPCH_SF1",
			},
		]);
		notifyColumnsLoaded(
			"snowflake",
			"SNOWFLAKE_SAMPLE_DATA",
			"TPCH_SF1",
			"CUSTOMER",
			[
				{ name: "C_CUSTKEY", type: "NUMBER" },
				{ name: "C_NAME", type: "VARCHAR" },
				{ name: "C_MKTSEGMENT", type: "VARCHAR" },
			],
		);

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "snowflake",
		});
		const model = makeFakeModel({
			text:
				"SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER c WHERE c.",
		});
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("C_CUSTKEY");
		expect(labels).toContain("C_NAME");
		expect(labels).toContain("C_MKTSEGMENT");
	});

	test("resolves an alias defined in FROM even when the cursor is back in SELECT", async () => {
		// `SELECT a.| FROM salesops.main.accounts AS a` — the alias `a` is
		// defined after the cursor, so parsing only text-before-cursor would
		// miss it. Parsing the whole query resolves it.
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "SALESOPS", name: "SALESOPS", type: "database" },
		]);
		notifyTablesLoaded("snowflake", "SALESOPS", "MAIN", [
			{ id: "ACCOUNTS", name: "ACCOUNTS", catalog: "SALESOPS", schema: "MAIN" },
		]);
		notifyColumnsLoaded("snowflake", "SALESOPS", "MAIN", "ACCOUNTS", [
			{ name: "ACCOUNT_ID", type: "NUMBER" },
			{ name: "NAME", type: "VARCHAR" },
		]);

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "snowflake",
		});
		const text = "SELECT a. FROM SALESOPS.MAIN.ACCOUNTS AS a";
		const model = makeFakeModel({
			text,
			// Cursor immediately after `SELECT a.`
			cursorOffset: "SELECT a.".length,
		});
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("ACCOUNT_ID");
		expect(labels).toContain("NAME");
	});

	test("Snowflake column insertText: uppercase bare, mixed-case double-quoted", async () => {
		// Snowflake folds unquoted identifiers to uppercase, so an all-uppercase
		// column resolves bare while a mixed-case one (created as a quoted
		// identifier) must be double-quoted to match its stored form.
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "DEV", name: "DEV", type: "database" },
		]);
		notifyTablesLoaded("snowflake", "DEV", "PUBLIC", [
			{ id: "EVENTS", name: "EVENTS", catalog: "DEV", schema: "PUBLIC" },
		]);
		notifyColumnsLoaded("snowflake", "DEV", "PUBLIC", "EVENTS", [
			{ name: "EVENT_ID", type: "NUMBER" },
			{ name: "userName", type: "VARCHAR" },
		]);

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "snowflake",
		});
		const model = makeFakeModel({
			text: "SELECT * FROM DEV.PUBLIC.EVENTS e WHERE e.",
		});
		const suggestions = await getSuggestions(provider, model);
		const byLabel = (l: string) => suggestions.find((s) => s.label === l);

		expect(byLabel("EVENT_ID")?.insertText).toBe("EVENT_ID");
		expect(byLabel("userName")?.insertText).toBe('"userName"');
	});

	test("table list arrives before columns: tables appear with empty columns", async () => {
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "DEV", name: "DEV", type: "database" },
		]);
		notifyTablesLoaded("snowflake", "DEV", "PUBLIC", [
			{ id: "ORDERS", name: "ORDERS", catalog: "DEV", schema: "PUBLIC" },
		]);
		// User has not yet expanded ORDERS, so no columns.

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "snowflake",
		});
		// Type `DEV.PUBLIC.` to enumerate tables in that schema.
		const model = makeFakeModel({ text: "SELECT * FROM DEV.PUBLIC." });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("ORDERS");
	});

	test("DuckDB mode does NOT surface Snowflake bridge tables (can't run them)", async () => {
		// The bridge holds a Snowflake table, but the active connector is DuckDB.
		// Suggesting it would let the user build a query DuckDB can't run.
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "SALESOPS", name: "SALESOPS", type: "database" },
		]);
		notifyTablesLoaded("snowflake", "SALESOPS", "RAW", [
			{ id: "RYAN_CLASSIFIED", name: "RYAN_CLASSIFIED", catalog: "SALESOPS", schema: "RAW" },
		]);

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "duckdb",
		});
		const model = makeFakeModel({ text: "SELECT * FROM " });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).not.toContain("SALESOPS");
		expect(labels).not.toContain("RYAN_CLASSIFIED");
	});

	test("top-level Snowflake databases appear in FROM context", async () => {
		registerCatalogProvider("snowflake", "snowflake");
		notifyCatalogsLoaded("snowflake", [
			{ id: "DEV", name: "DEV", type: "database" },
			{ id: "SNOWFLAKE_SAMPLE_DATA", name: "SNOWFLAKE_SAMPLE_DATA", type: "database" },
		]);

		const provider = makeProvider({
			mode: "full",
			dataSources: [],
			dialect: "snowflake",
		});
		const model = makeFakeModel({ text: "SELECT * FROM " });
		const suggestions = await getSuggestions(provider, model);
		const labels = suggestions.map((s) => s.label);
		expect(labels).toContain("DEV");
		expect(labels).toContain("SNOWFLAKE_SAMPLE_DATA");
	});
});

describe("provider — ranking and sortText", () => {
	test("returned suggestions carry sortText for Monaco's order", async () => {
		const provider = makeProvider({
			mode: "full",
			dialect: "duckdb",
		});
		const model = makeFakeModel({ text: "" });
		const suggestions = await getSuggestions(provider, model);
		// Every suggestion (when non-empty) gets a sortText from applyRanking.
		expect(suggestions.length).toBeGreaterThan(0);
		for (const s of suggestions) {
			expect(typeof (s as unknown as { sortText: string }).sortText).toBe(
				"string",
			);
		}
	});
});
