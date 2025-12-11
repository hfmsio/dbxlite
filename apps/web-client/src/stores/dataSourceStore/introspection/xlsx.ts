/**
 * XLSX Sheet Introspection
 * Pure functions for introspecting XLSX sheet columns
 */

import type { Column, DataSource } from "../../../types/data-source";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("XLSXIntrospection");

/**
 * Pure function: Introspect XLSX sheet columns
 * Lazy loading for XLSX sheets - columns are loaded on expand
 */
export async function introspectSheetColumns(
	dataSource: DataSource,
	sheetName: string,
): Promise<Column[]> {
	if (!dataSource.filePath || dataSource.type !== "xlsx") {
		throw new Error("Sheet introspection only works for XLSX files");
	}

	try {
		// Use DuckDB to introspect the specific sheet's structure
		const describeResult = await queryService.executeQuery(
			`DESCRIBE SELECT * FROM read_xlsx('${dataSource.filePath}', sheet='${sheetName}') LIMIT 1`,
		);

		const columns: Column[] = describeResult.rows.map((row) => ({
			name: String(row.column_name),
			type: String(row.column_type),
			nullable: row.null === "YES",
		}));

		return columns;
	} catch (error) {
		logger.error(`Failed to introspect sheet "${sheetName}":`, error);
		throw error;
	}
}
