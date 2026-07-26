/**
 * Unit tests for PaginationPlanner (WS-A / A5).
 *
 * The planner carries the audit's Phase-2 correctness fix, so these go beyond
 * the service-level characterization: they pin the SQL shape, the temp-table
 * lifecycle, the invalidation keyword set, and the read-seam RowCountEstimator
 * consumes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorType } from "../../../types/data-source";
import type { TableRow } from "../../../types/table";
import { PaginationPlanner } from "../pagination-planner";

const wasm = { isHttp: () => false };
const http = { isHttp: () => true };

/** Records every SQL the planner runs; counts resolve to `count` rows. */
function makeExecute(count = 42) {
	const calls: string[] = [];
	const execute = vi.fn(
		async (
			_type: ConnectorType,
			sql: string,
			_signal?: AbortSignal,
			_silent?: boolean,
		) => {
			calls.push(sql);
			if (sql.startsWith("SELECT COUNT(*)")) {
				return { rows: [{ cnt: count }] as TableRow[] };
			}
			return { rows: [] as TableRow[] };
		},
	);
	return { execute, calls };
}

const request = (over: Partial<Parameters<PaginationPlanner["plan"]>[1]> = {}) => ({
	limit: 10,
	offset: 0,
	enablePagination: true,
	activeConnector: "duckdb" as const,
	...over,
});

