// DuckDB adapter main API (uses worker). Parses Arrow IPC chunks and implements ACK-based backpressure.
import { tableFromIPC } from 'apache-arrow';
import { createLogger } from './logger';
import { decodeArrowColumnValue } from './arrow-value-decoder';

const logger = createLogger('DuckDBWorkerAdapter');

// Worker message types
interface WorkerMessageBase {
  type: string;
  id?: string;
}

interface InitedMessage extends WorkerMessageBase {
  type: 'inited';
}

interface ErrorMessage extends WorkerMessageBase {
  type: 'error';
  error: string;
}

interface FileRegisteredMessage extends WorkerMessageBase {
  type: 'file_registered';
  id: string;
}

interface FileBufferMessage extends WorkerMessageBase {
  type: 'file_buffer';
  id: string;
  buffer: Uint8Array;
}

interface JsonSchemaMessage extends WorkerMessageBase {
  type: 'json-schema';
  id: string;
  buffer: ArrayBuffer;
}

interface JsonMessage extends WorkerMessageBase {
  type: 'json';
  id: string;
  buffer: ArrayBuffer;
}

interface ArrowMessage extends WorkerMessageBase {
  type: 'arrow';
  id: string;
  buffer: Uint8Array;
}

interface DoneMessage extends WorkerMessageBase {
  type: 'done';
  id: string;
}

interface CancelledMessage extends WorkerMessageBase {
  type: 'cancelled';
  id: string;
}

export interface QueryStats {
  totalRows: number;
  totalBytes: number;
  largeRowCount: number;
  maxRowSize: number;
  chunkCount: number;
  avgRowSize: number;
}

interface QueryStatsMessage extends WorkerMessageBase {
  type: 'query-stats';
  id: string;
  stats: QueryStats;
}

type WorkerMessage =
  | InitedMessage
  | ErrorMessage
  | FileRegisteredMessage
  | FileBufferMessage
  | JsonSchemaMessage
  | JsonMessage
  | ArrowMessage
  | DoneMessage
  | CancelledMessage
  | QueryStatsMessage;

const ADAPTER_VERSION = '1.0.2-decimal-fix';
// Version logged only in development
if (import.meta.env?.DEV) {
  logger.debug('Module loaded', { version: ADAPTER_VERSION });
}

export class DuckDBWorkerAdapter {
  private worker: Worker | null = null
  private handlers = new Map<string, (msg: WorkerMessage) => void>()
  private initPromise: Promise<void> | null = null

