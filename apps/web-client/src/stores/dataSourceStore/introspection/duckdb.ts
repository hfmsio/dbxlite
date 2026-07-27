/**
 * DuckDB Database Introspection
 * Pure functions for introspecting DuckDB database schemas
 */

import type { Column, DataSource, Schema, Table } from "../../../types/data-source";
import type { DuckDBIntrospectionResult } from "../types";
import { queryService } from "../../../services/streaming-query-service";
import { generateDatabaseAlias } from "../../../utils/duckdbOperations";
import {
	buildAttachSQL,
	escapeStringLiteral,
} from "../../../utils/sqlSanitizer";
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
			await queryService.executeQueryOnConnector("duckdb", 
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

	const schemasResult = await queryService.executeQueryOnConnector("duckdb", schemasQuery);
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
	// Shared catalog predicate for the information_schema queries.
	const catalogFilter = attachedAs
		? `table_catalog = ${escapeStringLiteral(attachedAs)} AND `
		: "";

	// Three fixed queries per schema, regardless of how many tables it holds.
	// The previous implementation ran one column query AND one SELECT COUNT(*)
	// per table, so a large attached database issued thousands of statements
	// (many of them full scans) before the editor became usable. Batching keeps
	// attach time flat as the catalog grows.

	// 1. Table list + type (includes views).
	const tablesResult = await queryService.executeQueryOnConnector(
		"duckdb",
		`SELECT table_name, table_type
       FROM information_schema.tables
       WHERE ${catalogFilter}table_schema = ${escapedSchema}
       ORDER BY table_name`,
	);

	// 2. Every column in the schema in one query, grouped by table.
	const columnsResult = await queryService.executeQueryOnConnector(
		"duckdb",
		`SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE ${catalogFilter}table_schema = ${escapedSchema}
       ORDER BY table_name, ordinal_position`,
	);
	const columnsByTable = new Map<string, Column[]>();
	for (const row of columnsResult.rows) {
		const tableName = String(row.table_name);
		let list = columnsByTable.get(tableName);
		if (!list) {
			list = [];
			columnsByTable.set(tableName, list);
		}
		list.push({
			name: String(row.column_name),
			type: String(row.data_type),
			nullable: row.is_nullable === "YES",
		});
	}

	// 3. Estimated row counts in one query via duckdb_tables().estimated_size,
	//    replacing the per-table SELECT COUNT(*). Estimates are what mainstream
	//    tools display for large catalogs; the exact count runs when the user
	//    actually queries the table. Best-effort: if the pragma is unavailable
	//    we simply omit counts. duckdb_tables() covers base tables only, so
	//    views keep an undefined count (the explorer renders that cleanly).
	const rowCountByTable = new Map<string, number>();
	try {
		const dbFilter = attachedAs
			? `database_name = ${escapeStringLiteral(attachedAs)} AND `
			: "";
		const estResult = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT table_name, estimated_size
         FROM duckdb_tables()
         WHERE ${dbFilter}schema_name = ${escapedSchema}`,
		);
		for (const row of estResult.rows) {
			if (row.estimated_size != null) {
				rowCountByTable.set(
					String(row.table_name),
					Number(row.estimated_size),
				);
			}
		}
	} catch (error) {
		logger.warn("Failed to load estimated row counts:", error);
	}

	return tablesResult.rows.map((row) => {
		const tableName = String(row.table_name);
		return {
			name: tableName,
			schema: schemaName,
			columns: columnsByTable.get(tableName) ?? [],
			rowCount: rowCountByTable.get(tableName),
			type: row.table_type === "VIEW" ? "view" : "table",
		} as Table;
	});
}
