// Export base types and interfaces
export type {
  BaseConnector,
  CloudConnector,
  ConnectionConfig,
  QueryOptions,
  QueryChunk,
  Schema,
  TableInfo,
  ColumnInfo,
  CatalogInfo,
  SchemaInfo,
  TableMetadata,
  QueryCostEstimate,
  ConnectionTestResult
} from './base'

// Export connector implementations
export { BigQueryConnector } from './bigquery-connector'
export { DuckDBConnector } from './duckdb-connector'
export { DuckDBHttpConnector } from './duckdb-http-connector'
export { SnowflakeConnector } from './snowflake-connector'
export type { SnowflakeConnectorConfig } from './snowflake-connector'

// Export transport seam (used by Snowflake; will be adopted by BigQuery in Phase 3b)
export { BrowserTransport } from './transport'
export type { RequestTransport, BrowserTransportOptions } from './transport'

// Export Snowflake helpers
export { parseSnowflakeAccount } from './snowflake-account'
export type { SnowflakeAccount } from './snowflake-account'

// Export mode detection utility
export {
  detectMode,
  getConnectorForMode,
  getModeFeatures,
  isHttpModeAvailable,
  type DbxliteMode
} from './mode-detection'
