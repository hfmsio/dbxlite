import { useCallback } from "react";
import { fileHandleStore } from "../services/file-handle-store";
import { detectDataSourceType, openDataFiles } from "../services/file-service";
import { queryService } from "../services/streaming-query-service";
import type { ConnectorType } from "../services/streaming-query-service";
import type { DataSource, DataSourceType } from "../types/data-source";
import {
	detachDatabaseByAlias,
	generateDatabaseAlias,
} from "../utils/duckdbOperations";
import { errorMonitor } from "../utils/errorMonitor";
import { ZERO_COPY_THRESHOLD } from "../utils/fileConstants";
import { buildAttachSQL } from "../utils/sqlSanitizer";
import { createLogger } from "../utils/logger";

const logger = createLogger("FileUpload");

// Extended File type that may have path (Electron/Tauri)
interface FileWithPath extends File {
	path?: string;
}

// Type for file data from openDataFiles
interface DataFileInfo {
	name: string;
	buffer: ArrayBuffer;
	type: string;
	size: number;
	extension: string;
	file?: File;
	fileHandle?: FileSystemFileHandle;
	sheets?: { name: string; index: number }[];
	/** Full file path (only available in Electron/Tauri, used for HTTP mode) */
	fullPath?: string;
}

interface UseFileUploadOptions {
	initializing: boolean;
	activeConnector: ConnectorType;
	isBigQueryConnected: boolean;
	showToast: (
		message: string,
		type?: "success" | "error" | "warning" | "info",
		duration?: number,
	) => void;
	handleConnectorChange: (connector: ConnectorType) => void;
	addDataSource: (
		dataSource: Omit<DataSource, "id" | "uploadedAt">,
	) => Promise<DataSource>;
	setIsUploadingFiles: (uploading: boolean) => void;
	setUploadProgress: (progress: {
		currentFile: string;
		currentIndex: number;
		totalFiles: number;
	}) => void;
	setLastUploadedType: (type: "file" | "database" | null) => void;
}

interface UseFileUploadReturn {
	handleUploadDataFile: () => Promise<void>;
	handleDragDropUpload: (fileList: FileList) => Promise<void>;
}

/**
 * Hook for handling file uploads (button upload and drag-drop)
 */
