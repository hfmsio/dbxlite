/**
 * Tests for computeExportSql — the decision that fixed the BigQuery
 * "export only got 10K rows" bug.
 */

import { describe, expect, it } from "vitest";
import { computeExportSql } from "../exportSql";

const rows = (n: number) => ({ rows: new Array(n).fill({}) });

describe("computeExportSql", () => {
	it("re-runs for a virtual result (no in-memory rows)", () => {
		expect(
			computeExportSql({
				useVirtualTable: true,
				executedSql: "SELECT * FROM t",
				result: null,
			}),
		).toBe("SELECT * FROM t");
	});

	it("re-runs a truncated non-virtual BigQuery result (the 10K bug)", () => {
		// Grid holds 10K of 70.6M — must re-run to export everything.
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT * FROM `p.d.flights`",
				result: { ...rows(10_000), serverTotalRows: 70_600_000 },
			}),
		).toBe("SELECT * FROM `p.d.flights`");
	});

	it("uses the buffer (no re-run) when it holds the whole result", () => {
		// 50 of 50 rows in memory — re-running would re-scan and re-bill for
		// nothing.
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT * FROM small",
				result: { ...rows(50), serverTotalRows: 50 },
			}),
		).toBeUndefined();
	});

	it("falls back to the row estimate when serverTotalRows is absent", () => {
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT * FROM t",
				result: rows(10_000),
				estimatedRowCount: 500_000,
			}),
		).toBe("SELECT * FROM t");
	});

	it("re-runs when the total is unknown, to avoid silently dropping rows", () => {
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT * FROM t",
				result: rows(10_000),
			}),
		).toBe("SELECT * FROM t");
	});

	it("re-runs when there is no in-memory result at all", () => {
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT 1",
				result: null,
			}),
		).toBe("SELECT 1");
	});

	it("treats an exactly-full buffer as complete", () => {
		expect(
			computeExportSql({
				useVirtualTable: false,
				executedSql: "SELECT * FROM t",
				result: { ...rows(1000), serverTotalRows: 1000 },
			}),
		).toBeUndefined();
	});
});
