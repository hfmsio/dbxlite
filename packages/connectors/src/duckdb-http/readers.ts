/**
 * Binary readers for DuckDB query results.
 * Based on official DuckDB UI client implementation.
 */
import { BinaryDeserializer } from './BinaryDeserializer'
import { BinaryStreamReader } from './BinaryStreamReader'

// ============================================================================
// Type IDs (from DuckDB LogicalTypeId)
// ============================================================================

export const LogicalTypeId = {
  BOOLEAN: 10,
  TINYINT: 11,
  SMALLINT: 12,
  INTEGER: 13,
  BIGINT: 14,
  DATE: 15,
  TIME: 16,
  TIMESTAMP_SEC: 17,
  TIMESTAMP_MS: 18,
  TIMESTAMP: 19,
  TIMESTAMP_NS: 20,
  DECIMAL: 21,
  FLOAT: 22,
  DOUBLE: 23,
  CHAR: 24,
  VARCHAR: 25,
  BLOB: 26,
  INTERVAL: 27,
  UTINYINT: 28,
  USMALLINT: 29,
  UINTEGER: 30,
  UBIGINT: 31,
  TIMESTAMP_TZ: 32,
  TIME_TZ: 34,
  BIT: 36,
  BIGNUM: 39,
  UHUGEINT: 49,
  HUGEINT: 50,
  UUID: 54,
  STRUCT: 100,
  LIST: 101,
  MAP: 102,
  ENUM: 104,
  UNION: 107,
  ARRAY: 108,
} as const

// ============================================================================
// Types
// ============================================================================

export interface BaseTypeInfo {
  alias?: string
}

export interface GenericTypeInfo extends BaseTypeInfo {
  kind: 'generic'
}

export interface DecimalTypeInfo extends BaseTypeInfo {
  kind: 'decimal'
  width: number
  scale: number
}

export interface ListTypeInfo extends BaseTypeInfo {
  kind: 'list'
  childType: TypeIdAndInfo
}

export interface StructTypeInfo extends BaseTypeInfo {
  kind: 'struct'
  childTypes: [string, TypeIdAndInfo][]
}

export interface EnumTypeInfo extends BaseTypeInfo {
  kind: 'enum'
  valuesCount: number
  values: string[]
}

export interface ArrayTypeInfo extends BaseTypeInfo {
  kind: 'array'
  childType: TypeIdAndInfo
  size: number
}

export type TypeInfo =
  | GenericTypeInfo
  | DecimalTypeInfo
  | ListTypeInfo
  | StructTypeInfo
  | EnumTypeInfo
  | ArrayTypeInfo

export interface TypeIdAndInfo {
  id: number
  typeInfo?: TypeInfo
}

export interface ListEntry {
  offset: number
  length: number
}

export interface BaseVector {
  allValid: number
  validity: DataView | null
}

export interface DataVector extends BaseVector {
  kind: 'data'
  data: DataView
}

export interface StringVector extends BaseVector {
  kind: 'string'
  data: string[]
}

export interface DataListVector extends BaseVector {
  kind: 'datalist'
  data: DataView[]
}

export interface VectorListVector extends BaseVector {
  kind: 'vectorlist'
  data: Vector[]
}

export interface ListVector extends BaseVector {
  kind: 'list'
  listSize: number
  entries: ListEntry[]
  child: Vector
}

export interface ArrayVector extends BaseVector {
  kind: 'array'
  arraySize: number
  child: Vector
}

export type Vector =
  | DataVector
  | StringVector
  | DataListVector
  | VectorListVector
  | ListVector
  | ArrayVector

export interface ColumnNamesAndTypes {
  names: string[]
  types: TypeIdAndInfo[]
}

export interface DataChunk {
  rowCount: number
  vectors: Vector[]
}

export interface SuccessQueryResult {
  success: true
  columnNamesAndTypes: ColumnNamesAndTypes
  chunks: DataChunk[]
}

export interface ErrorQueryResult {
  success: false
  error: string
}

export type QueryResult = SuccessQueryResult | ErrorQueryResult

// ============================================================================
// Basic Readers
// ============================================================================

function readUint8(d: BinaryDeserializer): number {
  return d.readUint8()
}

function readBoolean(d: BinaryDeserializer): boolean {
  return d.readUint8() !== 0
}

function readVarInt(d: BinaryDeserializer): number {
  return d.readVarInt()
}

