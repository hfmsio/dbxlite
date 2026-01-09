/**
 * DuckDB HTTP Connector
 *
 * Connects to DuckDB CLI's embedded HTTP server (used by `duckdb -ui`).
 * This connector enables dbxlite to serve as a replacement UI for DuckDB's
 * built-in web interface.
 */
import {
  BaseConnector,
  ConnectionConfig,
  QueryOptions,
  QueryChunk,
  Schema,
  TableInfo,
  ColumnInfo,
  Row,
} from './base'
import {
  deserializeQueryResult,
  typeInfoToString,
  SuccessQueryResult,
  ErrorQueryResult,
  DataChunk,
  Vector,
  TypeIdAndInfo,
  LogicalTypeId,
} from './duckdb-http'

/** Default DuckDB UI server port (encodes "DUC" = 4,21,3) */
const DEFAULT_PORT = 4213

/** Generate a unique connection name */
function generateConnectionName(): string {
  return `dbxlite-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

export class DuckDBHttpConnector implements BaseConnector {
  readonly id = 'duckdb-http'

  private baseUrl: string
  private connectionName: string
  private connected = false
  private eventSource: EventSource | null = null
  private schemaChangeListeners: Array<() => void> = []

  constructor(baseUrl?: string) {
    // Default to current origin if running under duckdb -ui, otherwise localhost:4213
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/$/, '')
    } else if (typeof window !== 'undefined' && window.location.port === String(DEFAULT_PORT)) {
      this.baseUrl = window.location.origin
    } else {
      this.baseUrl = `http://localhost:${DEFAULT_PORT}`
    }
    this.connectionName = generateConnectionName()
  }

  async connect(_config: ConnectionConfig): Promise<void> {
    if (this.connected) return

    // Test connection by fetching server info
    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`DuckDB server not available: ${response.status}`)
      }

      this.connected = true

      // Set up SSE for catalog changes
      this.setupEventSource()
    } catch (error) {
      throw new Error(
        `Failed to connect to DuckDB HTTP server at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Set up Server-Sent Events for catalog change notifications
   */
  private setupEventSource(): void {
    if (typeof EventSource === 'undefined') return

    try {
      this.eventSource = new EventSource(`${this.baseUrl}/localEvents`)

      this.eventSource.addEventListener('catalog', () => {
        // Notify listeners of schema change
        for (const listener of this.schemaChangeListeners) {
          listener()
        }
      })

      // SSE auto-reconnects on error, no need to log every attempt
      // Error events are expected when server closes idle connections
    } catch {
      // SSE not critical, continue without it
    }
  }

  /**
   * Subscribe to schema change events
   */
  onSchemaChange(listener: () => void): () => void {
    this.schemaChangeListeners.push(listener)
    return () => {
      const index = this.schemaChangeListeners.indexOf(listener)
      if (index >= 0) {
        this.schemaChangeListeners.splice(index, 1)
      }
    }
  }

  /**
   * Build headers for DuckDB HTTP requests
   */
  private buildHeaders(options?: {
    database?: string
    schema?: string
    maxRows?: number
  }): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'text/plain',
      Origin: this.baseUrl,
      'X-DuckDB-UI-Connection-Name': this.connectionName,
    }

    if (options?.database) {
      headers['X-DuckDB-UI-Database-Name'] = btoa(options.database)
    }

    if (options?.schema) {
      headers['X-DuckDB-UI-Schema-Name'] = btoa(options.schema)
    }

    if (options?.maxRows !== undefined) {
      headers['X-DuckDB-UI-Result-Row-Limit'] = String(options.maxRows)
    }

    return headers
  }

  /**
   * Execute a SQL query and return raw result
   */
  private async executeQuery(
    sql: string,
    options?: { maxRows?: number }
  ): Promise<SuccessQueryResult> {
    if (!this.connected) {
      await this.connect({ options: {} })
    }

    const response = await fetch(`${this.baseUrl}/ddb/run`, {
      method: 'POST',
      headers: this.buildHeaders({ maxRows: options?.maxRows }),
      body: sql,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Query failed: ${response.status} - ${text}`)
    }

    const buffer = await response.arrayBuffer()
    const result = deserializeQueryResult(buffer)

    if (!result.success) {
      throw new Error((result as ErrorQueryResult).error)
    }

    return result as SuccessQueryResult
  }

  /**
   * Safely read from DataView with bounds checking
   */
  private safeRead<T>(
    dv: DataView,
    offset: number,
    size: number,
    reader: () => T
  ): T | null {
    if (offset < 0 || offset + size > dv.byteLength) {
      return null
    }
    return reader()
  }

  /**
   * Extract a value from a vector at a given row index
   */
  private extractValue(
    vector: Vector,
    type: TypeIdAndInfo,
    rowIdx: number,
    rowCount: number
  ): unknown {
    // Check validity bitmap
    if (vector.validity) {
      const byteIdx = Math.floor(rowIdx / 8)
      const bitIdx = rowIdx % 8
      if (byteIdx < vector.validity.byteLength) {
        const byte = vector.validity.getUint8(byteIdx)
        if ((byte & (1 << bitIdx)) === 0) {
          return null
        }
      }
    }

    switch (vector.kind) {
      case 'string':
        return rowIdx < vector.data.length ? vector.data[rowIdx] : null

      case 'data': {
        const dv = vector.data
        switch (type.id) {
          case LogicalTypeId.BOOLEAN:
            return this.safeRead(dv, rowIdx, 1, () => dv.getUint8(rowIdx) !== 0)
          case LogicalTypeId.TINYINT:
            return this.safeRead(dv, rowIdx, 1, () => dv.getInt8(rowIdx))
          case LogicalTypeId.SMALLINT:
            return this.safeRead(dv, rowIdx * 2, 2, () => dv.getInt16(rowIdx * 2, true))
          case LogicalTypeId.INTEGER:
            return this.safeRead(dv, rowIdx * 4, 4, () => dv.getInt32(rowIdx * 4, true))
          case LogicalTypeId.BIGINT:
            return this.safeRead(dv, rowIdx * 8, 8, () => Number(dv.getBigInt64(rowIdx * 8, true)))
          case LogicalTypeId.UTINYINT:
            return this.safeRead(dv, rowIdx, 1, () => dv.getUint8(rowIdx))
          case LogicalTypeId.USMALLINT:
            return this.safeRead(dv, rowIdx * 2, 2, () => dv.getUint16(rowIdx * 2, true))
          case LogicalTypeId.UINTEGER:
            return this.safeRead(dv, rowIdx * 4, 4, () => dv.getUint32(rowIdx * 4, true))
          case LogicalTypeId.UBIGINT:
            return this.safeRead(dv, rowIdx * 8, 8, () => Number(dv.getBigUint64(rowIdx * 8, true)))
          case LogicalTypeId.FLOAT:
            return this.safeRead(dv, rowIdx * 4, 4, () => dv.getFloat32(rowIdx * 4, true))
          case LogicalTypeId.DOUBLE:
            return this.safeRead(dv, rowIdx * 8, 8, () => dv.getFloat64(rowIdx * 8, true))
          case LogicalTypeId.DECIMAL: {
            // DECIMAL is stored as scaled integer
            const typeInfo = type.typeInfo
            if (typeInfo && typeInfo.kind === 'decimal') {
              const { width, scale } = typeInfo
              let rawValue: bigint | null = null
              if (width <= 4) {
                // 16-bit decimal stored in 2 bytes
                rawValue = this.safeRead(dv, rowIdx * 2, 2, () => BigInt(dv.getInt16(rowIdx * 2, true)))
              } else if (width <= 9) {
                // 32-bit decimal stored in 4 bytes
                rawValue = this.safeRead(dv, rowIdx * 4, 4, () => BigInt(dv.getInt32(rowIdx * 4, true)))
              } else if (width <= 18) {
                // 64-bit decimal stored in 8 bytes
                rawValue = this.safeRead(dv, rowIdx * 8, 8, () => dv.getBigInt64(rowIdx * 8, true))
              } else {
                // 128-bit decimal (HUGEINT) stored in 16 bytes
                rawValue = this.safeRead(dv, rowIdx * 16, 16, () => {
                  const lower = dv.getBigUint64(rowIdx * 16, true)
                  const upper = dv.getBigInt64(rowIdx * 16 + 8, true)
                  return (upper << 64n) | lower
                })
              }
              if (rawValue === null) return null
              // Apply scale factor
              if (scale === 0) {
                return Number(rawValue)
              }
              const divisor = 10n ** BigInt(scale)
              const intPart = rawValue / divisor
              const fracPart = rawValue % divisor
              if (fracPart === 0n) {
                return Number(intPart)
              }
              // Convert to number with proper decimal places
              return Number(rawValue) / Number(divisor)
            }
            // Fallback: try as 64-bit
            return this.safeRead(dv, rowIdx * 8, 8, () => Number(dv.getBigInt64(rowIdx * 8, true)))
          }
          case LogicalTypeId.DATE: {
            return this.safeRead(dv, rowIdx * 4, 4, () => {
              const days = dv.getInt32(rowIdx * 4, true)
              return new Date(days * 86400000).toISOString().split('T')[0]
            })
          }
          case LogicalTypeId.TIME: {
            // TIME is stored as microseconds since midnight (8 bytes)
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const micros = Number(dv.getBigInt64(rowIdx * 8, true))
              const totalSeconds = Math.floor(micros / 1_000_000)
              const hours = Math.floor(totalSeconds / 3600)
              const minutes = Math.floor((totalSeconds % 3600) / 60)
              const seconds = totalSeconds % 60
              const microsRemaining = micros % 1_000_000
              if (microsRemaining === 0) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
              }
              return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${microsRemaining.toString().padStart(6, '0')}`
            })
          }
          case LogicalTypeId.TIME_TZ: {
            // TIME_TZ is stored as microseconds (8 bytes) + offset in seconds (4 bytes) = 12 bytes
            // But DuckDB may pack it differently - treating as 8 bytes like TIME for now
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const micros = Number(dv.getBigInt64(rowIdx * 8, true))
              const totalSeconds = Math.floor(micros / 1_000_000)
              const hours = Math.floor(totalSeconds / 3600)
              const minutes = Math.floor((totalSeconds % 3600) / 60)
              const seconds = totalSeconds % 60
              return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            })
          }
          case LogicalTypeId.TIMESTAMP:
          case LogicalTypeId.TIMESTAMP_TZ: {
            // TIMESTAMP stored as microseconds since epoch
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const micros = Number(dv.getBigInt64(rowIdx * 8, true))
              return new Date(micros / 1000).toISOString()
            })
          }
          case LogicalTypeId.TIMESTAMP_SEC: {
            // TIMESTAMP_S stored as seconds since epoch
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const seconds = Number(dv.getBigInt64(rowIdx * 8, true))
              return new Date(seconds * 1000).toISOString()
            })
          }
          case LogicalTypeId.TIMESTAMP_MS: {
            // TIMESTAMP_MS stored as milliseconds since epoch
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const millis = Number(dv.getBigInt64(rowIdx * 8, true))
              return new Date(millis).toISOString()
            })
          }
          case LogicalTypeId.TIMESTAMP_NS: {
            // TIMESTAMP_NS stored as nanoseconds since epoch
            return this.safeRead(dv, rowIdx * 8, 8, () => {
              const nanos = Number(dv.getBigInt64(rowIdx * 8, true))
              return new Date(nanos / 1_000_000).toISOString()
            })
          }
          case LogicalTypeId.HUGEINT:
          case LogicalTypeId.UHUGEINT: {
            return this.safeRead(dv, rowIdx * 16, 16, () => {
              // 16 bytes, read as two 64-bit values
              const lower = dv.getBigUint64(rowIdx * 16, true)
              const upper = dv.getBigInt64(rowIdx * 16 + 8, true)
              // For display, just return as string if very large
              if (upper === 0n) return Number(lower)
              return `${upper}${lower.toString().padStart(20, '0')}`
            })
          }
          case LogicalTypeId.UUID: {
            // UUID is stored as 16 bytes (128 bits)
            return this.safeRead(dv, rowIdx * 16, 16, () => {
              const bytes = new Uint8Array(16)
              for (let i = 0; i < 16; i++) {
                bytes[i] = dv.getUint8(rowIdx * 16 + i)
              }
              // Format as UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
              const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
              return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
            })
          }
          case LogicalTypeId.INTERVAL: {
            // INTERVAL is stored as 16 bytes: months (4), days (4), microseconds (8)
            return this.safeRead(dv, rowIdx * 16, 16, () => {
              const months = dv.getInt32(rowIdx * 16, true)
              const days = dv.getInt32(rowIdx * 16 + 4, true)
              const micros = Number(dv.getBigInt64(rowIdx * 16 + 8, true))

              // Format as human-readable interval
              const parts: string[] = []
              if (months !== 0) {
                const years = Math.floor(months / 12)
                const remainingMonths = months % 12
                if (years !== 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
                if (remainingMonths !== 0) parts.push(`${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`)
              }
              if (days !== 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
              if (micros !== 0) {
                const totalSeconds = micros / 1_000_000
                const hours = Math.floor(totalSeconds / 3600)
                const minutes = Math.floor((totalSeconds % 3600) / 60)
                const seconds = totalSeconds % 60
                if (hours !== 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
                if (minutes !== 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)
                if (seconds !== 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`)
              }
              return parts.length > 0 ? parts.join(' ') : '0 seconds'
            })
          }
          default:
            // For other types, try to return raw bytes as hex
            return `[binary ${type.id}]`
        }
      }

      case 'datalist':
        // BLOB, BIT - return as hex string
        if (rowIdx < vector.data.length && vector.data[rowIdx]) {
          const dv = vector.data[rowIdx]
          const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
          return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
        }
        return null

      case 'list': {
        // LIST type - extract elements using entries
        if (rowIdx >= vector.entries.length) return []
        const entry = vector.entries[rowIdx]
        if (!entry || entry.length === 0) return []
        const childType = type.typeInfo && type.typeInfo.kind === 'list'
          ? type.typeInfo.childType
          : { id: LogicalTypeId.VARCHAR }
        const result: unknown[] = []
        for (let i = 0; i < entry.length; i++) {
          result.push(this.extractValue(vector.child, childType, entry.offset + i, vector.listSize))
        }
        return result
      }

      case 'array': {
        // ARRAY type - fixed size array
        const childType = type.typeInfo && type.typeInfo.kind === 'array'
          ? type.typeInfo.childType
          : { id: LogicalTypeId.VARCHAR }
        const result: unknown[] = []
        const startIdx = rowIdx * vector.arraySize
        for (let i = 0; i < vector.arraySize; i++) {
          result.push(this.extractValue(vector.child, childType, startIdx + i, vector.arraySize))
        }
        return result
      }

      case 'vectorlist': {
        // STRUCT type - create object from child vectors
        if (type.typeInfo && type.typeInfo.kind === 'struct') {
          const structInfo = type.typeInfo
          const result: Record<string, unknown> = {}
          for (let i = 0; i < structInfo.childTypes.length; i++) {
            const [fieldName, fieldType] = structInfo.childTypes[i]
            // Bounds check for child vector array
            if (i >= vector.data.length) {
              result[fieldName] = null
              continue
            }
            const childVector = vector.data[i]
            if (childVector) {
              result[fieldName] = this.extractValue(childVector, fieldType, rowIdx, rowCount)
            } else {
              result[fieldName] = null
            }
          }
          return result
        }
        // MAP type or unknown - return array of child values
        return vector.data.map((childVec) =>
          this.extractValue(childVec, { id: LogicalTypeId.VARCHAR }, rowIdx, rowCount)
        )
      }

      default:
        return null
    }
  }

  /**
   * Convert DataChunks to Row array
   */
  private chunksToRows(result: SuccessQueryResult): Row[] {
    const rows: Row[] = []
    const { names, types } = result.columnNamesAndTypes

    for (const chunk of result.chunks) {
      for (let rowIdx = 0; rowIdx < chunk.rowCount; rowIdx++) {
        const row: Row = {}
        for (let colIdx = 0; colIdx < names.length; colIdx++) {
          const vector = chunk.vectors[colIdx]
          if (vector) {
            row[names[colIdx]] = this.extractValue(vector, types[colIdx], rowIdx, chunk.rowCount)
          } else {
            row[names[colIdx]] = null
          }
        }
        rows.push(row)
      }
    }

    return rows
  }

  async *query(sql: string, opts?: QueryOptions): AsyncGenerator<QueryChunk> {
    const maxRows = opts?.maxRows ?? 10000

    try {
      const result = await this.executeQuery(sql, { maxRows })

      // Convert to rows
      const rows = this.chunksToRows(result)

      // Build schema from column info
      const columns: ColumnInfo[] = result.columnNamesAndTypes.names.map((name, i) => ({
        name,
        type: typeInfoToString(result.columnNamesAndTypes.types[i]),
        nullable: true,
      }))

      const schema: Schema = {
        tables: [
          {
            name: 'query_result',
            columns,
          },
        ],
      }

      // Yield in chunks if requested
      const chunkSize = opts?.chunkSize ?? rows.length

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const isLast = i + chunkSize >= rows.length

        yield {
          rows: chunk,
          done: isLast,
          schema: i === 0 ? schema : undefined,
          totalRows: rows.length,
        }
      }

      // If no rows, yield empty result with schema
      if (rows.length === 0) {
        const columns: ColumnInfo[] = result.columnNamesAndTypes.names.map((name, i) => ({
          name,
          type: typeInfoToString(result.columnNamesAndTypes.types[i]),
          nullable: true,
        }))

        yield {
          rows: [],
          done: true,
          schema: {
            tables: [{ name: 'query_result', columns }],
          },
          totalRows: 0,
        }
      }
    } catch (error) {
      throw error
    }
  }

  async cancel(_queryId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/ddb/interrupt`, {
        method: 'POST',
        headers: {
          Origin: this.baseUrl,
        },
      })
    } catch {
      // Interrupt may fail if query already completed
    }
  }

  async getSchema(): Promise<Schema> {
    if (!this.connected) {
      await this.connect({ options: {} })
    }

    const tables: TableInfo[] = []

    // Query information_schema for tables
    const tablesQuery = `
      SELECT
        table_catalog,
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_catalog, table_schema, table_name
    `

    try {
      const tablesResult = await this.executeQuery(tablesQuery)
      const tableRows = this.chunksToRows(tablesResult)

      for (const tableRow of tableRows) {
        const catalog = tableRow.table_catalog as string
        const schemaName = tableRow.table_schema as string
        const tableName = tableRow.table_name as string
        const tableType = tableRow.table_type as string

        // Get columns for this table
        const columnsQuery = `
          SELECT
            column_name,
            data_type,
            is_nullable
          FROM information_schema.columns
          WHERE table_catalog = '${catalog}'
            AND table_schema = '${schemaName}'
            AND table_name = '${tableName}'
          ORDER BY ordinal_position
        `

        const columns: ColumnInfo[] = []
        try {
          const columnsResult = await this.executeQuery(columnsQuery)
          const columnRows = this.chunksToRows(columnsResult)

          for (const colRow of columnRows) {
            columns.push({
              name: colRow.column_name as string,
              type: colRow.data_type as string,
              nullable: (colRow.is_nullable as string) === 'YES',
            })
          }
        } catch {
          // Failed to get columns for this table
        }

        tables.push({
          name: tableName,
          schema: schemaName,
          type: tableType?.toLowerCase() || 'table',
          columns,
        })
      }
    } catch (error) {
      console.error('Failed to get schema:', error)
    }

    return { tables }
  }

  async revoke(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.connected = false
    this.schemaChangeListeners = []
  }

  /**
   * Estimate row count for a query.
   * Uses COUNT(*) on the query as a subquery for accurate count.
   *
   * @param sql - The SQL query to estimate rows for
   * @returns Object with count and isEstimated flag
   */
  async getEstimatedRowCount(sql: string): Promise<{ count: number; isEstimated: boolean }> {
    // Remove trailing semicolon if present
    const cleanSql = sql.replace(/;\s*$/, '')

    // Wrap in COUNT(*) subquery
    const countSql = `SELECT COUNT(*) as cnt FROM (${cleanSql}) AS __count_subquery`

    try {
      const result = await this.executeQuery(countSql, { maxRows: 1 })
      const rows = this.chunksToRows(result)

      if (rows.length > 0 && rows[0].cnt !== undefined) {
        return {
          count: Number(rows[0].cnt),
          isEstimated: false, // COUNT(*) gives exact count
        }
      }

      return { count: 0, isEstimated: false }
    } catch (error) {
      // If count fails, return 0 with estimated flag
      console.warn('Failed to get row count:', error)
      return { count: 0, isEstimated: true }
    }
  }

  /**
   * Export query results to a file and return as Blob for download.
   * Uses DuckDB's COPY command to write to a temp file, then reads it back.
   *
   * @param sql - The SQL query to export
   * @param format - Export format: 'parquet', 'csv', or 'json'
   * @param fileName - Suggested filename for the download
   * @returns Blob containing the exported data
   */
  async exportAndDownload(
    sql: string,
    format: 'parquet' | 'csv' | 'json',
    _fileName: string
  ): Promise<Blob> {
    // Generate unique temp file path
    const uuid = crypto.randomUUID()
    const tempPath = `/tmp/dbxlite-export-${uuid}.${format}`

    // Remove trailing semicolon from SQL
    const cleanSql = sql.replace(/;\s*$/, '')

    // Build COPY command with format-specific options
    let copyOptions = ''
    switch (format) {
      case 'csv':
        copyOptions = "(FORMAT CSV, HEADER true)"
        break
      case 'json':
        copyOptions = "(FORMAT JSON, ARRAY true)"
        break
      case 'parquet':
        copyOptions = "(FORMAT PARQUET)"
        break
    }

    const copyCommand = `COPY (${cleanSql}) TO '${tempPath}' ${copyOptions}`

    try {
      // Execute COPY to write the file
      await this.executeQuery(copyCommand)

      // Read the file back as blob using read_blob
      const readCommand = `SELECT content FROM read_blob('${tempPath}')`
      const result = await this.executeQuery(readCommand, { maxRows: 1 })
      const rows = this.chunksToRows(result)

      if (rows.length === 0 || !rows[0].content) {
        throw new Error('Failed to read exported file')
      }

      // The content should be hex-encoded from our extractValue for BLOB
      const hexContent = rows[0].content as string

      // Convert hex string to Uint8Array
      const bytes = new Uint8Array(hexContent.length / 2)
      for (let i = 0; i < hexContent.length; i += 2) {
        bytes[i / 2] = parseInt(hexContent.substring(i, i + 2), 16)
      }

      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        parquet: 'application/octet-stream',
        csv: 'text/csv',
        json: 'application/json',
      }

      return new Blob([bytes], { type: mimeTypes[format] })
    } finally {
      // Clean up temp file (fire and forget)
      try {
        // DuckDB doesn't have delete_file, so we'll just leave the temp file
        // OS will clean /tmp eventually
        // If we had a way to delete, we would:
        // await this.executeQuery(`CALL delete_file('${tempPath}')`)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Check if connected to DuckDB server
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * Get the base URL of the DuckDB server
   */
  getBaseUrl(): string {
    return this.baseUrl
  }
}
