import {
	type BaseConnector,
	type CatalogInfo,
	type ConnectionTestResult,
	DuckDBConnector,
	DuckDBHttpConnector,
	type QueryCostEstimate,
	type SchemaInfo,
	SnowflakeConnector,
	type TableMetadata,
	type DbxliteMode,
} from "@ide/connectors";
import type { EncryptedCredentialStore } from "@ide/storage";
import type { ConnectorType } from "../types/data-source";
import { createLogger } from "../utils/logger";
import {
	type AbortRegistry,
	InMemoryAbortRegistry,
} from "./query/abort-registry";
import {
	ConnectorRegistry,
	type ConnectorEventHandler,
} from "./query/connector-registry";
import { DuckDBFileVfs, type FileVfs } from "./query/file-vfs";
import { PaginationPlanner } from "./query/pagination-planner";
import type { ExecuteOnConnector } from "./query/ports";
import {
	requireCatalog,
	supportsCacheClear,
	supportsProjectDefaults,
} from "./query/catalog-capable";
import { QueryExecutor } from "./query/query-executor";
import { RowCountEstimator } from "./query/row-count-estimator";

const logger = createLogger("QueryService");

// Re-export ConnectorType for backward compatibility
export type { ConnectorType };

// Snowflake setup config (subset of SnowflakeConnectorConfig that the UI
// provides; transport + credentialStore are wired here, not by callers).
//
// Two auth shapes:
//   - OAuth (default): supply account + clientId (+ optional clientSecret).
//     Connector runs the popup OAuth flow.
//   - PAT: supply account + auth.token. No popup, no admin setup. Token is
//     sent as `Authorization: Bearer <pat>` to the SQL API.
export interface SnowflakeSetupOptions {
	account: string;
	/** OAuth client ID. Required when auth.mode is "oauth" (or omitted). */
	clientId?: string;
	/**
	 * OAuth client secret. Optional — omit (or pass undefined) for
	 * `OAUTH_CLIENT_TYPE = 'PUBLIC'` (PKCE-only). Recommended for browser
	 * deployments since secrets are recoverable by any same-origin script.
	 */
	clientSecret?: string;
	/**
	 * Auth discriminator. Defaults to OAuth for backward compat with
	 * existing call sites that pass clientId at the top level.
	 */
	auth?:
		| { mode: "oauth" }
		| { mode: "pat"; token: string };
	warehouse: string;
	role?: string;
	database?: string;
	schema?: string;
}

// Result shapes now live with the query collaborators; re-exported here so
// every existing `from "./streaming-query-service"` import keeps working.
export type {
	ColumnMetadata,
	DataChunk,
	QueryMetadata,
	QueryResult,
	QueryStats,
	StreamingQueryOptions,
	StreamingQueryResult,
} from "./query/result-types";
import type {
	DataChunk,
	QueryResult,
	StreamingQueryOptions,
} from "./query/result-types";

/**
 * Streaming query service with memory-efficient pagination
 */
class StreamingQueryService {
	private readonly registry = new ConnectorRegistry();
	private readonly abortRegistry: AbortRegistry = new InMemoryAbortRegistry();
	private readonly fileVfs: FileVfs = new DuckDBFileVfs(
		() => this.registry.get("duckdb"),
	);
	/**
	 * The connector-execution seam handed to the query collaborators, so they
	 * can run SQL without a reference back to this object. Bound as an arrow
	 * property because it is passed around as a bare function.
	 */
	private readonly executeOnConnector: ExecuteOnConnector<QueryResult> = (
		connectorType,
		sql,
		signal,
		silent,
	) => this.executeQueryOnConnector(connectorType, sql, signal, silent);
	private readonly paginationPlanner = new PaginationPlanner(
		this.executeOnConnector,
		this.registry.mode,
	);
	// Reads the planner's materialization seam for its exact-count fast path,
	// so it is declared after it.
	private readonly rowCountEstimator = new RowCountEstimator(
		(sql) => this.paginationPlanner.exactRowCountFor(sql),
		() => this.getActiveConnector(),
	);
	// Declared last: it receives the collaborators above as a bundle.
	private readonly executor = new QueryExecutor({
		abortRegistry: this.abortRegistry,
		paginationPlanner: this.paginationPlanner,
		rowCountEstimator: this.rowCountEstimator,
		getActiveConnector: () => this.getActiveConnector(),
		getActiveConnectorType: () => this.registry.getActiveType(),
		getConnector: (type) => this.registry.get(type),
	});

