// DuckDB Worker implementation with duckdb-wasm + Arrow IPC streaming and simple backpressure via ACKs.
// This worker now accepts bundleUrls in the 'init' message and will attempt to use them in order.

import { tableFromIPC, RecordBatchStreamWriter, Table } from 'apache-arrow';
import type * as DuckDBTypes from '@duckdb/duckdb-wasm';
import {
	uint32ArrayToNumeric,
	bigInt64ToNumeric,
	bigUint64ToNumeric,
	validateNumeric,
	trackConversionError,
} from './type-converters';

let duckdb: typeof DuckDBTypes | null = null;
let db: DuckDBTypes.AsyncDuckDB | null = null;
let conn: DuckDBTypes.AsyncDuckDBConnection | null = null;
let initBaseUrls: string[] = [];
let DuckDBDataProtocol: typeof DuckDBTypes.DuckDBDataProtocol | null = null; // Will be imported dynamically with duckdb

const MAX_OUTSTANDING = 2;  // Reduced from 4 to limit memory pressure
const outstanding = new Map();

// Attempt garbage collection if available (V8 with --expose-gc flag)
function tryGarbageCollect() {
  const g = globalThis as { gc?: () => void };
  if (typeof g.gc === 'function') {
    g.gc();
  }
}

// Periodic garbage collection every 15 seconds
setInterval(() => {
  tryGarbageCollect();
}, 15000);

