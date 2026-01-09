/**
 * Type definitions for DuckDB HTTP API responses.
 * Based on duckdb-ui protocol.
 */

/** DuckDB logical type identifiers */
export enum DuckDBTypeId {
  INVALID = 0,
  BOOLEAN = 1,
  TINYINT = 2,
  SMALLINT = 3,
  INTEGER = 4,
  BIGINT = 5,
  UTINYINT = 6,
  USMALLINT = 7,
  UINTEGER = 8,
  UBIGINT = 9,
  FLOAT = 10,
  DOUBLE = 11,
  TIMESTAMP = 12,
  DATE = 13,
  TIME = 14,
  INTERVAL = 15,
  HUGEINT = 16,
  UHUGEINT = 32,
  VARCHAR = 17,
  BLOB = 18,
  DECIMAL = 19,
  TIMESTAMP_S = 20,
  TIMESTAMP_MS = 21,
  TIMESTAMP_NS = 22,
  ENUM = 23,
  LIST = 24,
  STRUCT = 25,
  MAP = 26,
  ARRAY = 33,
  UUID = 27,
  UNION = 28,
  BIT = 29,
  TIME_TZ = 30,
  TIMESTAMP_TZ = 31,
  ANY = 34,
  VARINT = 35,
  SQLNULL = 36,
}

/** Type information for a column */
export interface TypeInfo {
  typeId: DuckDBTypeId
  alias?: string
  // For DECIMAL
  width?: number
  scale?: number
  // For LIST/ARRAY
  childType?: TypeInfo
  // For STRUCT
  childTypes?: { name: string; type: TypeInfo }[]
  // For ENUM
  enumValues?: string[]
  // For MAP
  keyType?: TypeInfo
  valueType?: TypeInfo
}

/** Column metadata */
export interface ColumnInfo {
  name: string
  type: TypeInfo
}

/** Column names and types for a result set */
export interface ColumnNamesAndTypes {
  names: string[]
  types: TypeInfo[]
}

/** A data vector (column of values) */
export interface Vector {
  validity?: boolean[] // null bitmap
  data: unknown[] // actual values
}

/** A chunk of rows (batch) */
export interface DataChunk {
  rowCount: number
  vectors: Vector[]
}

/** Successful query result */
export interface SuccessQueryResult {
  success: true
  columns: ColumnNamesAndTypes
  chunks: DataChunk[]
}

/** Error query result */
export interface ErrorQueryResult {
  success: false
  error: string
}

/** Union type for query results */
export type QueryResult = SuccessQueryResult | ErrorQueryResult

/** Tokenize result (for SQL syntax highlighting) */
export interface TokenizeResult {
  tokens: Array<{
    type: number
    start: number
    end: number
  }>
  error?: string
}