	async initialize(credentialStore: EncryptedCredentialStore) {
		// The registry owns the credential store now: the lifecycle
		// collaborators that need it hang off it.
		this.registry.setCredentialStore(credentialStore);

		// Detect operating mode (WASM vs HTTP for duckdb -ui)
		const mode = this.registry.mode.detect();
		logger.info(`Initializing in ${mode} mode`);

		// Initialize DuckDB connector based on mode
		if (this.registry.mode.isHttp()) {
			// HTTP mode: Connect to DuckDB CLI's embedded HTTP server
			const duckdb = new DuckDBHttpConnector();
			await duckdb.connect({ options: {} });
			this.registry.set("duckdb", duckdb);
			logger.info("Connected to DuckDB HTTP server");
		} else {
			// WASM mode: Use in-browser DuckDB
			const duckdb = new DuckDBConnector();
			await duckdb.connect({ options: {} });
			this.registry.set("duckdb", duckdb);
		}
	}

	/**
	 * Get the current operating mode
	 */
	getMode(): DbxliteMode {
		return this.registry.mode.get();
	}

	/**
	 * Check if running in HTTP mode (duckdb -ui)
	 */
	isHttpMode(): boolean {
		return this.registry.mode.isHttp();
	}

	/**
	 * Subscribe to schema/catalog change events (HTTP mode only).
	 * Fires when ATTACH, DETACH, CREATE TABLE, DROP TABLE, etc. occur.
	 *
	 * @param listener - Callback to invoke on schema change
	 * @returns Unsubscribe function
	 */
	onSchemaChange(listener: () => void): () => void {
		if (!this.registry.mode.isHttp()) {
			// WASM mode doesn't have server-sent events
			return () => {};
		}

		const connector = this.registry.get("duckdb");
		if (connector && "onSchemaChange" in connector) {
			return (connector as DuckDBHttpConnector).onSchemaChange(listener);
		}

		return () => {};
	}

	/**
	 * Subscribe to connector state changes — connect, disconnect, session
	 * context. Keyed by connector slot, so a subscription survives the
	 * reconnects that replace connector instances.
	 *
	 * Same shape as `onSchemaChange`: returns its own unsubscribe. No emit
	 * points are wired yet (WS-B B2/B3 add those), so today this only
	 * delivers what the registry itself announces.
	 *
	 * @returns Unsubscribe function
	 */
	onConnectorState(handler: ConnectorEventHandler): () => void {
		return this.registry.onConnectorState(handler);
	}

	/**
	 * Execute a streaming query with pagination support
	 */
	async *executeStreamingQuery(
		sql: string,
		options: StreamingQueryOptions = {},
	): AsyncGenerator<DataChunk> {
		yield* this.executor.executeStreamingQuery(sql, options);
	}

	/**
	 * Get a specific page of results using server-side pagination
	 * @param offset - Row offset (0-based), NOT page number
	 */
	async getPage(
		sql: string,
		offset: number,
		pageSize: number,
		signal?: AbortSignal,
	): Promise<DataChunk> {
		return this.executor.getPage(sql, offset, pageSize, signal);
	}

	/**
	 * Estimate memory requirements for a query
	 * Returns estimated bytes needed to load all results
	 */
	async estimateMemoryUsage(sql: string): Promise<{
		estimatedRows: number;
		estimatedBytes: number;
		estimatedMB: number;
		isLarge: boolean;
		recommendation: string;
	}> {
		return this.executor.estimateMemoryUsage(sql);
	}

