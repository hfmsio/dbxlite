import { useCallback, useRef, useState } from "react";
import { fileHandleStore } from "../services/file-handle-store";
import { detectDataSourceType, openDataFile } from "../services/file-service";
import { queryService } from "../services/streaming-query-service";
import type { DataSource } from "../types/data-source";
import {
	generateDatabaseAlias,
	isDatabaseAlreadyAttached,
	safeDetachDatabase,
} from "../utils/duckdbOperations";
import { errorMonitor } from "../utils/errorMonitor";
import {
	buildAttachSQL,
	buildDetachSQL,
	buildSelectFromFile,
} from "../utils/sqlSanitizer";
import { createLogger } from "../utils/logger";
import { isDuckDBFile, isSQLFile, shouldUseZeroCopy } from "../utils/fileConstants";
import { buildFileTypeFilter, getFileExtension } from "../utils/fileTypeFilter";

const logger = createLogger("FileReload");

// ============================================================================
// Types
// ============================================================================

interface UseFileReloadOptions {
	initializing: boolean;
	dataSources: DataSource[];
	showToast: (
		message: string,
		type?: "success" | "error" | "warning" | "info",
		duration?: number,
	) => void;
	addDataSource: (
		dataSource: Omit<DataSource, "id" | "uploadedAt">,
	) => Promise<DataSource>;
	updateDataSource: (id: string, updates: Partial<DataSource>) => void;
	clearAllDataSources: () => void;
	introspectSchema: (id: string) => Promise<void>;
}

interface FileReloadProgress {
	currentLoadingFile: string;
	filesTotal: number;
	filesCompleted: number;
	filesFailed: number;
}

interface UseFileReloadReturn {
	reloadingFiles: boolean;
	isClearingDataSources: boolean;
	reloadProgress: FileReloadProgress;
	reloadFilesInBackground: () => Promise<void>;
	handleReloadFile: (oldFile: DataSource) => Promise<void>;
	handleRestoreFileAccess: (dataSource: DataSource) => Promise<void>;
	handleReattachDatabase: (database: DataSource) => Promise<void>;
	handleToggleWriteMode: (database: DataSource) => Promise<void>;
	handleClearFileHandles: () => Promise<void>;
}

interface StoredHandle {
	id: string;
	name: string;
	handle: FileSystemFileHandle;
}

type ReloadResult = "success" | "permission_denied" | "error";

// ============================================================================
// Helper Functions (outside hook to avoid recreation)
// ============================================================================

/**
 * Categorize an error for appropriate handling and messaging.
 */
function categorizeError(err: unknown): "permission" | "not_found" | "other" {
	const errMsg = err instanceof Error ? err.message : String(err);

	if (errMsg.includes("permission") || errMsg.includes("read")) {
		return "permission";
	}
	if (
		errMsg.includes("could not be found") ||
		errMsg.includes("NotFoundError") ||
		errMsg.includes("file or directory") ||
		errMsg.includes("no such file")
	) {
		return "not_found";
	}
	return "other";
}

/**
 * Check and request permission for a file handle.
 * Returns true if permission is granted.
 */
async function checkAndRequestPermission(
	handle: FileSystemFileHandle,
	fileName: string,
): Promise<boolean> {
	const permissionState = await handle.queryPermission({ mode: "read" });
	logger.info(`Permission state for ${fileName}: "${permissionState}"`);

	if (permissionState === "granted") {
		return true;
	}

	// Try requestPermission - may work in same session without user gesture
	logger.info(`Attempting requestPermission for ${fileName}`);
	try {
		const requestResult = await handle.requestPermission({ mode: "read" });
		logger.info(`requestPermission result for ${fileName}: "${requestResult}"`);
		return requestResult === "granted";
	} catch (permErr) {
		logger.debug(`requestPermission failed for ${fileName}:`, permErr);
		return false;
	}
}

/**
 * Register a file with DuckDB using appropriate method based on size.
 */
