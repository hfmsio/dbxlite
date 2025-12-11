/**
 * File Schema Introspection
 * Pure functions for introspecting file schemas (Parquet, CSV, JSON, etc.)
 */

import type { Column, DataSource } from "../../../types/data-source";
import type { FileIntrospectionResult } from "../types";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("FileIntrospection");

/**
 * Pure function: Introspect file schema (parquet, csv, json, etc.)
 * Does NOT mutate the input dataSource - returns result object
 */
export async function introspectFileSchema(
	dataSource: DataSource,
): Promise<FileIntrospectionResult> {
	if (!dataSource.filePath && !dataSource.tableName) {
		throw new Error("No file path or table name for data source");
	}

	const tableName = dataSource.tableName || `'${dataSource.filePath}'`;

	try {
		// Use DESCRIBE to get column information (metadata only, doesn't scan data)
		const describeResult = await queryService.executeQuery(
			`DESCRIBE SELECT * FROM ${tableName} LIMIT 1`,
		);

		const columns: Column[] = describeResult.rows.map((row) => ({
			name: String(row.column_name),
			type: String(row.column_type),
			nullable: row.null === "YES",
		}));

		// Get row count
		let rowCount: number | undefined;
		try {
			const countResult = await queryService.executeQuery(
				`SELECT COUNT(*) as cnt FROM ${tableName}`,
			);
			if (countResult.rows.length > 0) {
				rowCount = Number(countResult.rows[0].cnt);
			}
		} catch (error) {
			logger.warn("Failed to get row count:", error);
			// Don't fail introspection if row count fails - we still have schema
		}

		return {
			columns,
			stats: { columnCount: columns.length, rowCount },
		};
	} catch (error) {
		const errorStr = String(error);

		// For remote files, always throw errors - user needs immediate feedback
		if (dataSource.isRemote) {
			logger.error(
				"Failed to introspect remote file:",
				dataSource.remoteURL,
				error,
			);
			throw error;
		}

		// For local files: If file doesn't exist (e.g., after page refresh), return empty result
		if (
			errorStr.includes("No files found") ||
			errorStr.includes("does not exist") ||
			errorStr.includes("not found")
		) {
			logger.warn(
				"File no longer exists in DuckDB filesystem:",
				dataSource.filePath,
			);
			return {
				columns: [],
				stats: { columnCount: 0, rowCount: 0 },
			};
		}

		logger.error("Failed to introspect file schema:", error);
		throw error;
	}
}
