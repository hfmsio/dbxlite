/**
 * Tests for useServerDatabases hook
 *
 * Tests database discovery, schema introspection, and cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useServerDatabases } from "../useServerDatabases";

// Mock fixtures
const mockDatabasesResponse = {
	rows: [
		{ database_name: "sales", path: "/data/sales.duckdb", readonly: false },
		{ database_name: "analytics", path: "/data/analytics.duckdb", readonly: true },
	],
	columns: ["database_name", "path", "readonly"],
};

const mockEmptyResponse = { rows: [], columns: [] };

// Mock query service
const mockExecuteQuery = vi.fn();
const mockIsConnectorReady = vi.fn();
const mockOnSchemaChange = vi.fn((_cb: unknown) => vi.fn());

vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: (sql: string) => mockExecuteQuery(sql),
		isConnectorReady: () => mockIsConnectorReady(),
		onSchemaChange: (cb: unknown) => mockOnSchemaChange(cb),
	},
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("useServerDatabases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsConnectorReady.mockReturnValue(true);
		mockExecuteQuery.mockResolvedValue(mockEmptyResponse);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("initialization", () => {
		it("returns empty state when not in HTTP mode", () => {
			const { result } = renderHook(() => useServerDatabases(false));

			expect(result.current.databases).toEqual([]);
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBe(null);
			expect(result.current.hasContent).toBe(false);
		});

		it("starts with loading=false initially", () => {
			const { result } = renderHook(() => useServerDatabases(true));

			expect(result.current.isLoading).toBe(false);
		});
	});

	describe("database discovery", () => {
		it("fetches databases from duckdb_databases()", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("duckdb_databases()")
			);
		});

		it("excludes system and temp databases", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("NOT IN ('memory', 'system', 'temp')")
			);
		});

		it("fetches tables for discovered databases", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(mockDatabasesResponse)
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("duckdb_tables()")
			);
		});

		it("fetches views for discovered databases", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(mockDatabasesResponse)
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("duckdb_views()")
			);
		});
	});

	describe("connector readiness", () => {
		it("skips refresh when connector not ready", async () => {
			mockIsConnectorReady.mockReturnValue(false);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).not.toHaveBeenCalled();
		});

		it("refreshes when connector becomes ready", async () => {
			mockIsConnectorReady.mockReturnValue(true);
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(mockExecuteQuery).toHaveBeenCalled();
		});
	});

	describe("schema introspection", () => {
		it("uses escapeStringLiteral for SQL safety", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({
					rows: [{ database_name: "test'db", path: null, readonly: false }],
					columns: ["database_name", "path", "readonly"],
				})
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			// Should have escaped the single quote
			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("test''db")
			);
		});
	});

	describe("refresh", () => {
		it("refreshDatabases updates state", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(result.current.lastRefreshed).not.toBe(null);
		});

		it("handles errors gracefully", async () => {
			mockExecuteQuery.mockRejectedValue(new Error("Connection failed"));

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(result.current.error).toBe("Connection failed");
			expect(result.current.isLoading).toBe(false);
		});

		it("sets lastRefreshed timestamp on success", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			const before = new Date();
			await act(async () => {
				await result.current.refreshDatabases();
			});
			const after = new Date();

			expect(result.current.lastRefreshed).not.toBe(null);
			expect(result.current.lastRefreshed!.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(result.current.lastRefreshed!.getTime()).toBeLessThanOrEqual(after.getTime());
		});
	});

	describe("schema change subscription", () => {
		it("subscribes to schema changes on mount in http mode", () => {
			renderHook(() => useServerDatabases(true));

			expect(mockOnSchemaChange).toHaveBeenCalled();
		});

		it("does not subscribe in wasm mode", () => {
			renderHook(() => useServerDatabases(false));

			expect(mockOnSchemaChange).not.toHaveBeenCalled();
		});

		it("unsubscribes on unmount", () => {
			const mockUnsubscribe = vi.fn();
			mockOnSchemaChange.mockReturnValue(mockUnsubscribe);

			const { unmount } = renderHook(() => useServerDatabases(true));

			unmount();

			expect(mockUnsubscribe).toHaveBeenCalled();
		});
	});

	describe("hasContent", () => {
		it("returns false when no databases", () => {
			const { result } = renderHook(() => useServerDatabases(false));

			expect(result.current.hasContent).toBe(false);
		});

		it("returns true when databases exist", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(mockDatabasesResponse)
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useServerDatabases(true));

			await act(async () => {
				await result.current.refreshDatabases();
			});

			expect(result.current.hasContent).toBe(true);
			expect(result.current.databases.length).toBe(2);
		});
	});
});