// Convert BigInt to Number (or String for large values) in query results to avoid JSON serialization errors
// Uses iterative approach with explicit stack to prevent stack overflow with deeply nested types
// fieldScales: optional map of field name -> decimal scale for proper decimal formatting
// fieldTypes: optional map of field name -> type string for type-specific handling (e.g., Interval)
// intervalRawData: optional map of field name -> raw Int32Array data (workaround for Arrow toArray() bug)
// rowIndex: current row index for looking up interval data
function convertBigIntToNumber(obj: unknown, fieldScales?: Map<string, number>, fieldTypes?: Map<string, string>, intervalRawData?: Map<string, Int32Array>, rowIndex?: number): unknown {
  if (obj === null || obj === undefined) return obj;

  // Handle Arrow StructRow Proxy objects - they have toJSON() that resolves Dictionary/ENUM values
  // When accessing row[fieldName] directly, Dictionary fields may return unresolved accessor objects
  // Check if there are Dictionary fields that need resolution via JSON round-trip
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && fieldTypes) {
    // Check if any field is a Dictionary type (used for ENUM)
    let hasDictionaryField = false;
    for (const fieldType of fieldTypes.values()) {
      if (fieldType.toLowerCase().includes('dictionary')) {
        hasDictionaryField = true;
        break;
      }
    }

    if (hasDictionaryField) {
      try {
        // JSON.stringify calls toJSON() internally which resolves Dictionary/ENUM values
        const jsonStr = JSON.stringify(obj);
        const plainObj = JSON.parse(jsonStr);
        // Return the plain object directly - JSON already resolved all Dictionary values
        // Don't recurse to avoid infinite loop (plainObj is a plain Object)
        return plainObj;
      } catch {
        // Fall through to normal processing if JSON round-trip fails
      }
    }
  }

  if (typeof obj === 'bigint') {
    // Preserve precision for large integers by keeping as string
    if (obj > Number.MAX_SAFE_INTEGER || obj < Number.MIN_SAFE_INTEGER) {
      return obj.toString();
    }
    return Number(obj);
  }
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj !== 'object') return obj;

  // Handle Decimal objects at root level - convert to Number (or String for large values)
  const rootConstructor = (obj as {constructor?: {name?: string}}).constructor?.name;
  if (rootConstructor?.includes('Decimal')) {
    const strValue = (obj as {toString: () => string}).toString();
    try {
      const bigIntValue = BigInt(strValue);
      if (bigIntValue > BigInt(Number.MAX_SAFE_INTEGER) || bigIntValue < BigInt(Number.MIN_SAFE_INTEGER)) {
        return strValue;
      }
    } catch {
      // Not a valid integer, convert to Number
    }
    return Number(strValue);
  }

  // Note: Int32Array at root level is NOT converted to Interval here
  // because we don't have field type info. Int32Array could be a regular integer array.
  // Interval conversion only happens in the stack loop when fieldTypes confirms it.

  // Iterative processing with explicit stack
  const isRootArray = Array.isArray(obj);
  const root: unknown[] | Record<string, unknown> = isRootArray ? [] : {};

  // Stack entries: [source, target, key, fieldName]
  type StackEntry = [unknown, unknown[] | Record<string, unknown>, string | number, string | undefined];
  const stack: StackEntry[] = [];

  // Initialize stack
  if (isRootArray) {
    for (let i = (obj as unknown[]).length - 1; i >= 0; i--) {
      stack.push([(obj as unknown[])[i], root as unknown[], i, undefined]);
    }
  } else {
    const keys = Object.keys(obj as Record<string, unknown>);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      stack.push([(obj as Record<string, unknown>)[key], root as Record<string, unknown>, key, key]);
    }
  }

  while (stack.length > 0) {
    const [value, target, key, fieldName] = stack.pop()!;

    // Handle primitives
    if (value === null || value === undefined) {
      (target as Record<string | number, unknown>)[key] = value;
      continue;
    }
    if (typeof value === 'bigint') {
      // Preserve precision for large integers by keeping as string
      if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
        (target as Record<string | number, unknown>)[key] = value.toString();
      } else {
        (target as Record<string | number, unknown>)[key] = Number(value);
      }
      continue;
    }
    if (value instanceof Date) {
      (target as Record<string | number, unknown>)[key] = value.toISOString();
      continue;
    }
    if (typeof value !== 'object') {
      (target as Record<string | number, unknown>)[key] = value;
      continue;
    }

    // Handle Dictionary/ENUM types - check field type and use toString()
    // Dictionary values may be objects that need string conversion
    if (fieldName && fieldTypes?.has(fieldName)) {
      const fieldType = fieldTypes.get(fieldName)!;
      if (fieldType.toLowerCase().includes('dictionary')) {
        // Dictionary/ENUM values - convert to string representation
        const strValue = String(value);
        // Avoid "[object Object]" - use the actual toString result
        if (strValue && !strValue.startsWith('[object ')) {
          (target as Record<string | number, unknown>)[key] = strValue;
          continue;
        }
      }
    }

    // Handle Decimal objects - convert to Number (or String for large values) for proper sorting
    const constructorName = (value as {constructor?: {name?: string}}).constructor?.name;
    if (constructorName?.includes('Decimal')) {
      const unscaledStr = (value as {toString: () => string}).toString();

      // Apply scale and convert to Number
      if (fieldName && fieldScales?.has(fieldName)) {
        const scale = fieldScales.get(fieldName)!;
        if (scale > 0) {
          // Convert unscaled integer to scaled number
          // e.g., unscaled "1050" with scale 2 → 10.50
          const unscaled = Number(unscaledStr);
          const divisor = Math.pow(10, scale);
          (target as Record<string | number, unknown>)[key] = unscaled / divisor;
          continue;
        }
      }
      // No scale info - check if it's a large integer (HUGEINT) that would lose precision
      // Keep as string if larger than MAX_SAFE_INTEGER (check via BigInt to avoid precision loss)
      try {
        const bigIntValue = BigInt(unscaledStr);
        if (bigIntValue > BigInt(Number.MAX_SAFE_INTEGER) || bigIntValue < BigInt(Number.MIN_SAFE_INTEGER)) {
          (target as Record<string | number, unknown>)[key] = unscaledStr;
        } else {
          (target as Record<string | number, unknown>)[key] = Number(unscaledStr);
        }
      } catch {
        // Fallback to Number if BigInt parsing fails
        (target as Record<string | number, unknown>)[key] = Number(unscaledStr);
      }
      continue;
    }

    // Handle BLOB/Binary data (Uint8Array) - convert to hex string
    if (value instanceof Uint8Array) {
      const hexStr = Array.from(value)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      (target as Record<string | number, unknown>)[key] = `0x${hexStr}`;
      continue;
    }

    // Handle Uint32Array (HUGEINT/INT128 from DuckDB) - convert to Number
    // This MUST come before toJSON check because Arrow's Decimal wrapper has toJSON() that returns quoted strings
    if (value instanceof Uint32Array) {
      const numeric = uint32ArrayToNumeric(value);
      if (typeof numeric === 'bigint') {
        (target as Record<string | number, unknown>)[key] = Number(numeric);
      } else {
        (target as Record<string | number, unknown>)[key] = numeric; // string for large values
      }
      continue;
    }

    // Handle BigInt64Array (BIGINT - 64-bit signed integer)
    if (value instanceof BigInt64Array) {
      if (value.length === 1) {
        (target as Record<string | number, unknown>)[key] = bigInt64ToNumeric(value[0]);
      } else {
        (target as Record<string | number, unknown>)[key] = Array.from(value).map((v) => bigInt64ToNumeric(v));
      }
      continue;
    }

    // Handle BigUint64Array (UBIGINT - 64-bit unsigned integer)
    if (value instanceof BigUint64Array) {
      if (value.length === 1) {
        (target as Record<string | number, unknown>)[key] = bigUint64ToNumeric(value[0]);
      } else {
        (target as Record<string | number, unknown>)[key] = Array.from(value).map((v) => bigUint64ToNumeric(v));
      }
      continue;
    }

    // Handle Float32Array (FLOAT/REAL - 32-bit float) with NaN validation
    if (value instanceof Float32Array) {
      if (value.length === 1) {
        const num = validateNumeric(value[0]);
        if (num === null) {
          trackConversionError('Float32_worker', value[0]);
        }
        (target as Record<string | number, unknown>)[key] = num;
      } else {
        (target as Record<string | number, unknown>)[key] = Array.from(value).map((v) => {
          const num = validateNumeric(v);
          if (num === null) {
            trackConversionError('Float32_worker', v);
          }
          return num;
        });
      }
      continue;
    }

    // Handle Float64Array (DOUBLE - 64-bit float) with NaN validation
    if (value instanceof Float64Array) {
      if (value.length === 1) {
        const num = validateNumeric(value[0]);
        if (num === null) {
          trackConversionError('Float64_worker', value[0]);
        }
        (target as Record<string | number, unknown>)[key] = num;
      } else {
        (target as Record<string | number, unknown>)[key] = Array.from(value).map((v) => {
          const num = validateNumeric(v);
          if (num === null) {
            trackConversionError('Float64_worker', v);
          }
          return num;
        });
      }
      continue;
    }

    // Handle Interval objects (Arrow MONTH_DAY_NANO type)
    // Only convert Int32Array to interval string if field type confirms it's an Interval
    // Otherwise Int32Array could be a regular integer array column
    const isIntervalField = fieldName && fieldTypes?.get(fieldName)?.toLowerCase().includes('interval');
    if (isIntervalField) {
      // Use raw interval data if available (workaround for Arrow toArray() bug)
      // Arrow's toArray() corrupts Interval<MONTH_DAY_NANO> - gives [years, months] instead of [months, days, nanos_lo, nanos_hi]
      let months = 0, days = 0, nanos = 0;

      const rawData = intervalRawData?.get(fieldName!);
      if (rawData && rowIndex !== undefined) {
        // Raw data format: 4 int32s per row [months, days, nanos_low, nanos_high]
        const offset = rowIndex * 4;
        if (offset + 3 < rawData.length) {
          months = rawData[offset];
          days = rawData[offset + 1];
          const nanosLow = rawData[offset + 2] >>> 0; // unsigned
          const nanosHigh = rawData[offset + 3];
          nanos = nanosLow + nanosHigh * 4294967296;
        }
      } else if (constructorName === 'Int32Array') {
        // Fallback: use corrupted toArray() data (only years/months available)
        const arr = value as Int32Array;
        if (arr.length >= 2) {
          // toArray() gives [years, months] not [total_months, days]
          months = arr[0] * 12 + arr[1]; // convert back to total months
        }
      }

      // Format as human-readable interval string
      const parts: string[] = [];

      // Handle months (convert to years + remaining months)
      if (months !== 0) {
        const years = Math.floor(Math.abs(months) / 12);
        const remainingMonths = Math.abs(months) % 12;
        const sign = months < 0 ? '-' : '';
        if (years !== 0) parts.push(`${sign}${years}y`);
        if (remainingMonths !== 0) parts.push(`${months < 0 && years === 0 ? '-' : ''}${remainingMonths}mo`);
      }

      // Handle days
      if (days !== 0) {
        const sign = days < 0 ? '-' : '';
        parts.push(`${sign}${Math.abs(days)}d`);
      }

      // Handle time (nanoseconds)
      if (nanos !== 0) {
        const absNanos = Math.abs(nanos);
        const sign = nanos < 0 ? '-' : '';
        const hours = Math.floor(absNanos / 3600_000_000_000);
        const minutes = Math.floor((absNanos % 3600_000_000_000) / 60_000_000_000);
        const remainingNanos = absNanos % 60_000_000_000;
        const seconds = Math.floor(remainingNanos / 1_000_000_000);
        const subSecondNanos = remainingNanos % 1_000_000_000;

        if (hours !== 0) parts.push(`${sign}${hours}h`);
        if (minutes !== 0) parts.push(`${minutes}m`);
        if (seconds !== 0 || subSecondNanos !== 0) {
          // Format with appropriate precision: ms (3), µs (6), or ns (9)
          if (subSecondNanos === 0) {
            parts.push(`${seconds}s`);
          } else if (subSecondNanos % 1_000_000 === 0) {
            // Milliseconds precision
            const ms = subSecondNanos / 1_000_000;
            parts.push(`${seconds}.${ms.toString().padStart(3, '0')}s`);
          } else if (subSecondNanos % 1_000 === 0) {
            // Microseconds precision
            const us = subSecondNanos / 1_000;
            parts.push(`${seconds}.${us.toString().padStart(6, '0')}s`);
          } else {
            // Nanoseconds precision
            parts.push(`${seconds}.${subSecondNanos.toString().padStart(9, '0')}s`);
          }
        }
      }

      (target as Record<string | number, unknown>)[key] = parts.length > 0 ? parts.join(' ') : '0';
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      const newArr: unknown[] = [];
      (target as Record<string | number, unknown>)[key] = newArr;
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push([value[i], newArr, i, fieldName]);
      }
      continue;
    }

    // Handle objects with toJSON method (Arrow Struct, Map, etc.)
    if (typeof (value as {toJSON?: () => unknown}).toJSON === 'function') {
      const jsonValue = (value as {toJSON: () => unknown}).toJSON();
      // Push the JSON result back onto the stack for recursive processing
      stack.push([jsonValue, target, key, fieldName]);
      continue;
    }

    // Handle Map objects (convert to plain object)
    if (value instanceof Map) {
      const mapObj: Record<string, unknown> = {};
      (target as Record<string | number, unknown>)[key] = mapObj;
      const entries = Array.from(value.entries());
      for (let i = entries.length - 1; i >= 0; i--) {
        const [mapKey, mapVal] = entries[i];
        stack.push([mapVal, mapObj, String(mapKey), String(mapKey)]);
      }
      continue;
    }

    // Handle objects
    const newObj: Record<string, unknown> = {};
    (target as Record<string | number, unknown>)[key] = newObj;
    const keys = Object.keys(value as Record<string, unknown>);
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      stack.push([(value as Record<string, unknown>)[k], newObj, k, k]);
    }
  }

  return root;
}

