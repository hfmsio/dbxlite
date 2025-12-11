import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { exportToCSV, exportToJSON } from "../../../services/file-service";
import {
	type QueryResult,
	queryService,
} from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import {
	type ExportCompletionStatus,
	createExportCompletionStatus,
	downloadAsBlob,
	formatFileSize,
	generateExportFileName,
	getDuckDBFormatOption,
	getExportMimeType,
	saveToFileHandle,
	showExportFilePicker,
} from "../exportUtils";
import type { ColumnInfo } from "../types";

const logger = createLogger("useTableExport");

/** Interface for connectors that support Parquet export */
interface ParquetExportCapable {
	exportToParquet: (
		fileName: string,
		rows: Record<string, unknown>[],
		columns: string[],
		columnTypes?: { name: string; type: string }[],
	) => Promise<void>;
}

interface UseTableExportOptions {
	sql?: string;
	result?: QueryResult | null;
	columns: ColumnInfo[];
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onExportStart?: (params: {
		fileType: "csv" | "json" | "parquet";
		fileName: string;
		totalSteps: number;
	}) => void;
	onExportProgress?: (params: {
		currentStage: string;
		currentStep: number;
	}) => void;
	onExportComplete?: () => void;
	onExportError?: (error: string) => void;
}

export interface UseTableExportReturn {
	isExporting: boolean;
	exportComplete: ExportCompletionStatus | null;
	setExportComplete: React.Dispatch<
		React.SetStateAction<ExportCompletionStatus | null>
	>;
	handleExport: (format: "csv" | "json" | "parquet") => Promise<void>;
	cancelExport: () => void;
	clearExportComplete: () => void;
}

/**
 * Hook for handling table data export to CSV, JSON, and Parquet formats.
 * Supports both DuckDB streaming mode (uses COPY command) and pre-loaded mode (JavaScript conversion).
 */
