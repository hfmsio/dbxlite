/**
 * Tests for the DuckDB COPY export strategy — focused on the row count, which
 * used to be hardcoded to 0 (the file was fine, the reported count was not).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getActiveConnectorType: vi.fn(() => "duckdb"),
	executeQuery: vi.fn(),
	copyFileToBuffer: vi.fn(),
	dropFile: vi.fn(),
	showExportFilePicker: vi.fn(),
	saveToFileHandle: vi.fn(),
}));

vi.mock("../../../../services/streaming-query-service", () => ({
	queryService: {
		getActiveConnectorType: mocks.getActiveConnectorType,
		executeQuery: mocks.executeQuery,
		copyFileToBuffer: mocks.copyFileToBuffer,
		dropFile: mocks.dropFile,
	},
}));

vi.mock("../../exportUtils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../exportUtils")>();
	return {
		...actual,
		showExportFilePicker: mocks.showExportFilePicker,
		saveToFileHandle: mocks.saveToFileHandle,
	};
});

import { duckdbCopyStrategy as strat } from "../duckdbCopy";
import type { ExportContext } from "../types";

function ctx(): ExportContext {
	return {
		format: "parquet",
		fileName: "out.parquet",
		sql: "SELECT * FROM hits.main.hits100k",
		columns: [{ name: "a", type: "STRING", width: 100 }],
		signal: new AbortController().signal,
		onProgress: () => {},
	} as ExportContext;
}

describe("duckdbCopy row count", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("duckdb");
		mocks.showExportFilePicker.mockResolvedValue({ name: "out.parquet" });
		mocks.copyFileToBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]));
		mocks.dropFile.mockResolvedValue(undefined);
		mocks.saveToFileHandle.mockResolvedValue(undefined);
	});

	it("reports the real count from COPY's Count column", async () => {
		mocks.executeQuery.mockResolvedValue({
			rows: [{ Count: 100000 }],
			columns: ["Count"],
			totalRows: 1,
			executionTime: 5,
		});

		const result = await strat.execute(ctx());

		expect(result.rowsExported).toBe(100000);
	});

	it("reads the count positionally even if the column is renamed", async () => {
		mocks.executeQuery.mockResolvedValue({
			rows: [{ rows_written: 42 }],
			columns: ["rows_written"],
			totalRows: 1,
			executionTime: 5,
		});

		const result = await strat.execute(ctx());

		expect(result.rowsExported).toBe(42);
	});

	it("reports 0 for a genuinely empty COPY result", async () => {
		mocks.executeQuery.mockResolvedValue({
			rows: [],
			columns: [],
			totalRows: 0,
			executionTime: 5,
		});

		const result = await strat.execute(ctx());

		expect(result.rowsExported).toBe(0);
	});

	it("still runs the COPY with the SQL and format", async () => {
		mocks.executeQuery.mockResolvedValue({ rows: [{ Count: 7 }] });

		await strat.execute(ctx());

		expect(mocks.executeQuery).toHaveBeenCalledWith(
			expect.stringContaining("COPY (SELECT * FROM hits.main.hits100k) TO"),
			expect.anything(),
		);
	});
});
