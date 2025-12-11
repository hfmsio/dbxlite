/**
 * File service for saving and opening SQL files
 */

import type { DataSourceType } from "../types/data-source";
import type { CellValue, TableRow } from "../types/table";
import { createLogger } from "../utils/logger";
import { extractSheetNames } from "../utils/xlsxUtils";

const logger = createLogger("FileService");

export interface FileHandle {
	name: string;
	content: string;
	path?: string;
	fileHandle?: FileSystemFileHandle;
	/** File's last modified timestamp from disk (for conflict detection) */
	fileLastModified?: number;
}

export interface DataFileInfo {
	name: string;
	buffer: ArrayBuffer;
	type: DataSourceType;
	size: number;
	extension: string;
	fileHandle?: FileSystemFileHandle; // File handle for zero-copy access
	file?: File; // File object for direct access
	sheets?: Array<{ name: string; index: number }>; // XLSX sheet info (Phase 1)
}

/**
 * Opens a file picker to select a SQL file
 */
export async function openSQLFile(): Promise<FileHandle | null> {
	try {
		// Check if File System Access API is supported
		if ("showOpenFilePicker" in window) {
			const fileHandles = await window.showOpenFilePicker?.({
				types: [
					{
						description: "SQL Files",
						accept: {
							"text/sql": [".sql"],
							"text/plain": [".txt"],
						},
					},
				],
				multiple: false,
			});

			if (!fileHandles) {
				return null;
			}


			const [fileHandle] = fileHandles;
			const file = await fileHandle.getFile();
			const content = await file.text();

			return {
				name: file.name,
				content,
				path: file.name,
				fileHandle, // Return the file handle for persistence
				fileLastModified: file.lastModified, // For conflict detection
			};
		} else {
			// Fallback to traditional file input
			return new Promise((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".sql,.txt";
				input.onchange = async (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file) {
						const content = await file.text();
						resolve({
							name: file.name,
							content,
							path: file.name,
						});
					} else {
						resolve(null);
					}
				};
				input.click();
			});
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled file open dialog");
			return null;
		}
		logger.error("Error opening file:", err);
		return null;
	}
}

/**
 * Saves content to a SQL file
 * Returns an object with the file name and optional file handle
 */
