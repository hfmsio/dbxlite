/**
 * Tests for the cloud Parquet strategy's path selection.
 *
 * The safety contract: OPFS is used only when the probe passes, and every
 * other case falls back to the buffered path — so the export works in all
 * scenarios. These pin that wiring without needing real OPFS.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getActiveConnectorType: vi.fn(() => "bigquery"),
	getConnector: vi.fn(),
	copyFileToBuffer: vi.fn(),
	dropFile: vi.fn(),
	showExportFilePicker: vi.fn(),
	saveToFileHandle: vi.fn(),
	streamOpfsFileToWritable: vi.fn(),
	removeOpfsFile: vi.fn(),
}));

vi.mock("../../../../services/streaming-query-service", () => ({
	queryService: {
		getActiveConnectorType: mocks.getActiveConnectorType,
		getConnector: mocks.getConnector,
		copyFileToBuffer: mocks.copyFileToBuffer,
		dropFile: mocks.dropFile,
	},
}));

vi.mock("../../exportUtils", () => ({
	showExportFilePicker: mocks.showExportFilePicker,
	saveToFileHandle: mocks.saveToFileHandle,
}));

vi.mock("../opfsExport", () => ({
	opfsExportName: () => "__scratch.parquet",
	streamOpfsFileToWritable: mocks.streamOpfsFileToWritable,
	removeOpfsFile: mocks.removeOpfsFile,
}));

import { cloudStreamingStrategy as strat } from "../cloudStreaming";
import type { ExportContext } from "../types";

/** A DuckDB connector double with parquet + OPFS capability shape. */
function duckdb(opts: { opfsProbe: boolean }) {
	return {
		exportToParquet: vi.fn(),
		exportToParquetStreaming: vi.fn().mockResolvedValue(1234),
		probeOpfsExport: vi.fn().mockResolvedValue(opts.opfsProbe),
		registerOpfsOutput: vi.fn().mockResolvedValue(undefined),
		releaseOpfsOutput: vi.fn().mockResolvedValue(undefined),
	};
}

const source = () => ({ query: vi.fn(() => (async function* () {})()) });

function ctx(): ExportContext {
	return {
		format: "parquet",
		fileName: "out.parquet",
		sql: "SELECT * FROM `p.d.t`",
		columns: [{ name: "a", type: "STRING", width: 100 }],
		signal: new AbortController().signal,
		onProgress: () => {},
	} as ExportContext;
}

describe("cloudStreaming path selection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		mocks.showExportFilePicker.mockResolvedValue({
			name: "out.parquet",
			createWritable: vi.fn().mockResolvedValue({}),
		});
		mocks.streamOpfsFileToWritable.mockResolvedValue(2048);
		mocks.copyFileToBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]));
		mocks.dropFile.mockResolvedValue(undefined);
		mocks.saveToFileHandle.mockResolvedValue(undefined);
		mocks.removeOpfsFile.mockResolvedValue(undefined);
	});

	it("takes the OPFS path when the probe passes", async () => {
		const dk = duckdb({ opfsProbe: true });
		mocks.getConnector.mockImplementation((t: string) =>
			t === "duckdb" ? dk : source(),
		);

		const result = await strat.execute(ctx());

		expect(dk.registerOpfsOutput).toHaveBeenCalledWith("__scratch.parquet");
		expect(mocks.streamOpfsFileToWritable).toHaveBeenCalled();
		expect(mocks.removeOpfsFile).toHaveBeenCalledWith("__scratch.parquet");
		// OPFS path never buffers the whole file.
		expect(mocks.copyFileToBuffer).not.toHaveBeenCalled();
		expect(result.rowsExported).toBe(1234);
	});

	it("streams with no row cap on the OPFS path", async () => {
		const dk = duckdb({ opfsProbe: true });
		const src = source();
		mocks.getConnector.mockImplementation((t: string) =>
			t === "duckdb" ? dk : src,
		);

		await strat.execute(ctx());

		const opts = (src.query.mock.calls[0] as unknown[])?.[1] as {
			maxRows?: number;
		};
		expect(opts.maxRows).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("falls back to the buffered path when the probe fails", async () => {
		const dk = duckdb({ opfsProbe: false });
		mocks.getConnector.mockImplementation((t: string) =>
			t === "duckdb" ? dk : source(),
		);

		const result = await strat.execute(ctx());

		expect(dk.registerOpfsOutput).not.toHaveBeenCalled();
		expect(mocks.streamOpfsFileToWritable).not.toHaveBeenCalled();
		expect(mocks.copyFileToBuffer).toHaveBeenCalled();
		expect(mocks.saveToFileHandle).toHaveBeenCalled();
		expect(result.rowsExported).toBe(1234);
	});

	it("caps rows on the buffered fallback path", async () => {
		const dk = duckdb({ opfsProbe: false });
		const src = source();
		mocks.getConnector.mockImplementation((t: string) =>
			t === "duckdb" ? dk : src,
		);

		await strat.execute(ctx());

		const opts = (src.query.mock.calls[0] as unknown[])?.[1] as {
			maxRows?: number;
		};
		// Capped, not MAX_SAFE_INTEGER.
		expect(opts.maxRows).toBeLessThan(Number.MAX_SAFE_INTEGER);
	});

	it("cleans up the scratch file if the OPFS path throws", async () => {
		const dk = duckdb({ opfsProbe: true });
		dk.exportToParquetStreaming.mockRejectedValue(new Error("copy failed"));
		mocks.getConnector.mockImplementation((t: string) =>
			t === "duckdb" ? dk : source(),
		);

		await expect(strat.execute(ctx())).rejects.toThrow("copy failed");
		expect(mocks.removeOpfsFile).toHaveBeenCalledWith("__scratch.parquet");
	});
});
