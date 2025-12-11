/**
 * Export utility functions for PaginatedTable
 * These are pure/simple utilities that can be safely extracted
 */

/**
 * Get MIME type for export format
 */
export function getExportMimeType(format: "csv" | "json" | "parquet"): string {
	switch (format) {
		case "csv":
			return "text/csv";
		case "json":
			return "application/json";
		case "parquet":
			return "application/octet-stream";
		default:
			return "application/octet-stream";
	}
}

/**
 * Get file extension for export format
 */
export function getExportExtension(format: "csv" | "json" | "parquet"): string {
	return `.${format}`;
}

/**
 * Get DuckDB COPY format option string
 */
export function getDuckDBFormatOption(
	format: "csv" | "json" | "parquet",
): string {
	switch (format) {
		case "csv":
			return "CSV, HEADER TRUE";
		case "json":
			return "JSON";
		case "parquet":
			return "PARQUET";
		default:
			return "CSV, HEADER TRUE";
	}
}

/**
 * Generate export filename with timestamp
 */
export function generateExportFileName(
	format: "csv" | "json" | "parquet",
	prefix: string = "export",
): string {
	return `${prefix}_${Date.now()}.${format}`;
}

/**
 * Download buffer as blob (fallback when File System Access API not available)
 */
export function downloadAsBlob(
	buffer: Uint8Array | ArrayBuffer,
	fileName: string,
	mimeType: string,
): void {
	const blob = new Blob([buffer as BlobPart], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Save buffer to file handle using File System Access API
 */
export async function saveToFileHandle(
	fileHandle: FileSystemFileHandle,
	buffer: Uint8Array | ArrayBuffer,
): Promise<void> {
	const writable = await fileHandle.createWritable();
	await writable.write(buffer as BlobPart);
	await writable.close();
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Get accept types for file picker based on format
 */
export function getFilePickerAcceptTypes(
	format: "csv" | "json" | "parquet",
): { description: string; accept: Record<string, string[]> }[] {
	const mimeType = getExportMimeType(format);
	const extension = getExportExtension(format);

	return [
		{
			description: `${format.toUpperCase()} Files`,
			accept: { [mimeType]: [extension] },
		},
	];
}

/**
 * Check if File System Access API is available
 */
export function isFileSystemAccessSupported(): boolean {
	return "showSaveFilePicker" in window;
}

/**
 * Show save file picker with proper error handling
 * Returns null if user cancels or API not available
 */
export async function showExportFilePicker(
	fileName: string,
	format: "csv" | "json" | "parquet",
): Promise<FileSystemFileHandle | null> {
	if (!isFileSystemAccessSupported()) {
		return null;
	}

	try {
		const fileHandle = await window.showSaveFilePicker?.({
			suggestedName: fileName,
			types: getFilePickerAcceptTypes(format),
		});
		return fileHandle;
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "AbortError") {
			// User cancelled - this is expected
			return null;
		}
		// Other error - log and return null for fallback
		// File System Access API error - log quietly and return null for fallback
		return null;
	}
}

/**
 * Export completion status
 */
export interface ExportCompletionStatus {
	fileName: string;
	rowCount: number;
	fileType: "csv" | "json" | "parquet";
	timestamp: number;
	status: "success" | "cancelled" | "error";
	errorMessage?: string;
}

/**
 * Create export completion status object
 */
export function createExportCompletionStatus(
	fileName: string,
	rowCount: number,
	fileType: "csv" | "json" | "parquet",
	status: "success" | "cancelled" | "error",
	errorMessage?: string,
): ExportCompletionStatus {
	return {
		fileName,
		rowCount,
		fileType,
		timestamp: Date.now(),
		status,
		errorMessage,
	};
}
