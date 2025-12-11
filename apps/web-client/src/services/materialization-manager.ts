/**
 * Materialization Manager
 *
 * Manages the lifecycle of materialized tables including:
 * - Session restoration on app startup
 * - OPFS to DuckDB integration
 * - Table refresh
 * - Storage management
 */

import type { DuckDBConnector } from "@ide/connectors";
import { opfsPersistence } from "../../../../packages/duckdb-wasm-adapter/src/opfs-persistence";
import type {
	MaterializedTable,
	StorageQuota,
	StorageSummary,
} from "../types/materialization";
import type { TableRow } from "../types/table";
import { createLogger } from "../utils/logger";
import { persistenceMetadataStore } from "./persistence-metadata-store";
import { queryService } from "./streaming-query-service";

const logger = createLogger("MaterializationManager");

export class MaterializationManager {
	private duckdb: DuckDBConnector | null = null;
	private isInitialized = false;

	/**
	 * Initialize the materialization manager
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		logger.debug("Initializing...");

		try {
			// Initialize OPFS
			const opfsSupported = await opfsPersistence.initialize();
			if (!opfsSupported) {
				logger.warn("OPFS not supported, materialization disabled");
				return;
			}

			// Initialize metadata store
			await persistenceMetadataStore.initialize();

			// Get DuckDB connector
			this.duckdb = queryService.getActiveConnector() as DuckDBConnector;

			// Restore session
			await this.restoreSession();

			this.isInitialized = true;
			logger.info("Initialized successfully");
		} catch (error) {
			logger.error("Initialization failed:", error);
			throw error;
		}
	}

	/**
	 * Restore materialized tables from previous session
	 */
	async restoreSession(): Promise<void> {
		logger.debug("Restoring session...");

		try {
			const tables = await persistenceMetadataStore.getAllTables();
			logger.debug(`Found ${tables.length} tables to restore`);

			let restoredCount = 0;
			let unavailableCount = 0;

			for (const table of tables) {
				if (table.status === "available" || table.status === "importing") {
					try {
						// Check if OPFS file exists
						const exists = await opfsPersistence.fileExists(table.storagePath);

						if (exists) {
							// Only register completed tables
							if (table.status === "available") {
								await this.registerTableWithDuckDB(table);
								restoredCount++;
							}
						} else {
							// Mark as unavailable
							await persistenceMetadataStore.updateTableStatus(
								table.id,
								"unavailable",
							);
							unavailableCount++;
							logger.warn(`Table ${table.localName} file not found`);
						}
					} catch (error) {
						logger.error(`Failed to restore table ${table.localName}:`, error);
						await persistenceMetadataStore.updateTableStatus(
							table.id,
							"unavailable",
						);
						unavailableCount++;
					}
				}
			}

			logger.info(
				`Session restored: ${restoredCount} tables available, ${unavailableCount} unavailable`,
			);

			// Show toast notification to user
			if (restoredCount > 0 || unavailableCount > 0) {
				this.showRestorationSummary(restoredCount, unavailableCount);
			}
		} catch (error) {
			logger.error("Session restoration failed:", error);
		}
	}

	/**
	 * Register a materialized table with DuckDB
	 */
	async registerTableWithDuckDB(table: MaterializedTable): Promise<void> {
		if (!this.duckdb) {
			throw new Error("DuckDB not initialized");
		}

		try {
			// Parse schema and table name
			const [schema, tableName] = table.localName.split(".");

			// Create schema if not exists
			await this.duckdb.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

			// Read parquet file from OPFS
			const fileData = await opfsPersistence.readFile(table.storagePath);

			// Register file with DuckDB
			const tempFileName = `${schema}_${tableName}.parquet`;
			await queryService.registerFile(tempFileName, fileData);

			// Create view pointing to the parquet file
			await this.duckdb.query(`
        CREATE OR REPLACE VIEW ${table.localName} AS
        SELECT * FROM read_parquet('${tempFileName}')
      `);

			// Update last accessed timestamp
			const updatedTable = await persistenceMetadataStore.getTable(table.id);
			if (updatedTable) {
				updatedTable.lastAccessedAt = new Date();
				await persistenceMetadataStore.saveTable(updatedTable);
			}

			logger.debug(`Registered table: ${table.localName}`);
		} catch (error) {
			logger.error(`Failed to register table ${table.localName}:`, error);
			throw error;
		}
	}