export async function saveSQLFile(
	content: string,
	suggestedName?: string,
): Promise<{ name: string; fileHandle?: FileSystemFileHandle } | null> {
	try {
		// Check if File System Access API is supported
		if ("showSaveFilePicker" in window) {
			const fileHandle = await window.showSaveFilePicker?.({
				suggestedName: suggestedName || "query.sql",
				types: [
					{
						description: "SQL Files",
						accept: {
							"text/sql": [".sql"],
						},
					},
				],
			});

		if (!fileHandle) {
			return null;
		}

			const writable = await fileHandle.createWritable();
			await writable.write(content);
			await writable.close();

			return { name: fileHandle.name, fileHandle };
		} else {
			// Fallback to download
			const blob = new Blob([content], { type: "text/sql" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = suggestedName || "query.sql";
			a.click();
			URL.revokeObjectURL(url);
			return { name: suggestedName || "query.sql" };
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled file save dialog");
			return null;
		}
		logger.error("Error saving file:", err);
		return null;
	}
}

/**
 * Downloads query results as CSV
 */
export async function exportToCSV(
	columns: string[],
	rows: TableRow[],
	filename: string = "results.csv",
): Promise<string | null> {
	const csvContent = [
		columns.join(","),
		...rows.map((row) =>
			columns
				.map((col) => {
					const value = row[col];
					if (value === null || value === undefined) return "";
					const stringValue = String(value);
					// Escape values containing commas or quotes
					if (
						stringValue.includes(",") ||
						stringValue.includes('"') ||
						stringValue.includes("\n")
					) {
						return `"${stringValue.replace(/"/g, '""')}"`;
					}
					return stringValue;
				})
				.join(","),
		),
	].join("\n");

	try {
		// Check if File System Access API is supported
		if ("showSaveFilePicker" in window) {
			const fileHandle = await window.showSaveFilePicker?.({
				suggestedName: filename,
				types: [
					{
						description: "CSV Files",
						accept: {
							"text/csv": [".csv"],
						},
					},
				],
			});

		if (!fileHandle) {
			return null;
		}

			const writable = await fileHandle.createWritable();
			await writable.write(csvContent);
			await writable.close();

			return fileHandle.name;
		} else {
			// Fallback to automatic download
			const blob = new Blob([csvContent], { type: "text/csv" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			return filename;
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled CSV export dialog");
			return null;
		}
		logger.error("Error saving CSV file:", err);
		return null;
	}
}

/**
 * Detects the data source type from file extension
 */
export function detectDataSourceType(filename: string): DataSourceType {
	const ext = filename.toLowerCase().split(".").pop() || "";

	switch (ext) {
		case "db":
		case "duckdb":
			return "duckdb";
		case "parquet":
			return "parquet";
		case "csv":
			return "csv";
		case "tsv":
		case "tab":
			return "tsv";
		case "json":
			return "json";
		case "jsonl":
		case "ndjson":
			return "jsonl";
		case "xlsx":
		case "xls":
		case "ods":
			return "xlsx";
		case "arrow":
		case "ipc":
			return "arrow";
		default:
			// Default to parquet for unknown binary files
			return "parquet";
	}
}

/**
 * Opens a file picker to select multiple data files (CSV, Parquet, JSON, DuckDB)
 */
export async function openDataFiles(): Promise<DataFileInfo[]> {
	try {
		// Check if File System Access API is supported
		if ("showOpenFilePicker" in window) {
			const fileHandles = await window.showOpenFilePicker?.({
				types: [
					{
						description: "All Data Files",
						accept: {
							"text/csv": [".csv"],
							"text/tab-separated-values": [".tsv", ".tab"],
							"application/json": [".json", ".jsonl", ".ndjson"],
							"application/octet-stream": [
								".parquet",
								".db",
								".duckdb",
								".arrow",
								".ipc",
							],
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
								[".xlsx"],
							"application/vnd.ms-excel": [".xls"],
							"application/vnd.oasis.opendocument.spreadsheet": [".ods"],
						},
					},
					{
						description: "Text Files (CSV, TSV)",
						accept: {
							"text/csv": [".csv"],
							"text/tab-separated-values": [".tsv", ".tab"],
						},
					},
					{
						description: "JSON Files",
						accept: {
							"application/json": [".json", ".jsonl", ".ndjson"],
						},
					},
					{
						description: "Binary Files (Parquet, DuckDB, Arrow)",
						accept: {
							"application/octet-stream": [
								".parquet",
								".db",
								".duckdb",
								".arrow",
								".ipc",
							],
						},
					},
					{
						description: "Excel Files",
						accept: {
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
								[".xlsx"],
							"application/vnd.ms-excel": [".xls"],
							"application/vnd.oasis.opendocument.spreadsheet": [".ods"],
						},
					},
				],
				multiple: true, // Enable multiple file selection
			});

		if (!fileHandles) {
			return [];
		}

			// Process all selected files
			const fileInfos: DataFileInfo[] = [];
			for (const fileHandle of fileHandles) {
				const file = await fileHandle.getFile();
				const fileType = detectDataSourceType(file.name);

				// Use zero-copy file handle access for ALL files
				const buffer = new ArrayBuffer(0); // Empty buffer - we'll use file handle instead

				const fileInfo: DataFileInfo = {
					name: file.name,
					buffer,
					type: fileType,
					size: file.size,
					extension: file.name.split(".").pop() || "",
					fileHandle, // Store the file handle for zero-copy access
					file, // Store the File object for DuckDB to access directly
				};

				// Extract XLSX sheets (Phase 1: only sheet names)
				if (fileType === "xlsx") {
					const sheets = await extractXLSXSheets(fileInfo);
					if (sheets.length > 0) {
						fileInfo.sheets = sheets;
					}
				}

				fileInfos.push(fileInfo);
			}
			return fileInfos;
		} else {
			// Fallback to traditional file input
			return new Promise((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept =
					".csv,.tsv,.tab,.parquet,.json,.jsonl,.ndjson,.db,.duckdb,.xlsx,.xls,.ods,.arrow,.ipc";
				input.multiple = true; // Enable multiple file selection
				input.onchange = async (e) => {
					const files = (e.target as HTMLInputElement).files;
					if (files && files.length > 0) {
						const fileInfos: DataFileInfo[] = [];
						for (let i = 0; i < files.length; i++) {
							const file = files[i];
							const buffer = await file.arrayBuffer();
							const fileType = detectDataSourceType(file.name);

							const fileInfo: DataFileInfo = {
								name: file.name,
								buffer,
								type: fileType,
								size: file.size,
								extension: file.name.split(".").pop() || "",
							};

							// Extract XLSX sheets (Phase 1: only sheet names)
							if (fileType === "xlsx") {
								const sheets = await extractXLSXSheets(fileInfo);
								if (sheets.length > 0) {
									fileInfo.sheets = sheets;
								}
							}

							fileInfos.push(fileInfo);
						}
						resolve(fileInfos);
					} else {
						resolve([]);
					}
				};
				input.click();
			});
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled file open dialog");
			return [];
		}
		logger.error("Error opening data files:", err);
		return [];
	}
}

/**
 * Opens a file picker to select a single data file (CSV, Parquet, JSON, DuckDB)
 * @deprecated Use openDataFiles() for better UX with multi-file support
 */
export async function openDataFile(): Promise<DataFileInfo | null> {
	const files = await openDataFiles();
	return files.length > 0 ? files[0] : null;
}

/**
 * Downloads a remote file via fetch (to bypass CORS issues)
 */
export async function downloadRemoteFile(
	url: string,
): Promise<DataFileInfo | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch file: ${response.statusText}`);
		}
		const buffer = await response.arrayBuffer();
		const fileName = url.split("/").pop() || "downloaded_file.parquet";

		return {
			name: fileName,
			buffer,
			type: detectDataSourceType(fileName),
			size: buffer.byteLength,
			extension: fileName.split(".").pop() || "",
		};
	} catch (err: unknown) {
		logger.error("Error downloading remote file:", err);
		throw err;
	}
}

/**
 * Exports query results as JSON
 */
export async function exportToJSON(
	columns: string[],
	rows: TableRow[],
	filename: string = "results.json",
): Promise<string | null> {
	const jsonData = rows.map((row) => {
		const obj: Record<string, CellValue> = {};
		columns.forEach((col) => {
			obj[col] = row[col];
		});
		return obj;
	});

	const jsonContent = JSON.stringify(jsonData, null, 2);

	try {
		// Check if File System Access API is supported
		if ("showSaveFilePicker" in window) {
			const fileHandle = await window.showSaveFilePicker?.({
				suggestedName: filename,
				types: [
					{
						description: "JSON Files",
						accept: {
							"application/json": [".json"],
						},
					},
				],
			});

		if (!fileHandle) {
			return null;
		}

			const writable = await fileHandle.createWritable();
			await writable.write(jsonContent);
			await writable.close();

			return fileHandle.name;
		} else {
			// Fallback to automatic download
			const blob = new Blob([jsonContent], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			return filename;
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled JSON export dialog");
			return null;
		}
		logger.error("Error saving JSON file:", err);
		return null;
	}
}

/**
 * Downloads binary data as a file with save dialog
 */
export async function downloadBinaryFile(
	buffer: Uint8Array,
	filename: string,
	mimeType: string = "application/octet-stream",
): Promise<string | null> {
	try {
		// Check if File System Access API is supported
		if ("showSaveFilePicker" in window) {
			// Extract extension from filename
			const extension = filename.includes(".")
				? `.${filename.split(".").pop()}`
				: "";
			const acceptType: Record<string, string[]> = {};

			if (mimeType) {
				acceptType[mimeType] = extension ? [extension] : [];
			}

			const fileHandle = await window.showSaveFilePicker?.({
				suggestedName: filename,
				types: [
					{
						description: "File",
						accept: acceptType,
					},
				],
			});

		if (!fileHandle) {
			return null;
		}

			const writable = await fileHandle.createWritable();
			await writable.write(buffer as BufferSource);
			await writable.close();

			return fileHandle.name;
		} else {
			// Fallback to automatic download
			const blob = new Blob([buffer as BlobPart], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			return filename;
		}
	} catch (err: unknown) {
		// User cancelled the dialog - this is expected behavior
		if (err instanceof Error && err.name === "AbortError") {
			logger.debug("User cancelled file save dialog");
			return null;
		}
		// Actual error
		logger.error("Error saving binary file:", err);
		return null;
	}
}

/**
 * Extract XLSX sheet information from file
 *
 * Phase 1: Only extracts sheet names
 * Phase 2: Can be extended to introspect columns per sheet lazily
 *
 * Error handling: Returns empty array on failure (treats as single-sheet)
 */
export async function extractXLSXSheets(
	fileInfo: DataFileInfo,
): Promise<Array<{ name: string; index: number }>> {
	if (fileInfo.type !== "xlsx") {
		return [];
	}

	try {
		// Get buffer from file if zero-copy was used
		let buffer = fileInfo.buffer;
		if (fileInfo.file && buffer.byteLength === 0) {
			buffer = await fileInfo.file.arrayBuffer();
		}

		return await extractSheetNames(buffer);
	} catch (err: unknown) {
		logger.warn("Failed to extract XLSX sheets:", err);
		return []; // Graceful fallback
	}
}
