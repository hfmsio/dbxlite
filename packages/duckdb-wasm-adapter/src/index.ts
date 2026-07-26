// DuckDB adapter main API (uses worker). Parses Arrow IPC chunks and implements ACK-based backpressure.
import { createLogger } from './logger';

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

interface OpfsOutputRegisteredMessage extends WorkerMessageBase {
  type: 'opfs_output_registered';
}

interface OpfsOutputReleasedMessage extends WorkerMessageBase {
  type: 'opfs_output_released';
}

interface OpfsProbeResultMessage extends WorkerMessageBase {
  type: 'opfs_probe_result';
  ok: boolean;
}

interface FileDroppedMessage extends WorkerMessageBase {
  type: 'file_dropped';
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
  | FileDroppedMessage
  | FileBufferMessage
  | JsonSchemaMessage
  | JsonMessage
  | ArrowMessage
  | DoneMessage
  | CancelledMessage
  | QueryStatsMessage
  | OpfsOutputRegisteredMessage
  | OpfsOutputReleasedMessage
  | OpfsProbeResultMessage;

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
        console.error('[Worker] Error event:', e, 'filename:', e.filename, 'lineno:', e.lineno, 'colno:', e.colno)
        reject(new Error(`Worker error: ${e.message || 'Unknown error'} at ${e.filename}:${e.lineno}:${e.colno}`))
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

  async dropFile(fileName: string): Promise<void> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `drop_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if(msg.type === 'file_dropped') {
          this.handlers.delete(id)
          resolve()
        } else if(msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage({ type: 'drop_file', id, fileName })
    })
  }

  /**
   * Round-trip a tiny Parquet through OPFS to decide, once, whether the OPFS
   * export path works in this browser. Cached: the probe only runs once per
   * adapter instance. Never rejects — resolves false on any failure so callers
   * fall back cleanly.
   */
  private opfsProbe: Promise<boolean> | null = null
  async probeOpfsExport(): Promise<boolean> {
    if (this.opfsProbe) return this.opfsProbe
    this.opfsProbe = (async () => {
      // Cheap main-thread gate before paying for a worker round trip.
      if (
        typeof navigator === 'undefined' ||
        !navigator.storage?.getDirectory ||
        !(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
      ) {
        return false
      }
      if(!this.worker) await this.init()
      return new Promise<boolean>((resolve) => {
        const id = `opfsprobe_${Date.now()}`
        const handler = (msg: WorkerMessage) => {
          if (msg.type === 'opfs_probe_result') {
            this.handlers.delete(id)
            resolve((msg as OpfsProbeResultMessage).ok)
          } else if (msg.type === 'error') {
            this.handlers.delete(id)
            resolve(false)
          }
        }
        this.handlers.set(id, handler)
        this.worker!.postMessage({ type: 'opfs_probe', id })
      })
    })().catch(() => false)
    return this.opfsProbe
  }

  /** Register an OPFS file as a writable COPY target. */
  async registerOpfsOutput(fileName: string): Promise<void> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `opfsreg_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if (msg.type === 'opfs_output_registered') {
          this.handlers.delete(id)
          resolve()
        } else if (msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage({ type: 'opfs_register_output', id, fileName })
    })
  }

  /** Flush + release DuckDB's OPFS handle so the file is complete and readable. */
  async releaseOpfsOutput(fileName: string): Promise<void> {
    if(!this.worker) await this.init()
    return new Promise((resolve, reject) => {
      const id = `opfsrel_${Date.now()}`
      const handler = (msg: WorkerMessage) => {
        if (msg.type === 'opfs_output_released') {
          this.handlers.delete(id)
          resolve()
        } else if (msg.type === 'error') {
          this.handlers.delete(id)
          reject(new Error((msg as ErrorMessage).error))
        }
      }
      this.handlers.set(id, handler)
      this.worker!.postMessage({ type: 'opfs_release_output', id, fileName })
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
      } else if(msg.type === 'query-stats'){
        onStats && onStats((msg as QueryStatsMessage).stats)
      } else if(msg.type === 'error'){
        // Terminal: drop the handler so it doesn't leak (and its closure over
        // onRow → the consumer's row buffer) for the life of the session.
        this.handlers.delete(id)
        onError && onError((msg as ErrorMessage).error)
      } else if(msg.type === 'done'){
        this.handlers.delete(id)
        onDone && onDone()
      } else if(msg.type === 'cancelled'){
        // Terminal. The worker honours the cancel (stops posting chunks and
        // releases its ACK backpressure), so dropping the handler here can't
        // deadlock the worker on un-ACKed chunks.
        this.handlers.delete(id)
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
