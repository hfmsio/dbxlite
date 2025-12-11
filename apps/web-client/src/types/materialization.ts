/**
 * Multi-Source Data Materialization Types
 *
 * Supports importing data from cloud sources (BigQuery, Snowflake, Databricks)
 * into local DuckDB with OPFS persistence.
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType =
	| "bigquery"
	| "snowflake"
	| "databricks"
	| "postgres";

export interface Connection {
	id: string;
	name: string;
	type: ConnectionType;
	icon: string;
	color: string;

	/**
	 * DuckDB schema name for materialized tables from this connection
	 * Examples: 'bq_prod', 'sf_analytics', 'db_warehouse'
	 */
	duckdbSchema: string;

	/**
	 * Reference to encrypted credential in CredentialStore
	 */
	credentialKey: string;

	/**
	 * Cost protection settings
	 */
	costLimits: CostLimits;

	/**
	 * Connection status
	 */
	status: "connected" | "disconnected" | "connecting" | "error";
	lastError?: string;

	/**
	 * Timestamps
	 */
	createdAt: Date;
	lastUsedAt?: Date;
}

export interface CostLimits {
	/**
	 * Show warning dialog if query cost exceeds this (USD)
	 * Default: 1.00
	 */
	warnThresholdUSD: number;

	/**
	 * Block query execution if cost exceeds this (USD)
	 * Default: 10.00
	 */
	blockThresholdUSD: number;

	/**
	 * Maximum size per import (GB)
	 * Default: 5
	 */
	maxImportSizeGB: number;

	/**
	 * Track monthly spend across all queries
	 */
	trackMonthlySpend: boolean;
}

export interface ConnectionStatus {
	state: "disconnected" | "connecting" | "connected" | "error";
	lastError?: string;
	lastTestedAt?: Date;
}

/**
 * Connection configuration varies by connection type.
 * Stored securely in CredentialStore.
 */
export interface BigQueryConnectionConfig {
	projectId: string;
	serviceAccountKey: string;
}

export interface SnowflakeConnectionConfig {
	account: string;
	username: string;
	password: string;
	warehouse: string;
	database?: string;
}

export interface DatabricksConnectionConfig {
	host: string;
	token: string;
	httpPath: string;
}

export interface PostgresConnectionConfig {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
}

export type ConnectionConfig =
	| BigQueryConnectionConfig
	| SnowflakeConnectionConfig
	| DatabricksConnectionConfig
	| PostgresConnectionConfig;

// ============================================================================
// Materialized Table Types
// ============================================================================

export interface MaterializedTable {
	/**
	 * Unique identifier
	 */
	id: string;

	/**
	 * Full table name in DuckDB
	 * Example: 'bq_prod.customers'
	 */
	localName: string;

	/**
	 * Connection this table was imported from
	 */
	connectionId: string;

	/**
	 * How the table was created
	 */
	sourceType: "table_import" | "query_result";

	/**
	 * Original SQL query used to create this table
	 * For table_import: SELECT * FROM `project.dataset.table`
	 * For query_result: User's custom query
	 */
	sourceQuery: string;

	/**
	 * For table_import: the remote table identifier
	 * Example: 'project-123.analytics.customers'
	 */
	remoteTableId?: string;

	/**
	 * OPFS file path
	 * Example: '/tables/bq_prod_customers.parquet'
	 */
	storagePath: string;

	/**
	 * Table metadata
	 */
	sizeBytes: number;
	rowCount: number;
	columnCount: number;

	/**
	 * Timestamps
	 */
	createdAt: Date;
	lastRefreshedAt?: Date;
	lastAccessedAt?: Date;

	/**
	 * Refresh configuration
	 */
	refreshStrategy: "manual" | "scheduled";
	refreshIntervalMinutes?: number;
	autoRefresh: boolean;

	/**
	 * Cost tracking
	 */
	costTracking: {
		lastRefreshCostUSD?: number;
		totalCostUSD: number;
		refreshCount: number;
	};

	/**
	 * Current status
	 */
	status: "available" | "unavailable" | "importing" | "refreshing";
}

// ============================================================================
// Import Job Types
// ============================================================================

export interface ImportJob {
	/**
	 * Unique job identifier
	 */
	id: string;

	/**
	 * Target table name in DuckDB
	 */
	tableName: string;

