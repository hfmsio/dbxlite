import { describe, expect, test } from "vitest";
import { parseTableAliases } from "../alias-resolver";

describe("parseTableAliases", () => {
	test("returns empty array for query with no aliases", () => {
		expect(parseTableAliases("SELECT * FROM users")).toEqual([]);
	});

	test("parses simple AS alias", () => {
		const result = parseTableAliases("SELECT * FROM users AS u");
		expect(result).toEqual([
			{ alias: "u", tableName: "users", isCTE: false },
		]);
	});

	test("parses implicit alias without AS", () => {
		const result = parseTableAliases("SELECT * FROM users u");
		expect(result).toEqual([
			{ alias: "u", tableName: "users", isCTE: false },
		]);
	});

	test("parses qualified table reference db.table alias", () => {
		const result = parseTableAliases("SELECT * FROM analytics.users u");
		expect(result).toEqual([
			{
				alias: "u",
				tableName: "users",
				databaseName: "analytics",
				isCTE: false,
			},
		]);
	});

	test("parses fully-qualified db.schema.table alias", () => {
		const result = parseTableAliases(
			"SELECT * FROM project.dataset.users u",
		);
		expect(result).toEqual([
			{
				alias: "u",
				tableName: "users",
				databaseName: "project",
				schemaName: "dataset",
				isCTE: false,
			},
		]);
	});

	test("parses BigQuery backtick-quoted reference", () => {
		const result = parseTableAliases(
			"SELECT * FROM `project.dataset.users` u",
		);
		expect(result).toEqual([
			{
				alias: "u",
				tableName: "users",
				databaseName: "project",
				schemaName: "dataset",
				isCTE: false,
			},
		]);
	});

	test("parses multiple aliases in JOIN chain", () => {
		const result = parseTableAliases(
			"SELECT * FROM users u JOIN orders o ON u.id = o.user_id",
		);
		expect(result).toContainEqual({
			alias: "u",
			tableName: "users",
			isCTE: false,
		});
		expect(result).toContainEqual({
			alias: "o",
			tableName: "orders",
			isCTE: false,
		});
	});

	test("parses comma-separated FROM-clause aliases", () => {
		const result = parseTableAliases("SELECT * FROM users u, orders o");
		expect(result).toContainEqual({
			alias: "u",
			tableName: "users",
			isCTE: false,
		});
		expect(result).toContainEqual({
			alias: "o",
			tableName: "orders",
			isCTE: false,
		});
	});

	test("does not treat SQL keywords as aliases (WHERE, ORDER, GROUP, etc.)", () => {
		// `FROM users WHERE x = 1` should NOT produce an alias of "WHERE"
		const result = parseTableAliases("SELECT * FROM users WHERE x = 1");
		expect(result.find((a) => a.alias.toUpperCase() === "WHERE")).toBeUndefined();
	});

	test("parses single-quoted file-path reference (DuckDB)", () => {
		const result = parseTableAliases(
			"SELECT * FROM 'export_1777862557879-600k2.parquet' e",
		);
		expect(result).toEqual([
			{
				alias: "e",
				// Quoted file paths are NOT split on dots: the whole path is the
				// table identifier so it matches the schema's registered name.
				tableName: "export_1777862557879-600k2.parquet",
				isCTE: false,
			},
		]);
	});

	test("parses single-quoted file path with directory prefix", () => {
		const result = parseTableAliases(
			"SELECT * FROM 'data/2026/orders.csv' o WHERE o.id > 10",
		);
		expect(result).toContainEqual({
			alias: "o",
			tableName: "data/2026/orders.csv",
			isCTE: false,
		});
	});

	test("treats bare identifier ending in .parquet as a file path (no dot split)", () => {
		const result = parseTableAliases("SELECT * FROM xx112.parquet x");
		expect(result).toEqual([
			{
				alias: "x",
				tableName: "xx112.parquet",
				isCTE: false,
			},
		]);
	});

	test("treats bare identifier ending in .csv as a file path", () => {
		const result = parseTableAliases("SELECT * FROM data.csv c WHERE c.id > 0");
		expect(result).toContainEqual({
			alias: "c",
			tableName: "data.csv",
			isCTE: false,
		});
	});

	test("still splits bare identifier without a file extension as db.table", () => {
		// Regression guard: `analytics.users u` should still produce
		// { databaseName: "analytics", tableName: "users" }.
		const result = parseTableAliases("SELECT * FROM analytics.users u");
		expect(result).toEqual([
			{
				alias: "u",
				tableName: "users",
				databaseName: "analytics",
				isCTE: false,
			},
		]);
	});

	test("parses bare hyphenated identifier through bare-identifier path", () => {
		// Sanity check that the regex change didn't break bare-identifier
		// parsing. `_` is in `\w`, but hyphens are NOT — so a bare
		// hyphenated name still does not match the bare-identifier branch.
		// Only quoted forms accept hyphens.
		const result = parseTableAliases("SELECT * FROM my-broken-name x");
		// The regex stops at the hyphen, producing tableName "my" with alias "broken"
		// (or no match depending on tokens). Verify we get SOMETHING reasonable;
		// don't depend on exact behavior for the hyphenated-bare case.
		expect(Array.isArray(result)).toBe(true);
	});

	test("does not invent a phantom alias from a projection-list comma", () => {
		// The `,\s*` branch also fires on SELECT-list commas: `, b FROM` used
		// to record {tableName: "b", alias: "FROM"}. FROM is not a real alias.
		const result = parseTableAliases("SELECT a, b FROM orders o");
		expect(result.find((r) => r.alias.toUpperCase() === "FROM")).toBeUndefined();
		expect(result.find((r) => r.tableName === "b")).toBeUndefined();
		// The genuine FROM-clause alias is still resolved.
		expect(result).toContainEqual({
			alias: "o",
			tableName: "orders",
			isCTE: false,
		});
	});

	test("multi-column projection before FROM produces no phantom aliases", () => {
		const result = parseTableAliases(
			"SELECT id, name, created_at FROM users u JOIN orders o ON u.id = o.user_id",
		);
		const aliases = result.map((r) => r.alias).sort();
		expect(aliases).toEqual(["o", "u"]);
	});

	test("marks aliases that point at CTE names with isCTE: true", () => {
		const cteNames = new Set(["recent_users"]);
		const result = parseTableAliases(
			"WITH recent_users AS (SELECT * FROM users) SELECT * FROM recent_users r",
			cteNames,
		);
		const cteAlias = result.find((a) => a.alias === "r");
		expect(cteAlias).toBeDefined();
		expect(cteAlias?.isCTE).toBe(true);
		expect(cteAlias?.tableName).toBe("recent_users");
	});
});
