/**
 * useQueryExecution Hook Tests
 * Tests for query execution with DuckDB and BigQuery support
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQueryExecution } from "../useQueryExecution";

// Mock all dependencies
vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: vi.fn(),
		getRowCount: vi.fn(),
		getActiveConnectorType: vi.fn(),
		setActiveConnector: vi.fn(),
	},
}));

vi.mock("../../utils/queryExtractor", () => ({
	extractQueryAtCursor: vi.fn(),
}));

vi.mock("../../utils/engineDetectors", () => ({
	detectQueryEngine: vi.fn(),
}));

vi.mock("../../utils/queryErrorFormatter", () => ({
	formatQueryError: vi.fn(),
}));

vi.mock("../../utils/urlDetector", () => ({
	detectRemoteURLs: vi.fn(),
}));

vi.mock("../../utils/timeFormatter", () => ({
	formatExecutionTime: vi.fn(),
}));

vi.mock("../../utils/errorMonitor", () => ({
	errorMonitor: {
		logError: vi.fn(),
	},
}));

// Import mocked modules
import { queryService } from "../../services/streaming-query-service";
import { extractQueryAtCursor } from "../../utils/queryExtractor";
import { detectQueryEngine } from "../../utils/engineDetectors";
import { formatQueryError } from "../../utils/queryErrorFormatter";
import { detectRemoteURLs } from "../../utils/urlDetector";
import { formatExecutionTime } from "../../utils/timeFormatter";

// Mock editor ref
const createMockEditorRef = (
	value: string = "SELECT * FROM test",
	selection: string = "",
	cursorPosition: number = 0,
) => ({
	current: {
		getValue: vi.fn(() => value),
		getSelection: vi.fn(() => selection),
		getCursorPosition: vi.fn(() => cursorPosition),
		setValue: vi.fn(),
	},
});

// Default hook options
const createDefaultOptions = (overrides = {}) => ({
	initializing: false,
	initError: null,
	isUploadingFiles: false,
	isExporting: false,
	editorRef: createMockEditorRef() as any,
	activeConnector: "duckdb" as const,
	activeTabId: "tab-1",
	updateTab: vi.fn(),
	showToast: vi.fn(),
	addRemoteURL: vi.fn(),
	dataSources: [],
	engineDetectionMode: "off" as const,
	switchConnector: vi.fn(),
	isConnectorAvailable: vi.fn(() => true),
	...overrides,
});

describe("useQueryExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(detectRemoteURLs).mockReturnValue([]);
		vi.mocked(formatExecutionTime).mockReturnValue("100ms");
		vi.mocked(extractQueryAtCursor).mockImplementation(
			(fullText, _cursor, selection) => selection || fullText,
		);
		vi.mocked(queryService.getActiveConnectorType).mockReturnValue("duckdb");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("initialization", () => {
		it("should return initial state", () => {
			const { result } = renderHook(() =>
				useQueryExecution(createDefaultOptions()),
			);

			expect(result.current.isQueryExecuting).toBe(false);
			expect(result.current.abortControllerRef.current).toBe(null);
			expect(typeof result.current.handleRunQuery).toBe("function");
			expect(typeof result.current.handleStopQuery).toBe("function");
		});
	});

	describe("early return conditions", () => {
		it("should not execute when initializing", async () => {
			const options = createDefaultOptions({ initializing: true });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
		});

		it("should not execute when init error exists", async () => {
			const options = createDefaultOptions({ initError: "Init failed" });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
		});

		it("should not execute when uploading files", async () => {
			const options = createDefaultOptions({ isUploadingFiles: true });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
		});

		it("should not execute when exporting", async () => {
			const options = createDefaultOptions({ isExporting: true });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
		});

		it("should show error when editor not ready", async () => {
			const updateTab = vi.fn();
			const options = createDefaultOptions({
				editorRef: { current: null },
				updateTab,
			});
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(updateTab).toHaveBeenCalledWith("tab-1", {
				error: "Editor not ready",
			});
		});

		it("should show error for empty query", async () => {
			const updateTab = vi.fn();
			vi.mocked(extractQueryAtCursor).mockReturnValue("   ");

			const options = createDefaultOptions({ updateTab });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(updateTab).toHaveBeenCalledWith("tab-1", {
				error: "Please enter a SQL query",
			});
		});
	});

	describe("query execution - small results", () => {
		it("should execute query and update tab with results", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockResult = {
				rows: [{ id: 1, name: "test" }],
				columns: ["id", "name"],
				totalRows: 1,
				executionTime: 100,
			};

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM test");
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 1,
				isEstimated: false,
			});
			vi.mocked(queryService.executeQuery).mockResolvedValue(mockResult);

			const options = createDefaultOptions({ updateTab, showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			// Should update tab with loading state
			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					loading: true,
					error: null,
				}),
			);

			// Should update tab with results
			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					result: mockResult,
					loading: false,
					useVirtualTable: false,
				}),
			);
		});
	});

	describe("query execution - large results", () => {
		it("should use virtual table for large result sets", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM big_table");
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000,
				isEstimated: true,
			});

			const options = createDefaultOptions({ updateTab, showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			// Should set virtual table mode
			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					useVirtualTable: true,
					estimatedRowCount: 50000,
				}),
			);
		});

		it("should show large result message", async () => {
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM big_table");
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000,
				isEstimated: false,
			});

			const options = createDefaultOptions({ showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("50,000 rows"),
				"info",
				5000,
			);
		});
	});

	describe("engine detection", () => {
		it("should auto-switch to BigQuery when detected", async () => {
			const switchConnector = vi.fn(() => true);
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue(
				"SELECT * FROM `project.dataset.table`",
			);
			vi.mocked(detectQueryEngine).mockReturnValue({
				engine: "bigquery",
				confidence: "high",
				signals: ["backtick-quoted identifiers"],
			});
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 10,
				isEstimated: false,
			});
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 50,
			});

			const options = createDefaultOptions({
				engineDetectionMode: "auto",
				switchConnector,
				showToast,
			});
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(switchConnector).toHaveBeenCalledWith("bigquery");
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Auto-switched to bigquery"),
				"info",
				3000,
			);
		});

		it("should suggest switch without executing in suggest mode", async () => {
			const switchConnector = vi.fn();
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue(
				"SELECT * FROM `project.dataset.table`",
			);
			vi.mocked(detectQueryEngine).mockReturnValue({
				engine: "bigquery",
				confidence: "high",
				signals: ["backtick-quoted identifiers"],
			});

			const options = createDefaultOptions({
				engineDetectionMode: "suggest",
				switchConnector,
				showToast,
			});
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			// Should NOT switch
			expect(switchConnector).not.toHaveBeenCalled();
			// Should NOT execute
			expect(queryService.executeQuery).not.toHaveBeenCalled();
			// Should show suggestion toast
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("looks like bigquery"),
				"warning",
				5000,
			);
		});

		it("should not detect engine when mode is off", async () => {
			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM test");
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 10,
				isEstimated: false,
			});
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 50,
			});

			const options = createDefaultOptions({ engineDetectionMode: "off" });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(detectQueryEngine).not.toHaveBeenCalled();
		});
	});

	describe("query cancellation", () => {
		it("should abort query when handleStopQuery is called", async () => {
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM test");
			// Make the query take a long time
			vi.mocked(queryService.getRowCount).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ count: 10, isEstimated: false }), 5000)),
			);

			const options = createDefaultOptions({ showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			// Start the query
			act(() => {
				result.current.handleRunQuery();
			});

			// Capture the abort controller before stopping (it gets nulled after abort)
			const abortController = result.current.abortControllerRef.current;
			expect(abortController).not.toBeNull();

			// Stop the query
			act(() => {
				result.current.handleStopQuery();
			});

			expect(showToast).toHaveBeenCalledWith("Query cancelled", "info", 2000);
			// Verify abort was called on the captured controller
			expect(abortController?.signal.aborted).toBe(true);
			// Verify the ref was cleaned up
			expect(result.current.abortControllerRef.current).toBeNull();
		});
	});

	describe("error handling", () => {
		it("should handle query errors and show formatted message", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM missing");
			vi.mocked(queryService.getRowCount).mockRejectedValue(
				new Error("Table not found"),
			);
			vi.mocked(formatQueryError).mockReturnValue({
				userMessage: "Table 'missing' does not exist",
				catalogName: undefined,
			});

			const options = createDefaultOptions({ updateTab, showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					error: "Table 'missing' does not exist",
					loading: false,
				}),
			);

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Query failed"),
				"error",
				7000,
			);
		});

		it("should handle abort errors gracefully", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue("SELECT * FROM test");
			const abortError = new Error("Aborted");
			abortError.name = "AbortError";
			vi.mocked(queryService.getRowCount).mockRejectedValue(abortError);

			const options = createDefaultOptions({ updateTab, showToast });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					error: "Query cancelled by user",
				}),
			);

			expect(showToast).toHaveBeenCalledWith("Query cancelled", "info", 2000);
		});
	});

	describe("remote URL detection", () => {
		it("should detect and add remote URLs after successful query", async () => {
			const addRemoteURL = vi.fn().mockResolvedValue({ id: "ds-1" });

			vi.mocked(extractQueryAtCursor).mockReturnValue(
				"SELECT * FROM 'https://example.com/data.parquet'",
			);
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 10,
				isEstimated: false,
			});
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 50,
			});
			vi.mocked(detectRemoteURLs).mockReturnValue([
				{ url: "https://example.com/data.parquet", type: "parquet" },
			]);

			const options = createDefaultOptions({ addRemoteURL });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			expect(addRemoteURL).toHaveBeenCalledWith(
				"https://example.com/data.parquet",
				"parquet",
			);
		});
	});

	describe("BigQuery execution", () => {
		it("should execute BigQuery query without row count estimation", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockResult = {
				rows: [{ count: 100 }],
				columns: ["count"],
				totalRows: 1,
				executionTime: 200,
			};

			vi.mocked(extractQueryAtCursor).mockReturnValue(
				"SELECT COUNT(*) FROM dataset.table",
			);
			vi.mocked(queryService.executeQuery).mockResolvedValue(mockResult);

			const options = createDefaultOptions({
				activeConnector: "bigquery",
				updateTab,
				showToast,
			});
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			// Should NOT call getRowCount for BigQuery
			expect(queryService.getRowCount).not.toHaveBeenCalled();

			// Should show BigQuery toast
			expect(showToast).toHaveBeenCalledWith(
				"Running BigQuery query...",
				"info",
				2000,
			);

			// Should update with results
			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					result: mockResult,
					loading: false,
				}),
			);
		});
	});

	describe("aggregation query handling", () => {
		it("should not use virtual table for aggregation queries", async () => {
			const updateTab = vi.fn();

			vi.mocked(extractQueryAtCursor).mockReturnValue(
				"SELECT COUNT(*) FROM big_table GROUP BY category",
			);
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000, // Large input
				isEstimated: false,
			});
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [{ count: 5 }], // Small output
				columns: ["count"],
				totalRows: 1,
				executionTime: 100,
			});

			const options = createDefaultOptions({ updateTab });
			const { result } = renderHook(() => useQueryExecution(options));

			await act(async () => {
				await result.current.handleRunQuery();
			});

			// Should NOT use virtual table for aggregation
			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					useVirtualTable: false,
				}),
			);
		});
	});
});
