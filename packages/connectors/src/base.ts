/**
 * Base connector interface for data source connectors (BigQuery, DuckDB, etc.)
 */

/** Represents a single row of query results as a key-value record */
export type Row = Record<string, unknown>

export interface ConnectionConfig {
  /** Connection options (e.g., projectId, credentials, etc.) */
  options: Record<string, unknown>
}

export interface QueryOptions {
  /** Optional project ID (for BigQuery) */
  projectId?: string
  /** Maximum number of rows to return */
  maxRows?: number
  /** Timeout in milliseconds */
  timeout?: number
  /** Chunk size for result pagination */
  chunkSize?: number
  /** Additional connector-specific options */
  [key: string]: unknown
}

/** Stats about query payload for transparency to users */
export interface QueryStats {
  totalRows: number
  totalBytes: number
  largeRowCount: number
  maxRowSize: number
  chunkCount: number
  avgRowSize: number
}

export interface QueryChunk {
  /** Array of result rows */
  rows: Row[]
  /** True if this is the last chunk */
  done: boolean
  /** Optional column schema information */
  schema?: Schema
  /** Optional total row count (from query metadata, not counted separately) */
  totalRows?: number
  /** Optional payload stats (sent with final chunk for DuckDB) */
  queryStats?: QueryStats
}

export interface TableInfo {
  /** Table name */
  name: string
  /** Database/schema name */
  schema?: string
  /** Table type (table, view, etc.) */
  type?: string
  /** Column information */
  columns?: ColumnInfo[]
}

export interface ColumnInfo {
  /** Column name */
  name: string
  /** Data type */
  type: string
  /** Whether column is nullable */
  nullable?: boolean
  /** Column comment/description */
  comment?: string
}

export interface Schema {
  /** List of tables */
  tables: TableInfo[]
  /** Optional database name */
  database?: string
}

/**
 * Base connector interface that all data source connectors must implement
 */
export interface CatalogInfo {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Type of catalog */
  type: 'project' | 'catalog' | 'database'
  /** Optional description */
  description?: string
}

export interface SchemaInfo {
  /** Unique identifier */
  id: string
  /** Schema/dataset name */
  name: string
  /** Parent catalog/project */
  catalog?: string
  /** Optional description */
  description?: string
  /** Location/region */
  location?: string
}

export interface TableMetadata extends TableInfo {
  /** Unique table identifier */
  id: string
  /** Parent catalog/project */
  catalog?: string
  /** Parent schema/dataset */
  schema?: string
  /** Row count */
  rowCount?: number
  /** Size in bytes */
  sizeBytes?: number
  /** Creation timestamp */
  created?: Date
  /** Last modified timestamp */
  modified?: Date
  /** Table description */
  description?: string
  /** Table labels/tags */
  labels?: Record<string, string>
}

export interface QueryCostEstimate {
  /** Estimated bytes to be processed */
  estimatedBytes: number
  /** Estimated cost in USD */
  estimatedCostUSD?: number
  /** Whether caching is possible */
  cachingPossible?: boolean
}

export interface ConnectionTestResult {
  /** Whether connection test succeeded */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Latency in milliseconds */
  latencyMs?: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface BaseConnector {
  /** Unique identifier for this connector type (e.g., 'bigquery', 'duckdb') */
  readonly id: string

  /**
   * Connect to the data source
   * @param config Connection configuration
   */
  connect(config: ConnectionConfig): Promise<void>

  /**
   * Execute a SQL query and stream results
   * @param sql SQL query string
   * @param opts Optional query options
   * @returns AsyncGenerator that yields query result chunks
   */
  query(sql: string, opts?: QueryOptions): AsyncGenerator<QueryChunk>

  /**
   * Cancel a running query
   * @param queryId Query identifier
   */
  cancel(queryId: string): Promise<void>

  /**
   * Get schema information (tables, columns)
   * @returns Schema information
   */
  getSchema(): Promise<Schema>

  /**
   * Revoke/disconnect from the data source
   */
  revoke?(): Promise<void>

  /**
   * Export encrypted credentials
   * @param passphrase Passphrase for encryption
   * @returns Encrypted credential blob
   */
  exportEncrypted?(passphrase: string): Promise<string>

  /**
   * Import encrypted credentials
   * @param blob Encrypted credential blob
   * @param passphrase Passphrase for decryption
   */
  importEncrypted?(blob: string, passphrase: string): Promise<void>
}

/**
 * Extended connector interface for cloud data warehouses
 */
export interface CloudConnector extends BaseConnector {
  /**
   * List available projects/catalogs
   * @returns List of catalog information
   */
  listProjects?(): Promise<CatalogInfo[]>

  /**
   * List datasets/schemas in a project
   * @param projectId Project identifier
   * @returns List of schema information
   */
  listDatasets?(projectId: string): Promise<SchemaInfo[]>

  /**
   * List tables in a dataset
   * @param projectId Project identifier
   * @param datasetId Dataset identifier
   * @returns List of table metadata
   */
  listTables?(projectId: string, datasetId: string): Promise<TableMetadata[]>

  /**
   * Get detailed metadata for a specific table
   * @param projectId Project identifier
   * @param datasetId Dataset identifier
   * @param tableId Table identifier
   * @returns Table metadata with full schema
   */
  getTableMetadata?(projectId: string, datasetId: string, tableId: string): Promise<TableMetadata>

  /**
   * Estimate query cost without executing
   * @param sql SQL query to estimate
   * @param projectId Optional project identifier
   * @returns Cost estimate
   */
  estimateQueryCost?(sql: string, projectId?: string): Promise<QueryCostEstimate>

  /**
   * Test connection to the data source
   * @returns Connection test result
   */
  testConnection?(): Promise<ConnectionTestResult>

  /**
   * Check if currently connected
   * @returns True if connected
   */
  isConnected?(): boolean
}