async function registerFileWithDuckDB(
	fileName: string,
	file: File,
): Promise<void> {
	if (shouldUseZeroCopy(file.size)) {
		await queryService.registerFileHandle(fileName, file);
	} else {
		const buffer = await file.arrayBuffer();
		await queryService.registerFile(fileName, buffer);
	}
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook for handling file reload, restore, and reattach operations
 */
export function useFileReload({
	initializing,
	dataSources,
	showToast,
	addDataSource,
	updateDataSource,
	clearAllDataSources,
	introspectSchema,
}: UseFileReloadOptions): UseFileReloadReturn {
	const [reloadingFiles, setReloadingFiles] = useState(false);
	const [isClearingDataSources, setIsClearingDataSources] = useState(false);
	const [reloadProgress, setReloadProgress] = useState<FileReloadProgress>({
		currentLoadingFile: "",
		filesTotal: 0,
		filesCompleted: 0,
		filesFailed: 0,
	});

	// Use ref to avoid stale closure - dataSources changes trigger re-renders
	const dataSourcesRef = useRef(dataSources);
	dataSourcesRef.current = dataSources;

	// ========================================================================
	// Process Database File (extracted from reloadFilesFromHandles)
	// ========================================================================
	const processDatabaseHandle = useCallback(
		async (stored: StoredHandle): Promise<ReloadResult> => {
			const file = await stored.handle.getFile();
			await registerFileWithDuckDB(stored.name, file);

			const dbDataSource = dataSourcesRef.current.find(
				(ds) => ds.filePath === stored.name && ds.type === "duckdb",
			);
			const dbAlias = dbDataSource?.attachedAs || generateDatabaseAlias(stored.name);

			// Check if already correctly attached
			const alreadyAttached = await isDatabaseAlreadyAttached(dbAlias, stored.name);
			if (!alreadyAttached) {
				await safeDetachDatabase(dbAlias, stored.name);
				const isReadOnly = dbDataSource?.isReadOnly !== false;
				const attachSQL = buildAttachSQL(stored.name, dbAlias, isReadOnly);
				await queryService.executeQueryOnConnector("duckdb", attachSQL);
			}

			if (dbDataSource) {
				updateDataSource(dbDataSource.id, {
					isAttached: true,
					attachedAs: dbAlias,
					restoreFailed: false,
					restoreError: undefined,
					permissionStatus: "granted",
				});
				await introspectSchema(dbDataSource.id);
			} else {
				const newDataSource = await addDataSource({
					name: stored.name,
					type: "duckdb",
					size: file.size,
					filePath: stored.name,
					hasFileHandle: true,
					permissionStatus: "granted",
					isAttached: true,
					attachedAs: dbAlias,
				});
				await introspectSchema(newDataSource.id);
			}

			return "success";
		},
		[updateDataSource, introspectSchema, addDataSource],
	);

	// ========================================================================
	// Process Data File (extracted from reloadFilesFromHandles)
	// ========================================================================
	const processDataFileHandle = useCallback(
		async (stored: StoredHandle): Promise<ReloadResult> => {
			const file = await stored.handle.getFile();
			await queryService.registerFileHandle(stored.name, file);

			// Verify file is accessible
			await queryService.executeQueryOnConnector(
				"duckdb",
				buildSelectFromFile(stored.name, 1),
			);

			const existingDataSource = dataSourcesRef.current.find(
				(ds) => ds.filePath === stored.name,
			);

			if (existingDataSource) {
				updateDataSource(existingDataSource.id, {
					restoreFailed: false,
					restoreError: undefined,
					permissionStatus: "granted",
				});
			} else {
				await addDataSource({
					name: stored.name,
					type: detectDataSourceType(stored.name),
					size: file.size,
					filePath: stored.name,
					hasFileHandle: true,
					permissionStatus: "granted",
				});
			}

			return "success";
		},
		[updateDataSource, addDataSource],
	);

	// ========================================================================
	// Handle Failed Reload (extracted error handling)
	// ========================================================================
	const handleFailedReload = useCallback(
		async (stored: StoredHandle, err: unknown): Promise<void> => {
			const errMsg = err instanceof Error ? err.message : String(err);
			const errorType = categorizeError(err);

			// Clean up stale handles for deleted files
			if (errorType === "not_found") {
				logger.info(`File ${stored.name} no longer exists, removing stale handle`);
				try {
					await fileHandleStore.removeHandle(stored.id);
				} catch (removeErr) {
					logger.warn(`Could not remove stale handle for ${stored.name}:`, removeErr);
				}
			}

			const failedDataSource = dataSourcesRef.current.find(
				(ds) => ds.filePath === stored.name,
			);

			if (failedDataSource) {
				if (errorType === "permission") {
					updateDataSource(failedDataSource.id, {
						permissionStatus: "prompt",
						isAttached: false,
						restoreFailed: true,
						restoreError: errMsg,
					});
				} else {
					updateDataSource(failedDataSource.id, {
						isAttached: false,
						restoreFailed: true,
						restoreError: errMsg,
					});
				}
			}
		},
		[updateDataSource],
	);

	// ========================================================================
	// Core Reload Logic
	// ========================================================================
	const reloadFilesFromHandles = useCallback(async () => {
		if (!fileHandleStore.isSupported()) return;

		const errors: string[] = [];
		const reloaded: string[] = [];
		const permissionDenied: string[] = [];

		try {
			const handles = await fileHandleStore.getAllHandles();
			if (handles.length === 0) return;

			logger.info(`Found ${handles.length} stored file handle(s), attempting to reload...`);

			// Deduplicate handles by name
			const uniqueHandles = new Map<string, StoredHandle>();
			for (const handle of handles) {
				if (!uniqueHandles.has(handle.name)) {
					uniqueHandles.set(handle.name, handle);
				}
			}

			for (const stored of uniqueHandles.values()) {
				setReloadProgress((prev) => ({ ...prev, currentLoadingFile: stored.name }));

				try {
					// Check permission
					const hasPermission = await checkAndRequestPermission(stored.handle, stored.name);

					if (!hasPermission) {
						logger.info(`Permission denied for ${stored.name}, marking for re-auth`);
						permissionDenied.push(stored.name);

						const existingDataSource = dataSourcesRef.current.find(
							(ds) => ds.filePath === stored.name,
						);
						if (existingDataSource) {
							updateDataSource(existingDataSource.id, {
								permissionStatus: "prompt",
								restoreFailed: true,
								restoreError: "Click file to re-authorize access",
								isAttached: false,
							});
						}
						continue;
					}

					// Skip SQL editor files
					if (isSQLFile(stored.name)) continue;

					// Process based on file type
					if (isDuckDBFile(stored.name)) {
						await processDatabaseHandle(stored);
					} else {
						await processDataFileHandle(stored);
					}

					reloaded.push(stored.name);
					setReloadProgress((prev) => ({
						...prev,
						filesCompleted: prev.filesCompleted + 1,
					}));
				} catch (err) {
					const errMsg = err instanceof Error ? err.message : String(err);
					logger.error(`Failed to reload file ${stored.name}:`, errMsg);
					errors.push(`${stored.name} (${errMsg})`);

					setReloadProgress((prev) => ({
						...prev,
						filesFailed: prev.filesFailed + 1,
					}));

					const errorType = categorizeError(err);
					if (errorType === "permission") {
						permissionDenied.push(stored.name);
					}

					await handleFailedReload(stored, err);
				}
			}

			setReloadProgress((prev) => ({ ...prev, currentLoadingFile: "" }));

			// Show result toasts
			if (reloaded.length > 0) {
				showToast(
					`Restored ${reloaded.length} file(s) from previous session: ${reloaded.join(", ")}`,
					"success",
					5000,
				);
			}

			if (permissionDenied.length > 0) {
				errorMonitor.logError(
					"File Permission",
					new Error(`Permission needed for ${permissionDenied.length} files`),
					"info",
					{ files: permissionDenied },
				);
				showToast(
					`${permissionDenied.length} file(s) need re-authorization: ${permissionDenied.join(", ")}.\nClick on each file in the explorer to restore access.`,
					"info",
					6000,
				);
			}

			if (errors.length > 0) {
				errorMonitor.logError(
					"File Reload",
					new Error(`Failed to reload ${errors.length} files`),
					"warning",
					{ errors },
				);
				showToast(
					`Could not restore ${errors.length} file(s):\n${errors.join("\n")}\n\nYou may need to re-upload them.`,
					"error",
					8000,
				);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to reload files from handles:", errMsg);
			errorMonitor.logError("File Reload", err, "error", { errorMessage: errMsg });
			showToast(
				`Failed to restore previous files: ${errMsg}.\nYou may need to re-upload your files.`,
				"error",
				6000,
			);
		}
	}, [
		showToast,
		updateDataSource,
		processDatabaseHandle,
		processDataFileHandle,
		handleFailedReload,
	]);

	// ========================================================================
	// Background Reload with Progress
	// ========================================================================
	const reloadFilesInBackground = useCallback(async () => {
		if (!fileHandleStore.isSupported()) return;

		try {
			const handles = await fileHandleStore.getAllHandles();
			if (handles.length === 0) return;

			const uniqueHandles = new Map<string, StoredHandle>();
			for (const handle of handles) {
				if (!uniqueHandles.has(handle.name)) {
					uniqueHandles.set(handle.name, handle);
				}
			}

			setReloadProgress({
				currentLoadingFile: "",
				filesTotal: uniqueHandles.size,
				filesCompleted: 0,
				filesFailed: 0,
			});
			setReloadingFiles(true);

			showToast(`Restoring ${uniqueHandles.size} file(s) from previous session...`, "info", 3000);
			await reloadFilesFromHandles();
		} catch (err) {
			logger.error("Background file loading failed:", err);
		} finally {
			setReloadingFiles(false);
			setReloadProgress({
				currentLoadingFile: "",
				filesTotal: 0,
				filesCompleted: 0,
				filesFailed: 0,
			});
		}
	}, [showToast, reloadFilesFromHandles]);

	// ========================================================================
	// Handle Reload File (user picks new file)
	// ========================================================================
	const handleReloadFile = useCallback(
		async (oldFile: DataSource) => {
			if (initializing) {
				showToast("Please wait for the database to initialize...", "warning", 3000);
				return;
			}

			const fileData = await openDataFile();
			if (!fileData) return;

			try {
				const isDatabase = isDuckDBFile(fileData.name);

				// Register file
				if (isDatabase || !fileData.file) {
					let buffer = fileData.buffer;
					if (fileData.file && buffer.byteLength === 0) {
						buffer = await fileData.file.arrayBuffer();
					}
					await queryService.registerFile(fileData.name, buffer);
				} else {
					await queryService.registerFileHandle(fileData.name, fileData.file);
				}

				let isAttached = false;
				let attachedAs: string | undefined;

				if (isDatabase) {
					try {
						const dbAlias = generateDatabaseAlias(fileData.name);
						const attachSQL = buildAttachSQL(fileData.name, dbAlias, false);
						await queryService.executeQueryOnConnector("duckdb", attachSQL);
						isAttached = true;
						attachedAs = dbAlias;
						showToast(
							`Database "${fileData.name}" reloaded and attached as "${dbAlias}"`,
							"success",
							5000,
						);
					} catch (err) {
						logger.error("Failed to attach database:", err);
						showToast(
							`Database file registered but failed to attach: ${err instanceof Error ? err.message : String(err)}`,
							"warning",
							5000,
						);
					}
				} else {
					showToast(`File "${oldFile.name}" reloaded successfully!`, "success", 3000);
				}

				await addDataSource({
					name: oldFile.name,
					type: fileData.type,
					size: fileData.size,
					filePath: fileData.name,
					tableName: undefined,
					isAttached,
					attachedAs,
				});
			} catch (err) {
				showToast(
					`Failed to reload file: ${err instanceof Error ? err.message : String(err)}`,
					"error",
					5000,
				);
			}
		},
		[initializing, showToast, addDataSource],
	);

	// ========================================================================
	// Handle Restore File Access
	// ========================================================================
	const handleRestoreFileAccess = useCallback(
		async (dataSource: DataSource) => {
			if (initializing) {
				showToast("Please wait for the database to initialize...", "warning", 3000);
				return;
			}

			try {
				// Try to restore using existing stored file handle first
				const storedHandle = await fileHandleStore.getHandle(dataSource.id);
				if (storedHandle) {
					logger.debug(`Found stored handle for ${dataSource.name}, requesting permission...`);
					const hasPermission = await fileHandleStore.requestPermission(storedHandle.handle);

					if (hasPermission) {
						const file = await storedHandle.handle.getFile();
						await queryService.registerFileHandle(dataSource.name, file);

						updateDataSource(dataSource.id, {
							restoreFailed: false,
							restoreError: undefined,
							permissionStatus: "granted",
							hasFileHandle: true,
						});

						await introspectSchema(dataSource.id);
						showToast(`File access restored for "${dataSource.name}"`, "success", 3000);
						return;
					}
				}

				// Fall back to file picker
				showToast(`Please select the file: "${dataSource.name}"`, "info", 5000);

				const extension = getFileExtension(dataSource.name);
				const fileTypeFilter = buildFileTypeFilter(extension);

				if (!window.showOpenFilePicker) {
					throw new Error("File System Access API not supported");
				}

				const [fileHandle] = await window.showOpenFilePicker({
					multiple: false,
					types: fileTypeFilter,
				});

				if (!fileHandle) {
					showToast("No file selected", "info", 2000);
					return;
				}

				const file = await fileHandle.getFile();

				if (file.name !== dataSource.name) {
					showToast(
						`Selected file "${file.name}" doesn't match "${dataSource.name}".\nPlease select the correct file.`,
						"error",
						5000,
					);
					return;
				}

				const hasPermission = await fileHandleStore.requestPermission(fileHandle);
				if (!hasPermission) {
					showToast("Permission denied. Unable to restore file access.", "error", 4000);
					return;
				}

				await fileHandleStore.storeHandle(dataSource.id, dataSource.name, fileHandle);
				await queryService.registerFileHandle(dataSource.name, file);

				updateDataSource(dataSource.id, {
					restoreFailed: false,
					restoreError: undefined,
					permissionStatus: "granted",
					hasFileHandle: true,
				});

				await introspectSchema(dataSource.id);
				showToast(`File access restored for "${dataSource.name}"`, "success", 3000);
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;

				const errMsg = err instanceof Error ? err.message : String(err);
				logger.error("Failed to restore file access:", errMsg, err);
				showToast(`Failed to restore file access: ${errMsg}`, "error", 5000);
			}
		},
		[initializing, showToast, updateDataSource, introspectSchema],
	);

	// ========================================================================
	// Handle Reattach Database
	// ========================================================================
	const handleReattachDatabase = useCallback(
		async (database: DataSource) => {
			if (initializing) {
				showToast("Please wait for the database to initialize...", "warning", 3000);
				return;
			}

			try {
				const storedHandle = await fileHandleStore.getHandle(database.id);
				if (!storedHandle) {
					showToast(`No stored handle found for ${database.name}`, "error", 3000);
					return;
				}

				const file = await storedHandle.handle.getFile();
				await registerFileWithDuckDB(file.name, file);

				const dbAlias = database.attachedAs || generateDatabaseAlias(file.name);
				const alreadyAttached = await isDatabaseAlreadyAttached(dbAlias, file.name);

				if (!alreadyAttached) {
					await safeDetachDatabase(dbAlias, file.name);
					const attachSQL = buildAttachSQL(file.name, dbAlias, false);
					await queryService.executeQueryOnConnector("duckdb", attachSQL);
				}

				updateDataSource(database.id, {
					isAttached: true,
					attachedAs: dbAlias,
					restoreFailed: false,
					restoreError: undefined,
					introspectionError: undefined,
					permissionStatus: "granted",
				});

				await introspectSchema(database.id);
				showToast(`Database "${file.name}" reattached as "${dbAlias}"`, "success", 3000);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				logger.error("handleReattachDatabase failed:", err);

				if (categorizeError(err) === "permission") {
					updateDataSource(database.id, {
						permissionStatus: "denied",
						isAttached: false,
					});
					showToast(
						`Browser denied access to "${database.name}".\nRe-upload the file using the upload button to restore access.`,
						"error",
						10000,
					);
				} else {
					showToast(`Failed to reattach database: ${errMsg}`, "error", 5000);
				}
			}
		},
		[initializing, showToast, updateDataSource, introspectSchema],
	);

	// ========================================================================
	// Handle Toggle Write Mode
	// ========================================================================
	const handleToggleWriteMode = useCallback(
		async (database: DataSource) => {
			if (initializing) {
				showToast("Please wait for the database to initialize...", "warning", 3000);
				return;
			}

			if (!database.attachedAs || !database.filePath) {
				showToast("Cannot toggle write mode: database not properly attached", "error", 3000);
				return;
			}

			const { attachedAs: dbAlias, filePath } = database;
			const currentlyReadOnly = database.isReadOnly !== false;

			try {
				await queryService.executeQueryOnConnector("duckdb", buildDetachSQL(dbAlias), undefined, true);

				const attachSQL = buildAttachSQL(filePath, dbAlias, !currentlyReadOnly);
				await queryService.executeQueryOnConnector("duckdb", attachSQL);

				updateDataSource(database.id, { isReadOnly: !currentlyReadOnly });
				await introspectSchema(database.id);

				const modeLabel = currentlyReadOnly ? "write" : "read-only";
				showToast(`Database "${dbAlias}" switched to ${modeLabel} mode`, "success", 3000);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				logger.error("handleToggleWriteMode failed:", err);
				showToast(`Failed to toggle write mode: ${errMsg}`, "error", 5000);
			}
		},
		[initializing, showToast, updateDataSource, introspectSchema],
	);

	// ========================================================================
	// Handle Clear File Handles
	// ========================================================================
	const handleClearFileHandles = useCallback(async () => {
		if (isClearingDataSources) return;

		setIsClearingDataSources(true);
		try {
			if (!fileHandleStore.isSupported()) {
				showToast("File System Access API not supported in this browser", "info", 3000);
				return;
			}

			// Detach all non-internal databases
			try {
				const catalogsResult = await queryService.executeQueryOnConnector(
					"duckdb",
					`SELECT database_name FROM duckdb_databases() WHERE NOT internal`,
				);
				for (const row of catalogsResult.rows) {
					const dbName = row.database_name;
					if (dbName && !["system", "temp", "memory"].includes(dbName as string)) {
						try {
							await queryService.executeQueryOnConnector(
								"duckdb",
								buildDetachSQL(dbName as string),
								undefined,
								true,
							);
						} catch {
							// Ignore - expected if database not attached
						}
					}
				}
			} catch (listErr) {
				logger.warn("Could not list databases to detach:", listErr);
			}

			await fileHandleStore.clearAll();
			clearAllDataSources();
			showToast("All stored file handles, databases, and data sources cleared.", "success", 5000);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			showToast(`Failed to clear file handles: ${errMsg}`, "error", 5000);
		} finally {
			setIsClearingDataSources(false);
		}
	}, [isClearingDataSources, showToast, clearAllDataSources]);

	return {
		reloadingFiles,
		isClearingDataSources,
		reloadProgress,
		reloadFilesInBackground,
		handleReloadFile,
		handleRestoreFileAccess,
		handleReattachDatabase,
		handleToggleWriteMode,
		handleClearFileHandles,
	};
}
