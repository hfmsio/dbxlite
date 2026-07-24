/**
 * Characterization tests for StreamingQueryService (WS-A / A0 in
 * docs/REFACTOR-PLAN.md).
 *
 * The service is a 1,900-line singleton with no direct tests, and every query
 * in the app flows through it. These tests pin the behavior the decomposition
 * must not change, exactly as A0 enumerates: pagination determinism, the
 * HTTP-mode fallback, the row-count fast path / TTL cache / per-connector
 * branches, cancellation, the timezone side effect, and the file-op errors.
 *
 * The service builds its own connectors and narrows with `instanceof`, so we
 * stub `@ide/connectors` and run the real service. Each test gets a fresh
 * singleton via vi.resetModules() — the module-level `queryService` otherwise
 * carries materialization and count-cache state between cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- the connector-layer stub -------------------------------------------
// Hoisted so vi.mock's factory can close over it. `state` is mutable and is
// reset per test.

const fake = vi.hoisted(() => {
	const state: {
		calls: Array<{
			connector: string;
			sql: string;
			options?: Record<string, unknown>;
		}>;
		responder: (call: {
			connector: string;
			sql: string;
		}) => Array<Record<string, unknown>> | Error;
		mode: "wasm" | "http";
		estimatedRowCount: number;
	} = {
		calls: [],
		responder: () => [{ rows: [], done: true }],
		mode: "wasm",
		estimatedRowCount: 0,
	};

	class FakeBase {
		readonly slot: string;
		constructor(slot: string) {
			this.slot = slot;
		}
		async connect() {}
		async disconnect() {}
		async getSchema() {
			return { tables: [] };
		}
		async *query(sql: string, options?: Record<string, unknown>) {
			state.calls.push({ connector: this.slot, sql, options });
			const out = state.responder({ connector: this.slot, sql });
			if (out instanceof Error) throw out;
			for (const chunk of out) {
				// Honor an abort the way a real connector would: check before
				// handing back each chunk.
				const signal = options?.signal as AbortSignal | undefined;
				if (signal?.aborted) {
					const err = new Error("aborted");
					err.name = "AbortError";
					throw err;
				}
				yield chunk;
			}
		}
	}

	class DuckDBConnector extends FakeBase {
		constructor() {
			super("duckdb");
		}
		async getEstimatedRowCount(_sql: string) {
			return state.estimatedRowCount;
		}
		async registerFile(_name: string, _buf: ArrayBuffer) {}
		async registerFileHandle(_name: string, _file: unknown) {}
		async copyFileToBuffer(_name: string) {
			return new Uint8Array([1, 2, 3]);
		}
		async dropFile(_name: string) {}
	}

	// Deliberately WITHOUT the file-op methods: in HTTP mode this occupies the
	// "duckdb" slot, which is what makes dropFile/copyFileToBuffer throw.
	class DuckDBHttpConnector extends FakeBase {
		constructor() {
			super("duckdb");
		}
		onSchemaChange(_listener: () => void) {
			return () => {};
		}
	}

	class BigQueryConnector extends FakeBase {
		constructor() {
			super("bigquery");
		}
		clearCache() {}
	}

	class SnowflakeConnector extends FakeBase {
		constructor() {
			super("snowflake");
		}
		clearCache() {}
	}

	return {
		state,
		DuckDBConnector,
		DuckDBHttpConnector,
		BigQueryConnector,
		SnowflakeConnector,
	};
});

vi.mock("@ide/connectors", () => ({
	DuckDBConnector: fake.DuckDBConnector,
	DuckDBHttpConnector: fake.DuckDBHttpConnector,
	BigQueryConnector: fake.BigQueryConnector,
	SnowflakeConnector: fake.SnowflakeConnector,
	detectMode: () => fake.state.mode,
	isParquetExportCapable: () => false,
	// The registry narrows on this to decide whether to forward a connector's
	// own state events. These fakes emit nothing.
	isConnectorStateSource: () => false,
}));

const timezone = vi.hoisted(() => ({ setTimezone: vi.fn() }));
vi.mock("../formatter-settings", () => ({
	databaseTimezone: { setTimezone: timezone.setTimezone },
}));

// --- harness -------------------------------------------------------------

type QueryService =
	typeof import("../streaming-query-service").queryService;

/** Fresh singleton + initialized DuckDB connector in the requested mode. */
async function freshService(mode: "wasm" | "http" = "wasm") {
	fake.state.mode = mode;
	vi.resetModules();
	const mod = await import("../streaming-query-service");
	const svc = mod.queryService;
	await svc.initialize({
		save: vi.fn(),
		load: vi.fn(),
	} as unknown as Parameters<QueryService["initialize"]>[0]);
	// initialize() itself issues no queries; drop anything the connect path
	// logged so assertions read against a clean slate.
	fake.state.calls.length = 0;
	return svc;
}