export function useTableExport({
	sql,
	result,
	columns,
	showToast,
	onExportStart,
	onExportProgress,
	onExportComplete,
	onExportError,
}: UseTableExportOptions): UseTableExportReturn {
	const [isExporting, setIsExporting] = useState(false);
	const [exportComplete, setExportComplete] =
		useState<ExportCompletionStatus | null>(null);
	const exportAbortControllerRef = useRef<AbortController | null>(null);

	// ESC key handler to cancel export
	useEffect(() => {
		if (isExporting) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					if (exportAbortControllerRef.current) {
						exportAbortControllerRef.current.abort();
					}
				}
			};
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [isExporting]);

	// Dismiss export completion message on user interaction
	useEffect(() => {
		if (exportComplete) {
			const handleUserInteraction = () => {
				setExportComplete(null);
			};
			document.addEventListener("mousemove", handleUserInteraction, {
				once: true,
			});
			document.addEventListener("keydown", handleUserInteraction, {
				once: true,
			});
			return () => {
				document.removeEventListener("mousemove", handleUserInteraction);
				document.removeEventListener("keydown", handleUserInteraction);
			};
		}
	}, [exportComplete]);

	const cancelExport = useCallback(() => {
		if (exportAbortControllerRef.current) {
			exportAbortControllerRef.current.abort();
		}
	}, []);

	const clearExportComplete = useCallback(() => {
		setExportComplete(null);
	}, []);

	const handleExport = useCallback(
		async (format: "csv" | "json" | "parquet") => {
			if ((!sql && !result) || columns.length === 0) {
				showToast?.("No data to export", "error", 3000);
				return;
			}

			if (isExporting) {
				showToast?.("Export already in progress", "warning", 2000);
				return;
			}

			// Create abort controller for this export
			exportAbortControllerRef.current = new AbortController();
			setIsExporting(true);

			try {
				// Use COPY command for DuckDB when SQL is available (more efficient)
				if (sql) {
					const fileName = generateExportFileName(format);
					onExportStart?.({ fileType: format, fileName, totalSteps: 3 });

					const cleanSql = sql.trim().replace(/;+$/, "");

					// Step 1: Get file handle
					onExportProgress?.({
						currentStage: "Step 1/3: Choose where to save...",
						currentStep: 1,
					});
					const fileHandle = await showExportFilePicker(fileName, format);

					try {
						const formatOption = getDuckDBFormatOption(format);
						onExportProgress?.({
							currentStage: `Step 2/3: Exporting to ${format.toUpperCase()} (DuckDB processing)...`,
							currentStep: 2,
						});

						await queryService.executeQuery(
							`COPY (${cleanSql}) TO '${fileName}' (FORMAT ${formatOption})`,
							exportAbortControllerRef.current?.signal,
						);

						if (exportAbortControllerRef.current?.signal.aborted) {
							throw new Error("Export cancelled by user");
						}

						onExportProgress?.({
							currentStage: `Step 3/3: Downloading file...`,
							currentStep: 3,
						});
						const buffer = await queryService.copyFileToBuffer(fileName);

						if (exportAbortControllerRef.current?.signal.aborted) {
							throw new Error("Export cancelled by user");
						}

						const fileSizeStr = formatFileSize(buffer.byteLength);

						if (fileHandle) {
							await saveToFileHandle(fileHandle, buffer);
							showToast?.(
								`✓ Saved ${fileHandle.name} (${fileSizeStr})`,
								"success",
								5000,
							);
							setExportComplete(
								createExportCompletionStatus(
									fileHandle.name,
									0,
									format,
									"success",
								),
							);
							onExportComplete?.();
						} else {
							downloadAsBlob(buffer, fileName, getExportMimeType(format));
							showToast?.(
								`✓ Downloaded ${fileName} (${fileSizeStr})`,
								"success",
								5000,
							);
							setExportComplete(
								createExportCompletionStatus(fileName, 0, format, "success"),
							);
							onExportComplete?.();
						}
					} catch (error) {
						logger.error(`${format.toUpperCase()} export failed:`, error);
						onExportError?.(String(error));
						throw error;
					} finally {
						try {
							await queryService.dropFile(fileName);
						} catch (e) {
							logger.warn("Failed to drop export file:", e);
						}
					}
				} else {
					// Fallback: BigQuery or pre-loaded data
					const fileName = generateExportFileName(format);
					onExportStart?.({ fileType: format, fileName, totalSteps: 2 });

					let exportData: QueryResult;
					if (result) {
						exportData = result;
					} else {
						showToast?.("No data available to export", "error", 3000);
						throw new Error("No SQL or result data available for export");
					}

					if (exportAbortControllerRef.current?.signal.aborted) {
						throw new Error("Export cancelled by user");
					}

					onExportProgress?.({
						currentStage: `Step 2/2: Saving file...`,
						currentStep: 2,
					});

					if (format === "csv") {
						await exportToCSV(exportData.columns, exportData.rows, fileName);
						showToast?.(
							`Exported ${exportData.rows.length.toLocaleString()} rows to CSV`,
							"success",
							4000,
						);
						setExportComplete(
							createExportCompletionStatus(
								fileName,
								exportData.rows.length,
								"csv",
								"success",
							),
						);
					} else if (format === "json") {
						await exportToJSON(exportData.columns, exportData.rows, fileName);
						showToast?.(
							`Exported ${exportData.rows.length.toLocaleString()} rows to JSON`,
							"success",
							4000,
						);
						setExportComplete(
							createExportCompletionStatus(
								fileName,
								exportData.rows.length,
								"json",
								"success",
							),
						);
					} else if (format === "parquet") {
						// Parquet export requires DuckDB connector
						const currentConnectorType = queryService.getActiveConnectorType();
						let needsConnectorSwitch = false;

						try {
							const fileHandle = await showExportFilePicker(
								fileName,
								"parquet",
							);
							if (fileHandle === null) {
								throw new Error(
									"Parquet export requires File System Access API support",
								);
							}

							if (exportAbortControllerRef.current?.signal.aborted) {
								throw new Error("Export cancelled by user");
							}

							if (currentConnectorType !== "duckdb") {
								needsConnectorSwitch = true;
								queryService.setActiveConnector("duckdb");
							}

							const duckdb = queryService.getActiveConnector();

							const hasExportToParquet = (
								connector: unknown,
							): connector is ParquetExportCapable => {
								return (
									typeof connector === "object" &&
									connector !== null &&
									"exportToParquet" in connector &&
									typeof (connector as ParquetExportCapable).exportToParquet ===
										"function"
								);
							};

							if (!hasExportToParquet(duckdb)) {
								throw new Error(
									"Parquet export not available (DuckDB connector not initialized)",
								);
							}

							onExportProgress?.({
								currentStage: `Step 2/2: Creating Parquet file...`,
								currentStep: 2,
							});

							await duckdb.exportToParquet(
								fileName,
								exportData.rows,
								exportData.columns,
								exportData.columnTypes as { name: string; type: string }[] | undefined,
							);

							if (exportAbortControllerRef.current?.signal.aborted) {
								try {
									await queryService.dropFile(fileName);
								} catch (e) {
									logger.warn("Failed to clean up cancelled export:", e);
								}
								throw new Error("Export cancelled by user");
							}

							const buffer = await queryService.copyFileToBuffer(fileName);
							await saveToFileHandle(fileHandle, buffer);
							showToast?.(
								`Exported ${exportData.rows.length.toLocaleString()} rows to Parquet`,
								"success",
								4000,
							);
							setExportComplete(
								createExportCompletionStatus(
									fileHandle.name,
									exportData.rows.length,
									"parquet",
									"success",
								),
							);

							try {
								await queryService.dropFile(fileName);
							} catch (e) {
								logger.warn("Failed to drop export file from VFS:", e);
							}
						} finally {
							if (needsConnectorSwitch) {
								queryService.setActiveConnector(currentConnectorType);
							}
						}
					} else {
						throw new Error(`Unsupported export format: ${format}`);
					}

					onExportComplete?.();
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error("Export failed:", errorMsg);

				const fallbackFileName = `data.${format}`;
				if (errorMsg === "Export cancelled by user") {
					setExportComplete(
						createExportCompletionStatus(
							fallbackFileName,
							0,
							format,
							"cancelled",
						),
					);
					onExportComplete?.();
				} else {
					setExportComplete(
						createExportCompletionStatus(
							fallbackFileName,
							0,
							format,
							"error",
							errorMsg,
						),
					);
					showToast?.(`Export failed: ${errorMsg}`, "error", 5000);
					onExportError?.(errorMsg);
				}
			} finally {
				setIsExporting(false);
				exportAbortControllerRef.current = null;
			}
		},
		[
			sql,
			result,
			columns,
			isExporting,
			showToast,
			onExportStart,
			onExportProgress,
			onExportComplete,
			onExportError,
		],
	);

	return {
		isExporting,
		exportComplete,
		setExportComplete,
		handleExport,
		cancelExport,
		clearExportComplete,
	};
}