export function useFileUpload({
	initializing,
	activeConnector,
	isBigQueryConnected,
	showToast,
	handleConnectorChange,
	addDataSource,
	setIsUploadingFiles,
	setUploadProgress,
	setLastUploadedType,
}: UseFileUploadOptions): UseFileUploadReturn {
	/**
	 * Handle DuckDB database file upload
	 */
	const handleDuckDBDatabase = useCallback(
		async (fileData: DataFileInfo, isDragDrop: boolean) => {
			try {
				const dbAlias = generateDatabaseAlias(fileData.name);

				await detachDatabaseByAlias(dbAlias);

				// Drag-drop is read-write, button upload is read-only
				const attachSQL = buildAttachSQL(fileData.name, dbAlias, !isDragDrop);
				await queryService.executeQueryOnConnector("duckdb", attachSQL);

				// Get list of tables
				let tableNames = "";
				try {
					const tablesResult = await queryService.executeQueryOnConnector(
						"duckdb",
						`SELECT table_name as name FROM ${dbAlias}.information_schema.tables WHERE table_schema='main' ORDER BY table_name`,
					);
					tableNames = tablesResult.rows
						.map((r) => r.name || r.table_name || r[0])
						.filter(Boolean)
						.join(", ");
				} catch (_err) {
					tableNames = "(could not retrieve tables)";
				}

				// Add to data source store
				const dataSource = await addDataSource({
					name: `${dbAlias} (database)`,
					type: "duckdb",
					size: fileData.size,
					filePath: fileData.name,
					tableName: undefined,
					isAttached: true,
					attachedAs: dbAlias,
					isReadOnly: !isDragDrop, // Button uploads are read-only, drag-drop is read-write
					hasFileHandle: !isDragDrop && !!fileData.fileHandle,
					permissionStatus:
						!isDragDrop && fileData.fileHandle ? "granted" : undefined,
					isVolatile: isDragDrop,
				});

				// Store file handle if available
				if (
					!isDragDrop &&
					fileData.fileHandle &&
					fileHandleStore.isSupported()
				) {
					await fileHandleStore.storeHandle(
						dataSource.id,
						fileData.name,
						fileData.fileHandle,
					);
				}

				showToast(
					`Database "${fileData.name}" attached as "${dbAlias}".\n` +
						`Tables: ${tableNames || "none found"}.\n` +
						`Query with: SELECT * FROM ${dbAlias}.table_name`,
					"success",
					10000,
				);

				setLastUploadedType("database");
			} catch (attachErr) {
				const attachErrMsg =
					attachErr instanceof Error ? attachErr.message : String(attachErr);
				logger.error("Failed to attach database", attachErrMsg);

				errorMonitor.logError(
					"Database ATTACH",
					attachErr instanceof Error ? attachErr : new Error(attachErrMsg),
					"warning",
					{
						fileName: fileData.name,
						errorMessage: attachErrMsg,
					},
				);

				// Still add to data sources
				await addDataSource({
					name: fileData.name,
					type: fileData.type as DataSourceType,
					size: fileData.size,
					filePath: fileData.name,
					tableName: undefined,
					isVolatile: isDragDrop,
				});

				showToast(
					`Database file uploaded but could not attach: ${attachErrMsg}.\n` +
						`The file is registered. Try manually: ATTACH '${fileData.name}' AS mydb`,
					"warning",
					10000,
				);
			}
		},
		[addDataSource, showToast, setLastUploadedType],
	);

	/**
	 * Handle regular data file upload (CSV, Parquet, etc.)
	 */
	const handleRegularFile = useCallback(
		async (fileData: DataFileInfo, isDragDrop: boolean) => {
			const sheets =
				fileData.sheets && fileData.sheets.length > 0
					? fileData.sheets.map((s) => ({ name: s.name, index: s.index }))
					: undefined;

			const dataSource = await addDataSource({
				name: fileData.name,
				type: fileData.type as DataSourceType,
				size: fileData.size,
				filePath: fileData.name,
				tableName: undefined,
				hasFileHandle: !isDragDrop && !!fileData.fileHandle,
				permissionStatus:
					!isDragDrop && fileData.fileHandle ? "granted" : undefined,
				sheets,
				selectedSheet: sheets && sheets.length > 0 ? sheets[0].name : undefined,
				isVolatile: isDragDrop,
			});

			// Store file handle if available
			if (!isDragDrop && fileData.fileHandle && fileHandleStore.isSupported()) {
				await fileHandleStore.storeHandle(
					dataSource.id,
					fileData.name,
					fileData.fileHandle,
				);
			}

			setLastUploadedType("file");

			if (isDragDrop) {
				showToast(
					`File "${fileData.name}" uploaded and registered!`,
					"success",
					3000,
				);
			}
		},
		[addDataSource, setLastUploadedType, showToast],
	);

	/**
	 * Process files and register them with query service
	 */
	const processFiles = useCallback(
		async (files: DataFileInfo[], isDragDrop: boolean = false) => {
			if (files.length === 0) return;

			const isHttpMode = queryService.isHttpMode();

			// In HTTP mode, check if we have file paths available
			if (isHttpMode) {
				const filesWithPaths = files.filter((f) => f.fullPath);
				const filesWithoutPaths = files.filter((f) => !f.fullPath);

				if (filesWithoutPaths.length > 0) {
					// Some files don't have paths - warn user
					logger.warn(
						"HTTP mode: Some files don't have full paths available",
						filesWithoutPaths.map((f) => f.name),
					);
					showToast(
						`In HTTP mode (duckdb -ui), file upload requires full file paths.\n` +
							`Use file paths directly in queries instead:\n` +
							`SELECT * FROM read_csv('/path/to/file.csv')`,
						"warning",
						10000,
					);

					if (filesWithPaths.length === 0) {
						// No files have paths, abort
						setIsUploadingFiles(false);
						setUploadProgress({
							currentFile: "",
							currentIndex: 0,
							totalFiles: 0,
						});
						return;
					}
				}

				// Only process files that have paths
				files = filesWithPaths;
			}

			// Switch to DuckDB for file operations
			const previousConnector = activeConnector;
			const needsRestore = activeConnector !== "duckdb";

			if (needsRestore) {
				handleConnectorChange("duckdb");
			}

			// Process each file sequentially
			for (let i = 0; i < files.length; i++) {
				const fileData = files[i];

				setUploadProgress({
					currentFile: fileData.name,
					currentIndex: i + 1,
					totalFiles: files.length,
				});

				try {
					const isDuckDBDatabase =
						fileData.type === "duckdb" ||
						fileData.name.endsWith(".duckdb") ||
						fileData.name.endsWith(".db");

					// In HTTP mode with full path, no need to register - DuckDB reads directly
					if (isHttpMode && fileData.fullPath) {
						// Use the full path as the file reference
						// Override filePath with the actual filesystem path
						fileData.name = fileData.fullPath;
						logger.info(
							`HTTP mode: Using local file path: ${fileData.fullPath}`,
						);
					} else {
						// WASM mode: Register file with query service
						if (isDragDrop || !fileData.file) {
							// Drag-drop or no file handle - use buffer
							await queryService.registerFile(fileData.name, fileData.buffer);
						} else {
							// Button upload with file handle - use zero-copy
							await queryService.registerFileHandle(
								fileData.name,
								fileData.file,
							);
						}

						// Small delay to ensure file is fully registered
						await new Promise((resolve) => setTimeout(resolve, 100));
					}

					if (isDuckDBDatabase) {
						await handleDuckDBDatabase(fileData, isDragDrop);
					} else {
						await handleRegularFile(fileData, isDragDrop);
					}
				} catch (err) {
					const errMsg = err instanceof Error ? err.message : String(err);
					errorMonitor.logError("File Upload", err, "error", {
						fileName: fileData?.name,
					});
					showToast(
						`Failed to upload ${fileData.name}: ${errMsg}`,
						"error",
						5000,
					);
				}
			}

			// Show summary toast
			if (files.length > 0 && !files.some((f) => f.type === "duckdb")) {
				const fileNames = files.map((f) => f.name).join(", ");
				const modeNote = isHttpMode ? " (using local paths)" : "";
				showToast(
					`${files.length} file${files.length > 1 ? "s" : ""} ready${modeNote}!\n${fileNames}`,
					"success",
					6000,
				);
			}

			// Reset upload state
			setIsUploadingFiles(false);
			setUploadProgress({ currentFile: "", currentIndex: 0, totalFiles: 0 });

			// Restore previous connector if needed
			if (
				needsRestore &&
				previousConnector === "bigquery" &&
				isBigQueryConnected
			) {
				handleConnectorChange(previousConnector);
			}
		},
		[
			activeConnector,
			isBigQueryConnected,
			showToast,
			handleConnectorChange,
			setIsUploadingFiles,
			setUploadProgress,
			handleDuckDBDatabase,
			handleRegularFile,
		],
	);

	/**
	 * Handle button-initiated file upload
	 */
	const handleUploadDataFile = useCallback(async () => {
		if (initializing) {
			showToast(
				"Please wait for the database to initialize...",
				"warning",
				3000,
			);
			return;
		}

		const files = await openDataFiles();
		if (files.length === 0) return;

		setIsUploadingFiles(true);
		setUploadProgress({
			currentFile: "",
			currentIndex: 0,
			totalFiles: files.length,
		});

		if (files.length > 1) {
			showToast(`Uploading ${files.length} files...`, "info", 3000);
		}

		await processFiles(files as DataFileInfo[], false);
	}, [
		initializing,
		showToast,
		setIsUploadingFiles,
		setUploadProgress,
		processFiles,
	]);

	/**
	 * Handle drag-and-drop file upload
	 */
	const handleDragDropUpload = useCallback(
		async (fileList: FileList) => {
			if (initializing) {
				showToast(
					"Please wait for the database to initialize...",
					"warning",
					3000,
				);
				return;
			}

			setIsUploadingFiles(true);
			setUploadProgress({
				currentFile: "Reading files...",
				currentIndex: 0,
				totalFiles: fileList.length,
			});

			const totalSize = Array.from(fileList).reduce(
				(sum, f) => sum + f.size,
				0,
			);
			const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);

			if (fileList.length > 1) {
				showToast(
					`Reading ${fileList.length} files (${totalSizeMB} MB)...`,
					"info",
					3000,
				);
			} else {
				showToast(
					`Reading ${fileList[0].name} (${totalSizeMB} MB)...`,
					"info",
					3000,
				);
			}

			// Convert FileList to DataFileInfo array
			const files: DataFileInfo[] = [];
			for (let i = 0; i < fileList.length; i++) {
				const file = fileList[i];

				setUploadProgress({
					currentFile: `Reading ${file.name}...`,
					currentIndex: i + 1,
					totalFiles: fileList.length,
				});

				try {
					if (file.size > ZERO_COPY_THRESHOLD) {
						const sizeMB = (file.size / 1024 / 1024).toFixed(1);
						showToast(
							`Reading large file ${file.name} (${sizeMB} MB) - this may take a while...`,
							"warning",
							5000,
						);
					}

					const buffer = await file.arrayBuffer();
					const extension = file.name.split(".").pop()?.toLowerCase() || "";
					const type = detectDataSourceType(file.name);

					// Check for full file path (available in Electron/Tauri)
					const fileWithPath = file as FileWithPath;
					const fullPath = fileWithPath.path;

					files.push({
						name: file.name,
						buffer,
						type,
						size: file.size,
						extension,
						file,
						fullPath,
					});
				} catch (err) {
					logger.error(`Failed to read dropped file ${file.name}`, err);
					showToast(`Failed to read file ${file.name}`, "error", 3000);
				}
			}

			if (files.length === 0) {
				setIsUploadingFiles(false);
				setUploadProgress({ currentFile: "", currentIndex: 0, totalFiles: 0 });
				return;
			}

			await processFiles(files, true);
		},
		[
			initializing,
			showToast,
			setIsUploadingFiles,
			setUploadProgress,
			processFiles,
		],
	);

	return {
		handleUploadDataFile,
		handleDragDropUpload,
	};
}
