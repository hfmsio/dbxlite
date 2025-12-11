/**
 * useLocalDatabase - Manages the local in-memory database schema
 * This is the main DuckDB database for the current session
 */

import { useCallback, useEffect, useState } from "react";
import type { Column, Schema, Table } from "../types/data-source";
import { queryService } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";
import { escapeIdentifier, escapeStringLiteral } from "../utils/sqlSanitizer";

const logger = createLogger("useLocalDatabase");

export interface LocalDatabaseState {
	schemas: Schema[];
	isLoading: boolean;
	error: string | null;
	lastRefreshed: Date | null;
}

export function useLocalDatabase() {
	const [state, setState] = useState<LocalDatabaseState>({
		schemas: [],
		isLoading: false,
		error: null,
		lastRefreshed: null,
	});

	/**
	 * Introspect the main in-memory database schema
	 * Uses information_schema to find tables in the 'memory' catalog
	 */
	const refreshSchema = useCallback(async () => {
		// Check if DuckDB connector is ready before attempting to query
		if (!queryService.isConnectorReady("duckdb")) {
			logger.debug("DuckDB connector not ready yet, skipping schema refresh");
			return;
		}

		setState((prev) => ({ ...prev, isLoading: true, error: null }));

		try {
			// Get tables from in-memory database AND temp tables only
			// Filter by database_name = 'memory' to exclude attached databases
			const tablesQuery = `
				SELECT DISTINCT
					schema_name AS table_schema,
					table_name,
					CASE WHEN temporary THEN 'TEMP TABLE' ELSE 'BASE TABLE' END AS table_type
				FROM duckdb_tables()
				WHERE (database_name = 'memory' OR temporary = true)
				  AND schema_name NOT IN ('information_schema', 'pg_catalog')
				ORDER BY schema_name, table_name
			`;
			const allTablesResult = await queryService.executeQuery(tablesQuery);

			logger.debug("Found tables via duckdb_tables():", allTablesResult.rows);

			// Group tables by schema
			const schemaMap = new Map<string, Array<{ table_name: string; table_type: string }>>();
			for (const row of allTablesResult.rows) {
				const schemaName = String(row.table_schema);
				const tableInfo = {
					table_name: String(row.table_name),
					table_type: String(row.table_type),
				};
				if (!schemaMap.has(schemaName)) {
					schemaMap.set(schemaName, []);
				}
				schemaMap.get(schemaName)!.push(tableInfo);
			}

			const schemas: Schema[] = [];

			for (const [schemaName, tableInfos] of schemaMap.entries()) {
				const tables: Table[] = [];

				for (const tableInfo of tableInfos) {
					const tableName = tableInfo.table_name;

					// Get columns for this table
					const escapedSchema = escapeStringLiteral(schemaName);
					const escapedTable = escapeStringLiteral(tableName);
					const columnsQuery = `
						SELECT column_name, data_type, is_nullable
						FROM information_schema.columns
						WHERE (table_catalog = 'memory' OR table_catalog = 'temp')
						  AND table_schema = ${escapedSchema}
						  AND table_name = ${escapedTable}
						ORDER BY ordinal_position
					`;
					const columnsResult = await queryService.executeQuery(columnsQuery);

					const columns: Column[] = columnsResult.rows.map((col) => ({
						name: String(col.column_name),
						type: String(col.data_type),
						nullable: col.is_nullable === "YES",
					}));

					// Get row count and estimated size
					let rowCount = 0;
					let estimatedSize: number | undefined;
					const schemaIdent = escapeIdentifier(schemaName);
					const tableIdent = escapeIdentifier(tableName);
					try {
						const countResult = await queryService.executeQuery(
							`SELECT COUNT(*) as cnt FROM ${schemaIdent}.${tableIdent}`,
						);
						if (countResult.rows.length > 0) {
							rowCount = Number(countResult.rows[0].cnt);
						}
					} catch (err) {
						logger.warn(`Failed to get row count for ${tableName}:`, err);
					}

					// Get estimated size from duckdb_tables()
					try {
						const sizeResult = await queryService.executeQuery(
							`SELECT estimated_size FROM duckdb_tables()
							 WHERE schema_name = ${escapedSchema} AND table_name = ${escapedTable}`,
						);
						if (sizeResult.rows.length > 0 && sizeResult.rows[0].estimated_size != null) {
							estimatedSize = Number(sizeResult.rows[0].estimated_size);
						}
					} catch (err) {
						// Size estimation may not be available for all tables (views, etc)
						logger.debug(`Could not get size for ${tableName}:`, err);
					}

					tables.push({
						name: tableName,
						schema: schemaName,
						columns,
						rowCount,
						size: estimatedSize,
						type: tableInfo.table_type === "VIEW" ? "view" : "table",
						isTemporary: tableInfo.table_type === "TEMP TABLE",
					});
				}

				schemas.push({
					name: schemaName,
					tables,
				});
			}

			setState({
				schemas,
				isLoading: false,
				error: null,
				lastRefreshed: new Date(),
			});

			const totalTables = schemas.reduce((sum, s) => sum + s.tables.length, 0);
			logger.info(`Local database: found ${totalTables} tables in ${schemas.length} schemas`);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to introspect local database:", err);
			setState((prev) => ({
				...prev,
				isLoading: false,
				error: errorMsg,
			}));
		}
	}, []);

	// Auto-refresh on mount with retry logic for DuckDB readiness
	useEffect(() => {
		let cancelled = false;
		let retryCount = 0;
		const maxRetries = 10;
		const retryDelay = 500; // 500ms between retries

		const attemptRefresh = async () => {
			if (cancelled) return;

			// Check if DuckDB connector is ready
			if (!queryService.isConnectorReady("duckdb")) {
				retryCount++;
				if (retryCount < maxRetries) {
					logger.debug(`DuckDB not ready, retry ${retryCount}/${maxRetries} in ${retryDelay}ms`);
					setTimeout(attemptRefresh, retryDelay);
				} else {
					logger.warn("DuckDB connector not ready after max retries, giving up initial refresh");
				}
				return;
			}

			// DuckDB is ready, refresh the schema
			await refreshSchema();
		};

		// Start the first attempt after a short delay to let the app initialize
		const timer = setTimeout(attemptRefresh, 300);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [refreshSchema]);

	return {
		...state,
		refreshSchema,
		hasContent: state.schemas.some((s) => s.tables.length > 0),
	};
}
