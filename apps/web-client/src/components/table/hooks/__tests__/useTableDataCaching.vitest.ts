import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { queryService } from "../../../../services/streaming-query-service";
import { useTableData } from "../useTableData";

// Mock the query service
vi.mock("../../../../services/streaming-query-service", () => ({
	queryService: {
		getRowCount: vi.fn(),
		getPage: vi.fn(),
		getActiveConnectorType: vi.fn(() => "duckdb"),
	},
}));

// Mock ref for scrollContainerRef
const mockScrollContainerRef = {
	current: { clientWidth: 1200 },
} as React.RefObject<HTMLDivElement>;

// Helper to generate mock rows
const generateRows = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		name: `Row ${i + 1}`,
		value: i * 10,
	}));

const mockColumns = [
	{ name: "id", type: "INTEGER" },
	{ name: "name", type: "VARCHAR" },
	{ name: "value", type: "INTEGER" },
];

describe("useTableData caching behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("small result sets (rows < pageSize)", () => {
		test("should cache immediately when first page contains all results", async () => {
			const smallResultSet = generateRows(9); // 9 rows, simulating filtered CTE result
			const pageSize = 100;
			const cacheThreshold = 10000;

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 25000, // EXPLAIN estimate - inaccurate for filtered queries
				isEstimated: true,
			});

			vi.mocked(queryService.getPage).mockResolvedValue({
				rows: smallResultSet,
				columns: mockColumns,
				startIndex: 0,
				endIndex: smallResultSet.length,
				done: true,
			});

			const { result } = renderHook(() =>
				useTableData({
					sql: "WITH filtered AS (SELECT * FROM large_table) SELECT * FROM filtered WHERE col='value'",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Should be cached because first page (9 rows) < pageSize (100)
			expect(result.current.isCacheComplete).toBe(true);
			expect(result.current.cachedAllResults).toHaveLength(9);
			expect(result.current.totalRows).toBe(9); // Actual count, not EXPLAIN estimate
		});

		test("should allow sorting on small cached result set", async () => {
			const smallResultSet = [
				{ id: 3, name: "Charlie", value: 30 },
				{ id: 1, name: "Alice", value: 10 },
				{ id: 2, name: "Bob", value: 20 },
			];
			const pageSize = 100;
			const cacheThreshold = 10000;

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 25000,
				isEstimated: true,
			});
			vi.mocked(queryService.getPage).mockResolvedValue({
				rows: smallResultSet,
				columns: mockColumns,
				startIndex: 0,
				endIndex: smallResultSet.length,
				done: true,
			});

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM test WHERE filter",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			await waitFor(() => {
				expect(result.current.isCacheComplete).toBe(true);
			});

			// Apply sorting
			act(() => {
				result.current.handleColumnSort("name");
			});

			await waitFor(() => {
				expect(result.current.sortColumn).toBe("name");
			});

			// Page data should be sorted
			expect(result.current.pageData[0].name).toBe("Alice");
			expect(result.current.pageData[1].name).toBe("Bob");
			expect(result.current.pageData[2].name).toBe("Charlie");
		});
	});

	describe("medium result sets (pageSize < rows < cacheThreshold)", () => {
		test("should fetch all pages and cache when total rows under threshold", async () => {
			const pageSize = 100;
			const cacheThreshold = 500;
			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 10000,
				isEstimated: true,
			});

			// First page returns full pageSize (need to fetch more)
			// Second page returns full pageSize
			// Third page returns partial (50 rows) - first partial signal
			// Fourth page returns empty - confirms end of data
			vi.mocked(queryService.getPage)
				.mockResolvedValueOnce({
				rows: generateRows(100),
				columns: mockColumns,
				startIndex: 0,
				endIndex: 100,
				done: true,
			}) // page 0
				.mockResolvedValueOnce({
				rows: generateRows(100),
				columns: mockColumns,
				startIndex: 0,
				endIndex: 100,
				done: true,
			}) // page 1
				.mockResolvedValueOnce({ rows: generateRows(50), columns: mockColumns, startIndex: 0, endIndex: 50, done: true }) // page 2 (partial)
				.mockResolvedValueOnce({ rows: [], columns: mockColumns, startIndex: 0, endIndex: 0, done: true }); // page 3 (empty = end)

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM medium_table",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			await waitFor(
				() => {
					expect(result.current.isCacheComplete).toBe(true);
				},
				{ timeout: 5000 },
			);

			// Should have fetched all pages and cached
			expect(result.current.cachedAllResults).toHaveLength(250);
			expect(result.current.totalRows).toBe(250);

			// getPage should be called 4 times (page 0, 1, 2, 3 - with page 3 confirming end)
			expect(queryService.getPage).toHaveBeenCalledTimes(4);
		});

		test("should allow sorting after background caching completes", async () => {
			const pageSize = 100;
			const cacheThreshold = 500;

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 10000,
				isEstimated: true,
			});

			// Return different data to verify sorting works
			const page0 = [
				{ id: 3, name: "Charlie", value: 30 },
				...generateRows(99).slice(1),
			];
			const page1 = [
				{ id: 1, name: "Alice", value: 10 },
				...generateRows(99).slice(1),
			];
			vi.mocked(queryService.getPage)
				.mockResolvedValueOnce({ rows: page0, columns: mockColumns, startIndex: 0, endIndex: page0.length, done: true })
				.mockResolvedValueOnce({ rows: page1, columns: mockColumns, startIndex: 0, endIndex: page1.length, done: true })
				.mockResolvedValueOnce({ rows: [], columns: mockColumns, startIndex: 0, endIndex: 0, done: true }); // empty = end

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM test",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			await waitFor(
				() => {
					expect(result.current.isCacheComplete).toBe(true);
				},
				{ timeout: 5000 },
			);

			// Sorting should work
			act(() => {
				result.current.handleColumnSort("name");
			});

			await waitFor(() => {
				expect(result.current.sortColumn).toBe("name");
			});

			// Should not clear sort (sorting allowed on complete cache)
			expect(result.current.sortColumn).toBe("name");
		});
	});

	describe("large result sets (rows >= cacheThreshold)", () => {
		test("should abort caching when threshold exceeded", async () => {
			const pageSize = 100;
			const cacheThreshold = 200; // Low threshold for testing

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000,
				isEstimated: true,
			});

			// Keep returning full pages to exceed threshold
			vi.mocked(queryService.getPage).mockResolvedValue({
				rows: generateRows(100),
				columns: mockColumns,
				startIndex: 0,
				endIndex: 100,
				done: true,
			});

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM large_table",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			// Wait for caching to abort - both conditions must be true together
			await waitFor(
				() => {
					expect(result.current.isCaching).toBe(false);
					expect(result.current.cachedAllResults).toBeNull();
					expect(result.current.isCacheComplete).toBe(false);
				},
				{ timeout: 5000 },
			);
		});

		test("should reject sorting attempts on large uncached datasets", async () => {
			const pageSize = 100;
			const cacheThreshold = 200;
			const mockShowToast = vi.fn();

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000,
				isEstimated: true,
			});
			vi.mocked(queryService.getPage).mockResolvedValue({
				rows: generateRows(100),
				columns: mockColumns,
				startIndex: 0,
				endIndex: 100,
				done: true,
			});

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM large_table",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
					showToast: mockShowToast,
				}),
			);

			// Wait for caching to abort - both conditions must be true together
			await waitFor(
				() => {
					expect(result.current.isCaching).toBe(false);
					expect(result.current.cachedAllResults).toBeNull();
				},
				{ timeout: 5000 },
			);

			// Try to sort
			act(() => {
				result.current.handleColumnSort("name");
			});

			await waitFor(() => {
				// Sort should be rejected (column reset to null)
				expect(result.current.sortColumn).toBeNull();
			});

			// Should show warning message
			expect(mockShowToast).toHaveBeenCalledWith(
				expect.stringContaining("Dataset too large to sort"),
				"warning",
				expect.any(Number),
			);
		});

		test("should still allow pagination via database queries when cache is null", async () => {
			const pageSize = 100;
			const cacheThreshold = 200;

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 50000,
				isEstimated: false,
			});
			vi.mocked(queryService.getPage).mockResolvedValue({
				rows: generateRows(100),
				columns: mockColumns,
				startIndex: 0,
				endIndex: 100,
				done: true,
			});

			const { result } = renderHook(() =>
				useTableData({
					sql: "SELECT * FROM large_table",
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
				}),
			);

			await waitFor(
				() => {
					expect(result.current.isCaching).toBe(false);
					expect(result.current.cachedAllResults).toBeNull();
				},
				{ timeout: 5000 },
			);

			// Clear mock call count
			vi.mocked(queryService.getPage).mockClear();

			// Load page 2 (should query database, not cache)
			await act(async () => {
				await result.current.loadPage(2);
			});

			// Should have queried database for page 2
			expect(queryService.getPage).toHaveBeenCalledWith(
				"SELECT * FROM large_table",
				200, // offset = page 2 * pageSize 100
				100, // pageSize
				undefined,
			);
		});
	});

	describe("regression test: CTE with WHERE filter", () => {
		test("should cache and allow sorting for CTE query with small filtered result", async () => {
			// This is the exact scenario that caused the regression:
			// CTE query returns 9 rows but EXPLAIN estimates 25,000 from source CSV
			const filteredRows = generateRows(9);
			const pageSize = 100;
			const cacheThreshold = 10000;

			vi.mocked(queryService.getRowCount).mockResolvedValue({
				count: 25000, // DuckDB EXPLAIN estimate from source CSV
				isEstimated: true,
			});

			vi.mocked(queryService.getPage).mockResolvedValue({
			rows: filteredRows, // Actual filtered result: 9 rows
			columns: mockColumns,
			startIndex: 0,
			endIndex: filteredRows.length,
			done: true,
		});

			const mockShowToast = vi.fn();

			const { result } = renderHook(() =>
				useTableData({
					sql: `WITH educational AS (
            SELECT * FROM read_csv('educational-attainment.csv')
          ) SELECT * FROM educational WHERE geoname='California'`,
					pageSize,
					cacheThreshold,
					scrollContainerRef: mockScrollContainerRef,
					showToast: mockShowToast,
				}),
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Key assertions: despite EXPLAIN saying 25K rows, we should cache the actual 9
			expect(result.current.isCacheComplete).toBe(true);
			expect(result.current.cachedAllResults).toHaveLength(9);
			expect(result.current.totalRows).toBe(9); // Actual count, not estimate

			// Now try sorting - this was failing with "Dataset too large to sort"
			act(() => {
				result.current.handleColumnSort("value");
			});

			await waitFor(() => {
				expect(result.current.sortColumn).toBe("value");
			});

			// Sorting should work (not be rejected)
			expect(result.current.sortColumn).toBe("value");
			expect(result.current.pageData).toHaveLength(9);

			// Should show success message, not error
			expect(mockShowToast).toHaveBeenCalledWith(
				expect.stringContaining("Sorted"),
				"success",
				expect.any(Number),
			);
		});
	});
});
