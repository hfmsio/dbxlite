/**
 * Hook for handling ResultPane export functionality
 * Supports CSV, JSON, and Parquet exports with BigQuery streaming
 */
import { useCallback, useState } from "react";
import {
	exportToCSV,
	exportToJSON,
} from "../../../services/file-service";
import type {
	QueryResult,
} from "../../../services/streaming-query-service";
import { queryService } from "../../../services/streaming-query-service";
import type { FileSystemFileHandle } from "../../../types/table";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("useResultExport");

// Extended DuckDB connector type with Parquet export methods
interface DuckDBWithParquetExport {
	exportToParquet(
		fileName: string,
		rows: unknown[],
		columns: string[],
		columnTypes?: { name: string; type: string }[],
	): Promise<void>;
	exportToParquetStreaming(
		fileName: string,
		dataGenerator: AsyncGenerator<unknown[]>,
		columns: string[],
		columnTypes?: { name: string; type: string }[],
		progressCallback?: (rowsProcessed: number, totalRows?: number) => void,
	): Promise<number>;
}

interface UseResultExportOptions {
	result: QueryResult | null;
	lastQuery?: string;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

interface ExportProgress {
	isExporting: boolean;
	rowsProcessed: number;
	totalRows?: number;
	fileName: string;
}

interface UseResultExportReturn {
	exportProgress: ExportProgress | null;
	setExportProgress: (progress: ExportProgress | null) => void;
	handleExport: (format: "csv" | "json" | "parquet") => Promise<void>;
}

/**
 * Manages export functionality for ResultPane with support for
 * CSV, JSON, and Parquet formats, including BigQuery streaming
 */
export function useResultExport({
	result,
	lastQuery,
	showToast,
}: UseResultExportOptions): UseResultExportReturn {
	const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
		null,
	);

