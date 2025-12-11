/**
 * Introspection Tests
 * Tests for file and XLSX introspection functions
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { introspectFileSchema } from "./file";
import { introspectSheetColumns } from "./xlsx";
import type { DataSource } from "../../../types/data-source";

// Mock query service
const mockExecuteQuery = vi.fn();
vi.mock("../../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
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
		it("returns columns for XLSX sheet", async () => {
			mockExecuteQuery.mockResolvedValueOnce({
				rows: [
					{ column_name: "A", column_type: "VARCHAR", null: "YES" },
					{ column_name: "B", column_type: "DOUBLE", null: "YES" },
				],
			});

			const ds: DataSource = {
				id: "ds-1",
				name: "test.xlsx",
				type: "xlsx",
				filePath: "/test.xlsx",
				uploadedAt: new Date(),
			};

			const result = await introspectSheetColumns(ds, "Sheet1");

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("A");
			expect(result[1].name).toBe("B");
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
