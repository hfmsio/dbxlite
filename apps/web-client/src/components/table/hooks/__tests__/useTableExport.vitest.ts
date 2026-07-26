/**
 * Tests for useTableExport's cost/scope gate and truncation warning.
 *
 * These pin the behavior added to stop silent, billable cloud exports:
 *   - a cloud export must pause for confirmation before it re-runs the query
 *   - declining runs nothing (nothing billed)
 *   - a DuckDB export is local/free and never pauses
 *   - a capped Parquet export warns loudly instead of looking complete
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getActiveConnectorType: vi.fn(() => "duckdb"),
	estimateBigQueryCost: vi.fn(),
	execute: vi.fn(),
	strategyName: "fake",
}));

vi.mock("../../../../services/streaming-query-service", () => ({
	queryService: {
		getActiveConnectorType: mocks.getActiveConnectorType,
		estimateBigQueryCost: mocks.estimateBigQueryCost,
	},
}));

vi.mock("../../exporters", () => ({
	pickStrategy: () => ({ name: mocks.strategyName, execute: mocks.execute }),
}));

// showExportFilePicker etc. aren't reached because the strategy is mocked.
import { CLOUD_PARQUET_ROW_CAP } from "../../exporters/cloudStreaming";
import { useTableExport } from "../useTableExport";

const columns = [{ name: "a", type: "STRING", width: 120 }];

function setup(over: Partial<Parameters<typeof useTableExport>[0]> = {}) {
	const showToast = vi.fn();
	const view = renderHook(() =>
		useTableExport({
			sql: "SELECT * FROM `p.d.t`",
			columns,
			showToast,
			...over,
		}),
	);
	return { view, showToast };
}

describe("useTableExport cost/scope gate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("duckdb");
		mocks.execute.mockResolvedValue({
			fileHandleName: "out.parquet",
			rowsExported: 5,
		});
		mocks.estimateBigQueryCost.mockResolvedValue({
			estimatedBytes: 1_000_000_000,
			estimatedCostUSD: 2.5,
			cachingPossible: false,
		});
	});

	it("does not pause for a DuckDB export", async () => {
		mocks.getActiveConnectorType.mockReturnValue("duckdb");
		const { view } = setup();

		await act(async () => {
			await view.result.current.handleExport("parquet");
		});

		expect(view.result.current.exportPreview).toBeNull();
		expect(mocks.execute).toHaveBeenCalledTimes(1);
	});

	it("pauses a BigQuery export for confirmation before running", async () => {
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		const { view } = setup();

		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});

		// The preview is up and nothing has run yet.
		expect(view.result.current.exportPreview).not.toBeNull();
		expect(mocks.execute).not.toHaveBeenCalled();

		await act(async () => {
			view.result.current.confirmExportPreview();
			await pending;
		});

		expect(mocks.execute).toHaveBeenCalledTimes(1);
	});

	it("surfaces the BigQuery cost estimate in the preview", async () => {
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		const { view } = setup();

		await act(async () => {
			view.result.current.handleExport("parquet");
		});

		expect(view.result.current.exportPreview).toMatchObject({
			connectorType: "bigquery",
			rerunsRemotely: true,
			estimatedCostUSD: 2.5,
			estimatedBytes: 1_000_000_000,
		});
	});

	it("runs nothing when the user declines (nothing billed)", async () => {
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		const { view } = setup();

		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.cancelExportPreview();
			await pending;
		});

		expect(mocks.execute).not.toHaveBeenCalled();
		expect(view.result.current.exportPreview).toBeNull();
	});

	it("still shows the preview for Snowflake, without a cost figure", async () => {
		mocks.getActiveConnectorType.mockReturnValue("snowflake");
		const { view } = setup();

		await act(async () => {
			view.result.current.handleExport("parquet");
		});

		expect(view.result.current.exportPreview).toMatchObject({
			connectorType: "snowflake",
			rerunsRemotely: true,
		});
		expect(view.result.current.exportPreview?.estimatedCostUSD).toBeUndefined();
		expect(mocks.estimateBigQueryCost).not.toHaveBeenCalled();
	});

	it("proceeds even if the cost estimate fails", async () => {
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		mocks.estimateBigQueryCost.mockRejectedValue(new Error("dry-run failed"));
		const { view } = setup();

		await act(async () => {
			view.result.current.handleExport("parquet");
		});

		// Still asks — just without numbers.
		expect(view.result.current.exportPreview).toMatchObject({
			connectorType: "bigquery",
			estimatedCostUSD: undefined,
		});
	});
});

describe("useTableExport truncation warning", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		mocks.estimateBigQueryCost.mockResolvedValue({
			estimatedBytes: 1,
			estimatedCostUSD: 0.01,
			cachingPossible: false,
		});
	});

	it("warns loudly when a cloud Parquet export hits the row cap", async () => {
		mocks.execute.mockResolvedValue({
			fileHandleName: "out.parquet",
			rowsExported: CLOUD_PARQUET_ROW_CAP,
		});
		const { view, showToast } = setup({
			estimatedRowCount: 70_600_000,
			rowCountIsEstimated: true,
		});

		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.confirmExportPreview();
			await pending;
		});

		await waitFor(() =>
			expect(
				showToast.mock.calls.some(
					([msg, level]) =>
						typeof msg === "string" &&
						msg.includes("TRUNCATED") &&
						level === "warning",
				),
			).toBe(true),
		);
	});

	it("reports success when the export fits under the cap", async () => {
		mocks.execute.mockResolvedValue({
			fileHandleName: "out.parquet",
			rowsExported: 500,
		});
		const { view, showToast } = setup({ estimatedRowCount: 500 });

		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.confirmExportPreview();
			await pending;
		});

		const truncated = showToast.mock.calls.some(
			([msg]) => typeof msg === "string" && msg.includes("TRUNCATED"),
		);
		expect(truncated).toBe(false);
	});
});

describe("useTableExport ESC cancel confirmation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
		mocks.estimateBigQueryCost.mockResolvedValue({
			estimatedBytes: 1,
			estimatedCostUSD: 0.01,
			cachingPossible: false,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const pressEsc = () =>
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);

	/** Start an export that hangs in execute() so it stays in-flight. */
	function startHangingExport() {
		let release!: () => void;
		mocks.execute.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () =>
						resolve({ fileHandleName: "out.parquet", rowsExported: 5 });
				}),
		);
		return { release: () => release() };
	}

	it("ESC opens a confirm prompt instead of aborting immediately", async () => {
		startHangingExport();
		const { view } = setup();

		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.confirmExportPreview();
		});

		expect(view.result.current.isExporting).toBe(true);
		expect(view.result.current.cancelPrompt).toBe(false);

		await act(async () => {
			pressEsc();
		});

		// Prompted, not cancelled — the export is still running.
		expect(view.result.current.cancelPrompt).toBe(true);
		expect(view.result.current.isExporting).toBe(true);
		void pending;
	});

	it("dismissing the prompt keeps the export running", async () => {
		startHangingExport();
		const { view } = setup();
		await act(async () => {
			view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.confirmExportPreview();
		});
		await act(async () => {
			pressEsc();
		});

		await act(async () => {
			view.result.current.dismissCancelExport();
		});

		expect(view.result.current.cancelPrompt).toBe(false);
		expect(view.result.current.isExporting).toBe(true);
	});

	it("confirming the prompt aborts the export", async () => {
		let seenSignal: AbortSignal | undefined;
		mocks.execute.mockImplementation(
			(c: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					seenSignal = c.signal;
					c.signal.addEventListener("abort", () => {
						const err = new Error("Export cancelled by user");
						reject(err);
					});
				}),
		);
		const { view } = setup();
		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.handleExport("parquet");
		});
		await act(async () => {
			view.result.current.confirmExportPreview();
		});
		await act(async () => {
			pressEsc();
		});

		await act(async () => {
			view.result.current.confirmCancelExport();
			await pending;
		});

		expect(seenSignal?.aborted).toBe(true);
		expect(view.result.current.isExporting).toBe(false);
		expect(view.result.current.cancelPrompt).toBe(false);
	});
});
