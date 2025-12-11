/**
 * DataSource Store
 * Zustand store for managing data sources with granular reactivity
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Column, DataSource } from "../../types/data-source";
import type { DataSourceStore } from "./types";
import {
	loadFromStorage,
	saveToStorage,
	setupMultiTabSync,
	STORAGE_KEY,
} from "./persistence";
import {
	introspectDuckDBSchema,
	introspectFileSchema,
	introspectSheetColumns as introspectXLSXSheet,
} from "./introspection";
import { buildDetachSQL } from "../../utils/sqlSanitizer";
import { parseRemoteURL } from "../../utils/remoteFileGrouping";
import { queryService } from "../../services/streaming-query-service";
import { fileHandleStore } from "../../services/file-handle-store";
import { createLogger } from "../../utils/logger";

const logger = createLogger("DataSourceStore");

export const useDataSourceStore = create<DataSourceStore>()(
	subscribeWithSelector((set, get) => ({
		// ===== State =====
		dataSources: [],
		isLoadingFromStorage: true,
		pendingOperations: new Map(),
		introspectingIds: new Set(),
		operationErrors: {},

		// ===== CRUD Actions =====

		addDataSource: async (dataSource) => {
			const key =
				dataSource.filePath || `${dataSource.name}-${dataSource.type}`;
			const { pendingOperations } = get();

			// Check for in-flight operation (prevents concurrent duplicates)
			if (pendingOperations.has(key)) {
				logger.debug(
					`Data source "${dataSource.name}" is already being added, returning existing promise`,
				);
				return pendingOperations.get(key)!;
			}

			const addPromise = (async (): Promise<DataSource> => {
				// ✅ Use get() to always get fresh state (no stale closure!)
				const currentDataSources = get().dataSources;

				// Check for existing using multiple strategies
				const existing = currentDataSources.find((ds) => {
					if (dataSource.isRemote && dataSource.remoteURL) {
						return ds.remoteURL === dataSource.remoteURL;
					}
					if (dataSource.filePath) {
						return ds.filePath === dataSource.filePath;
					}
					return (
						ds.name === dataSource.name &&
						ds.type === dataSource.type &&
						!ds.isRemote &&
						!dataSource.isRemote
					);
				});

				if (existing) {
					logger.debug(
						`Replacing existing data source: ${dataSource.name} (ID: ${existing.id})`,
					);
					await get().removeDataSource(existing.id);
				}

				const newDataSource: DataSource = {
					...dataSource,
					id: `ds-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					uploadedAt: new Date(),
					isIntrospecting: true,
				};

				// Add to state immediately for instant UI update
				set((state) => ({
					dataSources: [...state.dataSources, newDataSource],
				}));

				// Run introspection asynchronously in background
				if (newDataSource.type === "duckdb") {
					introspectDuckDBSchema(newDataSource)
						.then((result) => {
							set((state) => ({
								dataSources: state.dataSources.map((ds) =>
									ds.id === newDataSource.id
										? {
												...ds,
												isIntrospecting: false,
												schemas: result.schemas,
												isAttached: result.isAttached,
												attachedAs: result.attachedAs,
												restoreFailed: false,
												restoreError: undefined,
												introspectionError: undefined,
											}
										: ds,
								),
							}));
						})
						.catch((err) => {
							logger.error("Failed to introspect DuckDB schema:", err);
							set((state) => ({
								dataSources: state.dataSources.map((ds) =>
									ds.id === newDataSource.id
										? {
												...ds,
												isIntrospecting: false,
												introspectionError:
													err instanceof Error ? err.message : String(err),
											}
										: ds,
								),
							}));
						});
				} else if (
					["parquet", "csv", "tsv", "json", "jsonl", "xlsx", "arrow"].includes(
						newDataSource.type,
					)
				) {
					introspectFileSchema(newDataSource)
						.then((result) => {
							set((state) => ({
								dataSources: state.dataSources.map((ds) =>
									ds.id === newDataSource.id
										? {
												...ds,
												isIntrospecting: false,
												columns: result.columns,
												stats: result.stats,
											}
										: ds,
								),
							}));
						})
						.catch((err) => {
							logger.error("Failed to introspect file schema:", err);
							set((state) => ({
								dataSources: state.dataSources.map((ds) =>
									ds.id === newDataSource.id
										? {
												...ds,
												isIntrospecting: false,
												introspectionError:
													err instanceof Error ? err.message : String(err),
											}
										: ds,
								),
							}));
						});
				} else {
					// No introspection needed - mark as complete
					set((state) => ({
						dataSources: state.dataSources.map((ds) =>
							ds.id === newDataSource.id
								? { ...ds, isIntrospecting: false }
								: ds,
						),
					}));
				}

				return newDataSource;
			})();

			// Track pending operation
			set((state) => {
				const newPending = new Map(state.pendingOperations);
				newPending.set(key, addPromise);
				return { pendingOperations: newPending };
			});

			try {
				return await addPromise;
			} finally {
				// Always cleanup pending map
				set((state) => {
					const newPending = new Map(state.pendingOperations);
					newPending.delete(key);
					return { pendingOperations: newPending };
				});
			}
		},

		addRemoteURL: async (url, type, name) => {
			// Check if URL already exists (using fresh state)
			const existing = get().dataSources.find(
				(ds) => ds.remoteURL === url || ds.filePath === url,
			);
			if (existing) {
				return existing;
			}

			// Switch to DuckDB for remote file introspection
			const currentConnector = queryService.getActiveConnectorType();
			const needsRestore = currentConnector !== "duckdb";

			if (needsRestore) {
				queryService.setActiveConnector("duckdb");
			}

			try {
				const remoteFileGroup = parseRemoteURL(url);
				const fileName =
					name ||
					remoteFileGroup?.filename ||
					url.split("/").pop()?.split("?")[0] ||
					"remote_file";
				const displayName = fileName.replace(
					/\.(parquet|csv|json|jsonl|ndjson)$/i,
					"",
				);

				const newDataSource: DataSource = {
					id: `ds-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					name: displayName,
					type,
					uploadedAt: new Date(),
					isRemote: true,
					remoteURL: url,
					filePath: url,
					remoteFileGroup: remoteFileGroup || undefined,
					isVolatile: false,
				};

				// Auto-introspect schema - throw error if it fails
				const result = await introspectFileSchema(newDataSource);
				const finalDataSource = {
					...newDataSource,
					columns: result.columns,
					stats: result.stats,
				};

				set((state) => ({
					dataSources: [...state.dataSources, finalDataSource],
				}));

				return finalDataSource;
			} finally {
				if (needsRestore) {
					queryService.setActiveConnector(currentConnector);
				}
			}
		},

		updateDataSource: (id, updates) => {
			set((state) => ({
				dataSources: state.dataSources.map((ds) =>
					ds.id === id ? { ...ds, ...updates, lastAccessedAt: new Date() } : ds,
				),
			}));
		},

		removeDataSource: async (id) => {
			const dataSource = get().dataSources.find((ds) => ds.id === id);
			if (!dataSource) return;

			// Detach DuckDB database if attached
			if (
				dataSource.type === "duckdb" &&
				dataSource.isAttached &&
				dataSource.attachedAs
			) {
				try {
					await queryService.executeQuery(
						buildDetachSQL(dataSource.attachedAs),
					);
				} catch (error) {
					logger.error("Failed to detach database:", error);
				}
			}

			// Remove file handle from IndexedDB if it exists
			if (dataSource.hasFileHandle) {
				try {
					await fileHandleStore.removeHandle(id);
					logger.debug(`Removed file handle for: ${dataSource.name}`);
				} catch (error) {
					logger.error("Failed to remove file handle:", error);
				}
			}

			set((state) => ({
				dataSources: state.dataSources.filter((ds) => ds.id !== id),
			}));
		},

		clearAllDataSources: () => {
			set({
				dataSources: [],
				pendingOperations: new Map(),
				introspectingIds: new Set(),
			});

			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch (err) {
				logger.error("Failed to clear localStorage:", err);
			}

			logger.info("Cleared all data sources");
		},

		getDataSource: (id) => {
			return get().dataSources.find((ds) => ds.id === id);
		},

		// ===== Introspection Actions =====

		introspectSchema: async (id) => {
			const dataSource = get().dataSources.find((ds) => ds.id === id);
			if (!dataSource) return;

			// Track introspection
			set((state) => {
				const newIds = new Set(state.introspectingIds);
				newIds.add(id);
				return { introspectingIds: newIds };
			});

			try {
				if (dataSource.type === "duckdb") {
					const result = await introspectDuckDBSchema(dataSource);
					get().updateDataSource(id, {
						schemas: result.schemas,
						isAttached: result.isAttached,
						attachedAs: result.attachedAs,
						restoreFailed: false,
						restoreError: undefined,
						introspectionError: undefined,
					});
				} else if (
					["parquet", "csv", "tsv", "json", "jsonl", "xlsx", "arrow"].includes(
						dataSource.type,
					)
				) {
					const result = await introspectFileSchema(dataSource);
					get().updateDataSource(id, {
						columns: result.columns,
						stats: result.stats,
						restoreFailed: false,
						restoreError: undefined,
						introspectionError: undefined,
					});
				}
			} finally {
				set((state) => {
					const newIds = new Set(state.introspectingIds);
					newIds.delete(id);
					return { introspectingIds: newIds };
				});
			}
		},

		refreshAllSchemas: async () => {
			const { dataSources, introspectSchema } = get();
			for (const ds of dataSources) {
				await introspectSchema(ds.id);
			}
		},

		introspectSheetColumns: async (fileId, sheetName): Promise<Column[]> => {
			const dataSource = get().dataSources.find((ds) => ds.id === fileId);
			if (!dataSource) {
				logger.warn(`Data source not found: ${fileId}`);
				return [];
			}

			const columns = await introspectXLSXSheet(dataSource, sheetName);

			// Update the sheet's columns in the data source
			if (dataSource.sheets) {
				const updatedSheets = dataSource.sheets.map((s) =>
					s.name === sheetName
						? { ...s, columns, columnCount: columns.length }
						: s,
				);
				get().updateDataSource(fileId, { sheets: updatedSheets });
			}

			return columns;
		},

		// ===== Internal Actions =====

		_setDataSources: (dataSources) => set({ dataSources }),

		_setIsLoadingFromStorage: (loading) =>
			set({ isLoadingFromStorage: loading }),

		_handleStorageSync: (dataSources) => set({ dataSources }),
	})),
);

// ===== Initialize Store =====

// Load from localStorage
const initialData = loadFromStorage();
useDataSourceStore.setState({
	dataSources: initialData,
	isLoadingFromStorage: false,
});

// Setup multi-tab sync
setupMultiTabSync((dataSources) => {
	useDataSourceStore.getState()._handleStorageSync(dataSources);
});

// Auto-save on changes (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
useDataSourceStore.subscribe(
	(state) => state.dataSources,
	(dataSources) => {
		// Don't save during initial load
		if (useDataSourceStore.getState().isLoadingFromStorage) return;

		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => saveToStorage(dataSources), 500);
	},
);

// Flush on unload
if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", () => {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveToStorage(useDataSourceStore.getState().dataSources);
	});
}
