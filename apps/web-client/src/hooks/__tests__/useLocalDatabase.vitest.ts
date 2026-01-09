/**
 * Tests for useLocalDatabase hook
 *
 * Tests local database introspection, table discovery, and refresh logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalDatabase } from "../useLocalDatabase";

// Mock fixtures
const mockTablesResponse = {
	rows: [
		{ table_schema: "main", table_name: "users", table_type: "BASE TABLE" },
		{ table_schema: "main", table_name: "orders", table_type: "BASE TABLE" },
	],
	columns: ["table_schema", "table_name", "table_type"],
};

const mockViewsResponse = {
	rows: [
		{ table_schema: "main", table_name: "active_users", table_type: "VIEW" },
	],
	columns: ["table_schema", "table_name", "table_type"],
};

const mockColumnsResponse = {
	rows: [
		{ column_name: "id", data_type: "INTEGER", is_nullable: "NO" },
		{ column_name: "name", data_type: "VARCHAR", is_nullable: "YES" },
	],
	columns: ["column_name", "data_type", "is_nullable"],
};

const mockCountResponse = {
	rows: [{ cnt: 500 }],
	columns: ["cnt"],
};

const mockSizeResponse = {
	rows: [{ estimated_size: 1024000 }],
	columns: ["estimated_size"],
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

describe("useLocalDatabase", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsConnectorReady.mockReturnValue(true);
		mockExecuteQuery.mockResolvedValue(mockEmptyResponse);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("initialization", () => {
		it("returns empty state initially", () => {
			mockIsConnectorReady.mockReturnValue(false);

			const { result } = renderHook(() => useLocalDatabase());

			expect(result.current.schemas).toEqual([]);
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBe(null);
			expect(result.current.hasContent).toBe(false);
		});

		it("starts with correct default state", () => {
			const { result } = renderHook(() => useLocalDatabase());

			expect(result.current.schemas).toEqual([]);
			expect(result.current.lastRefreshed).toBe(null);
		});
	});

	describe("table discovery", () => {
		it("queries duckdb_tables() for tables", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("duckdb_tables()")
			);
		});

		it("filters to memory database and temp tables", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("database_name = 'memory' OR temporary = true")
			);
		});

		it("excludes system schemas", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("NOT IN ('information_schema', 'pg_catalog')")
			);
		});
	});

	describe("view discovery", () => {
		it("queries duckdb_views() for views", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("duckdb_views()")
			);
		});

		it("filters views to memory database", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			const viewsCall = mockExecuteQuery.mock.calls.find(
				(call) => typeof call[0] === "string" && call[0].includes("duckdb_views()")
			);
			expect(viewsCall?.[0]).toContain("database_name = 'memory'");
		});
	});

	describe("column metadata", () => {
		it("fetches column metadata for each table", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({ rows: [{ table_schema: "main", table_name: "users", table_type: "BASE TABLE" }], columns: [] })
				.mockResolvedValueOnce(mockEmptyResponse) // views
				.mockResolvedValueOnce(mockColumnsResponse)
				.mockResolvedValueOnce(mockCountResponse)
				.mockResolvedValueOnce(mockSizeResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("information_schema.columns")
			);
		});
	});

	describe("row count estimation", () => {
		it("gets row count using COUNT(*)", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({ rows: [{ table_schema: "main", table_name: "users", table_type: "BASE TABLE" }], columns: [] })
				.mockResolvedValueOnce(mockEmptyResponse)
				.mockResolvedValueOnce(mockColumnsResponse)
				.mockResolvedValueOnce(mockCountResponse)
				.mockResolvedValueOnce(mockSizeResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).toHaveBeenCalledWith(
				expect.stringContaining("COUNT(*)")
			);
		});

		it("handles count errors gracefully", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({ rows: [{ table_schema: "main", table_name: "users", table_type: "BASE TABLE" }], columns: [] })
				.mockResolvedValueOnce(mockEmptyResponse)
				.mockResolvedValueOnce(mockColumnsResponse)
				.mockRejectedValueOnce(new Error("Count failed"))
				.mockResolvedValueOnce(mockSizeResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			// Should not have an error - count errors are silently handled
			expect(result.current.error).toBe(null);
		});
	});

	describe("refresh", () => {
		it("refreshSchema updates state", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(result.current.lastRefreshed).not.toBe(null);
		});

		it("handles errors and sets error state", async () => {
			mockExecuteQuery.mockRejectedValue(new Error("Query failed"));

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(result.current.error).toBe("Query failed");
			expect(result.current.isLoading).toBe(false);
		});

		it("skips refresh when connector not ready", async () => {
			mockIsConnectorReady.mockReturnValue(false);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(mockExecuteQuery).not.toHaveBeenCalled();
		});
	});

	describe("schema change subscription", () => {
		it("subscribes to schema changes on mount", () => {
			renderHook(() => useLocalDatabase());

			expect(mockOnSchemaChange).toHaveBeenCalled();
		});

		it("unsubscribes on unmount", () => {
			const mockUnsubscribe = vi.fn();
			mockOnSchemaChange.mockReturnValue(mockUnsubscribe);

			const { unmount } = renderHook(() => useLocalDatabase());

			unmount();

			expect(mockUnsubscribe).toHaveBeenCalled();
		});
	});

	describe("hasContent", () => {
		it("returns false when schemas are empty", () => {
			const { result } = renderHook(() => useLocalDatabase());

			expect(result.current.hasContent).toBe(false);
		});

		it("returns false when schemas have no tables", async () => {
			mockExecuteQuery.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(result.current.hasContent).toBe(false);
		});

		it("returns true when tables exist", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(mockTablesResponse)
				.mockResolvedValueOnce(mockEmptyResponse) // views
				.mockResolvedValue(mockEmptyResponse); // columns, count, size

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			expect(result.current.hasContent).toBe(true);
		});
	});

	describe("table types", () => {
		it("correctly identifies views", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce(mockEmptyResponse) // tables
				.mockResolvedValueOnce(mockViewsResponse) // views
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			const mainSchema = result.current.schemas.find((s) => s.name === "main");
			expect(mainSchema?.tables[0].type).toBe("view");
		});

		it("correctly identifies temp tables", async () => {
			mockExecuteQuery
				.mockResolvedValueOnce({
					rows: [{ table_schema: "temp", table_name: "temp_data", table_type: "TEMP TABLE" }],
					columns: [],
				})
				.mockResolvedValueOnce(mockEmptyResponse) // views
				.mockResolvedValue(mockEmptyResponse);

			const { result } = renderHook(() => useLocalDatabase());

			await act(async () => {
				await result.current.refreshSchema();
			});

			const tempSchema = result.current.schemas.find((s) => s.name === "temp");
			expect(tempSchema?.tables[0].isTemporary).toBe(true);
		});
	});
});