describe("PaginationPlanner", () => {
	let execute: ReturnType<typeof makeExecute>;

	beforeEach(() => {
		execute = makeExecute();
	});

	describe("materialized paging (WASM DuckDB)", () => {
		it("pages the temp table with ORDER BY rowid", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			const plan = await planner.plan(
				"SELECT * FROM t",
				request({ limit: 10, offset: 20 }),
			);

			expect(plan.sql).toBe(
				"SELECT * FROM __dbxlite_stream_1 ORDER BY rowid LIMIT 10 OFFSET 20",
			);
		});

		it("returns the exact count from the materialization", async () => {
			const planner = new PaginationPlanner(makeExecute(7).execute, wasm);

			const plan = await planner.plan("SELECT * FROM t", request());

			expect(plan.totalRows).toBe(7);
		});

		it("omits totalRows when the count query failed", async () => {
			const failCount = vi.fn(async (_t: string, sql: string) => {
				if (sql.startsWith("SELECT COUNT(*)")) throw new Error("nope");
				return { rows: [] };
			});
			const planner = new PaginationPlanner(failCount as never, wasm);

			const plan = await planner.plan("SELECT * FROM t", request());

			expect(plan.totalRows).toBeUndefined();
			expect(plan.sql).toContain("__dbxlite_stream_1");
		});

		it("strips trailing whitespace and semicolons before wrapping", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			await planner.plan("SELECT * FROM t ;  ", request());

			expect(execute.calls[0]).toBe(
				"CREATE TEMP TABLE __dbxlite_stream_1 AS SELECT * FROM t",
			);
		});

		it("reuses the temp table when the same SQL is paged again", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			await planner.plan("SELECT * FROM t", request({ offset: 0 }));
			const second = await planner.plan("SELECT * FROM t", request({ offset: 10 }));

			expect(
				execute.calls.filter((s) => s.startsWith("CREATE TEMP TABLE")),
			).toHaveLength(1);
			expect(second.sql).toBe(
				"SELECT * FROM __dbxlite_stream_1 ORDER BY rowid LIMIT 10 OFFSET 10",
			);
		});

		it("drops the previous table when a different query materializes", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			await planner.plan("SELECT * FROM t1", request());
			await planner.plan("SELECT * FROM t2", request());

			expect(execute.calls).toContain("DROP TABLE IF EXISTS __dbxlite_stream_1");
			expect(execute.calls).toContain(
				"CREATE TEMP TABLE __dbxlite_stream_2 AS SELECT * FROM t2",
			);
		});

		it("survives a failed drop of the previous table", async () => {
			const flaky = vi.fn(async (_t: string, sql: string) => {
				if (sql.startsWith("DROP TABLE")) throw new Error("gone");
				if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ cnt: 1 }] };
				return { rows: [] };
			});
			const planner = new PaginationPlanner(flaky as never, wasm);

			await planner.plan("SELECT * FROM t1", request());

			await expect(
				planner.plan("SELECT * FROM t2", request()),
			).resolves.toMatchObject({ sql: expect.stringContaining("__dbxlite_stream_2") });
		});

		it("marks the materialization queries silent so expected failures stay out of the log", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			await planner.plan("SELECT * FROM t", request());

			for (const call of execute.execute.mock.calls) {
				expect(call[3]).toBe(true);
			}
		});
	});

	describe("fallback to trailing-LIMIT injection", () => {
		it("injects LIMIT/OFFSET in HTTP mode without materializing", async () => {
			const planner = new PaginationPlanner(execute.execute, http);

			const plan = await planner.plan(
				"SELECT * FROM t",
				request({ limit: 10, offset: 5 }),
			);

			expect(plan.sql).toBe("SELECT * FROM t LIMIT 10 OFFSET 5");
			expect(execute.calls).toHaveLength(0);
		});

		it("omits OFFSET at offset zero", async () => {
			const planner = new PaginationPlanner(execute.execute, http);

			const plan = await planner.plan("SELECT * FROM t", request({ offset: 0 }));

			expect(plan.sql).toBe("SELECT * FROM t LIMIT 10");
		});

		it("leaves a statement that already ends in LIMIT untouched", async () => {
			const planner = new PaginationPlanner(execute.execute, http);

			const plan = await planner.plan("SELECT * FROM t LIMIT 3", request());

			expect(plan.sql).toBe("SELECT * FROM t LIMIT 3");
		});

		it("still injects when the LIMIT is only in a subquery", async () => {
			const planner = new PaginationPlanner(execute.execute, http);

			const plan = await planner.plan(
				"SELECT * FROM (SELECT * FROM t LIMIT 3) x",
				request(),
			);

			expect(plan.sql).toBe(
				"SELECT * FROM (SELECT * FROM t LIMIT 3) x LIMIT 10",
			);
		});

		it("falls back when CREATE TEMP TABLE cannot wrap the statement", async () => {
			const failCreate = vi.fn(async (_t: string, sql: string) => {
				if (sql.startsWith("CREATE TEMP TABLE")) throw new Error("cannot wrap");
				return { rows: [] };
			});
			const planner = new PaginationPlanner(failCreate as never, wasm);

			const plan = await planner.plan(
				"SELECT * FROM t",
				request({ limit: 10, offset: 5 }),
			);

			expect(plan.sql).toBe("SELECT * FROM t LIMIT 10 OFFSET 5");
		});
	});

	describe("statements that are never paginated", () => {
		it.each([
			["pagination disabled", request({ enablePagination: false })],
			["a non-DuckDB connector", request({ activeConnector: "bigquery" as const })],
			["no limit", request({ limit: undefined })],
		])("passes the SQL through with %s", async (_label, req) => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			const plan = await planner.plan("SELECT * FROM t", req);

			expect(plan.sql).toBe("SELECT * FROM t");
			expect(execute.calls).toHaveLength(0);
		});

		it("passes DDL through untouched", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			const plan = await planner.plan("CREATE TABLE x (a INT)", request());

			expect(plan.sql).toBe("CREATE TABLE x (a INT)");
		});
	});

	describe("invalidation", () => {
		it.each([
			"INSERT INTO t VALUES (1)",
			"UPDATE t SET a = 1",
			"DELETE FROM t",
			"MERGE INTO t USING s ON 1=1",
			"CREATE TABLE y (a INT)",
			"DROP TABLE t",
			"ALTER TABLE t ADD COLUMN b INT",
			"TRUNCATE t",
			"COPY t TO 'f.parquet'",
			"ATTACH 'x.db'",
			"DETACH x",
			"CALL foo()",
		])("drops the exact count after %s", async (mutation) => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());
			expect(planner.exactRowCountFor("SELECT * FROM t")).toBe(42);

			planner.invalidateIfMutating(mutation);

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBeNull();
		});

		it("invalidates on a WITH statement that carries DML", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			planner.invalidateIfMutating("WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c");

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBeNull();
		});

		it("keeps the materialization for a plain SELECT", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			planner.invalidateIfMutating("SELECT * FROM other");

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBe(42);
		});

		it("keeps the materialization for a read-only WITH", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			planner.invalidateIfMutating("WITH c AS (SELECT 1) SELECT * FROM c");

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBe(42);
		});

		it("re-materializes into a new table after an invalidation", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			planner.invalidateIfMutating("INSERT INTO t VALUES (1)");
			const plan = await planner.plan("SELECT * FROM t", request());

			expect(plan.sql).toContain("__dbxlite_stream_2");
			// The old table is still dropped: invalidation kills trust in the
			// snapshot, not the obligation to clean up.
			expect(execute.calls).toContain("DROP TABLE IF EXISTS __dbxlite_stream_1");
		});
	});

	describe("exactRowCountFor read-seam", () => {
		it("returns null before anything is materialized", () => {
			const planner = new PaginationPlanner(execute.execute, wasm);

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBeNull();
		});

		it("returns null for different SQL", async () => {
			const planner = new PaginationPlanner(execute.execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			expect(planner.exactRowCountFor("SELECT * FROM other")).toBeNull();
		});

		it("returns null when the count was never obtained", async () => {
			const noCount = vi.fn(async (_t: string, sql: string) => {
				if (sql.startsWith("SELECT COUNT(*)")) throw new Error("nope");
				return { rows: [] };
			});
			const planner = new PaginationPlanner(noCount as never, wasm);
			await planner.plan("SELECT * FROM t", request());

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBeNull();
		});

		it("reports a legitimate zero-row count", async () => {
			const planner = new PaginationPlanner(makeExecute(0).execute, wasm);
			await planner.plan("SELECT * FROM t", request());

			expect(planner.exactRowCountFor("SELECT * FROM t")).toBe(0);
		});
	});
});
