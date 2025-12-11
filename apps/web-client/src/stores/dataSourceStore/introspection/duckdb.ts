/**
 * DuckDB Database Introspection
 * Pure functions for introspecting DuckDB database schemas
 */

import type { Column, DataSource, Schema, Table } from "../../../types/data-source";
import type { DuckDBIntrospectionResult } from "../types";
import { queryService } from "../../../services/streaming-query-service";
import { generateDatabaseAlias } from "../../../utils/duckdbOperations";
import { buildAttachSQL, escapeStringLiteral } from "../../../utils/sqlSanitizer";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("DuckDBIntrospection");

/**
 * Pure function: Introspect DuckDB database schema
 * Does NOT mutate the input dataSource - returns result object
 */
export async function introspectDuckDBSchema(
	dataSource: DataSource,
): Promise<DuckDBIntrospectionResult> {
	let isAttached = dataSource.isAttached ?? false;
	let attachedAs = dataSource.attachedAs;

	// Attach if needed
	if (!isAttached && dataSource.filePath) {
		const dbAlias = generateDatabaseAlias(dataSource.filePath);

		try {
			await queryService.executeQuery(
				buildAttachSQL(dataSource.filePath, dbAlias, false),
			);
			isAttached = true;
			attachedAs = dbAlias;
		} catch (error) {
			const errorStr = String(error);
			if (
				errorStr.includes("already attached") ||
				errorStr.includes("Unique file handle conflict")
			) {
				logger.warn(
					"Database already attached, continuing with introspection:",
					dataSource.filePath,
				);
				isAttached = true;
				attachedAs = dbAlias;
			} else {
				logger.error("Failed to attach DuckDB database:", error);
				throw error;
			}
		}
	}

	// Query schemas
	const schemasQuery = attachedAs
		? `SELECT schema_name
       FROM information_schema.schemata
       WHERE catalog_name = ${escapeStringLiteral(attachedAs)}
         AND schema_name NOT IN ('information_schema', 'pg_catalog', 'temp')
       ORDER BY schema_name`
		: `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'temp')
       ORDER BY schema_name`;

	const schemasResult = await queryService.executeQuery(schemasQuery);
	const schemas: Schema[] = [];

	for (const row of schemasResult.rows) {
		const schemaName = String(row.schema_name);
		const tables = await introspectTables(schemaName, attachedAs);
		schemas.push({ name: schemaName, tables });
	}

	return { schemas, isAttached, attachedAs };
}

/**
 * Introspect tables within a schema
 */
async function introspectTables(
	schemaName: string,
	attachedAs?: string,
): Promise<Table[]> {
	const escapedSchema = escapeStringLiteral(schemaName);
	const tablesQuery = attachedAs
		? `SELECT
         table_schema,
         table_name,
         table_type
       FROM information_schema.tables
       WHERE table_catalog = ${escapeStringLiteral(attachedAs)}
         AND table_schema = ${escapedSchema}
       ORDER BY table_name`
		: `SELECT
         table_schema,
         table_name,
         table_type
       FROM information_schema.tables
       WHERE table_schema = ${escapedSchema}
       ORDER BY table_name`;

	const tablesResult = await queryService.executeQuery(tablesQuery);
	const tables: Table[] = [];

	for (const tableRow of tablesResult.rows) {
		const tableName = String(tableRow.table_name);
		const columns = await introspectColumns(schemaName, tableName, attachedAs);
		const rowCount = await getTableRowCount(schemaName, tableName, attachedAs);

		tables.push({
			name: tableName,
			schema: schemaName,
			columns,
			rowCount,
			type: tableRow.table_type === "VIEW" ? "view" : "table",
		});
	}

	return tables;
}

/**
 * Introspect columns for a table
 */
async function introspectColumns(
	schemaName: string,
	tableName: string,
	attachedAs?: string,
): Promise<Column[]> {
	const escapedSchema = escapeStringLiteral(schemaName);
	const escapedTableName = escapeStringLiteral(tableName);

	const columnsQuery = attachedAs
		? `SELECT
         column_name,
         data_type,
         is_nullable
       FROM information_schema.columns
       WHERE table_catalog = ${escapeStringLiteral(attachedAs)}
         AND table_schema = ${escapedSchema}
         AND table_name = ${escapedTableName}
       ORDER BY ordinal_position`
		: `SELECT
         column_name,
         data_type,
         is_nullable
       FROM information_schema.columns
       WHERE table_schema = ${escapedSchema}
         AND table_name = ${escapedTableName}
       ORDER BY ordinal_position`;

	const columnsResult = await queryService.executeQuery(columnsQuery);
	const columns: Column[] = [];

	for (const colRow of columnsResult.rows) {
		columns.push({
			name: String(colRow.column_name),
			type: String(colRow.data_type),
			nullable: colRow.is_nullable === "YES",
		});
	}

	return columns;
}

/**
 * Get row count for a table
 */
async function getTableRowCount(
	schemaName: string,
	tableName: string,
	attachedAs?: string,
): Promise<number> {
	try {
		const fullTableName = attachedAs
			? `${attachedAs}."${schemaName}"."${tableName}"`
			: `"${schemaName}"."${tableName}"`;

		const countResult = await queryService.executeQuery(
			`SELECT COUNT(*) as cnt FROM ${fullTableName}`,
		);

		if (countResult.rows.length > 0) {
			return Number(countResult.rows[0].cnt);
		}
	} catch (error) {
		logger.warn(`Failed to get row count for ${schemaName}.${tableName}:`, error);
	}

	return 0;
}
