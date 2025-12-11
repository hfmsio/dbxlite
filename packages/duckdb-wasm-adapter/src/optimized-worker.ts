// Optimized DuckDB Worker with better memory management and chunking
// Prevents stack overflow and memory issues with large datasets

import { tableFromIPC } from 'apache-arrow';
import type * as DuckDBTypes from '@duckdb/duckdb-wasm';

let duckdb: typeof DuckDBTypes | null = null;
let db: DuckDBTypes.AsyncDuckDB | null = null;
let conn: DuckDBTypes.AsyncDuckDBConnection | null = null;
let initBaseUrls: string[] = [];

// Streaming configuration
const MAX_OUTSTANDING = 2; // Reduce to prevent memory buildup
const BATCH_SIZE = 1000; // Process rows in smaller batches
const MEMORY_CHECK_INTERVAL = 5000; // Check memory every 5 seconds
const MAX_MEMORY_MB = 1024; // Max memory usage before forcing GC

const outstanding = new Map<string, number>();
const activeQueries = new Map<string, boolean>();

/**
 * Safely convert BigInt to Number without stack overflow
 * Uses iterative approach instead of recursive
 */
function convertBigIntToNumberSafe(obj: unknown): unknown {
  const stack: Array<{ obj: unknown; parent: unknown[] | Record<string, unknown>; key: string | number }> = [];
  const visited = new WeakSet<object>();

  // Clone the root object
  let result: unknown[] | Record<string, unknown> | unknown;
  if (Array.isArray(obj)) {
    result = [];
  } else if (obj !== null && typeof obj === 'object') {
    result = {};
  } else if (typeof obj === 'bigint') {
    return Number(obj);
  } else {
    return obj;
  }

  stack.push({ obj, parent: result as unknown[] | Record<string, unknown>, key: 0 });

  while (stack.length > 0) {
    const { obj: current, parent, key } = stack.pop()!;

    // Handle circular references
    if (current !== null && typeof current === 'object') {
      if (visited.has(current)) {
        (parent as Record<string | number, unknown>)[key] = '[Circular]';
        continue;
      }
      visited.add(current);
    }

    if (current === null || current === undefined) {
      (parent as Record<string | number, unknown>)[key] = current;
    } else if (typeof current === 'bigint') {
      (parent as Record<string | number, unknown>)[key] = Number(current);
    } else if (Array.isArray(current)) {
      (parent as Record<string | number, unknown>)[key] = [];
      for (let i = 0; i < current.length; i++) {
        stack.push({ obj: current[i], parent: (parent as Record<string | number, unknown>)[key] as unknown[] | Record<string, unknown>, key: i });
      }
    } else if (typeof current === 'object') {
      (parent as Record<string | number, unknown>)[key] = {};
      for (const k in current) {
        if (Object.prototype.hasOwnProperty.call(current, k)) {
          stack.push({ obj: (current as Record<string, unknown>)[k], parent: (parent as Record<string | number, unknown>)[key] as unknown[] | Record<string, unknown>, key: k });
        }
      }
    } else {
      (parent as Record<string | number, unknown>)[key] = current;
    }
  }

  return result;
}

/**
 * Process rows in batches to prevent memory buildup
 */
async function* processRowsBatched(rows: unknown[], batchSize: number = BATCH_SIZE): AsyncGenerator<unknown[]> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, Math.min(i + batchSize, rows.length));

    // Convert BigInts in batch
    const convertedBatch = batch.map(row => {
      try {
        return convertBigIntToNumberSafe(row);
      } catch {
        return row;
      }
    });

    yield convertedBatch;

    // Allow event loop to process other tasks
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Get current memory usage estimate
 */