  async init(){
    if(this.worker) return
    if(this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e) => {
        const msg = e.data as WorkerMessage
        if(msg.type === 'inited'){
          resolve()
        } else if(msg.type === 'error' && !msg.id){
          reject(new Error((msg as ErrorMessage).error || 'Worker initialization failed'))
        } else if(msg.id && this.handlers.has(msg.id)){
          this.handlers.get(msg.id)!(msg)
        } else if (import.meta.env?.DEV) {
          logger.debug('Unhandled worker message', { type: msg.type })
        }
      }
      this.worker.onerror = (e) => {
        reject(new Error(`Worker error: ${e.message}`))
      }
      // Provide base URLs for bundle loading: prefer local /duckdb/, fallback handled by worker
      const localBundleBase = `${location.origin}/duckdb`
      this.worker.postMessage({ type: 'init', baseUrls: [localBundleBase] })
    })

    await this.initPromise
  }

  async registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `register_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if(msg.type === 'file_registered') {
          this.handlers.delete(id)
          resolve()
        } else if(msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage(
        { type: 'register_file', id, fileName, fileBuffer },
        [fileBuffer]
      )
    })
  }

  async registerFileHandle(fileName: string, file: File): Promise<void> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `register_handle_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if(msg.type === 'file_registered') {
          this.handlers.delete(id)
          resolve()
        } else if(msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage({ type: 'register_file_handle', id, fileName, file })
    })
  }

  async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `copy_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if(msg.type === 'file_buffer') {
          this.handlers.delete(id)
          resolve((msg as FileBufferMessage).buffer)
        } else if(msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage({ type: 'copy_file_to_buffer', id, fileName })
    })
  }

  async runQuery(id: string, sql: string, onRow: (row:unknown)=>void, onDone?: ()=>void, onError?: (e:unknown)=>void, onSchema?: (schema: unknown)=>void, onStats?: (stats: QueryStats)=>void){
    if(!this.worker) await this.init()
    let schemaExtracted = false
    // handler translates worker messages into row-level callbacks and sends ACKs
    const handler = (msg: WorkerMessage) => {
      if(msg.type === 'json-schema' && msg.buffer){
        // Handle schema sent separately for JSON fallback
        try {
          const txt = new TextDecoder().decode(msg.buffer)
          const schema = JSON.parse(txt)
          if (!schemaExtracted && onSchema) {
            onSchema(schema)
            schemaExtracted = true
          }
        } catch {
          // JSON schema parse failed - non-critical
        }
        // Send ACK
        this.worker.postMessage({ type: 'ack', id: msg.id })
      } else if(msg.type === 'json' && msg.buffer){
        // Handle JSON data directly without trying Arrow IPC parsing
        try {
          const txt = new TextDecoder().decode(msg.buffer)
          const rows = JSON.parse(txt)
          for(const r of rows) onRow(r)
        } catch {
          // JSON parse failed - non-critical
        }
        // Send ACK
        this.worker.postMessage({ type: 'ack', id: msg.id })
      } else if(msg.type === 'arrow' && msg.buffer){
        try {
          // Try parse as Arrow IPC
          try {
            const table = tableFromIPC(msg.buffer)

            // Extract schema from the first chunk and send to callback
            if (!schemaExtracted && onSchema && table.schema) {
              const columns = table.schema.fields.map((field) => ({
                name: field.name,
                type: field.type.toString(),
                nullable: field.nullable
              }))
              onSchema(columns)
              schemaExtracted = true
            }

            // iterate rows
            let rowIndex = 0
            for(const row of table) {
              // Convert Arrow row to plain JavaScript object
              // Apache Arrow automatically converts Date32/Date64/Timestamp to JavaScript Date objects
              const plainRow: Record<string, unknown> = {}
              for (const field of table.schema.fields) {
                let value = row[field.name]

                // Access the column vector for decoding complex/decimal types
                const columnIndex = table.schema.fields.indexOf(field)
                const column = table.getChildAt(columnIndex)

                // Handle DECIMAL types: Arrow returns them as objects, and row[field.name]
                // triggers .toJSON() which returns a quoted string like "19.99"
                // We need to use .toString() instead to get the numeric string without quotes
                const fieldTypeName = field.type.toString().toLowerCase()

                if (fieldTypeName.includes('decimal')) {
                  if (column) {
                    const decimalValue = column.get(rowIndex)
                    if (decimalValue !== null && decimalValue !== undefined) {
                      // Use toString() to get numeric string without quotes
                      value = decimalValue.toString()
                    }
                  }
                } else if (fieldTypeName.includes('dictionary')) {
                  // Dictionary/ENUM types: The row[field.name] access through Arrow's StructRow proxy
                  // should resolve dictionary indices to actual values. However, if we get a non-primitive,
                  // use JSON round-trip to ensure proper resolution.
                  if (value !== null && value !== undefined && typeof value === 'object') {
                    // Dictionary value is an object - try to resolve via toJSON or toString
                    if (typeof (value as {toJSON?: () => unknown}).toJSON === 'function') {
                      value = (value as {toJSON: () => unknown}).toJSON()
                    } else if (typeof (value as {toString?: () => string}).toString === 'function') {
                      const strVal = (value as {toString: () => string}).toString()
                      if (!strVal.startsWith('[object ')) {
                        value = strVal
                      }
                    }
                    // If still an object, try JSON round-trip via the whole row
                    if (typeof value === 'object') {
                      try {
                        const rowJson = JSON.parse(JSON.stringify(row))
                        value = rowJson[field.name]
                      } catch {
                        // JSON resolution failed - keep original value
                      }
                    }
                  }
                } else if (column) {
                  // Decode Arrow LIST/STRUCT/MAP/UNION into plain JS values
                  value = decodeArrowColumnValue(column, rowIndex)
                }

                plainRow[field.name] = value
              }
              onRow(plainRow)
              rowIndex++
            }
          } catch(parseErr){
            // Fallback: treat buffer as JSON text
            try {
              const txt = new TextDecoder().decode(msg.buffer)
              const rows = JSON.parse(txt)
              for(const r of rows) onRow(r)
            } catch {
              // JSON fallback parse also failed
            }
          }
        } catch {
          // Processing chunk failed - will be handled by caller
        } finally {
          // ACK the chunk so worker can send more
          try { this.worker!.postMessage({ type: 'ack', id }) } catch(e){}
        }
      } else if(msg.type === 'query-stats'){
        onStats && onStats((msg as QueryStatsMessage).stats)
      } else if(msg.type === 'error'){
        onError && onError((msg as ErrorMessage).error)
      } else if(msg.type === 'done'){
        onDone && onDone()
      } else if(msg.type === 'cancelled'){
        onError && onError(new Error('cancelled'))
      }
    }
    this.handlers.set(id, handler)
    this.worker!.postMessage({ type: 'run', id, sql })
  }

  async cancel(id: string){
    this.worker?.postMessage({ type: 'cancel', id })
  }
}