	/**
	 * Get estimated row count for a query without loading all data
	 * - BigQuery: Runs query with LIMIT 0 to get totalRows from metadata (free, exact!)
	 * - DuckDB: Uses EXPLAIN for fast estimation (subsecond vs 30s+ COUNT, estimated)
	 * Results are cached for 5 minutes to avoid repeated queries
	 * @returns Object with count and isEstimated flag
	 */
	async getRowCount(
		sql: string,
		signal?: AbortSignal,
		_timeoutMs: number = 30000,
	): Promise<{ count: number; isEstimated: boolean }> {
		return this.rowCountEstimator.getRowCount(sql, signal);
	}

	/**
	 * Cancel an active query
	 */
	async cancelQuery(queryId: string) {
		this.abortRegistry.cancel(queryId);
	}

	/**
	 * Cancel all active queries
	 */
	async cancelAllQueries() {
		this.abortRegistry.cancelAll();
	}

	// Utility methods

	/**
	 * Set the active connector. This is the user's "current selection" — the
	 * connector the editor's Run button targets, the catalog explorer
	 * displays, etc. It is NOT a request-scoped scope.
	 *
	 * **Do NOT** use this in a try/finally swap-and-restore pattern. Errors,
	 * hot-reloads, navigations, and concurrent operations all orphan the
	 * restore and leave the global pointing at the wrong connector. Two
	 * production regressions in v0.4 came from exactly this anti-pattern.
	 *
	 * If you need to run an operation against a specific connector
	 * regardless of the active selection, use:
	 *   - `queryService.executeQueryOnConnector(type, sql, signal)`
	 *   - `queryService.getConnector(type)` (then call methods on it)
	 *   - the strategy registry under `components/table/exporters/` for
	 *     export work
	 */
	setActiveConnector(type: ConnectorType) {
		this.registry.setActive(type);
	}

	getActiveConnector(): BaseConnector {
		return this.registry.getActive();
	}

	getActiveConnectorType(): ConnectorType {
		return this.registry.getActiveType();
	}

	isConnectorReady(type: ConnectorType): boolean {
		return this.registry.has(type);
	}

	async registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void> {
		return this.fileVfs.registerFile(fileName, fileBuffer);
	}

	async registerFileHandle(fileName: string, file: File): Promise<void> {
		return this.fileVfs.registerFileHandle(fileName, file);
	}

