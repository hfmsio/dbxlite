/**
 * DataSource Persistence
 * LocalStorage persistence and multi-tab sync for data sources
 */

import type { DataSource } from "../../types/data-source";
import { createLogger } from "../../utils/logger";

const logger = createLogger("DataSourcePersistence");

export const STORAGE_KEY = "data-ide-data-sources";

/**
 * Load data sources from localStorage
 */
export function loadFromStorage(): DataSource[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];

		const parsed = JSON.parse(saved) as Record<string, unknown>[];

		// Convert date strings back to Date objects and reset runtime state
		const dataSources = parsed.map((ds) => ({
			...ds,
			uploadedAt: new Date(ds.uploadedAt as string | number | Date),
			lastAccessedAt: ds.lastAccessedAt
				? new Date(ds.lastAccessedAt as string | number | Date)
				: undefined,
			// Reset attachment state on page load - DuckDB worker is reinitialized
			isAttached: false,
			// Reset error states - will be re-evaluated during file handle restore
			restoreFailed: false,
			restoreError: undefined,
			introspectionError: undefined,
			// Keep columns/schemas/stats for all files - they're still valid
			columns: ds.columns,
			schemas: ds.schemas,
			stats: ds.stats,
		})) as DataSource[];

		// Dedupe and clean volatile files
		const cleaned = cleanupDataSources(dataSources);

		logger.info(`Loaded ${cleaned.length} data source(s) from localStorage`);
		return cleaned;
	} catch (error) {
		logger.error("Failed to load from localStorage:", error);
		return [];
	}
}

/**
 * Save data sources to localStorage
 */
export function saveToStorage(dataSources: DataSource[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(dataSources));
		logger.debug(`Saved ${dataSources.length} data source(s) to localStorage`);
	} catch (error) {
		logger.error("Failed to save to localStorage:", error);
	}
}

/**
 * Setup multi-tab sync listener
 * Returns cleanup function to remove event listener
 */
export function setupMultiTabSync(
	onSync: (dataSources: DataSource[]) => void,
): () => void {
	const handleStorageChange = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEY) return;

		if (event.newValue) {
			try {
				const parsed = JSON.parse(event.newValue) as Record<string, unknown>[];
				const dataSources = parsed.map((ds) => ({
					...ds,
					uploadedAt: new Date(ds.uploadedAt as string | number | Date),
					lastAccessedAt: ds.lastAccessedAt
						? new Date(ds.lastAccessedAt as string | number | Date)
						: undefined,
					isAttached: false, // Reset attachment state for safety
					columns: ds.columns,
					schemas: ds.schemas,
					stats: ds.stats,
				})) as DataSource[];

				logger.info(
					`Syncing ${dataSources.length} data sources from another tab`,
				);
				onSync(dataSources);
			} catch (error) {
				logger.error("Failed to sync from storage event:", error);
			}
		} else {
			// Another tab cleared all data sources
			logger.info("Another tab cleared data sources, syncing...");
			onSync([]);
		}
	};

	window.addEventListener("storage", handleStorageChange);
	return () => window.removeEventListener("storage", handleStorageChange);
}

/**
 * Clean up data sources: dedupe and remove volatile files
 */
function cleanupDataSources(dataSources: DataSource[]): DataSource[] {
	// Step 1: Dedupe by filePath, keeping most recent
	const seenPaths = new Map<string, DataSource>();
	const deduped: DataSource[] = [];
	let removedCount = 0;

	for (const ds of dataSources) {
		const key = ds.filePath || `${ds.name}-${ds.type}`;
		const existing = seenPaths.get(key);

		if (existing) {
			// Keep the more recent entry (by uploadedAt)
			if (ds.uploadedAt > existing.uploadedAt) {
				seenPaths.set(key, ds);
				const idx = deduped.findIndex((d) => d.id === existing.id);
				if (idx !== -1) {
					deduped[idx] = ds;
				}
			}
			removedCount++;
		} else {
			seenPaths.set(key, ds);
			deduped.push(ds);
		}
	}

	if (removedCount > 0) {
		logger.info(
			`Removed ${removedCount} duplicate data source(s) from localStorage`,
		);
	}

	// Step 2: Clean up volatile files and mark files needing re-upload
	const volatileFiles: DataSource[] = [];
	const persistentFiles: DataSource[] = [];

	for (const ds of deduped) {
		// Only remove files that are EXPLICITLY marked as volatile (drag-drop uploads)
		const isVolatile = ds.isVolatile === true;

		if (isVolatile) {
			volatileFiles.push(ds);
			logger.debug(
				`Removing volatile (drag-drop): ${ds.name} (type=${ds.type})`,
			);
		} else {
			// Mark files without file handles as needing re-upload
			// but keep them in the list so users can see what was there
			if (!ds.isRemote && !ds.hasFileHandle && ds.type !== "duckdb") {
				ds.restoreFailed = true;
				ds.restoreError = "File needs re-upload (no file handle)";
				// Clear stale schema data
				ds.columns = undefined;
				ds.schemas = undefined;
				ds.stats = undefined;
				logger.debug(
					`Marking as needing re-upload: ${ds.name} (no file handle)`,
				);
			}

			// For DuckDB databases, clear isAttached on load
			if (ds.type === "duckdb" && ds.isAttached) {
				ds.isAttached = false;
				logger.debug(
					`Clearing isAttached for database: ${ds.name} (will be restored if file handle exists)`,
				);
			}

			persistentFiles.push(ds);
			logger.debug(
				`Keeping: ${ds.name} (type=${ds.type}, hasFileHandle=${ds.hasFileHandle}, isRemote=${ds.isRemote})`,
			);
		}
	}

	if (volatileFiles.length > 0) {
		logger.info(
			`Cleared ${volatileFiles.length} volatile file(s) from previous session`,
		);
	}

	return persistentFiles;
}
