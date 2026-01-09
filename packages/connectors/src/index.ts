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

// Export mode detection utility
export {
  detectMode,
  getConnectorForMode,
  getModeFeatures,
  isHttpModeAvailable,
  type DbxliteMode
} from './mode-detection'
