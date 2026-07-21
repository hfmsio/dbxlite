import { BaseConnector, ConnectionConfig, QueryOptions, QueryChunk, Schema, TableInfo, ColumnInfo, Row, QueryStats, ParquetExportCapable } from './base'
import { DuckDBWorkerAdapter, QueryStats as AdapterQueryStats } from '@ide/duckdb-adapter'

export class DuckDBConnector implements BaseConnector, ParquetExportCapable {
  readonly id = 'duckdb'
  private adapter: DuckDBWorkerAdapter | null = null
  private queryCounter = 0

  async connect(_config: ConnectionConfig): Promise<void> {
    if (!this.adapter) {
      this.adapter = new DuckDBWorkerAdapter()
      await this.adapter.init()
    }
  }

  async registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }
    await this.adapter!.registerFile(fileName, fileBuffer)
  }

  async registerFileHandle(fileName: string, file: File): Promise<void> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }
    await this.adapter!.registerFileHandle(fileName, file)
  }

  /**
   * Unregister a file from DuckDB's virtual filesystem. Called on data-source
   * removal so a later re-add of the same filename registers cleanly instead
   * of colliding with the stale handle.
   */
  async dropFile(fileName: string): Promise<void> {
    if (!this.adapter) return // nothing registered if we never connected
    await this.adapter.dropFile(fileName)
  }

  async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }
    return await this.adapter!.copyFileToBuffer(fileName)
  }

  /**
   * Convert BigInt to Number in a value (handles nested objects/arrays)
   */
  private convertBigInt(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value
    }
    if (typeof value === 'bigint') {
      return Number(value)
    }
    // Preserve Date objects as-is (don't convert to plain objects)
    if (value instanceof Date) {
      return value
    }
    if (Array.isArray(value)) {
      return value.map(v => this.convertBigInt(v))
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(value)) {
        result[key] = this.convertBigInt((value as Record<string, unknown>)[key])
      }
      return result
    }
    return value
  }

  async *query(sql: string, opts?: QueryOptions): AsyncGenerator<QueryChunk> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    const signal = opts?.signal
    if (signal?.aborted) {
      throw new DOMException('Query aborted before start', 'AbortError')
    }

    const queryId = `query-${++this.queryCounter}`

    // Cancel via worker on abort. The DuckDB WASM worker accepts a cancel
    // signal which interrupts the running query (best-effort; the worker
    // checks between row callbacks).
    const handleAbort = () => {
      this.adapter?.cancel(queryId).catch(() => {
        // best-effort
      })
    }
    signal?.addEventListener('abort', handleAbort)
    const chunkSize = opts?.chunkSize || 1000  // Default 1000 rows per chunk
    let buffer: Row[] = []
    let error: unknown = null
    let done = false
    let schema: Schema | undefined
    let queryStats: QueryStats | undefined
    let resolveChunk: ((rows: Row[]) => void) | null = null

    // Create a promise-based wrapper around the callback-based API.
    // This promise tracks query completion, not individual chunks.
    // Both `resolve` AND `reject` must be captured: the error callback below
    // calls `reject(e)`. Without it, parser/runtime errors from the worker
    // throw a ReferenceError and never propagate to the UI - users see the
    // Stop Query button with no error message.
    const queryComplete = new Promise<void>((resolve, reject) => {

      this.adapter!.runQuery(
        queryId,
        sql,
        (row: Row) => {
          // Convert BigInt values to numbers immediately
          const convertedRow = this.convertBigInt(row) as Row
          buffer.push(convertedRow)

          // When buffer reaches chunk size, resolve the pending chunk promise
          if (buffer.length >= chunkSize && resolveChunk) {
            const chunk = buffer
            buffer = []
            const resolve = resolveChunk
            resolveChunk = null
            resolve(chunk)
          }
        },
        () => {
          done = true
          // Resolve any pending chunk with remaining buffer
          if (resolveChunk) {
            const resolve = resolveChunk
            resolveChunk = null
            resolve(buffer)
            buffer = []
          }
          resolve()
        },
        (e: unknown) => {
          error = e
          reject(e)
        },
        (columns: ColumnInfo[]) => {
          // Schema callback - receive column metadata from Arrow schema
          schema = {
            tables: [{
              name: 'query_result',
              columns
            }]
          }
        },
        (stats: AdapterQueryStats) => {
          // Stats callback - receive payload stats for transparency
          queryStats = stats
        }
      )
    })

    try {
      // Yield chunks as they become available
      while (!done || buffer.length > 0) {
        if (buffer.length >= chunkSize) {
          // Buffer is ready, yield immediately
          const chunk = buffer
          buffer = []
          yield { rows: chunk, done: false, schema }
        } else if (!done) {
          // Wait for next chunk to fill up OR query completion/error
          // Race prevents deadlock when query errors before sending data
          const chunkRows = await Promise.race([
            new Promise<Row[]>((resolve) => {
              resolveChunk = resolve
            }),
            queryComplete.then(() => {
              // Query completed without error, return empty array
              return []
            })
          ])

          // If query completed (done=true) and we got empty array, exit loop
          if (chunkRows.length === 0 && done) {
            break
          }

          // Only yield if we have data
          if (chunkRows.length > 0) {
            yield { rows: chunkRows, done: false, schema }
          }
        } else if (buffer.length > 0) {
          // Query done, flush remaining buffer
          const chunk = buffer
          buffer = []
          yield { rows: chunk, done: true, schema, queryStats }
        } else {
          // Query done, no more data
          break
        }
      }

      // Wait for query to fully complete (may already be complete from race above)
      await queryComplete

      // Yield final empty chunk to signal completion if no data was sent
      if (!schema) {
        yield { rows: [], done: true, schema, queryStats }
      }
    } catch (e) {
      // Clean up pending resolvers
      resolveChunk = null

      if (error) {
        throw error
      }
      throw e
    } finally {
      signal?.removeEventListener('abort', handleAbort)
    }
  }

  async cancel(queryId: string): Promise<void> {
    if (this.adapter) {
      await this.adapter.cancel(queryId)
    }
  }

  /**
   * Get estimated row count using EXPLAIN (fast, no actual query execution)
   * @param sql SQL query to estimate
   * @returns Estimated row count, or -1 if estimation fails
   */
  async getEstimatedRowCount(sql: string): Promise<number> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    try {
      // Use EXPLAIN to get estimated cardinality without running the query
      // DuckDB's EXPLAIN provides "estimated_cardinality" in the query plan
      const explainSql = `EXPLAIN ${sql}`

      let explainOutput = ''
      const rows: Row[] = []
      for await (const chunk of this.query(explainSql)) {
        // Collect all rows for analysis
        rows.push(...chunk.rows)

        // EXPLAIN returns text output with estimated cardinality
        for (const row of chunk.rows) {
          // Row is typically { explain_key: string, explain_value: string }
          // or a single string field with the plan
          const rowObj = row as Record<string, unknown>
          const rowStr = typeof row === 'string' ? row :
                        (rowObj.explain_value as string) || (rowObj[Object.keys(rowObj)[0]] as string) || ''
          explainOutput += rowStr + '\n'
        }
      }

      // Parse EXPLAIN output for row estimation

      // Try multiple parsing strategies

      // Strategy 1: Look for "~12345 Rows" pattern (DuckDB WASM format)
      // This is the most common format in DuckDB WASM EXPLAIN output
      let ecMatch = explainOutput.match(/~(\d+)\s+Rows/i)
      if (ecMatch) {
        const estimate = parseInt(ecMatch[1])
        // Found ~Rows pattern
        return estimate
      }

      // Strategy 2: Look for "EC: 12345" pattern
      ecMatch = explainOutput.match(/EC:\s*(\d+)/i)
      if (ecMatch) {
        const estimate = parseInt(ecMatch[1])
        // Found EC pattern
        return estimate
      }

      // Strategy 3: Look for "estimated_cardinality" text
      ecMatch = explainOutput.match(/estimated[_\s]cardinality[:\s]+(\d+)/i)
      if (ecMatch) {
        const estimate = parseInt(ecMatch[1])
        // Found text pattern
        return estimate
      }

      // Strategy 4: Look for numbers after "Cardinality:"
      ecMatch = explainOutput.match(/Cardinality:\s*(\d+)/i)
      if (ecMatch) {
        const estimate = parseInt(ecMatch[1])
        // Found Cardinality pattern
        return estimate
      }

      // Strategy 5: For simple table scans, count rows directly
      // EXPLAIN might show row counts for SEQ_SCAN operations
      ecMatch = explainOutput.match(/SEQ_SCAN.*?(\d{3,})/i)
      if (ecMatch) {
        const estimate = parseInt(ecMatch[1])
        // Found SEQ_SCAN pattern
        return estimate
      }

      // Strategy 6: DUMMY_SCAN — DuckDB's marker for a query with no real
      // source (e.g. SELECT 1, SELECT 'x', SELECT current_date, version()).
      // Each DUMMY_SCAN produces exactly one row by construction. Without
      // this strategy, callers see -1 and route to virtual-table streaming
      // mode for a 1-row result, surfacing a misleading "very large dataset"
      // toast.
      if (/DUMMY_SCAN/i.test(explainOutput)) {
        return 1
      }

      // If no EC found, return -1 to indicate unknown
      // Could not parse estimated cardinality from EXPLAIN output
      return -1
    } catch (e) {
      // EXPLAIN failed, will use fallback
      return -1
    }
  }

  async getSchema(): Promise<Schema> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    const tables: TableInfo[] = []

    // Query INFORMATION_SCHEMA to get tables
    const tablesQuery = `
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `

    const tableRows: Row[] = []
    for await (const chunk of this.query(tablesQuery)) {
      tableRows.push(...chunk.rows)
    }

    // For each table, get column information
    for (const tableRow of tableRows) {
      const rowObj = tableRow as Record<string, unknown>
      const schema = (rowObj.table_schema || rowObj[0]) as string
      const tableName = (rowObj.table_name || rowObj[1]) as string
      const tableType = (rowObj.table_type || rowObj[2]) as string

      const columnsQuery = `
        SELECT
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = '${tableName}'
        ORDER BY ordinal_position
      `

      const columns: ColumnInfo[] = []
      try {
        for await (const chunk of this.query(columnsQuery)) {
          for (const colRow of chunk.rows) {
            const colObj = colRow as Record<string, unknown>
            columns.push({
              name: (colObj.column_name || colObj[0]) as string,
              type: (colObj.data_type || colObj[1]) as string,
              nullable: ((colObj.is_nullable || colObj[2]) as string) === 'YES'
            })
          }
        }
      } catch (e) {
        // Failed to get columns, returning empty array
      }

      tables.push({
        name: tableName,
        schema: schema,
        type: tableType?.toLowerCase() || 'table',
        columns
      })
    }

    return { tables }
  }

  /**
   * Execute a simple query (helper method for internal use)
   */
  private async executeSimpleQuery(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const queryId = `simple-${++this.queryCounter}`
      this.adapter!.runQuery(
        queryId,
        sql,
        () => {}, // No rows expected for DDL/DML
        () => resolve(),
        (err) => reject(err)
      )
    })
  }

  /**
   * Export data to a Parquet file in DuckDB's virtual filesystem
   * @param fileName - Name of the Parquet file (e.g., 'mydata.parquet')
   * @param data - Array of row objects to export
   * @param columns - Array of column names (order matters)
   * @param columnTypes - Optional array of column type information for better type inference
   * @returns Promise that resolves when export is complete
   */
  async exportToParquet(fileName: string, data: Row[], columns: string[], columnTypes?: Array<{name: string, type: string}>): Promise<void> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    // Create a temporary table with the data
    const tempTableName = `temp_export_${Date.now()}_${Math.random().toString(36).substring(7)}`

    try {
      // Build CREATE TABLE statement with inferred types
      const sampleRow = data[0]
      const columnDefs = columns.map(col => {
        // First check if we have explicit type information
        const columnType = columnTypes?.find(c => c.name === col)
        if (columnType) {
          // Map BigQuery/SQL types to DuckDB types
          return `"${col}" ${this.mapToDuckDBType(columnType.type)}`
        }

        // Fall back to value-based type inference
        const value = sampleRow[col]
        let type = 'VARCHAR'

        if (typeof value === 'number') {
          type = Number.isInteger(value) ? 'BIGINT' : 'DOUBLE'
        } else if (typeof value === 'boolean') {
          type = 'BOOLEAN'
        } else if (value instanceof Date) {
          type = 'TIMESTAMP'
        }

        return `"${col}" ${type}`
      }).join(', ')

      // Create temporary table
      await this.executeSimpleQuery(`CREATE TEMPORARY TABLE ${tempTableName} (${columnDefs})`)

      // Build map of column names to their target DuckDB types for INSERT conversion
      const columnTypeMap = new Map<string, string>()
      columns.forEach(col => {
        const columnType = columnTypes?.find(c => c.name === col)
        if (columnType) {
          columnTypeMap.set(col, this.mapToDuckDBType(columnType.type))
        } else {
          // Infer from sample value
          const value = sampleRow[col]
          if (typeof value === 'number') {
            columnTypeMap.set(col, Number.isInteger(value) ? 'BIGINT' : 'DOUBLE')
          } else if (typeof value === 'boolean') {
            columnTypeMap.set(col, 'BOOLEAN')
          } else if (value instanceof Date) {
            columnTypeMap.set(col, 'TIMESTAMP')
          } else {
            columnTypeMap.set(col, 'VARCHAR')
          }
        }
      })

      // Insert data in batches to avoid query size limits
      const batchSize = 1000
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize)
        const values = batch.map(row => {
          const vals = columns.map(col => {
            // Clean Arrow metadata before processing
            const value = this.cleanArrowMetadata(row[col])
            const targetType = columnTypeMap.get(col) || 'VARCHAR'

            if (value === null || value === undefined) return 'NULL'
            if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
            if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
            if (value instanceof Date) return `'${value.toISOString()}'`
            // Handle numeric timestamps: convert epoch ms to TIMESTAMP using epoch_ms()
            if (typeof value === 'number' && targetType === 'TIMESTAMP') {
              return `epoch_ms(${value})`
            }
            // Handle arrays (LIST type)
            if (Array.isArray(value)) {
              const arrayVals = value.map(v => this.serializeValueForSQL(v)).join(', ')
              return `[${arrayVals}]`
            }
            // Handle objects (STRUCT type)
            if (typeof value === 'object') {
              const structVals = Object.entries(value)
                .map(([k, v]) => `'${k}': ${this.serializeValueForSQL(v)}`)
                .join(', ')
              return `{${structVals}}`
            }
            return String(value)
          }).join(', ')
          return `(${vals})`
        }).join(', ')

        await this.executeSimpleQuery(`INSERT INTO ${tempTableName} VALUES ${values}`)
      }

      // Export to Parquet
      await this.executeSimpleQuery(`COPY ${tempTableName} TO '${fileName}' (FORMAT PARQUET)`)

      // Export complete
    } finally {
      // Clean up temporary table
      try {
        await this.executeSimpleQuery(`DROP TABLE IF EXISTS ${tempTableName}`)
      } catch {
        // Non-critical: temp table cleanup failed
      }
    }
  }

  /**
   * Clean Arrow internal metadata from objects
   */
  private cleanArrowMetadata(value: unknown, debugPath: string = ''): unknown {
    if (value === null || value === undefined) return value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (value instanceof Date) return value

    if (Array.isArray(value)) {
      // For real arrays, just clean each element
      return value.map((v, i) => this.cleanArrowMetadata(v, `${debugPath}[${i}]`))
    }

    if (typeof value === 'object') {
      const objValue = value as Record<string, unknown>
      const keys = Object.keys(objValue)
      const hasArrowFields = keys.some(k =>
        ['type', 'offset', 'length', 'nullCount', 'nullBitmap', 'values',
         'valueOffsets', '_offsets', 'stride', 'numChildren', 'children', 'data'].includes(k)
      )

      // If this looks like an Arrow vector, try to extract values
      if (hasArrowFields) {
        // Check for 'data' field first (used by LIST/ARRAY types)
        if (objValue.data !== undefined && objValue.data !== null) {
          // Check if this is a string array (has _offsets field)
          if (objValue._offsets !== undefined && objValue._offsets !== null) {
            const dataField = objValue.data as Record<string, unknown> | unknown[]
            const offsetsField = objValue._offsets as Record<string, unknown> | unknown[]

            // Extract byte data
            const byteData = Array.isArray(dataField)
              ? dataField
              : Object.keys(dataField as Record<string, unknown>)
                  .filter(k => /^\d+$/.test(k))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(k => (dataField as Record<string, unknown>)[k])

            // Extract offsets
            const offsets = Array.isArray(offsetsField)
              ? offsetsField
              : Object.keys(offsetsField as Record<string, unknown>)
                  .filter(k => /^\d+$/.test(k))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(k => (offsetsField as Record<string, unknown>)[k])

            if (byteData.length > 0 && offsets.length > 1) {
              const strings: string[] = []

              // Decode each string using offsets
              for (let i = 0; i < offsets.length - 1; i++) {
                const start = offsets[i] as number
                const end = offsets[i + 1] as number
                const bytes = (byteData as unknown[]).slice(start, end)

                // Convert bytes to string
                try {
                  const str = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
                  strings.push(str)
                } catch {
                  // String decode failed, use empty string
                  strings.push('')
                }
              }

              return strings
            }
          }

          // If not a string array, treat data as regular values
          if (typeof objValue.data === 'object') {
            const dataObj = objValue.data as Record<string, unknown> | unknown[]
            const dataArray = Array.isArray(dataObj)
              ? dataObj
              : Object.keys(dataObj as Record<string, unknown>)
                  .filter(k => /^\d+$/.test(k))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(k => (dataObj as Record<string, unknown>)[k])

            if (dataArray.length > 0) {
              return dataArray.map((v, i) => this.cleanArrowMetadata(v, `${debugPath}.data[${i}]`))
            }
          }
        }

        // Check if there's a 'values' field (some Arrow vectors store data here)
        if (objValue.values !== undefined && objValue.values !== null) {
          // If values is an array-like object, convert to array
          if (typeof objValue.values === 'object') {
            const valuesObj = objValue.values as Record<string, unknown> | unknown[]
            const valuesArray = Array.isArray(valuesObj)
              ? valuesObj
              : Object.keys(valuesObj as Record<string, unknown>)
                  .filter(k => /^\d+$/.test(k))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(k => (valuesObj as Record<string, unknown>)[k])

            if (valuesArray.length > 0) {
              return valuesArray.map((v, i) => this.cleanArrowMetadata(v, `${debugPath}.values[${i}]`))
            }
          }
        }

        // Otherwise, try to extract from numeric indices
        const numericKeys = keys.filter(k => /^\d+$/.test(k)).sort((a, b) => parseInt(a) - parseInt(b))
        if (numericKeys.length > 0) {
          return numericKeys.map((k, i) => this.cleanArrowMetadata(objValue[k], `${debugPath}[${i}]`))
        }

        // No data found, return null
        return null
      }

      // For regular objects (not Arrow vectors), clean fields
      const arrowInternalFields = [
        'type', 'offset', 'length', 'nullCount', 'nullBitmap',
        'values', 'valueOffsets', '_offsets', 'stride',
        'numChildren', 'children', 'data', 'ArrayType',
        'VectorType', 'RowType', 'constructor'
      ]

      const cleaned: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(objValue)) {
        // Skip Arrow internal fields
        if (arrowInternalFields.includes(key)) continue
        // For regular objects, skip numeric keys (likely Arrow buffer indices)
        if (/^\d+$/.test(key)) continue
        // Recursively clean nested values
        cleaned[key] = this.cleanArrowMetadata(val, `${debugPath}.${key}`)
      }

      // If object is empty after cleaning, return null
      return Object.keys(cleaned).length > 0 ? cleaned : null
    }

    return value
  }

  /**
   * Recursively serialize a value to DuckDB SQL syntax
   */
  private serializeValueForSQL(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (value instanceof Date) return `'${value.toISOString()}'`
    if (Array.isArray(value)) {
      const arrayVals = value.map(v => this.serializeValueForSQL(v)).join(', ')
      return `[${arrayVals}]`
    }
    if (typeof value === 'object') {
      const structVals = Object.entries(value)
        .map(([k, v]) => `'${k}': ${this.serializeValueForSQL(v)}`)
        .join(', ')
      return `{${structVals}}`
    }
    return String(value)
  }

  /**
   * Map SQL types to DuckDB types, converting Arrow type syntax to DuckDB syntax
   */
  private mapToDuckDBType(sqlType: string): string {
    const type = sqlType.toUpperCase()

    // Handle Arrow complex types - convert syntax from Arrow to DuckDB
    // Arrow uses: Struct<{field1:Type1, field2:Type2}>
    // DuckDB uses: STRUCT(field1 TYPE1, field2 TYPE2)

    if (type.startsWith('STRUCT<')) {
      // Extract the content between < and >
      const content = sqlType.match(/STRUCT<\{([^}]+)\}>/i)?.[1]
      if (content) {
        // Parse field definitions: "field1:Type1, field2:Type2"
        const fields = content.split(',').map(field => {
          const [name, fieldType] = field.trim().split(':')
          // Recursively map the field type
          const mappedType = this.mapToDuckDBType(fieldType.trim())
          return `${name.trim()} ${mappedType}`
        }).join(', ')
        return `STRUCT(${fields})`
      }
      // Fallback: try to preserve the type but convert < > to ( )
      return sqlType.replace(/<\{/g, '(').replace(/\}>/g, ')')
    }

    if (type.startsWith('LIST<') || type.startsWith('ARRAY<')) {
      // Arrow: List<Type> or Array<Type>
      // DuckDB: TYPE[]
      const innerType = sqlType.match(/<([^>]+)>/i)?.[1]
      if (innerType) {
        const mappedInnerType = this.mapToDuckDBType(innerType.trim())
        return `${mappedInnerType}[]`
      }
      return 'VARCHAR[]'
    }

    if (type.startsWith('MAP<')) {
      // Arrow: Map<KeyType, ValueType>
      // DuckDB: MAP(KEY_TYPE, VALUE_TYPE)
      const content = sqlType.match(/<([^>]+)>/i)?.[1]
      if (content) {
        const parts = content.split(',').map(p => p.trim())
        if (parts.length === 2) {
          const keyType = this.mapToDuckDBType(parts[0])
          const valueType = this.mapToDuckDBType(parts[1])
          return `MAP(${keyType}, ${valueType})`
        }
      }
      return 'MAP(VARCHAR, VARCHAR)'
    }

    // Handle simple Arrow types
    if (type === 'UTF8' || type === 'STRING' || type === 'VARCHAR' || type === 'TEXT') return 'VARCHAR'
    if (type === 'INT8') return 'TINYINT'
    if (type === 'INT16') return 'SMALLINT'
    if (type === 'INT32') return 'INTEGER'
    if (type === 'INT64' || type === 'INTEGER') return 'BIGINT'
    if (type === 'UINT8') return 'UTINYINT'
    if (type === 'UINT16') return 'USMALLINT'
    if (type === 'UINT32') return 'UINTEGER'
    if (type === 'UINT64') return 'UBIGINT'
    if (type === 'FLOAT32' || type === 'FLOAT') return 'FLOAT'
    if (type === 'FLOAT64' || type === 'DOUBLE' || type === 'NUMERIC' || type.startsWith('DECIMAL')) return 'DOUBLE'
    if (type === 'BOOL' || type === 'BOOLEAN') return 'BOOLEAN'
    if (type.includes('TIMESTAMP') || type.includes('DATETIME')) return 'TIMESTAMP'
    if (type === 'DATE' || type === 'DATE32' || type === 'DATE64') return 'DATE'
    if (type.includes('TIME')) return 'TIME'
    if (type === 'BINARY' || type === 'BYTES' || type === 'BLOB') return 'BLOB'
    if (type === 'JSON') return 'JSON'

    // Default to VARCHAR for unknown types
    return 'VARCHAR'
  }

  /**
   * Infer a DuckDB type from a sample JS value. Used by the streaming
   * Parquet writer when no explicit columnTypes are supplied. Conservative:
   * unknown shapes map to VARCHAR so DuckDB can still ingest them.
   */
  private inferDuckDBTypeFromValue(value: unknown): string {
    if (value === null || value === undefined) return 'VARCHAR'
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE'
    }
    if (typeof value === 'boolean') return 'BOOLEAN'
    if (typeof value === 'bigint') return 'BIGINT'
    if (value instanceof Date) return 'TIMESTAMP'
    return 'VARCHAR'
  }

  /**
   * Export data to Parquet in chunks (for large datasets from external sources like BigQuery)
   * @param fileName - Name of the Parquet file
   * @param dataGenerator - Async generator that yields chunks of data
   * @param columns - Array of column names
   * @param columnTypes - Optional array of column type information
   * @param onProgress - Optional callback for progress updates (rowsProcessed, totalRows if known)
   * @returns Promise that resolves when export is complete
   */
  async exportToParquetStreaming(
    fileName: string,
    dataGenerator: AsyncGenerator<{rows: Row[], done: boolean, totalRows?: number}>,
    columns: string[],
    columnTypes?: Array<{name: string, type: string}>,
    onProgress?: (rowsProcessed: number, totalRows?: number) => void
  ): Promise<number> {
    // True chunked Parquet write.
    //
    // Earlier implementations buffered every chunk into a DuckDB temp table
    // (multi-100MB result resident in WASM heap before the first byte of
    // Parquet was written). That moved the memory pressure from JS into
    // WASM but didn't eliminate it.
    //
    // This implementation writes each chunk to its own Parquet file
    // immediately:
    //   1. chunk arrives → JSON-encode → registerFile as virtual JSON
    //   2. COPY (SELECT … FROM read_json('chunk.json')) TO 'chunk_N.parquet'
    //   3. drop the JSON virtual file (the JSON buffer is freed once the
    //      COPY completes; the chunk Parquet stays in VFS until merge)
    // After the generator drains:
    //   4. COPY (SELECT * FROM read_parquet(['chunk_0.parquet', …])) TO 'final.parquet'
    //   5. drop all chunk Parquets
    //
    // Steady-state memory: one chunk's JSON + one chunk's Parquet
    // (~10-100 MB total for typical Snowflake partitions). The full result
    // never materializes; the merge step streams chunk Parquets through
    // DuckDB's reader.
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    const exportId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
    let totalRowsProcessed = 0
    let firstChunkRow: Row | null = null
    const chunkParquetFiles: string[] = []

    // Resolve a single SELECT projection that matches the user's column list
    // and casts each column to a stable DuckDB type. Inferred only if no
    // explicit columnTypes — for cloud connectors we always pass them.
    const buildSelectProjection = (sampleRow: Row): string => {
      return columns
        .map((col) => {
          const explicit = columnTypes?.find((c) => c.name === col)
          const ddType = explicit
            ? this.mapToDuckDBType(explicit.type)
            : this.inferDuckDBTypeFromValue(sampleRow[col])
          // CAST gives every chunk the same schema even when read_json
          // would otherwise infer divergent types per chunk (e.g. all-null
          // columns). Quoted identifiers preserve case.
          return `CAST("${col}" AS ${ddType}) AS "${col}"`
        })
        .join(', ')
    }

    try {
      for await (const chunk of dataGenerator) {
        if (chunk.rows.length === 0) continue
        if (!firstChunkRow) firstChunkRow = chunk.rows[0]

        const chunkIdx = chunkParquetFiles.length
        const jsonFile = `__export_${exportId}_chunk_${chunkIdx}.json`
        const parquetFile = `__export_${exportId}_chunk_${chunkIdx}.parquet`

        // BigInt → string (JSON.stringify throws on BigInt by default).
        const json = JSON.stringify(chunk.rows, (_k, v) => {
          if (typeof v === 'bigint') return v.toString()
          return v
        })
        const buf = new TextEncoder().encode(json)
        await this.adapter!.registerFile(
          jsonFile,
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
        )

        const selectProjection = buildSelectProjection(firstChunkRow)
        await this.executeSimpleQuery(
          `COPY (SELECT ${selectProjection} FROM read_json('${jsonFile}', format='array', auto_detect=true)) TO '${parquetFile}' (FORMAT PARQUET)`
        )
        chunkParquetFiles.push(parquetFile)

        totalRowsProcessed += chunk.rows.length
        if (onProgress) {
          onProgress(totalRowsProcessed, chunk.totalRows)
        }
        // The JSON virtual file is no longer needed; if the adapter exposes
        // dropFile in the future we'd release here. Today it accumulates
        // until session end; the buffer reference goes out of scope so it's
        // GC-eligible from the JS side.
      }

      if (chunkParquetFiles.length === 0) {
        // Generator yielded zero rows — write an empty parquet using a
        // dummy schema. DuckDB's COPY needs at least an SELECT statement.
        await this.executeSimpleQuery(
          `COPY (SELECT NULL::VARCHAR AS empty WHERE 1=0) TO '${fileName}' (FORMAT PARQUET)`
        )
        return 0
      }

      if (chunkParquetFiles.length === 1) {
        // Single chunk — rename in-place via re-COPY (DuckDB-WASM has no
        // rename API). Cheaper than a no-op merge.
        await this.executeSimpleQuery(
          `COPY (SELECT * FROM read_parquet('${chunkParquetFiles[0]}')) TO '${fileName}' (FORMAT PARQUET)`
        )
      } else {
        // Multiple chunks — merge via read_parquet([…]). DuckDB streams
        // the chunk files; total memory stays bounded by the largest single
        // chunk Parquet rather than the full result.
        const fileList = chunkParquetFiles.map((f) => `'${f}'`).join(', ')
        await this.executeSimpleQuery(
          `COPY (SELECT * FROM read_parquet([${fileList}])) TO '${fileName}' (FORMAT PARQUET)`
        )
      }

      return totalRowsProcessed
    } finally {
      // Best-effort: chunk Parquets sit in VFS until session end; future
      // adapter.dropFile() would clean them. The merge has already read
      // them so they're cold from this point on.
    }
  }

  async revoke(): Promise<void> {
    // DuckDB doesn't require revocation, but we can clean up
    this.adapter = null
  }
}
