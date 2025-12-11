import { BaseConnector, ConnectionConfig, QueryOptions, QueryChunk, Schema, TableInfo, ColumnInfo, Row } from './base'
import { DuckDBWorkerAdapter } from '@ide/duckdb-adapter'

/**
 * Streaming DuckDB connector that doesn't collect all rows in memory
 * Supports true pagination and virtual scrolling for millions of rows
 */
export class StreamingDuckDBConnector implements BaseConnector {
  readonly id = 'streaming-duckdb'
  private adapter: DuckDBWorkerAdapter | null = null
  private queryCounter = 0
  private activeQueries = new Map<string, { cancel: () => void }>()

  async connect(config: ConnectionConfig): Promise<void> {
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

  async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }
    return await this.adapter!.copyFileToBuffer(fileName)
  }

  /**
   * Stream query results without collecting into memory
   * Yields chunks as they arrive from DuckDB worker
   */
  async *query(sql: string, opts?: QueryOptions): AsyncGenerator<QueryChunk> {
    if (!this.adapter) {
      await this.connect({ options: {} })
    }

    const queryId = `query-${++this.queryCounter}`
    const chunkSize = opts?.chunkSize || 1000
    let buffer: Row[] = []
    let cancelled = false

    // Create a queue for incoming rows
    const rowQueue: Row[] = []
    let resolveNext: ((value: IteratorResult<QueryChunk>) => void) | null = null
    let rejectNext: ((error: unknown) => void) | null = null
    let queryComplete = false
    let queryError: unknown = null

    // Setup cancellation
    const cancelFn = () => {
      cancelled = true
      if (this.adapter) {
        this.adapter.cancel(queryId)
      }
      this.activeQueries.delete(queryId)
    }
    this.activeQueries.set(queryId, { cancel: cancelFn })

    // Start the query
    this.adapter!.runQuery(
      queryId,
      sql,
      // onRow callback - stream rows as they arrive
      (row: Row) => {
        if (cancelled) return

        rowQueue.push(row)

        // If we have enough rows for a chunk, process them
        if (rowQueue.length >= chunkSize && resolveNext) {
          const chunk = rowQueue.splice(0, chunkSize)
          const resolve = resolveNext
          resolveNext = null
          rejectNext = null
          resolve({ value: { rows: chunk, done: false }, done: false })
        }
      },
      // onDone callback
      () => {
        queryComplete = true
        this.activeQueries.delete(queryId)

        // If we have a pending resolve, send remaining rows
        if (resolveNext) {
          const resolve = resolveNext
          resolveNext = null
          rejectNext = null

          if (rowQueue.length > 0) {
            const remaining = rowQueue.splice(0, rowQueue.length)
            resolve({ value: { rows: remaining, done: true }, done: false })
          } else {
            resolve({ done: true, value: undefined })
          }
        }
      },
      // onError callback
      (error: unknown) => {
        queryError = error
        this.activeQueries.delete(queryId)

        if (rejectNext) {
          const reject = rejectNext
          resolveNext = null
          rejectNext = null
          reject(error)
        }
      }
    )

    try {
      // Yield chunks as they become available
      while (!queryComplete || rowQueue.length > 0) {
        if (cancelled) break

        // If we have enough buffered rows, yield a chunk
        if (rowQueue.length >= chunkSize) {
          const chunk = rowQueue.splice(0, chunkSize)
          yield { rows: chunk, done: false }
        } else if (queryComplete && rowQueue.length > 0) {
          // Query is done and we have remaining rows
          const remaining = rowQueue.splice(0, rowQueue.length)
          yield { rows: remaining, done: true }
          break
        } else if (!queryComplete) {
          // Wait for more rows
          await new Promise<QueryChunk>((resolve, reject) => {
            resolveNext = resolve as unknown as ((value: IteratorResult<QueryChunk>) => void)
            rejectNext = reject

            // Check again in case rows arrived while setting up promise
            if (rowQueue.length >= chunkSize) {
              const chunk = rowQueue.splice(0, chunkSize)
              resolveNext = null
              rejectNext = null
              resolve({ rows: chunk, done: false })
            } else if (queryComplete) {
              resolveNext = null
              rejectNext = null
              if (rowQueue.length > 0) {
                const remaining = rowQueue.splice(0, rowQueue.length)
                resolve({ rows: remaining, done: true })
              } else {
                resolve({ rows: [], done: true })
              }
            }
          }).then(chunk => {
            if (chunk.rows.length > 0) {
              return chunk
            }
          }).catch(error => {
            throw error
          })
        } else {
          // Query complete and no rows left
          break
        }
      }

      if (queryError) {
        throw queryError
      }
    } finally {
      this.activeQueries.delete(queryId)
    }
  }

  async cancel(queryId: string): Promise<void> {
    const query = this.activeQueries.get(queryId)
    if (query) {
      query.cancel()
    }
  }

  async cancelAll(): Promise<void> {
    for (const [queryId, query] of this.activeQueries) {
      query.cancel()
    }
    this.activeQueries.clear()
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
      } catch {
        // Failed to get columns - non-critical, table still usable
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

  async revoke(): Promise<void> {
    await this.cancelAll()
    this.adapter = null
  }

  /**
   * Execute a paginated query using LIMIT and OFFSET
   */
  async *paginatedQuery(
    sql: string,
    pageSize: number = 1000,
    maxRows?: number
  ): AsyncGenerator<QueryChunk> {
    let offset = 0
    let totalRowsFetched = 0
    const limit = pageSize

    while (true) {
      // Add LIMIT and OFFSET to the query
      const paginatedSql = `${sql} LIMIT ${limit} OFFSET ${offset}`

      let hasRows = false
      for await (const chunk of this.query(paginatedSql)) {
        hasRows = true
        totalRowsFetched += chunk.rows.length

        yield chunk

        // Stop if we've reached maxRows
        if (maxRows && totalRowsFetched >= maxRows) {
          return
        }
      }

      // If no rows were returned, we've reached the end
      if (!hasRows) {
        break
      }

      offset += limit
    }
  }

  /**
   * Get estimated row count without loading all data
   */
  async getRowCount(sql: string): Promise<number> {
    const countSql = `SELECT COUNT(*) as count FROM (${sql}) t`

    try {
      for await (const chunk of this.query(countSql)) {
        if (chunk.rows.length > 0) {
          const row = chunk.rows[0] as Record<string, unknown>
          return (row.count as number) || (row[0] as number) || 0
        }
      }
      return 0
    } catch {
      // Row count query failed
      return -1
    }
  }

  /**
   * Optimized method for sampling data (for schema inference, previews)
   */
  async *sampleQuery(sql: string, sampleSize: number = 100): AsyncGenerator<QueryChunk> {
    // Use TABLESAMPLE or LIMIT for efficient sampling
    const sampleSql = `${sql} LIMIT ${sampleSize}`
    yield* this.query(sampleSql)
  }
}