	/**
	 * Schema in DuckDB (e.g., 'bq_prod')
	 */
	schema: string;

	/**
	 * SQL query to execute on source
	 */
	sourceQuery: string;

	/**
	 * Source engine
	 */
	sourceEngine: ConnectionType;

	/**
	 * Connection ID
	 */
	connectionId: string;

	/**
	 * Job status
	 */
	status:
		| "queued"
		| "running"
		| "paused"
		| "completed"
		| "failed"
		| "cancelled";

	/**
	 * Progress tracking
	 */
	progress: ImportProgress;

	/**
	 * Checkpoints for crash recovery
	 */
	checkpoints: ImportCheckpoint[];

	/**
	 * Timestamps
	 */
	createdAt: Date;
	startedAt?: Date;
	pausedAt?: Date;
	completedAt?: Date;

	/**
	 * Error information
	 */
	error?: {
		message: string;
		code?: string;
		timestamp: Date;
	};
}

export interface ImportProgress {
	/**
	 * Bytes processed so far
	 */
	bytesProcessed: number;

	/**
	 * Total bytes to process (estimated)
	 */
	totalBytes: number;

	/**
	 * Rows processed
	 */
	rowsProcessed: number;

	/**
	 * Estimated total rows
	 */
	estimatedTotalRows?: number;

	/**
	 * Percentage complete (0-100)
	 */
	percentComplete: number;

	/**
	 * Current transfer speed (MB/s)
	 */
	speedMBps: number;

	/**
	 * Estimated seconds remaining
	 */
	estimatedSecondsRemaining: number;

	/**
	 * Last update timestamp
	 */
	lastUpdate: Date;
}

export interface ImportCheckpoint {
	/**
	 * Checkpoint timestamp
	 */
	timestamp: Date;

	/**
	 * Bytes processed at this checkpoint
	 */
	bytesProcessed: number;

	/**
	 * Rows processed at this checkpoint
	 */
	rowsProcessed: number;

	/**
	 * Resume token (if API supports it)
	 */
	resumeToken?: string;

	/**
	 * OPFS file offset for resume
	 */
	fileOffset?: number;
}

// ============================================================================
// Query Execution Types
// ============================================================================

export type QueryEngine = "bigquery" | "snowflake" | "databricks" | "duckdb";

export interface QueryExecution {
	/**
	 * Unique execution ID
	 */
	id: string;

	/**
	 * SQL query
	 */
	sql: string;

	/**
	 * Engine that executed the query
	 */
	engine: QueryEngine;

	/**
	 * Connection used (if cloud query)
	 */
	connectionId?: string;

	/**
	 * Execution status
	 */
	status: "pending" | "running" | "completed" | "error";

	/**
	 * Query results
	 */
	results?: {
		rows: Record<string, unknown>[];
		columns: string[];
		rowCount: number;
	};

	/**
	 * Cost information (for cloud queries)
	 */
	cost?: QueryCost;

	/**
	 * Timing information
	 */
	timing: {
		startedAt?: Date;
		completedAt?: Date;
		durationMs?: number;
	};

	/**
	 * Error information
	 */
	error?: {
		message: string;
		code?: string;
	};
}

export interface QueryCost {
	/**
	 * Estimated cost before execution (USD)
	 */
	estimatedCostUSD?: number;

	/**
	 * Actual cost after execution (USD)
	 */
	actualCostUSD?: number;

	/**
	 * Bytes processed
	 */
	bytesProcessed?: number;

	/**
	 * Bytes billed (may differ from processed)
	 */
	bytesBilled?: number;
}

// ============================================================================
// Smart Detection Types
// ============================================================================

export interface QueryAnalysis {
	/**
	 * Detected engine for execution
	 */
	suggestedEngine: QueryEngine;

	/**
	 * Confidence level (0-1)
	 */
	confidence: number;

	/**
	 * Tables referenced in query
	 */
	tables: TableReference[];

	/**
	 * Whether query mixes local and remote tables
	 */
	hasMixedSources: boolean;

	/**
	 * Warning messages
	 */
	warnings: string[];

	/**
	 * Cost estimate (if applicable)
	 */
	costEstimate?: QueryCost;
}

export interface TableReference {
	/**
	 * Full table identifier
	 */
	identifier: string;

