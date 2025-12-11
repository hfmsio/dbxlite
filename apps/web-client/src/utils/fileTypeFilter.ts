/**
 * File Type Filter Builder
 *
 * Builds file type filters for the File System Access API file picker.
 */

/**
 * MIME types for common data file extensions.
 */
const MIME_TYPES: Record<string, string> = {
	".csv": "text/csv",
	".tsv": "text/tab-separated-values",
	".json": "application/json",
	".jsonl": "application/json",
	".ndjson": "application/json",
	".parquet": "application/octet-stream",
	".db": "application/octet-stream",
	".duckdb": "application/octet-stream",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xls": "application/vnd.ms-excel",
	".arrow": "application/octet-stream",
	".ipc": "application/octet-stream",
};

/**
 * All supported data file extensions grouped by MIME type.
 */
const ALL_DATA_FILES_ACCEPT: Record<string, string[]> = {
	"application/octet-stream": [
		".parquet",
		".csv",
		".json",
		".jsonl",
		".ndjson",
		".duckdb",
		".db",
		".arrow",
		".ipc",
	],
	"text/csv": [".csv", ".tsv"],
	"application/json": [".json", ".jsonl", ".ndjson"],
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
		".xlsx",
	],
	"application/vnd.ms-excel": [".xls"],
};

/**
 * File picker accept type structure.
 */
export interface FilePickerAcceptType {
	description: string;
	accept: Record<string, string[]>;
}

/**
 * Build file type filters for the file picker.
 *
 * If an extension is provided, creates a specific filter for that type
 * followed by an "All Data Files" fallback filter.
 *
 * @param extension - Optional file extension (e.g., "csv", "parquet")
 * @returns Array of file picker accept types
 */
export function buildFileTypeFilter(extension?: string): FilePickerAcceptType[] {
	const filters: FilePickerAcceptType[] = [];

	// Validate and normalize extension
	const normalizedExt = extension?.toLowerCase().replace(/^\./, "");
	const isValidExtension = normalizedExt && /^[a-z0-9]+$/.test(normalizedExt);
	const extensionWithDot = isValidExtension ? `.${normalizedExt}` : "";

	// Add specific extension filter if valid
	if (extensionWithDot && isValidExtension) {
		const mimeType = MIME_TYPES[extensionWithDot] || "application/octet-stream";
		filters.push({
			description: `${normalizedExt.toUpperCase()} Files`,
			accept: {
				[mimeType]: [extensionWithDot],
			},
		});
	}

	// Always add "All Data Files" as fallback
	filters.push({
		description: "All Data Files",
		accept: ALL_DATA_FILES_ACCEPT,
	});

	return filters;
}

/**
 * Extract extension from filename.
 *
 * @param filename - The filename to extract extension from
 * @returns Extension without dot, lowercase, or empty string if none
 */
export function getFileExtension(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop() || "";
	return /^[a-z0-9]+$/.test(ext) ? ext : "";
}
