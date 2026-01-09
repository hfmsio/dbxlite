/**
 * DuckDB HTTP protocol implementation.
 * For communicating with DuckDB CLI's embedded HTTP server.
 */
export { BinaryStreamReader } from './BinaryStreamReader'
export { BinaryDeserializer } from './BinaryDeserializer'

// Export all types and functions from readers (the official implementation)
export {
  // Type ID constants
  LogicalTypeId,
  // Type definitions
  type BaseTypeInfo,
  type GenericTypeInfo,
  type DecimalTypeInfo,
  type ListTypeInfo,
  type StructTypeInfo,
  type EnumTypeInfo,
  type ArrayTypeInfo,
  type TypeInfo,
  type TypeIdAndInfo,
  // Vector types
  type ListEntry,
  type BaseVector,
  type DataVector,
  type StringVector,
  type DataListVector,
  type VectorListVector,
  type ListVector,
  type ArrayVector,
  type Vector,
  // Result types
  type ColumnNamesAndTypes,
  type DataChunk,
  type SuccessQueryResult,
  type ErrorQueryResult,
  type QueryResult,
  // Functions
  deserializeQueryResult,
  typeInfoToString,
} from './readers'
