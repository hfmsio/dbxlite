/**
 * Introspection Tests
 * Tests for file and XLSX introspection functions
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { introspectFileSchema } from "./file";
import { introspectSheetColumns } from "./xlsx";
import type { DataSource } from "../../../types/data-source";

// Mock query service. Introspection now calls executeQueryOnConnector("duckdb", sql)
// to keep DuckDB-only system queries off whatever connector is active. Both
// methods route to the same mock so existing assertions still pass.
const mockExecuteQuery = vi.fn();
vi.mock("../../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
		executeQueryOnConnector: (_connector: string, ...args: unknown[]) =>
			mockExecuteQuery(...args),
	},
}));

describe("introspection functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("introspectFileSchema", () => {
		it("returns columns from DESCRIBE query", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({
					rows: [
						{ column_name: "id", column_type: "INTEGER", null: "NO" },
						{ column_name: "name", column_type: "VARCHAR", null: "YES" },
					],
				})
				.mockResolvedValueOnce({
					rows: [{ cnt: 1000 }],
				});

			const ds: DataSource = {
				id: "ds-1",
				name: "test.parquet",
				type: "parquet",
				filePath: "/test.parquet",
				uploadedAt: new Date(),
			};

			const result = await introspectFileSchema(ds);

			expect(result.columns).toHaveLength(2);
			expect(result.columns[0]).toEqual({
				name: "id",
				type: "INTEGER",
				nullable: false,
			});
			expect(result.columns[1]).toEqual({
				name: "name",
				type: "VARCHAR",
				nullable: true,
			});
			expect(result.stats.columnCount).toBe(2);
			expect(result.stats.rowCount).toBe(1000);
		});

		it("throws error if no filePath or tableName", async () => {
			const ds: DataSource = {
				id: "ds-1",
				name: "test",
				type: "parquet",
				uploadedAt: new Date(),
			};

			await expect(introspectFileSchema(ds)).rejects.toThrow(
				"No file path or table name",
			);
		});

		it("handles row count failure gracefully", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({
					rows: [{ column_name: "id", column_type: "INTEGER", null: "NO" }],
				})
				.mockRejectedValueOnce(new Error("Count failed"));

			const ds: DataSource = {
				id: "ds-1",
				name: "test.parquet",
				type: "parquet",
				filePath: "/test.parquet",
				uploadedAt: new Date(),
			};

			const result = await introspectFileSchema(ds);

			expect(result.columns).toHaveLength(1);
			expect(result.stats.rowCount).toBeUndefined();
		});

		it("uses tableName if provided instead of filePath", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({
					rows: [{ column_name: "col1", column_type: "TEXT", null: "YES" }],
				})
				.mockResolvedValueOnce({
					rows: [{ cnt: 500 }],
				});

			const ds: DataSource = {
				id: "ds-1",
				name: "test",
				type: "parquet",
				tableName: "my_table",
				filePath: "/ignored.parquet",
				uploadedAt: new Date(),
			};

			await introspectFileSchema(ds);

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				"DESCRIBE SELECT * FROM my_table LIMIT 1",
			);
		});
	});

	describe("introspectSheetColumns", () => {
		const xlsxSource: DataSource = {
			id: "ds-1",
			name: "test.xlsx",
			type: "xlsx",
			filePath: "/test.xlsx",
			uploadedAt: new Date(),
		};

		/** A probe response whose header sits on row 1 (ordinary sheet). */
		const ordinaryProbe = {
			rows: [
				{ A: "id", B: "name" },
				{ A: "1", B: "acme" },
			],
		};

		/** Title on row 1, blank row 2, header row 3 — the reported bug. */
		const reportProbe = {
			rows: [
				{ A: "Account Segmentation", B: null, C: null },
				{ A: null, B: null, C: null },
				{ A: "account_id", B: "segment", C: "arr" },
				{ A: "1", B: "SMB", C: "100" },
			],
		};

		const describeResponse = {
			rows: [
				{ column_name: "A", column_type: "VARCHAR", null: "YES" },
				{ column_name: "B", column_type: "DOUBLE", null: "YES" },
			],
		};

		it("returns columns for XLSX sheet", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(ordinaryProbe)
				.mockResolvedValueOnce(describeResponse);

			const result = await introspectSheetColumns(xlsxSource, "Sheet1");

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("A");
			expect(result[1].name).toBe("B");
		});

		it("describes a report-style sheet through its detected range", async () => {
			// Without the range this DESCRIBEs the title cell and reports the
			// sheet as a single column.
			mockExecuteQuery
				.mockResolvedValueOnce(reportProbe)
				.mockResolvedValueOnce(describeResponse);

			await introspectSheetColumns(xlsxSource, "MASTER (Business Type Led)");

			const describeSQL = mockExecuteQuery.mock.calls[1][0] as string;
			expect(describeSQL).toContain("range='A3:C1048576'");
			// The range alone would pad to the sheet ceiling; both are needed.
			expect(describeSQL).toContain("stop_at_empty=true");
		});

		it("leaves an ordinary sheet on DuckDB's defaults, emitting no range", async () => {
			// A header already at A1 is what read_xlsx assumes by default, so a
			// sheet that always worked with a bare call keeps getting one — no
			// range bolted on just because detection ran.
			mockExecuteQuery
				.mockResolvedValueOnce(ordinaryProbe)
				.mockResolvedValueOnce(describeResponse);

			await introspectSheetColumns(xlsxSource, "Sheet1");

			const describeSQL = mockExecuteQuery.mock.calls[1][0] as string;
			expect(describeSQL).not.toContain("range=");
			expect(describeSQL).not.toContain("stop_at_empty");
		});

		it("skips the probe when the caller already knows the range", async () => {
			mockExecuteQuery.mockResolvedValueOnce(describeResponse);

			await introspectSheetColumns(xlsxSource, "Sheet1", "A3:I1048576");

			expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
			expect(mockExecuteQuery.mock.calls[0][0]).toContain("range='A3:I1048576'");
		});

		it("still describes the sheet when the probe fails", async () => {
			// Detection is an optimisation; a probe failure must not block the read.
			mockExecuteQuery
				.mockRejectedValueOnce(new Error("probe exploded"))
				.mockResolvedValueOnce(describeResponse);

			const result = await introspectSheetColumns(xlsxSource, "Sheet1");

			expect(result).toHaveLength(2);
			expect(mockExecuteQuery.mock.calls[1][0]).not.toContain("range=");
		});

		it("throws error for non-xlsx files", async () => {
			const ds: DataSource = {
				id: "ds-1",
				name: "test.parquet",
				type: "parquet",
				filePath: "/test.parquet",
				uploadedAt: new Date(),
			};

			await expect(introspectSheetColumns(ds, "Sheet1")).rejects.toThrow(
				"only works for XLSX",
			);
		});

		it("throws error if no filePath", async () => {
			const ds: DataSource = {
				id: "ds-1",
				name: "test.xlsx",
				type: "xlsx",
				uploadedAt: new Date(),
			};

			await expect(introspectSheetColumns(ds, "Sheet1")).rejects.toThrow(
				"only works for XLSX",
			);
		});
	});
});
