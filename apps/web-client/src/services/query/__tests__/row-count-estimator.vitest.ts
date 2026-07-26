/**
 * Unit tests for RowCountEstimator (WS-A / A6).
 *
 * The estimator narrows on real connector classes, so these tests build
 * instances via Object.create to satisfy `instanceof` without running the
 * connectors' constructors.
 */

import {
	type BaseConnector,
	BigQueryConnector,
	DuckDBConnector,
	SnowflakeConnector,
} from "@ide/connectors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RowCountEstimator } from "../row-count-estimator";

type Chunk = { rows?: unknown[]; totalRows?: number };

/** An instance that passes `instanceof Cls` with a scripted query(). */
function connectorOf<T>(
	Cls: new (...args: never[]) => T,
	impl: Record<string, unknown>,
): T {
	return Object.assign(Object.create(Cls.prototype), impl) as T;
}

const yielding = (chunks: Chunk[]) =>
	vi.fn(async function* () {
		for (const chunk of chunks) yield chunk;
	});

const noMaterialization = () => null;

describe("RowCountEstimator", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	describe("materialization fast path", () => {
		it("returns the exact count without touching the connector", async () => {
			const connector = connectorOf(DuckDBConnector, {
				getEstimatedRowCount: vi.fn(),
			});
			const estimator = new RowCountEstimator(
				() => 123,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT 1")).resolves.toEqual({
				count: 123,
				isEstimated: false,
			});
			expect(connector.getEstimatedRowCount).not.toHaveBeenCalled();
		});

		it("reports a legitimate zero without falling through", async () => {
			const connector = connectorOf(DuckDBConnector, {
				getEstimatedRowCount: vi.fn().mockResolvedValue(99),
			});
			const estimator = new RowCountEstimator(
				() => 0,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT 1")).resolves.toEqual({
				count: 0,
				isEstimated: false,
			});
		});
	});

	describe("DuckDB", () => {
		let connector: DuckDBConnector;
		let estimator: RowCountEstimator;

		beforeEach(() => {
			connector = connectorOf(DuckDBConnector, {
				getEstimatedRowCount: vi.fn().mockResolvedValue(4242),
			});
			estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);
		});

		it("uses EXPLAIN and marks the result estimated", async () => {
			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: 4242,
				isEstimated: true,
			});
		});

		it("serves the second ask from cache", async () => {
			await estimator.getRowCount("SELECT * FROM t");
			await estimator.getRowCount("SELECT * FROM t");

			expect(connector.getEstimatedRowCount).toHaveBeenCalledTimes(1);
		});

		it("re-counts once the TTL expires", async () => {
			vi.useFakeTimers();
			await estimator.getRowCount("SELECT * FROM t");

			vi.advanceTimersByTime(2 * 60 * 1000 + 1);
			await estimator.getRowCount("SELECT * FROM t");

			expect(connector.getEstimatedRowCount).toHaveBeenCalledTimes(2);
		});

		it("does not cache a non-positive estimate", async () => {
			vi.mocked(connector.getEstimatedRowCount).mockResolvedValue(0);

			await estimator.getRowCount("SELECT * FROM t");
			await estimator.getRowCount("SELECT * FROM t");

			expect(connector.getEstimatedRowCount).toHaveBeenCalledTimes(2);
		});

		it("keys the cache per query", async () => {
			await estimator.getRowCount("SELECT * FROM a");
			await estimator.getRowCount("SELECT * FROM b");

			expect(connector.getEstimatedRowCount).toHaveBeenCalledTimes(2);
		});

		it("forgets everything on clear()", async () => {
			await estimator.getRowCount("SELECT * FROM t");
			estimator.clear();
			await estimator.getRowCount("SELECT * FROM t");

			expect(connector.getEstimatedRowCount).toHaveBeenCalledTimes(2);
		});
	});

	describe("BigQuery", () => {
		it("reads the exact total from LIMIT 0 metadata", async () => {
			const query = yielding([{ rows: [], totalRows: 500 }]);
			const connector = connectorOf(BigQueryConnector, { query });
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: 500,
				isEstimated: false,
			});
			expect(query).toHaveBeenCalledWith("SELECT * FROM t LIMIT 0", {
				maxRows: 0,
			});
		});

		it("returns -1 as exact when metadata carries no total", async () => {
			const connector = connectorOf(BigQueryConnector, {
				query: yielding([{ rows: [] }]),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: -1,
				isEstimated: false,
			});
		});
	});

	describe("Snowflake", () => {
		const snowflakeYielding = (chunks: Chunk[]) =>
			connectorOf(SnowflakeConnector, { query: yielding(chunks) });

		it("wraps the query in COUNT(*) and reports an exact count", async () => {
			const connector = snowflakeYielding([{ rows: [{ c: 31 }] }]);
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: 31,
				isEstimated: false,
			});
			expect(connector.query).toHaveBeenCalledWith(
				"SELECT COUNT(*) AS c FROM (SELECT * FROM t)",
				expect.anything(),
			);
		});

		it("strips trailing semicolons before wrapping", async () => {
			const connector = snowflakeYielding([{ rows: [{ c: 1 }] }]);
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await estimator.getRowCount("SELECT * FROM t;  ");

			expect(connector.query).toHaveBeenCalledWith(
				"SELECT COUNT(*) AS c FROM (SELECT * FROM t)",
				expect.anything(),
			);
		});

		it("coerces a string count", async () => {
			const connector = snowflakeYielding([{ rows: [{ c: "77" }] }]);
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: 77,
				isEstimated: false,
			});
		});

		it("returns an estimated -1 when the count query fails", async () => {
			const connector = connectorOf(SnowflakeConnector, {
				query: vi.fn(async function* () {
					throw new Error("count blew up");
				}),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: -1,
				isEstimated: true,
			});
		});

		it("does not cache the failed -1", async () => {
			let fail = true;
			const connector = connectorOf(SnowflakeConnector, {
				query: vi.fn(async function* () {
					if (fail) throw new Error("nope");
					yield { rows: [{ c: 5 }] };
				}),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await estimator.getRowCount("SELECT * FROM t");
			fail = false;

			await expect(estimator.getRowCount("SELECT * FROM t")).resolves.toEqual({
				count: 5,
				isEstimated: false,
			});
		});

		it("passes a signal that aborts when the caller's does", async () => {
			let seen: AbortSignal | undefined;
			const connector = connectorOf(SnowflakeConnector, {
				query: vi.fn(async function* (
					_sql: string,
					opts: { signal?: AbortSignal },
				) {
					seen = opts.signal;
					yield { rows: [{ c: 1 }] };
				}),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);
			const outer = new AbortController();

			await estimator.getRowCount("SELECT * FROM t", outer.signal);

			expect(seen).toBeInstanceOf(AbortSignal);
			expect(seen?.aborted).toBe(false);
			outer.abort();
			expect(seen?.aborted).toBe(true);
		});
	});

	describe("unknown connectors", () => {
		it("returns an estimated -1", async () => {
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => ({ query: vi.fn() }) as unknown as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT 1")).resolves.toEqual({
				count: -1,
				isEstimated: true,
			});
		});
	});

	describe("abort propagation", () => {
		it("re-throws AbortError instead of swallowing it as -1", async () => {
			const connector = connectorOf(DuckDBConnector, {
				getEstimatedRowCount: vi.fn().mockImplementation(() => {
					const err = new Error("aborted");
					err.name = "AbortError";
					throw err;
				}),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT 1")).rejects.toMatchObject({
				name: "AbortError",
			});
		});

		it("swallows other errors as an estimated -1", async () => {
			const connector = connectorOf(DuckDBConnector, {
				getEstimatedRowCount: vi.fn().mockRejectedValue(new Error("boom")),
			});
			const estimator = new RowCountEstimator(
				noMaterialization,
				() => connector as BaseConnector,
			);

			await expect(estimator.getRowCount("SELECT 1")).resolves.toEqual({
				count: -1,
				isEstimated: true,
			});
		});
	});
});