function getMemoryUsage(): number {
  const perfWithMemory = performance as unknown as {memory?: {usedJSHeapSize: number}};
  if ('memory' in performance && perfWithMemory.memory) {
    return perfWithMemory.memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}

/**
 * Force garbage collection if available
 */
function tryGarbageCollect() {
  const globalWithGC = global as unknown as {gc?: () => void};
  if (typeof globalWithGC.gc === 'function') {
    globalWithGC.gc();
  }
}

/**
 * Reset database on fatal error
 */
async function resetDatabase() {
  try {
    if (conn) await conn.close();
    if (db) await db.terminate();
  } catch {
    // Reset error - non-critical
  }
  db = null;
  conn = null;
}

interface BundleConfig {
  mvp?: {
    mainModule: string;
    mainWorker: string;
  };
  eh?: {
    mainModule: string;
    mainWorker: string;
  };
  coi?: {
    mainModule: string;
    mainWorker: string;
    pthreadWorker: string;
  };
}

function createBundleConfig(baseUrl: string): BundleConfig {
  return {
    mvp: {
      mainModule: `${baseUrl}/duckdb-mvp.wasm`,
      mainWorker: `${baseUrl}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${baseUrl}/duckdb-eh.wasm`,
      mainWorker: `${baseUrl}/duckdb-browser-eh.worker.js`,
    },
    coi: {
      mainModule: `${baseUrl}/duckdb-coi.wasm`,
      mainWorker: `${baseUrl}/duckdb-browser-coi.worker.js`,
      pthreadWorker: `${baseUrl}/duckdb-browser-coi.pthread.worker.js`,
    },
  };
}

async function tryLoadBundles(bundleConfigs: BundleConfig[]): Promise<BundleConfig | null> {
  for(const config of bundleConfigs){
    try {
      const testUrl = config.eh?.mainModule || config.mvp?.mainModule;
      if (testUrl) {
        const res = await fetch(testUrl, { method: 'HEAD' });
        if(res.ok){
          return config;
        }
      }
    } catch(e){
      // ignore and try next
    }
  }
  return null;
}

/**
 * Stream query results with proper chunking and backpressure
 */
async function streamQuery(id: string, sql: string) {
  const startTime = Date.now();
  let rowCount = 0;
  let chunkCount = 0;
  let lastMemoryCheck = Date.now();

  try {
    activeQueries.set(id, true);
    outstanding.set(id, 0);

    // Use streaming API if available
    if (conn && typeof conn.queryArrowIPC === 'function') {
      const iterator = await conn.queryArrowIPC(sql);

      for await (const chunk of iterator) {
        // Check if query was cancelled
        if (!activeQueries.get(id)) {
          break;
        }

        // Memory management
        const now = Date.now();
        if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL) {
          const memUsage = getMemoryUsage();
          if (memUsage > MAX_MEMORY_MB) {
            tryGarbageCollect();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          lastMemoryCheck = now;
        }

        // Apply backpressure
        while ((outstanding.get(id) || 0) >= MAX_OUTSTANDING) {
          if (!activeQueries.get(id)) break;
          await new Promise(r => setTimeout(r, 50));
        }

        try {
          // Send chunk with transfer to avoid copying
          self.postMessage({ type: 'arrow', id, buffer: chunk }, [chunk]);
        } catch (e) {
          // Fallback without transfer
          self.postMessage({ type: 'arrow', id, buffer: chunk });
        }

        outstanding.set(id, (outstanding.get(id) || 0) + 1);
        chunkCount++;
      }
    } else {
      // Fallback for non-streaming API
      const res = await conn.query(sql);

      if (res.toArrow) {
        // Use Arrow format
        const arrowBuf = res.toArrow();
        self.postMessage({ type: 'arrow', id, buffer: arrowBuf }, [arrowBuf]);
      } else {
        // Process rows in batches
        const rows = res.toArray ? res.toArray() : res;
        rowCount = rows.length;

        // Process and send in batches
        for await (const batch of processRowsBatched(rows, BATCH_SIZE)) {
          // Check if cancelled
          if (!activeQueries.get(id)) break;

          // Apply backpressure
          while ((outstanding.get(id) || 0) >= MAX_OUTSTANDING) {
            if (!activeQueries.get(id)) break;
            await new Promise(r => setTimeout(r, 50));
          }

          // Send batch as JSON
          const txt = JSON.stringify(batch);
          const buf = new TextEncoder().encode(txt).buffer;

          try {
            self.postMessage({ type: 'arrow', id, buffer: buf }, [buf]);
          } catch (e) {
            // Fallback without transfer
            self.postMessage({ type: 'arrow', id, buffer: buf });
          }

          outstanding.set(id, (outstanding.get(id) || 0) + 1);
        }
      }
    }

  } catch (err) {
    const errorStr = String(err);

    // Check if this is a fatal error
    if (errorStr.includes('database has been invalidated') || errorStr.includes('FATAL Error')) {
      await resetDatabase();
      self.postMessage({
        type: 'error',
        id,
        error: 'Database encountered a fatal error and has been reset. Please reload the page.'
      });
    } else {
      self.postMessage({ type: 'error', id, error: errorStr });
    }
  } finally {
    self.postMessage({ type: 'done', id });
    outstanding.delete(id);
    activeQueries.delete(id);

    // Cleanup memory
    tryGarbageCollect();
  }
}

/**
 * Handle worker messages
 */
self.addEventListener('message', async (ev) => {
  const msg = ev.data;

  try {
    switch(msg.type) {
      case 'init':
        const baseUrls = msg.baseUrls || [];
        initBaseUrls = baseUrls;

        if(!duckdb){
          const _duck = await import('@duckdb/duckdb-wasm');
          duckdb = _duck;
        }

        const logger = new duckdb.ConsoleLogger();
        const bundleConfigs = baseUrls.map((url: string) => createBundleConfig(url));

        let selectedBundles = await tryLoadBundles(bundleConfigs);
        if (!selectedBundles) {
          selectedBundles = duckdb.getJsDelivrBundles();
        }

        const bundle = selectedBundles.eh || await duckdb.selectBundle(selectedBundles);
        const worker = new Worker(bundle.mainWorker!);

        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        conn = await db.connect();

        // Configure DuckDB for large datasets
        try {
          await conn.query("SET memory_limit='1GB'");
          await conn.query("SET threads=2");
          await conn.query("SET preserve_insertion_order=false");
        } catch {
          // Config warning - non-critical
        }

        self.postMessage({ type: 'inited' });
        break;

      case 'run':
        const { id, sql } = msg;
        streamQuery(id, sql);
        break;

      case 'ack':
        const cur = outstanding.get(msg.id) || 0;
        outstanding.set(msg.id, Math.max(0, cur - 1));
        break;

      case 'cancel':
        activeQueries.set(msg.id, false);
        self.postMessage({ type: 'cancelled', id: msg.id });
        break;

      case 'register_file':
        try {
          if (!db) throw new Error('Database not initialized');
          await db.registerFileBuffer(msg.fileName, new Uint8Array(msg.fileBuffer));
          self.postMessage({ type: 'file_registered', id: msg.id });
        } catch (err) {
          self.postMessage({ type: 'error', id: msg.id, error: String(err) });
        }
        break;

      case 'copy_file_to_buffer':
        try {
          if (!db) throw new Error('Database not initialized');
          const buffer = await db.copyFileToBuffer(msg.fileName);
          self.postMessage({ type: 'file_buffer', id: msg.id, buffer: buffer }, [buffer.buffer]);
        } catch (err) {
          self.postMessage({ type: 'error', id: msg.id, error: String(err) });
        }
        break;

      case 'get_memory_info':
        self.postMessage({
          type: 'memory_info',
          id: msg.id,
          usage: getMemoryUsage(),
          outstanding: outstanding.get(msg.queryId) || 0
        });
        break;

      default:
        // Unknown message type - ignore
    }
  } catch (e) {
    self.postMessage({ type: 'error', error: String(e) });
  }
});

// Monitor memory usage periodically
setInterval(() => {
  const memUsage = getMemoryUsage();
  if (memUsage > MAX_MEMORY_MB * 0.9) {
    tryGarbageCollect();
  }
}, 30000);