/**
 * Selectors Tests
 * Tests for granular selector hooks
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDataSourceStore } from "./store";
import {
	useDataSources,
	useDatabases,
	useFiles,
	useRemoteFiles,
	useLocalFiles,
	useDataSourceById,
	useAddDataSource,
	useRemoveDataSource,
	useDataSourcesLegacy,
} from "./selectors";

// Mock dependencies
vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
		getActiveConnectorType: vi.fn().mockReturnValue("duckdb"),
		setActiveConnector: vi.fn(),
	},
}));

vi.mock("../../services/file-handle-store", () => ({
	fileHandleStore: {
		removeHandle: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../utils/sqlSanitizer", () => ({
	buildDetachSQL: vi.fn((alias: string) => `DETACH ${alias}`),
	buildAttachSQL: vi.fn(
		(path: string, alias: string) => `ATTACH '${path}' AS ${alias}`,
	),
	escapeStringLiteral: vi.fn((s: string) => `'${s}'`),
}));

vi.mock("../../utils/duckdbOperations", () => ({
	generateDatabaseAlias: vi.fn((path: string) => {
		const name = path.split("/").pop()?.replace(".duckdb", "") || "db";
		return name;
	}),
}));

vi.mock("../../utils/remoteFileGrouping", () => ({
	parseRemoteURL: vi.fn(() => null),
}));

describe("selectors", () => {
	beforeEach(() => {
		act(() => {
			useDataSourceStore.setState({
				dataSources: [
					{
						id: "ds-1",
						name: "db.duckdb",
						type: "duckdb",
						uploadedAt: new Date(),
					},
					{
						id: "ds-2",
						name: "local.parquet",
						type: "parquet",
						uploadedAt: new Date(),
						isRemote: false,
					},
					{
						id: "ds-3",
						name: "remote.csv",
						type: "csv",
						uploadedAt: new Date(),
						isRemote: true,
					},
					{
						id: "ds-4",
						name: "data.json",
						type: "json",
						uploadedAt: new Date(),
					},
				],
				isLoadingFromStorage: false,
				pendingOperations: new Map(),
				introspectingIds: new Set(),
				operationErrors: {},
			});
		});
	});

	describe("useDataSources", () => {
		it("returns all data sources", () => {
			const { result } = renderHook(() => useDataSources());
			expect(result.current).toHaveLength(4);
		});
	});

	describe("useDatabases", () => {
		it("returns only duckdb type", () => {
			const { result } = renderHook(() => useDatabases());
			expect(result.current).toHaveLength(1);
			expect(result.current[0].type).toBe("duckdb");
		});
	});

	describe("useFiles", () => {
		it("returns file types (parquet, csv, json, etc.)", () => {
			const { result } = renderHook(() => useFiles());
			expect(result.current).toHaveLength(3);
			expect(result.current.every((f) => f.type !== "duckdb")).toBe(true);
		});
	});

	describe("useRemoteFiles", () => {
		it("returns only remote files", () => {
			const { result } = renderHook(() => useRemoteFiles());
			expect(result.current).toHaveLength(1);
			expect(result.current[0].isRemote).toBe(true);
		});
	});

	describe("useLocalFiles", () => {
		it("returns non-remote, non-duckdb files", () => {
			const { result } = renderHook(() => useLocalFiles());
			expect(result.current).toHaveLength(2);
			expect(
				result.current.every((f) => !f.isRemote && f.type !== "duckdb"),
			).toBe(true);
		});
	});

	describe("useDataSourceById", () => {
		it("returns specific data source", () => {
			const { result } = renderHook(() => useDataSourceById("ds-2"));
			expect(result.current?.name).toBe("local.parquet");
		});

		it("returns undefined for non-existent ID", () => {
			const { result } = renderHook(() => useDataSourceById("non-existent"));
			expect(result.current).toBeUndefined();
		});
	});

	describe("action selectors", () => {
		it("useAddDataSource returns stable function", () => {
			const { result, rerender } = renderHook(() => useAddDataSource());
			const first = result.current;
			rerender();
			expect(result.current).toBe(first);
		});

		it("useRemoveDataSource returns stable function", () => {
			const { result, rerender } = renderHook(() => useRemoveDataSource());
			const first = result.current;
			rerender();
			expect(result.current).toBe(first);
		});
	});

	describe("useDataSourcesLegacy", () => {
		it("returns all expected properties", () => {
			const { result } = renderHook(() => useDataSourcesLegacy());

			expect(result.current).toHaveProperty("dataSources");
			expect(result.current).toHaveProperty("addDataSource");
			expect(result.current).toHaveProperty("addRemoteURL");
			expect(result.current).toHaveProperty("updateDataSource");
			expect(result.current).toHaveProperty("removeDataSource");
			expect(result.current).toHaveProperty("clearAllDataSources");
			expect(result.current).toHaveProperty("getDataSource");
			expect(result.current).toHaveProperty("introspectSchema");
			expect(result.current).toHaveProperty("refreshAllSchemas");
			expect(result.current).toHaveProperty("introspectSheetColumns");
			expect(result.current).toHaveProperty("isLoadingFromStorage");
		});

		it("dataSources matches store state", () => {
			const { result } = renderHook(() => useDataSourcesLegacy());
			expect(result.current.dataSources).toHaveLength(4);
		});
	});
});
