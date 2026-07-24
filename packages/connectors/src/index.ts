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
  ConnectionTestResult,
  ParquetExportCapable
} from './base'

export { isParquetExportCapable } from './base'

// Connector state events (WS-B): the signal that replaces UI state polling.
export {
  ConnectorStateEmitter,
  classifyAuthFailure,
  isConnectorStateSource,
} from './connector-state'
export type {
  ConnectorStatus,
  ConnectorStatusReason,
  ConnectorStateEvent,
  ConnectorStateListener,
  ConnectorStateSource,
} from './connector-state'

// Export connector implementations
export { BigQueryConnector, OAUTH_SCOPES } from './bigquery-connector'
export type { BigQueryAuth } from './bigquery-connector'
export { DuckDBConnector } from './duckdb-connector'
export { DuckDBHttpConnector } from './duckdb-http-connector'
export { SnowflakeConnector } from './snowflake-connector'
export type { SnowflakeConnectorConfig } from './snowflake-connector'

// Export transport seam (used by Snowflake; will be adopted by BigQuery in Phase 3b)
export { BrowserTransport, CloudProxyUnavailableError } from './transport'
export type { RequestTransport, BrowserTransportOptions } from './transport'

// Export Snowflake helpers
export { parseSnowflakeAccount } from './snowflake-account'
export type { SnowflakeAccount } from './snowflake-account'

// OAuth callback constants — single source of truth across the
// connectors package and the web-client app.
export {
  SNOWFLAKE_OAUTH_RESPONSE_KEY,
  SNOWFLAKE_OAUTH_ERROR_KEY,
  SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY,
  SNOWFLAKE_TOKEN_KEY,
  SNOWFLAKE_CONFIG_KEY,
  SNOWFLAKE_PKCE_VERIFIER_KEY,
  SNOWFLAKE_OAUTH_STATE_KEY,
  SNOWFLAKE_OAUTH_BROADCAST_CHANNEL,
  SNOWFLAKE_OAUTH_CALLBACK_PATH,
} from './oauth-constants'
export type {
  OAuthCodeMessage,
  OAuthErrorMessage,
  OAuthMessage,
} from './oauth-constants'

// Export mode detection utility
export {
  detectMode,
  getConnectorForMode,
  getModeFeatures,
  isHttpModeAvailable,
  type DbxliteMode
} from './mode-detection'
