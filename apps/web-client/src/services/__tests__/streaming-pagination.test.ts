/**
 * Stream-materialisation pagination tests.
 *
 * The bug class under test: paging by re-executing `sql LIMIT n OFFSET m`
 * per page is unsound (no cross-execution ordering guarantee under
 * preserve_insertion_order=false), and the old anywhere-match LIMIT test
 * disabled paging entirely for subquery-LIMIT queries. The fix materialises
 * the query once into a temp table and pages ORDER BY rowid over it.
 *
 * The service is a singleton with private connector wiring, so tests inject
 * a recording fake connector directly into its map.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Recording fake DuckDB connector. */
class FakeDuckDB {
	executed: string[] = [];
	failCreate = false;

	async *query(sql: string): AsyncGenerator<{
		rows: Record<string, unknown>[];
		done: boolean;
	}> {
		this.executed.push(sql);
		if (/^CREATE TEMP TABLE/i.test(sql)) {
			if (this.failCreate) throw new Error("cannot materialise this shape");
			yield { rows: [], done: true };
			return;
		}
		if (/^SELECT COUNT\(\*\) AS cnt FROM __dbxlite_stream/i.test(sql)) {
			yield { rows: [{ cnt: 42 }], done: true };
			return;
		}
		if (/^DROP TABLE/i.test(sql)) {
			yield { rows: [], done: true };
			return;
		}
		// Page reads / direct queries: return a small marker row set.
		yield { rows: [{ id: 1 }, { id: 2 }], done: true };
	}
}

type ServiceInternals = {
	registry: {
		set(slot: string, connector: unknown): void;
		setActive(slot: string): void;
	};
};

let fake: FakeDuckDB;
let queryService: typeof import("../streaming-query-service").queryService;

// A fresh module instance per test. Resetting the singleton by poking private
// field names is what this used to do, and it broke silently the moment the
// materialisation state moved into PaginationPlanner. Re-importing gives a
// genuinely clean service without depending on its internal shape: mode
// defaults to wasm, and the planner and count cache start empty.
beforeEach(async () => {
	vi.resetModules();
	({ queryService } = await import("../streaming-query-service"));
	fake = new FakeDuckDB();
	const internals = queryService as unknown as ServiceInternals;
	internals.registry.set("duckdb", fake);
	internals.registry.setActive("duckdb");
});

describe("stream materialisation paging", () => {
	it("materialises once, then pages ORDER BY rowid — never raw LIMIT/OFFSET on user SQL", async () => {
		const sql = "SELECT k, count(*) c FROM base GROUP BY k";
		await queryService.getPage(sql, 0, 100);

		const create = fake.executed.find((s) => s.startsWith("CREATE TEMP TABLE"));
		expect(create).toBeDefined();
		expect(create).toContain(sql);

		const page = fake.executed.find((s) => /ORDER BY rowid/i.test(s));
		expect(page).toMatch(/LIMIT 100 OFFSET 0/);
		// The unsound legacy shape must not appear.
		expect(
			fake.executed.some((s) => s.startsWith(`${sql} LIMIT`)),
		).toBe(false);
	});

	it("reuses the materialisation across pages (one CREATE for many pages)", async () => {
		const sql = "SELECT * FROM big";
		await queryService.getPage(sql, 0, 100);
		await queryService.getPage(sql, 100, 100);
		await queryService.getPage(sql, 200, 100);

		const creates = fake.executed.filter((s) =>
			s.startsWith("CREATE TEMP TABLE"),
		);
		expect(creates).toHaveLength(1);
		expect(
			fake.executed.filter((s) => /ORDER BY rowid/i.test(s)),
		).toHaveLength(3);
		expect(fake.executed.some((s) => /OFFSET 200/.test(s))).toBe(true);
	});

	it("pages queries whose LIMIT lives in a subquery (old code returned the full set per page)", async () => {
		const sql = "SELECT * FROM (SELECT * FROM t LIMIT 5) x JOIN big USING (id)";
		await queryService.getPage(sql, 100, 100);

		// Materialised and paged — not re-executed bare.
		expect(
			fake.executed.some((s) => s.startsWith("CREATE TEMP TABLE")),
		).toBe(true);
		expect(fake.executed.some((s) => /ORDER BY rowid.*OFFSET 100/.test(s))).toBe(
			true,
		);
		// The bare re-execution (page = whole result) must not happen.
		expect(fake.executed.filter((s) => s === sql)).toHaveLength(0);
	});

	it("returns the exact materialised count from getRowCount", async () => {
		const sql = "SELECT * FROM big";
		await queryService.getPage(sql, 0, 100);
		const { count, isEstimated } = await queryService.getRowCount(sql);
		expect(count).toBe(42);
		expect(isEstimated).toBe(false);
	});

	it("invalidates the materialisation when a mutation executes", async () => {
		const sql = "SELECT * FROM t";
		await queryService.getPage(sql, 0, 100);
		expect(
			fake.executed.filter((s) => s.startsWith("CREATE TEMP TABLE")),
		).toHaveLength(1);

		await queryService.executeQuery("INSERT INTO t VALUES (1)");

		await queryService.getPage(sql, 0, 100);
		expect(
			fake.executed.filter((s) => s.startsWith("CREATE TEMP TABLE")),
		).toHaveLength(2);
	});

	it("falls back to legacy LIMIT injection when materialisation fails", async () => {
		fake.failCreate = true;
		const sql = "SELECT * FROM t";
		await queryService.getPage(sql, 0, 50);

		expect(fake.executed.some((s) => s === `${sql} LIMIT 50`)).toBe(true);
		expect(fake.executed.some((s) => /ORDER BY rowid/.test(s))).toBe(false);
	});

	it("never materialises or paginates WITH-prefixed DML", async () => {
		const sql =
			"WITH src AS (SELECT * FROM staging) INSERT INTO target SELECT * FROM src";
		await queryService.getPage(sql, 0, 100);

		// Executed exactly once, verbatim — no CREATE, no LIMIT appended.
		expect(fake.executed).toEqual([sql]);
	});
});