	async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
		return this.fileVfs.copyFileToBuffer(fileName);
	}

	/**
	 * Drop a file from DuckDB's virtual filesystem
	 */
	async dropFile(fileName: string): Promise<void> {
		return this.fileVfs.dropFile(fileName);
	}

	/**
	 * Get a specific connector by type
	 */
	getConnector(type: ConnectorType): BaseConnector | null {
		return this.registry.get(type);
	}

	/**
	 * Convert BigInt values to numbers (safe for JSON serialization)
	 * Also handles Apache Arrow row objects
	 */
	/**
	 * Execute a SQL query on a specific connector (non-streaming, all rows in memory)
	 * @param silent - If true, don't log errors (useful for expected failures like DETACH)
	 */
	async executeQueryOnConnector(
		connectorType: ConnectorType,
		sql: string,
		signal?: AbortSignal,
		silent?: boolean,
	): Promise<QueryResult> {
		return this.executor.executeQueryOnConnector(
			connectorType,
			sql,
			signal,
			silent,
		);
	}

	/**
	 * Execute a SQL query and return results (non-streaming, uses active connector)
	 */
	async executeQuery(sql: string, signal?: AbortSignal): Promise<QueryResult> {
		return this.executor.executeQuery(sql, signal);
	}

	/**
	 * Get schema information from the active connector
	 */
	async getSchema() {
		const connector = this.getActiveConnector();
		return await connector.getSchema();
	}

	// ============================================
	// BigQuery-specific methods
	// ============================================

	/**
	 * Set up BigQuery connector with OAuth
	 */
	async setupBigQuery(
		clientId: string,
		clientSecret: string,
		signal?: AbortSignal,
	) {
		return this.registry.bigquery.setup(clientId, clientSecret, signal);
	}

	/** Connect BigQuery with a pre-minted access token instead of OAuth. */
	async setupBigQueryWithAccessToken(accessToken: string) {
		return this.registry.bigquery.setupWithAccessToken(accessToken);
	}

	/**
	 * Restore BigQuery connection from stored credentials
	 */
	async restoreBigQueryConnection(): Promise<boolean> {
		return this.registry.bigquery.restore();
	}

	/**
	 * Check if BigQuery connector is available and connected
	 */
	isBigQueryConnected(): boolean {
		return this.registry.bigquery.isConnected();
	}

	/**
	 * Disconnect from BigQuery and revoke credentials
	 */
	async disconnectBigQuery(): Promise<void> {
		return this.registry.bigquery.disconnect();
	}

	/**
	 * Clear BigQuery metadata cache (projects, datasets, tables)
	 */
	clearBigQueryCache(): void {
		const connector = this.registry.get("bigquery");
		if (!connector) return;

		if (supportsCacheClear(connector)) {
			connector.clearCache();
		}
	}

	/**
	 * Attempt to reconnect to BigQuery using stored credentials
	 */
	async reconnectBigQuery(): Promise<boolean> {
		return this.registry.bigquery.reconnect();
	}

	/**
	 * List BigQuery projects
	 */
	async getBigQueryProjects(): Promise<CatalogInfo[]> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		return requireCatalog(
			connector,
			"listProjects",
			"BigQuery connector not initialized",
			"Project listing not supported",
		).listProjects();
	}

	/**
	 * List BigQuery datasets in a project
	 */
	async getBigQueryDatasets(projectId: string): Promise<SchemaInfo[]> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		return requireCatalog(
			connector,
			"listDatasets",
			"BigQuery connector not initialized",
			"Dataset listing not supported",
		).listDatasets(projectId);
	}

	/**
	 * List BigQuery tables in a dataset
	 */
	async getBigQueryTables(
		projectId: string,
		datasetId: string,
	): Promise<TableMetadata[]> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		return requireCatalog(
			connector,
			"listTables",
			"BigQuery connector not initialized",
			"Table listing not supported",
		).listTables(projectId, datasetId);
	}

	/**
	 * Get BigQuery table metadata
	 */
	async getBigQueryTableMetadata(
		projectId: string,
		datasetId: string,
		tableId: string,
	): Promise<TableMetadata> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		const result = await requireCatalog(
			connector,
			"getTableMetadata",
			"BigQuery connector not initialized",
			"Table metadata not supported",
		).getTableMetadata(projectId, datasetId, tableId);
		if (!result) throw new Error("Table metadata not available");
		return result;
	}

	/**
	 * Estimate BigQuery query cost
	 */
	async estimateBigQueryCost(
		sql: string,
		projectId?: string,
	): Promise<QueryCostEstimate> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		const result = await requireCatalog(
			connector,
			"estimateQueryCost",
			"BigQuery connector not initialized",
			"Cost estimation not supported",
		).estimateQueryCost(sql, projectId);
		if (!result) throw new Error("Cost estimate not available");
		return result;
	}

	/**
	 * Test BigQuery connection
	 */
	async testBigQueryConnection(): Promise<ConnectionTestResult> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		const result = await requireCatalog(
			connector,
			"testConnection",
			"BigQuery connector not initialized",
			"Connection testing not supported",
		).testConnection();
		if (!result) throw new Error("Connection test result not available");
		return result;
	}

	/**
	 * Get BigQuery default project
	 */
	async getBigQueryDefaultProject(): Promise<string | null> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			return null;
		}
		if (supportsProjectDefaults(connector)) {
			return connector.getDefaultProject() ?? null;
		}
		return null;
	}

	/**
	 * Set BigQuery default project
	 */
	async setBigQueryDefaultProject(projectId: string): Promise<void> {
		const connector = this.registry.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (supportsProjectDefaults(connector)) {
			connector.setDefaultProject(projectId);
			return;
		}
		throw new Error("Setting default project not supported");
	}

	/**
	 * Disconnect from a connector
	 */
	async disconnect(type: ConnectorType) {
		const connector = this.registry.get(type);
		if (connector?.revoke) {
			await connector.revoke();
		}
		this.registry.delete(type);
		// Announce through the owning lifecycle so the status is derived the
		// same way whichever path removed the connector.
		if (type === "bigquery" || type === "snowflake") {
			this.registry.emitStatus(type, "disconnected", "manual");
		}
	}

	// ============================================
	// Snowflake-specific methods (mirrors BigQuery)
	// ============================================

	/**
	 * Set up Snowflake connector with OAuth and persist config.
	 * Triggers the OAuth popup flow.
	 */
	async setupSnowflake(opts: SnowflakeSetupOptions): Promise<void> {
		return this.registry.snowflake.setup(opts);
	}

	/**
	 * Restore Snowflake connection from stored credentials.
	 * Returns true if restored successfully, false otherwise.
	 */
	async restoreSnowflakeConnection(): Promise<boolean> {
		return this.registry.snowflake.restore();
	}

	/**
	 * Update Snowflake config (warehouse/database/schema/role) without re-auth.
	 */
	async updateSnowflakeConfig(config: {
		warehouse?: string;
		database?: string;
		schema?: string;
		role?: string;
	}): Promise<void> {
		return this.registry.snowflake.updateConfig(config);
	}

	/**
	 * Check if Snowflake connector is available and connected.
	 */
	isSnowflakeConnected(): boolean {
		return this.registry.snowflake.isConnected();
	}

	/**
	 * Disconnect from Snowflake and revoke credentials.
	 */
	async disconnectSnowflake(): Promise<void> {
		return this.registry.snowflake.disconnect();
	}

	/**
	 * Test Snowflake connection.
	 */
	async testSnowflakeConnection(): Promise<ConnectionTestResult> {
		const connector = this.registry.get("snowflake");
		if (!connector) {
			throw new Error("Snowflake connector not initialized");
		}
		// Aligned with the BigQuery path (A10): Snowflake was already narrowed
		// via getSnowflakeConnector(), so this is the one site that still used
		// a string test. Same helper, same messages.
		const result = await requireCatalog(
			connector,
			"testConnection",
			"Snowflake connector not initialized",
			"Connection testing not supported",
		).testConnection();
		if (!result) throw new Error("Connection test result not available");
		return result;
	}

	/**
	 * Get Snowflake connector instance (for direct API access in catalog UI).
	 */
	getSnowflakeConnector(): SnowflakeConnector | null {
		return this.registry.snowflake.getConnector();
	}

	/**
	 * List Snowflake databases (catalogs).
	 */
	async getSnowflakeDatabases(): Promise<CatalogInfo[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listProjects();
	}

	/**
	 * List Snowflake schemas in a database.
	 */
	async getSnowflakeSchemas(databaseName: string): Promise<SchemaInfo[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listDatasets(databaseName);
	}

	/**
	 * List Snowflake tables in a schema.
	 */
	async getSnowflakeTables(
		databaseName: string,
		schemaName: string,
	): Promise<TableMetadata[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listTables(databaseName, schemaName);
	}

	/**
	 * Get Snowflake table metadata.
	 */
	async getSnowflakeTableMetadata(
		databaseName: string,
		schemaName: string,
		tableName: string,
	): Promise<TableMetadata> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.getTableMetadata(databaseName, schemaName, tableName);
	}

	/**
	 * Clear Snowflake metadata cache.
	 */
	clearSnowflakeCache(): void {
		const sf = this.getSnowflakeConnector();
		sf?.clearCache();
	}
}

// Export singleton instance
export const streamingQueryService = new StreamingQueryService();

// Also export as queryService for backward compatibility during migration
export const queryService = streamingQueryService;
