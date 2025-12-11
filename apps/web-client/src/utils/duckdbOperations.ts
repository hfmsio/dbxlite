/**
 * DuckDB Operations Utility
 *
 * Centralized functions for DuckDB database operations including:
 * - Database alias generation
 * - Database attachment/detachment
 * - Database state queries
 *
 * This eliminates duplication across useFileUpload, useFileReload, and data-source-store.
 */

import { queryService } from "../services/streaming-query-service";
import { createLogger } from "./logger";
import {
	buildAttachSQL,
	buildDetachSQL,
	escapeIdentifier,
	escapeLikePattern,
	escapeStringLiteral,
} from "./sqlSanitizer";

const logger = createLogger("DuckDBOperations");

/**
 * Generate a valid DuckDB alias from a filename.
 *
 * Rules:
 * - Remove .duckdb or .db extension
 * - Replace non-alphanumeric characters with underscores
 * - Ensure doesn't start with a number (prefix with underscore)
 *
 * @example
 * generateDatabaseAlias("my_data.duckdb") // "my_data"
 * generateDatabaseAlias("sales data.db")  // "sales_data"
 * generateDatabaseAlias("2024-report.duckdb") // "_2024_report"
 */
export function generateDatabaseAlias(fileName: string): string {
	return fileName
		.replace(/\.(duckdb|db)$/i, "")
		.replace(/[^a-zA-Z0-9_]/g, "_")
		.replace(/^[0-9]/, "_$&");
}

/**
 * Check if a database with the given path is already attached.
 * Returns the alias if found, null otherwise.
 *
 * @param filePath - The file path to search for
 * @returns The database alias if found, null otherwise
 */
export async function findAttachedDatabaseByPath(
	filePath: string,
): Promise<string | null> {
	try {
		// Escape the file path for safe LIKE matching
		const escapedPath = escapeStringLiteral(`%${escapeLikePattern(filePath)}`);
		const exactPath = escapeStringLiteral(filePath);
		const result = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT database_name, path FROM duckdb_databases() WHERE path LIKE ${escapedPath} OR path = ${exactPath}`,
			undefined,
			true,
		);
		if (result.rows.length > 0) {
			return result.rows[0].database_name as string;
		}
		return null;
	} catch (_err) {
		return null;
	}
}

/**
 * Check if a database is attached with the given alias.
 *
 * @param dbAlias - The database alias to check
 * @returns True if a database with this alias is attached
 */
export async function isDatabaseAttachedByAlias(
	dbAlias: string,
): Promise<boolean> {
	try {
		const escapedAlias = escapeStringLiteral(dbAlias);
		const result = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT database_name FROM duckdb_databases() WHERE database_name = ${escapedAlias}`,
			undefined,
			true,
		);
		return result.rows.length > 0;
	} catch (_err) {
		return false;
	}
}

/**
 * Check if database is already correctly attached with given alias and path.
 *
 * @param dbAlias - The expected database alias
 * @param filePath - The expected file path
 * @returns True if the database is attached with matching alias and path
 */
export async function isDatabaseAlreadyAttached(
	dbAlias: string,
	filePath: string,
): Promise<boolean> {
	try {
		const escapedAlias = escapeStringLiteral(dbAlias);
		const result = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT database_name, path FROM duckdb_databases() WHERE database_name = ${escapedAlias}`,
			undefined,
			true,
		);
		if (result.rows.length > 0) {
			const attachedPath = result.rows[0].path as string;
			// Check if paths match (DuckDB may store full path or just filename)
			if (attachedPath === filePath || attachedPath.endsWith(filePath)) {
				return true;
			}
		}
		return false;
	} catch (_err) {
		return false;
	}
}

/**
 * Safely detach a database by alias.
 * Simple version that only detaches by alias.
 *
 * @param dbAlias - The database alias to detach
 * @returns True if a database was detached, false otherwise
 */
export async function detachDatabaseByAlias(
	dbAlias: string,
): Promise<boolean> {
	try {
		const isAttached = await isDatabaseAttachedByAlias(dbAlias);
		if (isAttached) {
			await queryService.executeQueryOnConnector(
				"duckdb",
				buildDetachSQL(dbAlias),
				undefined,
				true,
			);
			logger.debug(`Detached database by alias: ${dbAlias}`);
			return true;
		}
		return false;
	} catch (_err) {
		return false;
	}
}

/**
 * Safely detach a database by alias or path.
 * Handles both alias-based and path-based conflicts.
 *
 * This is the more comprehensive version that also checks for
 * databases attached with the same file but different aliases.
 *
 * @param dbAlias - The database alias to detach
 * @param filePath - Optional file path to also check for conflicts
 * @returns True if a database was detached, false otherwise
 */
export async function safeDetachDatabase(
	dbAlias: string,
	filePath?: string,
): Promise<boolean> {
	try {
		// First, check if there's a database attached with the same path (regardless of alias)
		if (filePath) {
			const existingAlias = await findAttachedDatabaseByPath(filePath);
			if (existingAlias && existingAlias !== dbAlias) {
				logger.debug(
					`Found database attached with path ${filePath} under different alias: ${existingAlias}`,
				);
				try {
					await queryService.executeQueryOnConnector(
						"duckdb",
						buildDetachSQL(existingAlias),
						undefined,
						true,
					);
					logger.debug(`Detached database: ${existingAlias}`);
				} catch (detachErr) {
					logger.warn(`Could not detach ${existingAlias}:`, detachErr);
				}
			}
		}

		// Then detach by alias
		return await detachDatabaseByAlias(dbAlias);
	} catch (_err) {
		return false;
	}
}

/**
 * Attach a DuckDB database file.
 *
 * @param filePath - Path to the database file
 * @param alias - Database alias to use
 * @param readOnly - Whether to attach in read-only mode (default: true)
 * @throws Error if attachment fails
 */
export async function attachDatabase(
	filePath: string,
	alias: string,
	readOnly = true,
): Promise<void> {
	const sql = buildAttachSQL(filePath, alias, readOnly);
	await queryService.executeQueryOnConnector("duckdb", sql, undefined, true);
	logger.debug(`Attached database: ${alias} from ${filePath} (readOnly: ${readOnly})`);
}

/**
 * Get list of attached non-internal databases.
 *
 * @returns Array of database names (excludes 'memory', 'temp', 'system')
 */
export async function getAttachedDatabases(): Promise<string[]> {
	try {
		const result = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT database_name FROM duckdb_databases() WHERE database_name NOT IN ('memory', 'temp', 'system')`,
			undefined,
			true,
		);
		return result.rows.map((row) => row.database_name as string);
	} catch (_err) {
		return [];
	}
}
