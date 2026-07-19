/**
 * File Constants
 *
 * Shared constants and utilities for file operations.
 */

/**
 * Files larger than this threshold use zero-copy registration
 * (registerFileHandle instead of registerFile with ArrayBuffer).
 * This avoids memory issues with very large files.
 */
export const ZERO_COPY_THRESHOLD = 1024 * 1024 * 1024; // 1GB

/**
 * Check if a file should use zero-copy registration based on size.
 */
export function shouldUseZeroCopy(size: number): boolean {
	return size > ZERO_COPY_THRESHOLD;
}

/**
 * Whether DuckDB should read this format from a materialised buffer rather
 * than a File handle.
 *
 * Format decides this, not size. Parquet/CSV/JSON are read forward: DuckDB
 * fetches only the bytes it needs (a Parquet footer is a few KB even for a
 * 150 MB file), so a File handle is a large win. XLSX is the opposite — it
 * is a ZIP, and the reader seeks all over the archive. Every seek through
 * the browser FileReader costs a slice + synchronous read, which measured
 * 3-10x slower than reading the same sheet from a buffer. Excel tops out
 * around a million rows, so materialising the whole workbook is affordable.
 *
 * This predicate governs BOTH the decision to read the buffer up front and
 * the choice of registration call. Keep it that way: when those two decisions
 * were made independently they drifted apart, and XLSX silently ended up on
 * the slow path with its buffer read and then thrown away.
 */
export function requiresFullBuffer(extensionOrName: string): boolean {
	const lower = extensionOrName.toLowerCase();
	return (
		lower === "xlsx" ||
		lower === "xls" ||
		lower.endsWith(".xlsx") ||
		lower.endsWith(".xls")
	);
}

/** How a file's bytes should be handed to DuckDB. */
export type RegistrationMode = "buffer" | "handle";

/**
 * Decide how to register a file with DuckDB.
 *
 * Two independent reasons to materialise the whole file into a buffer:
 *   - Format: XLSX must be buffered regardless of size (see requiresFullBuffer),
 *     because the ZIP reader seeks all over the archive and the File-handle
 *     path pays a slice + sync read per seek.
 *   - Size: below the zero-copy threshold a buffer is simplest; only large
 *     files earn the File handle, where DuckDB fetches just the bytes it reads.
 *
 * Every reload/restore path routes through here so they can't drift — they
 * used to disagree, and XLSX ended up on the slow handle path in most of them.
 */
export function chooseRegistrationMode(
	fileName: string,
	size: number,
): RegistrationMode {
	if (requiresFullBuffer(fileName)) return "buffer";
	return shouldUseZeroCopy(size) ? "handle" : "buffer";
}

/**
 * Common data file extensions supported by DuckDB.
 */
export const DATA_FILE_EXTENSIONS = [
	".parquet",
	".csv",
	".tsv",
	".json",
	".jsonl",
	".ndjson",
	".arrow",
	".ipc",
	".xlsx",
	".xls",
] as const;

/**
 * DuckDB database file extensions.
 */
export const DATABASE_EXTENSIONS = [".duckdb", ".db"] as const;

/**
 * Check if a filename is a DuckDB database file.
 */
export function isDuckDBFile(filename: string): boolean {
	const lower = filename.toLowerCase();
	return lower.endsWith(".duckdb") || lower.endsWith(".db");
}

/**
 * Check if a filename is a SQL file (editor file, not data).
 */
export function isSQLFile(filename: string): boolean {
	const lower = filename.toLowerCase();
	return lower.endsWith(".sql") || lower.endsWith(".txt");
}
