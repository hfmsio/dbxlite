/**
 * DataSource Store Tests
 * Tests for the Zustand data source store
 */

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDataSourceStore } from "./store";

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

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		}),
	};
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("dataSourceStore", () => {
	beforeEach(() => {
		act(() => {
			useDataSourceStore.setState({
				dataSources: [],
				isLoadingFromStorage: false,
				pendingOperations: new Map(),
				introspectingIds: new Set(),
				operationErrors: {},
			});
		});
		localStorageMock.clear();
		vi.clearAllMocks();
	});

	// ===== ADD DATA SOURCE =====
	describe("addDataSource", () => {
		it("adds a new data source with generated ID", async () => {
			const store = useDataSourceStore.getState();

			const result = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
					filePath: "/test/test.parquet",
				});
			});

			expect(result.id).toMatch(/^ds-\d+-[a-z0-9]+$/);
			expect(result.name).toBe("test.parquet");
			expect(result.uploadedAt).toBeInstanceOf(Date);
			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
		});

		it("sets isIntrospecting to true initially", async () => {
			const store = useDataSourceStore.getState();

			const result = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
				});
			});

			expect(result.isIntrospecting).toBe(true);
		});

		it("prevents duplicate additions by filePath", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({
					name: "test.parquet",
					type: "parquet",
					filePath: "/test/test.parquet",
				});
			});

			await act(async () => {
				await store.addDataSource({
					name: "test-renamed.parquet",
					type: "parquet",
					filePath: "/test/test.parquet",
				});
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
			expect(useDataSourceStore.getState().dataSources[0].name).toBe(
				"test-renamed.parquet",
			);
		});

		it("prevents duplicate additions by remoteURL", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({
					name: "remote1",
					type: "parquet",
					isRemote: true,
					remoteURL: "https://example.com/data.parquet",
				});
			});

			await act(async () => {
				await store.addDataSource({
					name: "remote2",
					type: "parquet",
					isRemote: true,
					remoteURL: "https://example.com/data.parquet",
				});
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
		});

		it("allows different files with same name but different paths", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({
					name: "data.parquet",
					type: "parquet",
					filePath: "/path1/data.parquet",
				});
				await store.addDataSource({
					name: "data.parquet",
					type: "parquet",
					filePath: "/path2/data.parquet",
				});
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(2);
		});

		it("handles concurrent additions of same file (returns same promise)", async () => {
			const store = useDataSourceStore.getState();

			const [result1, result2] = await act(async () => {
				return Promise.all([
					store.addDataSource({
						name: "test.parquet",
						type: "parquet",
						filePath: "/test/test.parquet",
					}),
					store.addDataSource({
						name: "test.parquet",
						type: "parquet",
						filePath: "/test/test.parquet",
					}),
				]);
			});

			expect(result1.id).toBe(result2.id);
			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
		});

		it("handles rapid sequential additions correctly", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				for (let i = 0; i < 5; i++) {
					await store.addDataSource({
						name: `file${i}.parquet`,
						type: "parquet",
						filePath: `/test/file${i}.parquet`,
					});
				}
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(5);
		});

		it("cleans up pendingOperations after completion", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({
					name: "test.parquet",
					type: "parquet",
					filePath: "/test/test.parquet",
				});
			});

			expect(useDataSourceStore.getState().pendingOperations.size).toBe(0);
		});
	});

	// ===== UPDATE DATA SOURCE =====
	describe("updateDataSource", () => {
		it("updates existing data source", async () => {
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
				});
			});

			act(() => {
				store.updateDataSource(ds.id, { name: "updated.parquet" });
			});

			const updated = useDataSourceStore.getState().dataSources[0];
			expect(updated.name).toBe("updated.parquet");
		});

		it("sets lastAccessedAt on update", async () => {
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
				});
			});

			const before = new Date();
			act(() => {
				store.updateDataSource(ds.id, { name: "updated.parquet" });
			});
			const after = new Date();

			const updated = useDataSourceStore.getState().dataSources[0];
			expect(updated.lastAccessedAt).toBeDefined();
			expect(updated.lastAccessedAt!.getTime()).toBeGreaterThanOrEqual(
				before.getTime(),
			);
			expect(updated.lastAccessedAt!.getTime()).toBeLessThanOrEqual(
				after.getTime(),
			);
		});

		it("preserves other fields when updating", async () => {
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
					filePath: "/test/path",
				});
			});

			act(() => {
				store.updateDataSource(ds.id, { name: "updated.parquet" });
			});

			const updated = useDataSourceStore.getState().dataSources[0];
			expect(updated.type).toBe("parquet");
			expect(updated.filePath).toBe("/test/path");
		});

		it("does nothing for non-existent ID", () => {
			const store = useDataSourceStore.getState();

			act(() => {
				store.updateDataSource("non-existent-id", { name: "test" });
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(0);
		});
	});

	// ===== REMOVE DATA SOURCE =====
	describe("removeDataSource", () => {
		it("removes data source by ID", async () => {
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
				});
			});

			await act(async () => {
				await store.removeDataSource(ds.id);
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(0);
		});

		it("calls fileHandleStore.removeHandle for files with handles", async () => {
			const { fileHandleStore } = await import(
				"../../services/file-handle-store"
			);
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
					hasFileHandle: true,
				});
			});

			await act(async () => {
				await store.removeDataSource(ds.id);
			});

			expect(fileHandleStore.removeHandle).toHaveBeenCalledWith(ds.id);
		});

		it("does nothing for non-existent ID", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({ name: "test.parquet", type: "parquet" });
			});

			await act(async () => {
				await store.removeDataSource("non-existent-id");
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
		});

		it("removes correct item when multiple exist", async () => {
			const store = useDataSourceStore.getState();

			const [ds1, ds2, ds3] = await act(async () => {
				return Promise.all([
					store.addDataSource({
						name: "file1.parquet",
						type: "parquet",
						filePath: "/1",
					}),
					store.addDataSource({
						name: "file2.parquet",
						type: "parquet",
						filePath: "/2",
					}),
					store.addDataSource({
						name: "file3.parquet",
						type: "parquet",
						filePath: "/3",
					}),
				]);
			});

			await act(async () => {
				await store.removeDataSource(ds2.id);
			});

			const remaining = useDataSourceStore.getState().dataSources;
			expect(remaining).toHaveLength(2);
			expect(remaining.map((d) => d.name)).toEqual([
				"file1.parquet",
				"file3.parquet",
			]);
		});
	});

	// ===== CLEAR ALL =====
	describe("clearAllDataSources", () => {
		it("clears all data sources", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({ name: "test1.parquet", type: "parquet" });
				await store.addDataSource({ name: "test2.csv", type: "csv" });
				await store.addDataSource({ name: "db.duckdb", type: "duckdb" });
			});

			act(() => {
				store.clearAllDataSources();
			});

			expect(useDataSourceStore.getState().dataSources).toHaveLength(0);
		});

		it("clears localStorage", async () => {
			const store = useDataSourceStore.getState();

			await act(async () => {
				await store.addDataSource({ name: "test.parquet", type: "parquet" });
			});

			act(() => {
				store.clearAllDataSources();
			});

			expect(localStorageMock.removeItem).toHaveBeenCalledWith(
				"data-ide-data-sources",
			);
		});

		it("clears pendingOperations", () => {
			const store = useDataSourceStore.getState();

			act(() => {
				store.clearAllDataSources();
			});

			expect(useDataSourceStore.getState().pendingOperations.size).toBe(0);
		});

		it("clears introspectingIds", () => {
			const store = useDataSourceStore.getState();

			act(() => {
				store.clearAllDataSources();
			});

			expect(useDataSourceStore.getState().introspectingIds.size).toBe(0);
		});
	});

	// ===== GET DATA SOURCE =====
	describe("getDataSource", () => {
		it("returns data source by ID", async () => {
			const store = useDataSourceStore.getState();

			const ds = await act(async () => {
				return store.addDataSource({
					name: "test.parquet",
					type: "parquet",
				});
			});

			const result = store.getDataSource(ds.id);
			expect(result).toBeDefined();
			expect(result?.name).toBe("test.parquet");
		});

		it("returns undefined for non-existent ID", () => {
			const store = useDataSourceStore.getState();
			const result = store.getDataSource("non-existent-id");
			expect(result).toBeUndefined();
		});
	});

	// ===== ADD REMOTE URL =====
	describe("addRemoteURL", () => {
		it("returns existing data source if URL already exists", async () => {
			const store = useDataSourceStore.getState();

			const ds1 = await act(async () => {
				return store.addDataSource({
					name: "remote",
					type: "parquet",
					isRemote: true,
					remoteURL: "https://example.com/data.parquet",
					filePath: "https://example.com/data.parquet",
				});
			});

			const ds2 = await act(async () => {
				return store.addRemoteURL(
					"https://example.com/data.parquet",
					"parquet",
				);
			});

			expect(ds2?.id).toBe(ds1.id);
			expect(useDataSourceStore.getState().dataSources).toHaveLength(1);
		});
	});
});