function readData(d: BinaryDeserializer): DataView {
  const length = d.readVarInt()
  return d['reader'].readData(length)
}

function readString(d: BinaryDeserializer): string {
  return d.readString()
}

function readStringList(d: BinaryDeserializer): string[] {
  return d.readList(() => d.readString())
}

function readDataList(d: BinaryDeserializer): DataView[] {
  return d.readList(() => readData(d))
}

function readVarIntList(d: BinaryDeserializer): number[] {
  return d.readList(() => d.readVarInt())
}

// ============================================================================
// Type Readers
// ============================================================================

function readTypeInfo(d: BinaryDeserializer): TypeInfo {
  const typeInfoType = d.readProperty(100, readUint8)
  const alias = d.readPropertyWithDefault(101, readString, undefined)
  // Field 102 modifiers - skip if present
  d.readPropertyWithDefault(102, () => { d.throwUnsupported('modifiers') }, undefined)

  const baseInfo: BaseTypeInfo = alias ? { alias } : {}
  let typeInfo: TypeInfo

  switch (typeInfoType) {
    case 1: // GENERIC_TYPE_INFO
      typeInfo = { ...baseInfo, kind: 'generic' }
      break
    case 2: // DECIMAL_TYPE_INFO
      {
        const width = d.readPropertyWithDefault(200, readUint8, 0)
        const scale = d.readPropertyWithDefault(201, readUint8, 0)
        typeInfo = { ...baseInfo, kind: 'decimal', width, scale }
      }
      break
    case 4: // LIST_TYPE_INFO
      {
        const childType = d.readProperty(200, readType)
        typeInfo = { ...baseInfo, kind: 'list', childType }
      }
      break
    case 5: // STRUCT_TYPE_INFO
      {
        const childTypes = d.readProperty(200, (d) =>
          d.readList(() => {
            const name = d.readProperty(0, readString)
            const type = d.readProperty(1, readType)
            d.expectObjectEnd()
            return [name, type] as [string, TypeIdAndInfo]
          })
        )
        typeInfo = { ...baseInfo, kind: 'struct', childTypes }
      }
      break
    case 6: // ENUM_TYPE_INFO
      {
        const valuesCount = d.readProperty(200, readVarInt)
        const values = d.readProperty(201, readStringList)
        typeInfo = { ...baseInfo, kind: 'enum', valuesCount, values }
      }
      break
    case 9: // ARRAY_TYPE_INFO
      {
        const childType = d.readProperty(200, readType)
        const size = d.readPropertyWithDefault(201, readVarInt, 0)
        typeInfo = { ...baseInfo, kind: 'array', childType, size }
      }
      break
    default:
      typeInfo = { ...baseInfo, kind: 'generic' }
  }

  d.expectObjectEnd()
  return typeInfo
}

function readNullableTypeInfo(d: BinaryDeserializer): TypeInfo | null {
  return d.readNullable(readTypeInfo)
}

function readType(d: BinaryDeserializer): TypeIdAndInfo {
  const id = d.readProperty(100, readUint8)
  const typeInfo = d.readPropertyWithDefault(101, readNullableTypeInfo, null)
  d.expectObjectEnd()
  return typeInfo ? { id, typeInfo } : { id }
}

function readTypeList(d: BinaryDeserializer): TypeIdAndInfo[] {
  return d.readList(readType)
}

// ============================================================================
// Vector Readers
// ============================================================================

function readListEntry(d: BinaryDeserializer): ListEntry {
  const offset = d.readProperty(100, readVarInt)
  const length = d.readProperty(101, readVarInt)
  d.expectObjectEnd()
  return { offset, length }
}

function readListEntryList(d: BinaryDeserializer): ListEntry[] {
  return d.readList(readListEntry)
}