// Reset database on fatal error
async function resetDatabase() {
  try {
    if (conn) await conn.close();
    if (db) await db.terminate();
  } catch(e) {
    // Error during database reset (non-critical)
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
  // DuckDB WASM expects bundles with mainModule (WASM) and mainWorker (JS) URLs
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
  // Try each bundle configuration in order
  for(const config of bundleConfigs){
    try {
      // Test if the EH bundle (most commonly used) is available
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

self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  try {
    if(msg.type === 'init'){
      const baseUrls = msg.baseUrls || [];
      initBaseUrls = baseUrls; // Store for potential reinit

      // dynamic import
      if(!duckdb){
        const _duck = await import('@duckdb/duckdb-wasm');
        duckdb = _duck;
        DuckDBDataProtocol = _duck.DuckDBDataProtocol; // Import the protocol enum
      }
      const logger = new duckdb.ConsoleLogger();

      // Create bundle configurations for each base URL
      const bundleConfigs = baseUrls.map((url: string) => createBundleConfig(url));

      // Try to use custom bundles first, then fall back to default jsdelivr bundles
      let selectedBundles = await tryLoadBundles(bundleConfigs);
      if (!selectedBundles) {
        // Fall back to jsdelivr CDN bundles
        selectedBundles = duckdb.getJsDelivrBundles();
      }

      // Explicitly select EH bundle (no SharedArrayBuffer required) to avoid COI header issues
      // COI bundle requires COOP/COEP headers which aren't set in dev server
      const bundle = selectedBundles.eh || await duckdb.selectBundle(selectedBundles);

      // Create worker from bundle (v1.30+ API)
      const worker = new Worker(bundle.mainWorker!);
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // Configure DuckDB - using in-memory database
      // Note: OPFS persistence is experimental and has known issues:
      // - Issue #1576: temp_directory filesystem problems
      // - Issue #2096: COI worker OPFS crashes
      // See: https://github.com/duckdb/duckdb-wasm/discussions/1322
      let opfsAvailable = false;

      // Use in-memory database for reliability
      // OPFS can be enabled experimentally by changing path to 'opfs://dbx.db'
      // Note: Large operations (>2GB) may fail with OOM. Workaround: Use batched INSERTs or COPY TO Parquet

      await db.open({
        path: ':memory:',
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE
      });

      conn = await db.connect();

      // Configure memory limits
      // Note: temp_directory doesn't work in WASM without OPFS (Issue #1576)
      try {
        await conn.query("SET memory_limit=-1");  // Unlimited (use all available)
        await conn.query("SET threads=1");  // Single thread reduces fragmentation
        await conn.query("SET preserve_insertion_order=false");  // Memory optimization

        // Set timezone to user's local timezone so CURRENT_DATE/CURRENT_TIMESTAMP
        // return local date/time instead of UTC
        const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (localTimeZone) {
          await conn.query(`SET TimeZone='${localTimeZone}'`);
        }
      } catch (e) {
        console.warn('[DuckDB] Config failed (non-critical):', e);
      }

      // Note: DuckDB WASM auto-loads httpfs extension when needed for HTTPS URLs
      // Manual INSTALL/LOAD commands are not needed and may cause errors
      // The extension will be loaded automatically on first use

      self.postMessage({ type: 'inited', opfsPersistence: opfsAvailable });
    } else if(msg.type === 'run'){
      const { id, sql } = msg;
      outstanding.set(id, 0);
      try {
        // Try using send() with Arrow IPC protocol (DuckDB WASM 1.28+)
        // DISABLED: conn.send() with ARROW_IPC_STREAM causes errors, use queryArrowIPC() instead
        if (false && conn && typeof conn.send === 'function' && DuckDBDataProtocol) {
          // Using conn.send() with Arrow IPC protocol
          try {
            const arrowResult = await conn.send(sql, undefined, DuckDBDataProtocol.ARROW_IPC_STREAM);
            // Got Arrow IPC result

            // arrowResult is an AsyncRecordBatchStreamReader
            // We need to read all batches and convert to a Table
            const batches = [];
            for await (const batch of arrowResult) {
              batches.push(batch);
            }
            const table = new Table(batches);
            // Table converted

            // Serialize table to Arrow IPC format
            const writer = RecordBatchStreamWriter.writeAll(table);
            const buffer = await writer.toUint8Array();

            // Sending Arrow buffer
            // Send it directly to the main thread
            try {
              self.postMessage({ type: 'arrow', id, buffer: buffer }, [buffer.buffer]);
            } catch (e) {
              // If transfer fails, send without transfer
              self.postMessage({ type: 'arrow', id, buffer: buffer });
            }
          } catch (sendErr) {
            // send() with Arrow IPC failed, will throw
            throw sendErr;
          }
        } else if (conn && typeof conn.queryArrowIPC === 'function') {
          // Using queryArrowIPC
          const iterator = await conn.queryArrowIPC(sql);
          for await (const chunk of iterator) {
            while ((outstanding.get(id) || 0) >= MAX_OUTSTANDING) {
              await new Promise(r => setTimeout(r, 10));
            }
            try {
              self.postMessage({ type: 'arrow', id, buffer: chunk }, [chunk]);
            } catch (e) {
              self.postMessage({ type: 'arrow', id, buffer: chunk });
            }
            outstanding.set(id, (outstanding.get(id)||0) + 1);
          }
        } else {
          const res = await conn.query(sql);

          // Build a map of interval column raw data (workaround for Arrow toArray() bug)
          // Arrow's toArray() corrupts Interval<MONTH_DAY_NANO> values, so we read raw column data
          const intervalRawData = new Map<string, Int32Array>();
          if (res.schema?.fields) {
            for (const field of res.schema.fields) {
              if (field.type?.toString()?.includes('Interval')) {
                const col = res.getChild(field.name);
                if (col?.data?.[0]?.values instanceof Int32Array) {
                  intervalRawData.set(field.name, col.data[0].values);
                }
              }
            }
          }

          if (res.toArrow) {
            const arrowBuf = res.toArrow();
            self.postMessage({ type: 'arrow', id, buffer: arrowBuf }, [arrowBuf]);
          } else {
            // Extract schema from result if available
            let fieldScales: Map<string, number> | undefined;
            let fieldTypes: Map<string, string> | undefined;
            if (res.schema && res.schema.fields) {
              // Build maps of field name -> decimal scale and field name -> type string
              fieldScales = new Map();
              fieldTypes = new Map();
              const schema = res.schema.fields.map((field: {
                name: string;
                type: {toString: () => string; constructor?: {name?: string}; scale?: number};
                nullable: boolean;
              }) => {
                // Get type string - handle Arrow type objects
                let typeStr = 'UNKNOWN'
                if (field.type && typeof field.type.toString === 'function') {
                  typeStr = field.type.toString()
                }

                // Store field type for type-specific handling (e.g., Interval)
                fieldTypes!.set(field.name, typeStr);

                // Extract decimal scale if this is a decimal field
                if (field.type && field.type.constructor?.name?.includes('Decimal') && field.type.scale !== undefined) {
                  fieldScales!.set(field.name, field.type.scale);
                }

                return {
                  name: field.name,
                  type: typeStr,
                  nullable: field.nullable
                }
              })
              // Send schema separately
              const schemaTxt = JSON.stringify(schema)
              const schemaBuf = new TextEncoder().encode(schemaTxt).buffer
              self.postMessage({ type: 'json-schema', id, buffer: schemaBuf }, [schemaBuf])
            }

            const rows = res.toArray ? res.toArray() : res;
            // Size-based chunking: limit chunks to ~5MB to prevent browser crashes
            // duckdb_functions() has rows that are ~900KB each!
            const MAX_CHUNK_BYTES = 5 * 1024 * 1024; // 5MB max per chunk
            const MAX_ROWS_PER_CHUNK = 500; // Also cap row count
            const LARGE_ROW_THRESHOLD = 500000; // 500KB

            let currentChunk: unknown[] = [];
            let currentChunkSize = 0;

            // Stats tracking for transparency
            let totalBytes = 0;
            let largeRowCount = 0;
            let maxRowSize = 0;
            let chunkCount = 0;

            for (let i = 0; i < rows.length; i++) {
              try {
                const convertedRow = convertBigIntToNumber(rows[i], fieldScales, fieldTypes, intervalRawData, i);
                const rowStr = JSON.stringify(convertedRow);
                const rowSize = rowStr.length;

                // Track stats
                totalBytes += rowSize;
                if (rowSize > maxRowSize) maxRowSize = rowSize;
                if (rowSize > LARGE_ROW_THRESHOLD) {
                  largeRowCount++;
                }

                // Check if adding this row would exceed limits
                if (currentChunk.length > 0 &&
                    (currentChunkSize + rowSize > MAX_CHUNK_BYTES || currentChunk.length >= MAX_ROWS_PER_CHUNK)) {
                  // Send current chunk first
                  const txt = JSON.stringify(currentChunk);
                  const buf = new TextEncoder().encode(txt).buffer;
                  self.postMessage({ type: 'json', id, buffer: buf }, [buf]);
                  chunkCount++;
                  outstanding.set(id, (outstanding.get(id)||0) + 1);
                  while ((outstanding.get(id) || 0) >= MAX_OUTSTANDING) {
                    await new Promise(r => setTimeout(r, 10));
                  }
                  currentChunk = [];
                  currentChunkSize = 0;
                }

                currentChunk.push(convertedRow);
                currentChunkSize += rowSize;

              } catch (rowErr) {
                // Log detailed info about the failing row
                const row = rows[i];
                const rowKeys = row && typeof row === 'object' ? Object.keys(row) : [];
                console.error(`[DuckDB Worker] Row ${i} failed to serialize:`, {
                  error: String(rowErr),
                  errorName: (rowErr as Error).name,
                  rowKeys: rowKeys.slice(0, 10)
                });
                // Include placeholder for failed row
                currentChunk.push({ __error: `Row ${i} failed: ${(rowErr as Error).name}` });
                currentChunkSize += 100; // Approximate placeholder size
              }
            }

            // Send remaining rows
            if (currentChunk.length > 0) {
              const txt = JSON.stringify(currentChunk);
              const buf = new TextEncoder().encode(txt).buffer;
              self.postMessage({ type: 'json', id, buffer: buf }, [buf]);
              chunkCount++;
              outstanding.set(id, (outstanding.get(id)||0) + 1);
            }

            // Send query stats for transparency
            self.postMessage({
              type: 'query-stats',
              id,
              stats: {
                totalRows: rows.length,
                totalBytes,
                largeRowCount,
                maxRowSize,
                chunkCount,
                avgRowSize: rows.length > 0 ? Math.round(totalBytes / rows.length) : 0
              }
            });
          }
        }
      } catch (err) {
        const errorStr = String(err);

        // Check if this is a fatal error that invalidated the database
        if (errorStr.includes('database has been invalidated') || errorStr.includes('FATAL Error')) {
          // Fatal DuckDB error, resetting database
          await resetDatabase();
          self.postMessage({
            type: 'error',
            id,
            error: 'Database encountered a fatal error and has been reset. Please reload the page to reinitialize.'
          });
        } else if (errorStr.includes('Out of Memory') || errorStr.includes('Allocation failure')) {
          // Provide more helpful error message for OOM errors
          // DuckDB out of memory error
          self.postMessage({
            type: 'error',
            id,
            error: 'Out of Memory: The query or file is too large to process in the browser. Try:\n' +
                   '1. Querying smaller subsets using LIMIT or WHERE clauses\n' +
                   '2. Using SELECT with specific columns instead of SELECT *\n' +
                   '3. Processing smaller files\n' +
                   '4. Using COUNT(*) with LIMIT for large tables'
          });
        } else {
          self.postMessage({ type: 'error', id, error: errorStr });
        }
      } finally {
        self.postMessage({ type: 'done', id });
        outstanding.delete(id);
        // Trigger GC after query completion to free memory
        tryGarbageCollect();
      }
    } else if (msg.type === 'ack'){
      const { id } = msg;
      const cur = outstanding.get(id) || 0;
      outstanding.set(id, Math.max(0, cur - 1));
    } else if (msg.type === 'cancel'){
      const { id } = msg;
      self.postMessage({ type: 'cancelled', id });
    } else if (msg.type === 'register_file') {
      const { id, fileName, fileBuffer } = msg;
      try {
        if (!db) {
          throw new Error('Database not initialized');
        }
        // Register the file with DuckDB
        await db.registerFileBuffer(fileName, new Uint8Array(fileBuffer));
        self.postMessage({ type: 'file_registered', id });
      } catch (err) {
        self.postMessage({ type: 'error', id, error: String(err) });
      }
    } else if (msg.type === 'copy_file_to_buffer') {
      const { id, fileName } = msg;
      try {
        if (!db) {
          throw new Error('Database not initialized');
        }
        // Retrieve the file from DuckDB's virtual filesystem
        const buffer = await db.copyFileToBuffer(fileName);
        self.postMessage({ type: 'file_buffer', id, buffer: buffer }, [buffer.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id, error: String(err) });
      }
    } else if (msg.type === 'register_file_handle') {
      const { id, fileName, file } = msg;
      try {
        if (!db) {
          throw new Error('Database not initialized');
        }
        if (!DuckDBDataProtocol) {
          throw new Error('DuckDBDataProtocol not loaded');
        }
        // Register the file using Browser FileReader protocol
        // Use BROWSER_FILEREADER protocol (2) for File objects
        // This works with File objects from File System Access API
        await db.registerFileHandle(fileName, file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
        self.postMessage({ type: 'file_registered', id });
      } catch (err) {
        self.postMessage({ type: 'error', id, error: String(err) });
      }
    }
  } catch (e) {
    // Send error without id for init errors
    self.postMessage({ type: 'error', error: String(e) });
  }
});