	/**
	 * Refresh a materialized table from its source
	 */
	async refreshTable(tableId: string): Promise<void> {
		const table = await persistenceMetadataStore.getTable(tableId);
		if (!table) {
			throw new Error(`Table not found: ${tableId}`);
		}

		logger.debug(`Refreshing table: ${table.localName}`);

		try {
			// Update status
			await persistenceMetadataStore.updateTableStatus(tableId, "importing");

			// Determine source engine
			let sourceEngine: "bigquery" | "duckdb" = "bigquery";
			if (table.connectionId.startsWith("sf_")) {
				sourceEngine = "bigquery"; // Will be snowflake in future
			} else if (table.connectionId.startsWith("db_")) {
				sourceEngine = "bigquery"; // Will be databricks in future
			}

			// Execute source query
			queryService.setActiveConnector(sourceEngine);
			const result = await queryService.executeQuery(table.sourceQuery);

			// Estimate cost (for BigQuery)
			let costUSD = 0;
			if (sourceEngine === "bigquery") {
				try {
					const estimate = await queryService.estimateBigQueryCost(
						table.sourceQuery,
					);
					costUSD = estimate.estimatedCostUSD ?? 0;
				} catch (e) {
					logger.warn("Failed to estimate cost:", e);
				}
			}

			// Convert to Parquet
			const parquetData = await this.convertToParquet(
				result.rows,
				result.columns,
			);

			// Write to OPFS
			await opfsPersistence.writeFile(table.storagePath, parquetData, {
				overwrite: true,
			});

			// Update metadata
			await persistenceMetadataStore.recordRefresh(
				tableId,
				result.totalRows,
				parquetData.byteLength,
				costUSD,
			);

			// Re-register with DuckDB
			await this.registerTableWithDuckDB(table);

			// Update status
			await persistenceMetadataStore.updateTableStatus(tableId, "available");

			logger.info(`Table refreshed: ${table.localName}`);
		} catch (error) {
			logger.error(`Refresh failed for ${table.localName}:`, error);
			await persistenceMetadataStore.updateTableStatus(tableId, "available");
			throw error;
		}
	}

	/**
	 * Delete a materialized table
	 */
	async deleteTable(tableId: string): Promise<void> {
		const table = await persistenceMetadataStore.getTable(tableId);
		if (!table) {
			throw new Error(`Table not found: ${tableId}`);
		}

		logger.debug(`Deleting table: ${table.localName}`);

		try {
			// Drop from DuckDB
			if (this.duckdb) {
				try {
					await this.duckdb.query(`DROP VIEW IF EXISTS ${table.localName}`);
				} catch (e) {
					logger.warn("Failed to drop view:", e);
				}
			}

			// Delete OPFS file
			try {
				const exists = await opfsPersistence.fileExists(table.storagePath);
				if (exists) {
					await opfsPersistence.deleteFile(table.storagePath);
				}
			} catch (e) {
				logger.warn("Failed to delete OPFS file:", e);
			}

			// Delete metadata
			await persistenceMetadataStore.deleteTable(tableId);

			logger.info(`Table deleted: ${table.localName}`);
		} catch (error) {
			logger.error(`Failed to delete table ${table.localName}:`, error);
			throw error;
		}
	}

	/**
	 * Get storage quota information
	 */
	async getStorageQuota(): Promise<StorageQuota> {
		const quota = await opfsPersistence.getQuota();
		return {
			totalBytes: quota.totalBytes,
			usedBytes: quota.usedBytes,
			availableBytes: quota.availableBytes,
			percentUsed: quota.percentUsed,
			isPersisted: quota.isPersisted,
		};
	}

	/**
	 * Get storage summary
	 */
	async getStorageSummary(): Promise<StorageSummary> {
		const quota = await this.getStorageQuota();
		const summary = await persistenceMetadataStore.getStorageSummary();

		return {
			quota,
			...summary,
		};
	}

	/**
	 * Request persistent storage
	 */
	async requestPersistence(): Promise<boolean> {
		return await opfsPersistence.requestPersistence();
	}

	/**
	 * Convert query results to Parquet format
	 */
	private async convertToParquet(
		rows: TableRow[],
		columns: string[],
	): Promise<ArrayBuffer> {
		// TODO: Use proper Parquet library (parquetjs or arrow)
		// For now, serialize as JSON (temporary implementation)
		const data = {
			schema: columns,
			rows: rows,
		};

		const json = JSON.stringify(data);
		return new TextEncoder().encode(json).buffer;
	}

	/**
	 * Show restoration summary toast
	 */
	private showRestorationSummary(restored: number, unavailable: number): void {
		// This would be replaced with a proper toast notification
		const message = [];
		if (restored > 0) {
			message.push(
				`Restored ${restored} materialized table${restored > 1 ? "s" : ""}`,
			);
		}
		if (unavailable > 0) {
			message.push(
				`${unavailable} table${unavailable > 1 ? "s" : ""} unavailable (files missing)`,
			);
		}

		logger.info(message.join(", "));
	}

	/**
	 * Check if manager is initialized
	 */
	get initialized(): boolean {
		return this.isInitialized;
	}
}

export const materializationManager = new MaterializationManager();
