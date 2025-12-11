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