function readVector(d: BinaryDeserializer, type: TypeIdAndInfo): Vector {
  const allValid = d.readProperty(100, readUint8)
  const validity = allValid ? d.readProperty(101, readData) : null
  const baseVector: BaseVector = { allValid, validity }
  let vector: Vector | undefined

  switch (type.id) {
    case LogicalTypeId.BOOLEAN:
    case LogicalTypeId.TINYINT:
    case LogicalTypeId.SMALLINT:
    case LogicalTypeId.INTEGER:
    case LogicalTypeId.BIGINT:
    case LogicalTypeId.DATE:
    case LogicalTypeId.TIME:
    case LogicalTypeId.TIMESTAMP_SEC:
    case LogicalTypeId.TIMESTAMP_MS:
    case LogicalTypeId.TIMESTAMP:
    case LogicalTypeId.TIMESTAMP_NS:
    case LogicalTypeId.DECIMAL:
    case LogicalTypeId.FLOAT:
    case LogicalTypeId.DOUBLE:
    case LogicalTypeId.INTERVAL:
    case LogicalTypeId.UTINYINT:
    case LogicalTypeId.USMALLINT:
    case LogicalTypeId.UINTEGER:
    case LogicalTypeId.UBIGINT:
    case LogicalTypeId.TIMESTAMP_TZ:
    case LogicalTypeId.TIME_TZ:
    case LogicalTypeId.UHUGEINT:
    case LogicalTypeId.HUGEINT:
    case LogicalTypeId.UUID:
    case LogicalTypeId.ENUM:
      {
        const data = d.readProperty(102, readData)
        vector = { ...baseVector, kind: 'data', data }
      }
      break
    case LogicalTypeId.CHAR:
    case LogicalTypeId.VARCHAR:
      {
        const data = d.readProperty(102, readStringList)
        vector = { ...baseVector, kind: 'string', data }
      }
      break
    case LogicalTypeId.BLOB:
    case LogicalTypeId.BIT:
    case LogicalTypeId.BIGNUM:
      {
        const data = d.readProperty(102, readDataList)
        vector = { ...baseVector, kind: 'datalist', data }
      }
      break
    case LogicalTypeId.STRUCT:
    case LogicalTypeId.UNION:
      {
        const { typeInfo } = type
        if (!typeInfo || typeInfo.kind !== 'struct') {
          throw new Error('STRUCT or UNION without struct typeInfo')
        }
        const types = typeInfo.childTypes.map((e) => e[1])
        const data = d.readProperty(103, (d) => readVectorList(d, types))
        vector = { ...baseVector, kind: 'vectorlist', data }
      }
      break
    case LogicalTypeId.LIST:
    case LogicalTypeId.MAP:
      {
        const { typeInfo } = type
        if (!typeInfo || typeInfo.kind !== 'list') {
          throw new Error('LIST or MAP without list typeInfo')
        }
        const listSize = d.readProperty(104, readVarInt)
        const entries = d.readProperty(105, readListEntryList)
        const child = d.readProperty(106, (d) => readVector(d, typeInfo.childType))
        vector = { ...baseVector, kind: 'list', listSize, entries, child }
      }
      break
    case LogicalTypeId.ARRAY:
      {
        const { typeInfo } = type
        if (!typeInfo || typeInfo.kind !== 'array') {
          throw new Error('ARRAY without array typeInfo')
        }
        const arraySize = d.readProperty(103, readVarInt)
        const child = d.readProperty(104, (d) => readVector(d, typeInfo.childType))
        vector = { ...baseVector, kind: 'array', arraySize, child }
      }
      break
    default:
      throw new Error(`Unrecognized type id: ${type.id}`)
  }

  d.expectObjectEnd()
  return vector
}

function readVectorList(d: BinaryDeserializer, types: TypeIdAndInfo[]): Vector[] {
  return d.readList((d, i) => readVector(d, types[i]))
}

// ============================================================================
// Result Readers
// ============================================================================

function readColumnNamesAndTypes(d: BinaryDeserializer): ColumnNamesAndTypes {
  const names = d.readProperty(100, readStringList)
  const types = d.readProperty(101, readTypeList)
  d.expectObjectEnd()
  return { names, types }
}

function readChunk(d: BinaryDeserializer, types: TypeIdAndInfo[]): DataChunk {
  const rowCount = d.readProperty(100, readVarInt)
  const vectors = d.readProperty(101, (d) => readVectorList(d, types))
  d.expectObjectEnd()
  return { rowCount, vectors }
}

function readDataChunkList(d: BinaryDeserializer, types: TypeIdAndInfo[]): DataChunk[] {
  return d.readList((d) => readChunk(d, types))
}

function readSuccessQueryResult(d: BinaryDeserializer): SuccessQueryResult {
  const columnNamesAndTypes = d.readProperty(101, readColumnNamesAndTypes)
  const chunks = d.readProperty(102, (d) =>
    readDataChunkList(d, columnNamesAndTypes.types)
  )
  // NOTE: No expectObjectEnd() here - matches official implementation
  return { success: true, columnNamesAndTypes, chunks }
}

