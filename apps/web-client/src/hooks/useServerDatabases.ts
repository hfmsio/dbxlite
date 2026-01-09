/**
 * useServerDatabases - Discovers attached databases on the DuckDB server
 *
 * In HTTP/Server mode, the DuckDB server may have databases attached that
 * the user added via SQL (ATTACH 'path/to/db.duckdb'). This hook queries
 * the server to discover these databases and their schemas.
 */

import { useCallback, useEffect, useState } from "react";
import type { Column, Schema, Table } from "../types/data-source";
import { queryService } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";
import { escapeStringLiteral } from "../utils/sqlSanitizer";

const logger = createLogger("useServerDatabases");

export interface ServerDatabase {
	name: string;
	path: string | null;
	readonly: boolean;
	schemas: Schema[];
}

export interface ServerDatabasesState {
	databases: ServerDatabase[];
	isLoading: boolean;
	error: string | null;
	lastRefreshed: Date | null;
}

/**
 * Hook to discover and introspect databases attached to the DuckDB server.
 * Only active in HTTP mode - returns empty state in WASM mode.
 */
export function useServerDatabases(isHttpMode: boolean) {
	const [state, setState] = useState<ServerDatabasesState>({
		databases: [],
		isLoading: false,
		error: null,
		lastRefreshed: null,
	});

	/**
	 * Refresh the list of attached databases and their schemas
	 */
	const refreshDatabases = useCallback(async () => {
		if (!isHttpMode) {
			logger.debug("Not in HTTP mode, skipping server database refresh");
			return;
		}

		if (!queryService.isConnectorReady("duckdb")) {
			logger.debug("DuckDB connector not ready, skipping server database refresh");
			return;
		}

		setState((prev) => ({ ...prev, isLoading: true, error: null }));

		try {
			// Get all attached databases (exclude system databases)
			const dbQuery = `
				SELECT database_name, path, readonly
				FROM duckdb_databases()
				WHERE database_name NOT IN ('memory', 'system', 'temp')
				ORDER BY database_name
			`;
			const dbResult = await queryService.executeQuery(dbQuery);
			logger.debug("Found attached databases:", dbResult.rows);

			const databases: ServerDatabase[] = [];

			for (const dbRow of dbResult.rows) {
				const dbName = String(dbRow.database_name);
				const dbPath = dbRow.path ? String(dbRow.path) : null;
				const readonly = Boolean(dbRow.readonly);

				// Get tables AND views for this database
				const escapedDbName = escapeStringLiteral(dbName);

				// Query tables
				const tablesQuery = `
					SELECT DISTINCT
						schema_name,
						table_name,
						CASE WHEN temporary THEN 'TEMP TABLE' ELSE 'BASE TABLE' END AS table_type
					FROM duckdb_tables()
					WHERE database_name = ${escapedDbName}
					  AND schema_name NOT IN ('information_schema', 'pg_catalog')
					ORDER BY schema_name, table_name
				`;

				// Query views
				const viewsQuery = `
					SELECT DISTINCT
						schema_name,
						view_name AS table_name,
						'VIEW' AS table_type
					FROM duckdb_views()
					WHERE database_name = ${escapedDbName}
					  AND schema_name NOT IN ('information_schema', 'pg_catalog')
					ORDER BY schema_name, view_name
				`;

				let tablesResult;
				let viewsResult;
				try {
					// Execute sequentially - DuckDB HTTP doesn't handle concurrent queries well
					tablesResult = await queryService.executeQuery(tablesQuery);
					viewsResult = await queryService.executeQuery(viewsQuery);
				} catch (err) {
					logger.warn(`Failed to get tables/views for database ${dbName}:`, err);
					// Add database with empty schemas
					databases.push({
						name: dbName,
						path: dbPath,
						readonly,
						schemas: [],
					});
					continue;
				}

				// Combine tables and views, group by schema
				const allObjects = [...tablesResult.rows, ...viewsResult.rows];
				const schemaMap = new Map<string, Array<{ table_name: string; table_type: string }>>();
				for (const row of allObjects) {
					const schemaName = String(row.schema_name);
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

					// Limit tables to introspect (for performance)
					const tablesToIntrospect = tableInfos.slice(0, 50);

					for (const tableInfo of tablesToIntrospect) {
						const tableName = tableInfo.table_name;
						const escapedSchema = escapeStringLiteral(schemaName);
						const escapedTable = escapeStringLiteral(tableName);

						// Get columns using duckdb_columns()
						let columns: Column[] = [];
						try {
							const columnsQuery = `
								SELECT column_name, data_type, is_nullable
								FROM duckdb_columns()
								WHERE database_name = ${escapedDbName}
								  AND schema_name = ${escapedSchema}
								  AND table_name = ${escapedTable}
								ORDER BY column_index
							`;
							const columnsResult = await queryService.executeQuery(columnsQuery);
							columns = columnsResult.rows.map((col) => ({
								name: String(col.column_name),
								type: String(col.data_type),
								nullable: col.is_nullable === true || col.is_nullable === "YES",
							}));
						} catch (err) {
							logger.debug(`Could not get columns for ${dbName}.${schemaName}.${tableName}:`, err);
						}

						// Get row count (optional, skip if slow)
						let rowCount = 0;
						try {
							const countResult = await queryService.executeQuery(
								`SELECT COUNT(*) as cnt FROM "${dbName}"."${schemaName}"."${tableName}"`,
							);
							if (countResult.rows.length > 0) {
								rowCount = Number(countResult.rows[0].cnt);
							}
						} catch (err) {
							// Skip row count on error
							logger.debug(`Could not get row count for ${dbName}.${schemaName}.${tableName}`);
						}

						tables.push({
							name: tableName,
							schema: schemaName,
							columns,
							rowCount,
							type: tableInfo.table_type === "VIEW" ? "view" : "table",
							isTemporary: tableInfo.table_type === "TEMP TABLE",
						});
					}

					// Add note if tables were truncated
					if (tableInfos.length > 50) {
						logger.info(`Schema ${dbName}.${schemaName} has ${tableInfos.length} tables, showing first 50`);
					}

					schemas.push({
						name: schemaName,
						tables,
					});
				}

				databases.push({
					name: dbName,
					path: dbPath,
					readonly,
					schemas,
				});
			}

			setState({
				databases,
				isLoading: false,
				error: null,
				lastRefreshed: new Date(),
			});

			const totalTables = databases.reduce(
				(sum, db) => sum + db.schemas.reduce((s, schema) => s + schema.tables.length, 0),
				0
			);
			logger.info(`Server databases: found ${databases.length} databases with ${totalTables} tables`);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to introspect server databases:", err);
			setState((prev) => ({
				...prev,
				isLoading: false,
				error: errorMsg,
			}));
		}
	}, [isHttpMode]);

	// Auto-refresh on mount when in HTTP mode
	useEffect(() => {
		if (!isHttpMode) return;

		let cancelled = false;
		let retryCount = 0;
		const maxRetries = 10;
		const retryDelay = 500;

		const attemptRefresh = async () => {
			if (cancelled) return;

			if (!queryService.isConnectorReady("duckdb")) {
				retryCount++;
				if (retryCount < maxRetries) {
					logger.debug(`DuckDB not ready, retry ${retryCount}/${maxRetries}`);
					setTimeout(attemptRefresh, retryDelay);
				}
				return;
			}

			await refreshDatabases();
		};

		const timer = setTimeout(attemptRefresh, 500);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [isHttpMode, refreshDatabases]);

	// Subscribe to catalog change events (ATTACH, DETACH, CREATE TABLE, etc.)
	useEffect(() => {
		if (!isHttpMode) return;

		const unsubscribe = queryService.onSchemaChange(() => {
			logger.info("Catalog change detected, refreshing server databases");
			refreshDatabases();
		});

		return unsubscribe;
	}, [isHttpMode, refreshDatabases]);

	return {
		...state,
		refreshDatabases,
		hasContent: state.databases.length > 0,
	};
}