	const handleExport = useCallback(
		async (format: "csv" | "parquet" | "json") => {
			if (!result) return;

			try {
				if (format === "csv") {
					const savedName = await exportToCSV(
						result.columns,
						result.rows,
						"results.csv",
					);
					if (savedName) {
						showToast?.(
							`Exported ${result.rows.length} rows as CSV to ${savedName}`,
							"success",
						);
					} else {
						showToast?.(`Export cancelled`, "info");
					}
				} else if (format === "json") {
					const savedName = await exportToJSON(
						result.columns,
						result.rows,
						"results.json",
					);
					if (savedName) {
						showToast?.(
							`Exported ${result.rows.length} rows as JSON to ${savedName}`,
							"success",
						);
					} else {
						showToast?.(`Export cancelled`, "info");
					}
				} else if (format === "parquet") {
					// Export to Parquet using DuckDB (works for results from any connector)
					try {
						const fileName = `results_${Date.now()}.parquet`;

						// Get DuckDB connector (needed for Parquet export)
						const currentConnectorType = queryService.getActiveConnectorType();
						let needsConnectorSwitch = false;

						if (currentConnectorType !== "duckdb") {
							// Temporarily switch to DuckDB for export
							needsConnectorSwitch = true;
							queryService.setActiveConnector("duckdb");
						}

						const duckdb = queryService.getActiveConnector();

						// For BigQuery or large result sets, use streaming export if query is available
						if (
							currentConnectorType === "bigquery" &&
							lastQuery &&
							"exportToParquetStreaming" in duckdb
						) {
							// Re-query BigQuery with streaming to avoid loading all data in memory
							const sourceConnector = queryService.getConnector("bigquery");
							if (!sourceConnector) {
								throw new Error("BigQuery connector not available");
							}

							// IMPORTANT: Get file handle BEFORE starting the export (while user gesture is fresh)
							// This ensures the save dialog works even for long-running exports
							let fileHandle: FileSystemFileHandle | null = null;
							try {
								const extension = ".parquet";
								const handle = await window.showSaveFilePicker?.({
									suggestedName: fileName,
									types: [
										{
											description: "Parquet File",
											accept: { "application/octet-stream": [extension] },
										},
									],
								});
								fileHandle = handle ?? null;
							} catch (err: unknown) {
								if (err instanceof Error && err.name === "AbortError") {
									logger.debug(
										"User cancelled file save dialog before export started",
									);
									showToast?.("Export cancelled", "info");
									if (needsConnectorSwitch) {
										queryService.setActiveConnector(currentConnectorType);
									}
									return;
								}
								throw err;
							}

							try {
								// Show progress modal
								setExportProgress({
									isExporting: true,
									rowsProcessed: 0,
									fileName: fileName,
								});

								// Create async generator from BigQuery query
								const dataGenerator = sourceConnector.query(lastQuery, {
									maxRows: 1000000,
								}); // Up to 1M rows

								// Stream export with progress updates
								const totalRows = await (
									duckdb as DuckDBWithParquetExport
								).exportToParquetStreaming(
									fileName,
									dataGenerator,
									result.columns,
									result.columnTypes,
									(rowsProcessed: number, totalRows?: number) => {
										setExportProgress({
											isExporting: true,
											rowsProcessed,
											totalRows,
											fileName,
										});
									},
								);

								// Retrieve the file from DuckDB's virtual filesystem
								const buffer = await queryService.copyFileToBuffer(fileName);

								// Clear progress modal
								if (!fileHandle) {
									throw new Error("File handle is null");
								}
								setExportProgress(null);

								// Write to the pre-selected file handle
								const writable = await fileHandle.createWritable();
								await writable.write(new Blob([buffer]));
								await writable.close();

								logger.info(
									`Successfully saved ${totalRows.toLocaleString()} rows to ${fileHandle.name}`,
								);
								showToast?.(
									`Exported ${totalRows.toLocaleString()} rows as Parquet to ${fileHandle.name}`,
									"success",
								);
							} catch (err) {
								setExportProgress(null);
								throw err;
							}
						} else {
							// Use standard in-memory export for small datasets or DuckDB queries
							if (
								"exportToParquet" in duckdb &&
								typeof duckdb.exportToParquet === "function"
							) {
								// Get file handle BEFORE starting the export (while user gesture is fresh)
								let fileHandle: FileSystemFileHandle | null = null;
								try {
									const extension = ".parquet";
									const handle = await window.showSaveFilePicker?.({
										suggestedName: fileName,
										types: [
											{
												description: "Parquet File",
												accept: { "application/octet-stream": [extension] },
											},
										],
									});
									fileHandle = handle ?? null;
								} catch (err: unknown) {
									if (err instanceof Error && err.name === "AbortError") {
										logger.debug("User cancelled file save dialog");
										showToast?.("Export cancelled", "info");
										if (needsConnectorSwitch) {
											queryService.setActiveConnector(currentConnectorType);
										}
										return;
									}
									throw err;
								}

								// Export to DuckDB virtual filesystem
								await (duckdb as DuckDBWithParquetExport).exportToParquet(
									fileName,
									result.rows,
									result.columns,
									result.columnTypes,
								);

								// Retrieve the file from DuckDB's virtual filesystem
								const buffer = await queryService.copyFileToBuffer(fileName);

								// Write to the pre-selected file handle
								if (!fileHandle) {
									throw new Error("File handle is null");
								}
								const writable = await fileHandle.createWritable();
								await writable.write(new Blob([buffer]));
								await writable.close();

								showToast?.(
									`Exported ${result.rows.length} rows as Parquet to ${fileHandle.name}`,
									"success",
								);
							} else {
								throw new Error(
									"DuckDB connector does not support Parquet export",
								);
							}
						}

						// Restore original connector
						if (needsConnectorSwitch) {
							queryService.setActiveConnector(currentConnectorType);
						}
					} catch (err) {
						logger.error("Parquet export error", err);
						throw new Error(
							`Parquet export failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
				}
			} catch (err) {
				showToast?.(
					`Export failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
		[result, lastQuery, showToast],
	);

	return {
		exportProgress,
		setExportProgress,
		handleExport,
	};
}