	/**
	 * Detected source
	 */
	source: "local" | "bigquery" | "snowflake" | "databricks" | "unknown";

	/**
	 * Whether table is materialized locally
	 */
	isMaterialized: boolean;

	/**
	 * Materialized table info (if applicable)
	 */
	materializedTable?: MaterializedTable;
}

// ============================================================================
// Storage Management Types
// ============================================================================

export interface StorageQuota {
	/**
	 * Total available storage (bytes)
	 */
	totalBytes: number;

	/**
	 * Used storage (bytes)
	 */
	usedBytes: number;

	/**
	 * Available storage (bytes)
	 */
	availableBytes: number;

	/**
	 * Percentage used (0-100)
	 */
	percentUsed: number;

	/**
	 * Whether storage is persisted (won't be cleared by browser)
	 */
	isPersisted: boolean;
}

export interface StorageSummary {
	/**
	 * Overall quota
	 */
	quota: StorageQuota;

	/**
	 * Breakdown by connection
	 */
	byConnection: Map<string, ConnectionStorage>;

	/**
	 * Total materialized tables
	 */
	totalTables: number;

	/**
	 * Tables by status
	 */
	tablesByStatus: {
		available: number;
		unavailable: number;
		importing: number;
	};
}

export interface ConnectionStorage {
	/**
	 * Connection ID
	 */
	connectionId: string;

	/**
	 * Total bytes used
	 */
	totalBytes: number;

	/**
	 * Number of tables
	 */
	tableCount: number;

	/**
	 * Total cost spent (USD)
	 */
	totalCostUSD: number;
}

// ============================================================================
// File Permission Types
// ============================================================================

export interface FilePermissionStatus {
	/**
	 * File handle ID
	 */
	handleId: string;

	/**
	 * File name
	 */
	fileName: string;

	/**
	 * Permission state
	 */
	permission: "granted" | "denied" | "prompt";

	/**
	 * Whether file still exists
	 */
	exists: boolean;

	/**
	 * Last checked timestamp
	 */
	lastChecked: Date;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface MaterializeDialogState {
	/**
	 * Whether dialog is open
	 */
	isOpen: boolean;

	/**
	 * Query execution to materialize
	 */
	execution?: QueryExecution;

	/**
	 * Suggested table name
	 */
	suggestedTableName: string;

	/**
	 * Selected schema
	 */
	selectedSchema: string;

	/**
	 * Whether to save source query for refresh
	 */
	saveSourceQuery: boolean;
}

export interface ImportProgressState {
	/**
	 * Active import jobs
	 */
	activeJobs: ImportJob[];

	/**
	 * Completed jobs (recent)
	 */
	recentJobs: ImportJob[];

	/**
	 * Whether progress UI is visible
	 */
	isVisible: boolean;

	/**
	 * Expanded job ID (for details)
	 */
	expandedJobId?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface MaterializationConfig {
	/**
	 * Default max import size (GB)
	 */
	defaultMaxImportSizeGB: number;

	/**
	 * Default warning threshold (USD)
	 */
	defaultWarnThresholdUSD: number;

	/**
	 * Default block threshold (USD)
	 */
	defaultBlockThresholdUSD: number;

	/**
	 * Chunk size for streaming imports (MB)
	 */
	importChunkSizeMB: number;

	/**
	 * Checkpoint interval (rows)
	 */
	checkpointInterval: number;

	/**
	 * Auto-request file permissions on startup
	 */
	autoRequestPermissions: boolean;

	/**
	 * Show storage summary on startup
	 */
	showStartupSummary: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type MaterializationEvent =
	| { type: "import_started"; job: ImportJob }
	| { type: "import_progress"; job: ImportJob; progress: ImportProgress }
	| { type: "import_paused"; job: ImportJob }
	| { type: "import_resumed"; job: ImportJob }
	| { type: "import_completed"; job: ImportJob; table: MaterializedTable }
	| { type: "import_failed"; job: ImportJob; error: Error }
	| { type: "table_refreshed"; table: MaterializedTable }
	| { type: "table_deleted"; tableId: string }
	| { type: "quota_warning"; quota: StorageQuota }
	| { type: "connection_added"; connection: Connection }
	| { type: "connection_removed"; connectionId: string };