function readErrorQueryResult(d: BinaryDeserializer): ErrorQueryResult {
  const error = d.readProperty(101, readString)
  // NOTE: No expectObjectEnd() here - matches official implementation
  return { success: false, error }
}

function readQueryResult(d: BinaryDeserializer): QueryResult {
  const success = d.readProperty(100, readBoolean)
  if (success) {
    return readSuccessQueryResult(d)
  }
  return readErrorQueryResult(d)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Deserialize a query result from a binary buffer
 */
export function deserializeQueryResult(buffer: ArrayBuffer): QueryResult {
  const reader = new BinaryStreamReader(buffer)
  const deserializer = new BinaryDeserializer(reader)
  return readQueryResult(deserializer)
}

/**
 * Convert TypeIdAndInfo to a human-readable string
 */
export function typeInfoToString(type: TypeIdAndInfo): string {
  const { id, typeInfo } = type

  switch (id) {
    case LogicalTypeId.BOOLEAN: return 'BOOLEAN'
    case LogicalTypeId.TINYINT: return 'TINYINT'
    case LogicalTypeId.SMALLINT: return 'SMALLINT'
    case LogicalTypeId.INTEGER: return 'INTEGER'
    case LogicalTypeId.BIGINT: return 'BIGINT'
    case LogicalTypeId.UTINYINT: return 'UTINYINT'
    case LogicalTypeId.USMALLINT: return 'USMALLINT'
    case LogicalTypeId.UINTEGER: return 'UINTEGER'
    case LogicalTypeId.UBIGINT: return 'UBIGINT'
    case LogicalTypeId.FLOAT: return 'FLOAT'
    case LogicalTypeId.DOUBLE: return 'DOUBLE'
    case LogicalTypeId.DECIMAL:
      if (typeInfo?.kind === 'decimal') {
        return `DECIMAL(${typeInfo.width},${typeInfo.scale})`
      }
      return 'DECIMAL'
    case LogicalTypeId.VARCHAR: return 'VARCHAR'
    case LogicalTypeId.CHAR: return 'CHAR'
    case LogicalTypeId.BLOB: return 'BLOB'
    case LogicalTypeId.DATE: return 'DATE'
    case LogicalTypeId.TIME: return 'TIME'
    case LogicalTypeId.TIME_TZ: return 'TIMETZ'
    case LogicalTypeId.TIMESTAMP: return 'TIMESTAMP'
    case LogicalTypeId.TIMESTAMP_TZ: return 'TIMESTAMPTZ'
    case LogicalTypeId.TIMESTAMP_SEC: return 'TIMESTAMP_S'
    case LogicalTypeId.TIMESTAMP_MS: return 'TIMESTAMP_MS'
    case LogicalTypeId.TIMESTAMP_NS: return 'TIMESTAMP_NS'
    case LogicalTypeId.INTERVAL: return 'INTERVAL'
    case LogicalTypeId.HUGEINT: return 'HUGEINT'
    case LogicalTypeId.UHUGEINT: return 'UHUGEINT'
    case LogicalTypeId.UUID: return 'UUID'
    case LogicalTypeId.BIT: return 'BIT'
    case LogicalTypeId.LIST:
      if (typeInfo?.kind === 'list') {
        return `${typeInfoToString(typeInfo.childType)}[]`
      }
      return 'LIST'
    case LogicalTypeId.ARRAY:
      if (typeInfo?.kind === 'array') {
        return `${typeInfoToString(typeInfo.childType)}[${typeInfo.size}]`
      }
      return 'ARRAY'
    case LogicalTypeId.STRUCT:
      if (typeInfo?.kind === 'struct') {
        const fields = typeInfo.childTypes
          .map(([name, t]) => `${name}: ${typeInfoToString(t)}`)
          .join(', ')
        return `STRUCT(${fields})`
      }
      return 'STRUCT'
    case LogicalTypeId.MAP:
      return 'MAP'
    case LogicalTypeId.ENUM:
      return 'ENUM'
    case LogicalTypeId.UNION:
      return 'UNION'
    default:
      return typeInfo?.alias ?? `UNKNOWN(${id})`
  }
}