/** Convenience: register a fake connector directly into a service slot. */
function injectConnector(
	svc: QueryService,
	slot: "bigquery" | "snowflake",
	connector: unknown,
) {
	// Goes through the registry's own API rather than poking a raw Map, so
	// this survives further movement of the service's internals.
	(
		svc as unknown as {
			registry: { set(slot: string, connector: unknown): void };
		}
	).registry.set(slot, connector);
	svc.setActiveConnector(slot);
}

const sqlOf = (calls: typeof fake.state.calls) => calls.map((c) => c.sql);

/** Drain a streaming query into a flat row list. */
async function drain(gen: AsyncGenerator<{ rows: unknown[] }>) {
	const rows: unknown[] = [];
	for await (const chunk of gen) rows.push(...chunk.rows);
	return rows;
}

describe("StreamingQueryService characterization", () => {
	beforeEach(() => {
		fake.state.calls = [];
		fake.state.responder = () => [{ rows: [], done: true }];
		fake.state.estimatedRowCount = 0;
		timezone.setTimezone.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ---------------------------------------------------- pagination

	describe("pagination determinism (DuckDB, WASM mode)", () => {
		it("pages a materialized temp table with ORDER BY rowid, not raw LIMIT/OFFSET", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 40 }], done: true }]
					: [{ rows: [{ a: 1 }], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", {
					limit: 10,
					offset: 20,
				}),
			);

			const sqls = sqlOf(fake.state.calls);
			expect(sqls[0]).toBe(
				"CREATE TEMP TABLE __dbxlite_stream_1 AS SELECT * FROM t",
			);
			expect(sqls).toContain(
				"SELECT * FROM __dbxlite_stream_1 ORDER BY rowid LIMIT 10 OFFSET 20",
			);
			expect(sqls).not.toContain("SELECT * FROM t LIMIT 10 OFFSET 20");
		});

		it("creates the temp table once and reuses it when the same SQL is re-paged", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 40 }], done: true }]
					: [{ rows: [{ a: 1 }], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", { limit: 10, offset: 0 }),
			);
			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", { limit: 10, offset: 10 }),
			);

			const creates = sqlOf(fake.state.calls).filter((s) =>
				s.startsWith("CREATE TEMP TABLE"),
			);
			expect(creates).toHaveLength(1);
			expect(sqlOf(fake.state.calls)).toContain(
				"SELECT * FROM __dbxlite_stream_1 ORDER BY rowid LIMIT 10 OFFSET 10",
			);
		});

		it("drops the previous temp table when a new query is materialized", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 1 }], done: true }]
					: [{ rows: [{ a: 1 }], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t1", { limit: 5 }),
			);
			await drain(
				svc.executeStreamingQuery("SELECT * FROM t2", { limit: 5 }),
			);

			expect(sqlOf(fake.state.calls)).toContain(
				"DROP TABLE IF EXISTS __dbxlite_stream_1",
			);
			expect(sqlOf(fake.state.calls)).toContain(
				"CREATE TEMP TABLE __dbxlite_stream_2 AS SELECT * FROM t2",
			);
		});

		it("strips trailing semicolons before wrapping in CREATE TEMP TABLE", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 1 }], done: true }]
					: [{ rows: [], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t;  ", { limit: 5 }),
			);

			expect(sqlOf(fake.state.calls)[0]).toBe(
				"CREATE TEMP TABLE __dbxlite_stream_1 AS SELECT * FROM t",
			);
		});

		it("falls back to direct paging when materialization fails", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.startsWith("CREATE TEMP TABLE")
					? new Error("cannot wrap")
					: [{ rows: [{ a: 1 }], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", { limit: 10, offset: 5 }),
			);

			expect(sqlOf(fake.state.calls)).toContain(
				"SELECT * FROM t LIMIT 10 OFFSET 5",
			);
		});

		it("leaves a statement that already ends in LIMIT alone when materialization fails", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.startsWith("CREATE TEMP TABLE")
					? new Error("cannot wrap")
					: [{ rows: [], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t LIMIT 3", { limit: 10 }),
			);

			expect(sqlOf(fake.state.calls)).toContain("SELECT * FROM t LIMIT 3");
		});

		it("does not paginate a non-paginatable statement", async () => {
			const svc = await freshService("wasm");

			await drain(
				svc.executeStreamingQuery("CREATE TABLE x (a INT)", { limit: 10 }),
			);

			expect(sqlOf(fake.state.calls)).toEqual(["CREATE TABLE x (a INT)"]);
		});

		it("invalidates the materialization when a mutating statement runs", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 7 }], done: true }]
					: [{ rows: [], done: true }];

			await drain(svc.executeStreamingQuery("SELECT * FROM t", { limit: 5 }));
			expect((await svc.getRowCount("SELECT * FROM t")).count).toBe(7);

			await svc.executeQuery("INSERT INTO t VALUES (1)");

			// The exact-count fast path is gone; the count now comes from the
			// DuckDB EXPLAIN estimate instead.
			fake.state.estimatedRowCount = 999;
			const after = await svc.getRowCount("SELECT * FROM t");
			expect(after).toEqual({ count: 999, isEstimated: true });
		});
	});

	describe("HTTP-mode fallback", () => {
		it("never materializes and uses trailing-LIMIT injection instead", async () => {
			const svc = await freshService("http");
			fake.state.responder = () => [{ rows: [{ a: 1 }], done: true }];

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", { limit: 10, offset: 5 }),
			);

			const sqls = sqlOf(fake.state.calls);
			expect(sqls.some((s) => s.startsWith("CREATE TEMP TABLE"))).toBe(false);
			expect(sqls).toContain("SELECT * FROM t LIMIT 10 OFFSET 5");
		});

		it("omits OFFSET when paging from zero", async () => {
			const svc = await freshService("http");

			await drain(
				svc.executeStreamingQuery("SELECT * FROM t", { limit: 10, offset: 0 }),
			);

			expect(sqlOf(fake.state.calls)).toContain("SELECT * FROM t LIMIT 10");
		});

		it("reports http mode", async () => {
			const svc = await freshService("http");
			expect(svc.getMode()).toBe("http");
			expect(svc.isHttpMode()).toBe(true);
		});
	});

	// ---------------------------------------------------- row count

	describe("getRowCount", () => {
		it("returns the exact materialized count and bypasses the estimate path", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 123 }], done: true }]
					: [{ rows: [], done: true }];

			await drain(svc.executeStreamingQuery("SELECT * FROM t", { limit: 5 }));
			fake.state.estimatedRowCount = 55; // would be used if the fast path missed

			expect(await svc.getRowCount("SELECT * FROM t")).toEqual({
				count: 123,
				isEstimated: false,
			});
		});

		it("uses DuckDB EXPLAIN for an estimate", async () => {
			const svc = await freshService("wasm");
			fake.state.estimatedRowCount = 4242;

			expect(await svc.getRowCount("SELECT * FROM t")).toEqual({
				count: 4242,
				isEstimated: true,
			});
		});

		it("serves a repeat count from the TTL cache", async () => {
			const svc = await freshService("wasm");
			fake.state.estimatedRowCount = 10;

			await svc.getRowCount("SELECT * FROM t");
			fake.state.estimatedRowCount = 999;
			const second = await svc.getRowCount("SELECT * FROM t");

			expect(second).toEqual({ count: 10, isEstimated: true });
		});

		it("re-counts once the TTL has expired", async () => {
			vi.useFakeTimers();
			const svc = await freshService("wasm");
			fake.state.estimatedRowCount = 10;

			await svc.getRowCount("SELECT * FROM t");
			vi.advanceTimersByTime(2 * 60 * 1000 + 1);
			fake.state.estimatedRowCount = 20;

			expect(await svc.getRowCount("SELECT * FROM t")).toEqual({
				count: 20,
				isEstimated: true,
			});
		});

		it("does not cache a zero/negative DuckDB estimate", async () => {
			const svc = await freshService("wasm");
			fake.state.estimatedRowCount = 0;

			await svc.getRowCount("SELECT * FROM t");
			fake.state.estimatedRowCount = 77;

			expect((await svc.getRowCount("SELECT * FROM t")).count).toBe(77);
		});

		it("uses BigQuery LIMIT 0 metadata for an exact count", async () => {
			const svc = await freshService("wasm");
			injectConnector(svc, "bigquery", new fake.BigQueryConnector());
			fake.state.responder = () => [
				{ rows: [], done: true, totalRows: 500 },
			];

			expect(await svc.getRowCount("SELECT * FROM t")).toEqual({
				count: 500,
				isEstimated: false,
			});
			expect(sqlOf(fake.state.calls)).toContain("SELECT * FROM t LIMIT 0");
			expect(fake.state.calls[0].options).toMatchObject({ maxRows: 0 });
		});

		it("counts Snowflake with a wrapped COUNT(*), stripping trailing semicolons", async () => {
			const svc = await freshService("wasm");
			injectConnector(svc, "snowflake", new fake.SnowflakeConnector());
			fake.state.responder = () => [{ rows: [{ c: 31 }], done: true }];

			expect(await svc.getRowCount("SELECT * FROM t;")).toEqual({
				count: 31,
				isEstimated: false,
			});
			expect(sqlOf(fake.state.calls)).toContain(
				"SELECT COUNT(*) AS c FROM (SELECT * FROM t)",
			);
		});

		it("returns an estimated -1 when the Snowflake count fails", async () => {
			const svc = await freshService("wasm");
			injectConnector(svc, "snowflake", new fake.SnowflakeConnector());
			fake.state.responder = () => new Error("count blew up");

			expect(await svc.getRowCount("SELECT * FROM t")).toEqual({
				count: -1,
				isEstimated: true,
			});
		});

		it("passes a combined abort signal into the Snowflake count", async () => {
			const svc = await freshService("wasm");
			injectConnector(svc, "snowflake", new fake.SnowflakeConnector());
			fake.state.responder = () => [{ rows: [{ c: 1 }], done: true }];
			const outer = new AbortController();

			await svc.getRowCount("SELECT * FROM t", outer.signal);

			const countCall = fake.state.calls.find((c) =>
				c.sql.startsWith("SELECT COUNT(*)"),
			);
			// A signal is threaded through; it is neither the caller's raw
			// signal nor undefined, because the 5s timeout is combined in.
			expect(countCall?.options?.signal).toBeInstanceOf(AbortSignal);
		});
	});

	// ---------------------------------------------------- cancellation

	describe("cancellation", () => {
		it("aborts an in-flight streaming query via cancelAllQueries", async () => {
			const svc = await freshService("wasm");
			// Two chunks: the service checks the abort flag between them.
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 2 }], done: true }]
					: [
							{ rows: [{ a: 1 }], done: false },
							{ rows: [{ a: 2 }], done: true },
						];

			const gen = svc.executeStreamingQuery("SELECT * FROM t", {
				limit: 10,
				chunkSize: 1,
			});
			await gen.next();
			await svc.cancelAllQueries();

			await expect(gen.next()).rejects.toMatchObject({ name: "AbortError" });
		});

		it("aborts on the caller's external signal", async () => {
			const svc = await freshService("wasm");
			const ctl = new AbortController();
			fake.state.responder = ({ sql }) =>
				sql.includes("COUNT(*)")
					? [{ rows: [{ cnt: 2 }], done: true }]
					: [
							{ rows: [{ a: 1 }], done: false },
							{ rows: [{ a: 2 }], done: true },
						];

			const gen = svc.executeStreamingQuery("SELECT * FROM t", {
				limit: 10,
				chunkSize: 1,
				signal: ctl.signal,
			});
			await gen.next();
			ctl.abort();

			await expect(gen.next()).rejects.toMatchObject({ name: "AbortError" });
		});

		it("clears the active-query registry once a query finishes", async () => {
			const svc = await freshService("wasm");
			const registry = (
				svc as unknown as { abortRegistry: { size: number } }
			).abortRegistry;

			await drain(svc.executeStreamingQuery("SELECT 1", {}));

			expect(registry.size).toBe(0);
		});

		it("registers the query while it is in flight", async () => {
			const svc = await freshService("wasm");
			const registry = (
				svc as unknown as { abortRegistry: { size: number } }
			).abortRegistry;
			fake.state.responder = () => [
				{ rows: [{ a: 1 }], done: false },
				{ rows: [{ a: 2 }], done: true },
			];

			const gen = svc.executeStreamingQuery("SELECT 1", { chunkSize: 1 });
			await gen.next();

			expect(registry.size).toBe(1);
			await gen.return(undefined as never);
		});

		it("raises AbortError from executeQuery when the signal is already aborted", async () => {
			const svc = await freshService("wasm");
			const ctl = new AbortController();
			ctl.abort();
			fake.state.responder = () => [{ rows: [{ a: 1 }], done: true }];

			await expect(
				svc.executeQuery("SELECT 1", ctl.signal),
			).rejects.toMatchObject({ name: "AbortError" });
		});
	});

	// ---------------------------------------------------- timezone side effect

	describe("SET timezone side effect", () => {
		it("fires from executeQuery", async () => {
			const svc = await freshService("wasm");
			await svc.executeQuery("SET timezone = 'UTC'");
			expect(timezone.setTimezone).toHaveBeenCalledWith("UTC");
		});

		it("fires from executeQueryOnConnector", async () => {
			const svc = await freshService("wasm");
			await svc.executeQueryOnConnector("duckdb", "SET TimeZone TO 'CET'");
			expect(timezone.setTimezone).toHaveBeenCalledWith("CET");
		});

		it("fires from executeStreamingQuery", async () => {
			const svc = await freshService("wasm");
			await drain(
				svc.executeStreamingQuery("SET timezone = 'Asia/Tokyo'", {}),
			);
			expect(timezone.setTimezone).toHaveBeenCalledWith("Asia/Tokyo");
		});

		it("ignores a statement with no SET timezone", async () => {
			const svc = await freshService("wasm");
			await svc.executeQuery("SELECT 1");
			expect(timezone.setTimezone).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------- file ops

	describe("DuckDB virtual-filesystem ops", () => {
		it("copies a file through the DuckDB connector", async () => {
			const svc = await freshService("wasm");
			await expect(svc.copyFileToBuffer("a.db")).resolves.toEqual(
				new Uint8Array([1, 2, 3]),
			);
		});

		it("throws 'not supported' when copying in HTTP mode", async () => {
			const svc = await freshService("http");
			await expect(svc.copyFileToBuffer("a.db")).rejects.toThrow(
				"File copy not supported",
			);
		});

		it("throws 'not supported' when dropping in HTTP mode", async () => {
			const svc = await freshService("http");
			await expect(svc.dropFile("a.db")).rejects.toThrow(
				"File drop not supported by this connector",
			);
		});
	});

	// ---------------------------------------------------- result shape

	describe("result shape", () => {
		it("surfaces column metadata from the connector schema", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = () => [
				{
					rows: [{ a: 1 }],
					done: true,
					schema: {
						tables: [{ columns: [{ name: "a", type: "INTEGER", nullable: false }] }],
					},
				},
			];

			const result = await svc.executeQuery("SELECT a FROM t");

			expect(result.columns).toEqual(["a"]);
			expect(result.columnTypes).toEqual([
				{ name: "a", type: "INTEGER", nullable: false, comment: undefined },
			]);
		});

		it("converts BigInt values to numbers", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = () => [
				{ rows: [{ n: 9007199254740991n }], done: true },
			];

			const result = await svc.executeQuery("SELECT n");

			expect(result.rows[0].n).toBe(9007199254740991);
		});

		it("preserves Date values", async () => {
			const svc = await freshService("wasm");
			const when = new Date("2026-01-01T00:00:00Z");
			fake.state.responder = () => [{ rows: [{ d: when }], done: true }];

			const result = await svc.executeQuery("SELECT d");

			expect(result.rows[0].d).toBe(when);
		});

		it("reports serverTotalRows when the connector surfaces it", async () => {
			const svc = await freshService("wasm");
			fake.state.responder = () => [
				{ rows: [{ a: 1 }], done: true, totalRows: 10_000 },
			];

			const result = await svc.executeQuery("SELECT a FROM t");

			expect(result.serverTotalRows).toBe(10_000);
			expect(result.totalRows).toBe(1);
		});

		it("tags the result with the connector that produced it", async () => {
			const svc = await freshService("wasm");
			const result = await svc.executeQueryOnConnector("duckdb", "SELECT 1");
			expect(result.connectorType).toBe("duckdb");
		});

		it("rejects a query against an unregistered connector", async () => {
			const svc = await freshService("wasm");
			await expect(
				svc.executeQueryOnConnector("bigquery", "SELECT 1"),
			).rejects.toThrow("Connector bigquery not available");
		});
	});

	// ---------------------------------------------------- connector registry

	describe("connector selection", () => {
		it("refuses to activate a connector that was never initialized", async () => {
			const svc = await freshService("wasm");
			expect(() => svc.setActiveConnector("bigquery")).toThrow(
				"Connector bigquery not initialized",
			);
		});

		it("reports readiness per connector slot", async () => {
			const svc = await freshService("wasm");
			expect(svc.isConnectorReady("duckdb")).toBe(true);
			expect(svc.isConnectorReady("snowflake")).toBe(false);
		});

		it("returns null for an absent connector", async () => {
			const svc = await freshService("wasm");
			expect(svc.getConnector("bigquery")).toBeNull();
		});
	});
});
