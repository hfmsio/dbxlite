import {
	type BaseConnector,
	BigQueryConnector,
	type CatalogInfo,
	type CloudConnector,
	type ColumnInfo,
	type ConnectionTestResult,
	DuckDBConnector,
	DuckDBHttpConnector,
	type QueryCostEstimate,
	type SchemaInfo,
	SnowflakeConnector,
	type TableMetadata,
	detectMode,
	type DbxliteMode,
} from "@ide/connectors";
import type { EncryptedCredentialStore } from "@ide/storage";
import type { ConnectorType } from "../types/data-source";
import type { TableRow } from "../types/table";
import { createLogger } from "../utils/logger";
import {
	getStatementKeyword as getSqlKeyword,
	getTrailingLimit,
	isPaginatableStatement,
} from "../utils/sqlPagination";
import { databaseTimezone } from "./formatter-settings";

const logger = createLogger("QueryService");

/**
 * Detect SET timezone commands and update the database timezone store.
 * Supports: SET timezone = 'X', SET TimeZone = 'X', SET TimeZone TO 'X'
 */
function detectAndUpdateTimezone(sql: string): void {
	// Match: SET timezone = 'value' or SET TimeZone TO 'value' anywhere in the SQL
	// Use global flag to find all occurrences (in case of multiple SET statements)
	const regex = /\bSET\s+timezone\s*(?:=|TO)\s*['"]?([^'";\s]+)['"]?/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(sql)) !== null) {
		const newTimezone = match[1];
		logger.debug("Timezone detection: SET timezone =", newTimezone);
		databaseTimezone.setTimezone(newTimezone);
	}
}

// Re-export ConnectorType for backward compatibility
export type { ConnectorType };

// Extended DuckDB connector type with file operations
interface DuckDBConnectorExtended extends BaseConnector {
	registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void>;
	registerFileHandle(fileName: string, file: File): Promise<void>;
	copyFileToBuffer(fileName: string): Promise<Uint8Array>;
	dropFile(fileName: string): Promise<void>;
}

// Extended BigQuery connector type with cache clearing
interface BigQueryConnectorExtended extends BaseConnector {
	clearCache(): void;
}

// Snowflake setup config (subset of SnowflakeConnectorConfig that the UI
// provides; transport + credentialStore are wired here, not by callers).
//
// Two auth shapes:
//   - OAuth (default): supply account + clientId (+ optional clientSecret).
//     Connector runs the popup OAuth flow.
//   - PAT: supply account + auth.token. No popup, no admin setup. Token is
//     sent as `Authorization: Bearer <pat>` to the SQL API.
export interface SnowflakeSetupOptions {
	account: string;
	/** OAuth client ID. Required when auth.mode is "oauth" (or omitted). */
	clientId?: string;
	/**
	 * OAuth client secret. Optional — omit (or pass undefined) for
	 * `OAUTH_CLIENT_TYPE = 'PUBLIC'` (PKCE-only). Recommended for browser
	 * deployments since secrets are recoverable by any same-origin script.
	 */
	clientSecret?: string;
	/**
	 * Auth discriminator. Defaults to OAuth for backward compat with
	 * existing call sites that pass clientId at the top level.
	 */
	auth?:
		| { mode: "oauth" }
		| { mode: "pat"; token: string };
	warehouse: string;
	role?: string;
	database?: string;
	schema?: string;
}

/**
 * Streaming query result that supports pagination and virtual scrolling
 */
export interface StreamingQueryResult {
	// Observable stream of data chunks
	chunks: AsyncIterable<DataChunk>;
	// Total row count (may be estimated for large datasets)
	totalRows?: number;
	// Column metadata
	columns: ColumnMetadata[];
	// Query execution metadata
	metadata: QueryMetadata;
}

/** Stats about query payload for transparency to users */
export interface QueryStats {
	totalRows: number;
	totalBytes: number;
	largeRowCount: number;
	maxRowSize: number;
	chunkCount: number;
	avgRowSize: number;
}

export interface DataChunk {
	rows: TableRow[];
	startIndex: number;
	endIndex: number;
	done: boolean;
	columns?: ColumnMetadata[]; // Schema information from connector
	totalRows?: number; // Total row count from connector metadata (BigQuery, EXPLAIN, etc.)
	queryStats?: QueryStats; // Payload stats for transparency (DuckDB)
}

export interface ColumnMetadata {
	name: string;
	type?: string;
	nullable?: boolean;
	comment?: string;
}

/**
 * Simple query result (non-streaming, all rows in memory)
 * Used for small result sets and backward compatibility with queryService
 */
export interface QueryResult {
	rows: TableRow[];
	columns: string[];
	columnTypes?: ColumnMetadata[];
	totalRows: number;
	/**
	 * Server-reported size of the FULL result when the connector surfaces it
	 * (BigQuery). When larger than rows.length, the fetch was truncated
	 * (maxRows) and the UI should say so instead of presenting a partial
	 * result as complete.
	 */
	serverTotalRows?: number;
	executionTime: number;
	/**
	 * Connector-side query identifier (Snowflake's statementHandle, BigQuery's
	 * jobId). Optional — only present for connectors that surface it. Consumed
	 * by QueryStatsFooter for post-execution stats lookup. (Backlog SF-T5.3.)
	 */
	connectorQueryId?: string;
	/**
	 * Connector type that produced this result. Lets the UI pick the right
	 * CatalogProvider for follow-up calls (e.g. provider.getQueryStats).
	 */
	connectorType?: ConnectorType;
}

export interface QueryMetadata {
	queryId: string;
	startTime: number;
	bytesProcessed?: number;
	cached?: boolean;
}

/**
 * Query options for streaming and pagination
 */
export interface StreamingQueryOptions {
	// Maximum rows to return (for LIMIT)
	limit?: number;
	// Offset for pagination (for OFFSET)
	offset?: number;
	// Chunk size for streaming
	chunkSize?: number;
	// Enable server-side pagination
	enablePagination?: boolean;
	// Project ID for BigQuery
	projectId?: string;
	// Abort signal for cancellation
	signal?: AbortSignal;
}

/**
 * Streaming query service with memory-efficient pagination
 */
class StreamingQueryService {
	private connectors: Map<ConnectorType, BaseConnector> = new Map();
	private activeConnector: ConnectorType = "duckdb";
	private credentialStore: EncryptedCredentialStore | null = null;
	private activeQueries = new Map<string, AbortController>();
	// Count cache with 5-minute TTL to avoid repeated COUNT queries
	private countCache = new Map<
		string,
		{ count: number; isEstimated: boolean; timestamp: number }
	>();
	private readonly COUNT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (reduced for memory)
	// Operating mode: 'wasm' for standalone, 'http' for duckdb -ui
	private mode: DbxliteMode = "wasm";

	/**
	 * The latest streaming query materialised into a temp table for stable
	 * paging. Raw `sql LIMIT n OFFSET m` per page is unsound: each page is a
	 * separate execution and with preserve_insertion_order=false DuckDB gives
	 * no cross-execution ordering guarantee, so pages could repeat or skip
	 * rows. Materialising once and paging `ORDER BY rowid` over the fixed
	 * table is deterministic by construction — and gives an exact row count
	 * for free. WASM-mode DuckDB only (temp tables are connection-scoped;
	 * the WASM worker holds one long-lived connection).
	 */
	private streamMaterialization: {
		sql: string;
		table: string;
		rowCount: number;
	} | null = null;
	/**
	 * Name of the last materialisation's table, kept separately so the next
	 * materialisation can DROP it even after an invalidation nulled the
	 * pointer (a mutation invalidates trust in the snapshot, not the need to
	 * clean up the table).
	 */
	private lastStreamTable: string | null = null;
	private streamTableSeq = 0;

	/**
	 * Hash a SQL query for caching purposes
	 */
	private hashQuery(sql: string): string {
		// Simple hash function for query caching
		let hash = 0;
		for (let i = 0; i < sql.length; i++) {
			const char = sql.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(36);
	}

	/**
	 * Drop trust in the current stream materialisation when a statement can
	 * mutate what it snapshot. Cheap keyword test; the temp table itself is
	 * dropped lazily by the next materialisation (see lastStreamTable).
	 */
	private maybeInvalidateStreamMaterialization(sql: string): void {
		if (!this.streamMaterialization) return;
		const kw = getSqlKeyword(sql);
		const mutating =
			/^(insert|update|delete|merge|create|drop|alter|truncate|copy|import|attach|detach|call)$/.test(
				kw,
			) ||
			(kw === "with" && !isPaginatableStatement(sql));
		if (mutating) {
			this.streamMaterialization = null;
		}
	}

	/**
	 * Materialise `sql` into a temp table for stable paging, reusing the
	 * existing one when the same SQL is paged again. Returns null when
	 * materialisation isn't applicable (HTTP mode: temp tables are not
	 * guaranteed connection-stable across requests) or fails (non-SELECT
	 * shapes) — callers fall back to legacy behavior.
	 */
	private async ensureStreamMaterialization(
		sql: string,
		signal?: AbortSignal,
	): Promise<{ table: string; rowCount: number } | null> {
		if (this.streamMaterialization?.sql === sql) {
			return this.streamMaterialization;
		}
		if (this.mode === "http") return null;

		const cleanSql = sql.replace(/[\s;]+$/, "");
		const table = `__dbxlite_stream_${++this.streamTableSeq}`;
		try {
			await this.executeQueryOnConnector(
				"duckdb",
				`CREATE TEMP TABLE ${table} AS ${cleanSql}`,
				signal,
				true,
			);
		} catch (err) {
			logger.debug(
				"Stream materialisation failed; falling back to direct paging",
				err,
			);
			return null;
		}

		// Best-effort cleanup of the previous stream table.
		const previous = this.lastStreamTable;
		this.lastStreamTable = table;
		if (previous && previous !== table) {
			this.executeQueryOnConnector(
				"duckdb",
				`DROP TABLE IF EXISTS ${previous}`,
				undefined,
				true,
			).catch(() => {
				/* non-critical */
			});
		}

		let rowCount = -1;
		try {
			const countResult = await this.executeQueryOnConnector(
				"duckdb",
				`SELECT COUNT(*) AS cnt FROM ${table}`,
				signal,
				true,
			);
			rowCount = Number(countResult.rows[0]?.cnt ?? -1);
		} catch {
			// Count is an enhancement; paging still works without it.
		}

		this.streamMaterialization = { sql, table, rowCount };
		return this.streamMaterialization;
	}

	async initialize(credentialStore: EncryptedCredentialStore) {
		this.credentialStore = credentialStore;

		// Detect operating mode (WASM vs HTTP for duckdb -ui)
		this.mode = detectMode();
		logger.info(`Initializing in ${this.mode} mode`);

		// Initialize DuckDB connector based on mode
		if (this.mode === "http") {
			// HTTP mode: Connect to DuckDB CLI's embedded HTTP server
			const duckdb = new DuckDBHttpConnector();
			await duckdb.connect({ options: {} });
			this.connectors.set("duckdb", duckdb);
			logger.info("Connected to DuckDB HTTP server");
		} else {
			// WASM mode: Use in-browser DuckDB
			const duckdb = new DuckDBConnector();
			await duckdb.connect({ options: {} });
			this.connectors.set("duckdb", duckdb);
		}
	}

	/**
	 * Get the current operating mode
	 */
	getMode(): DbxliteMode {
		return this.mode;
	}

	/**
	 * Check if running in HTTP mode (duckdb -ui)
	 */
	isHttpMode(): boolean {
		return this.mode === "http";
	}

	/**
	 * Subscribe to schema/catalog change events (HTTP mode only).
	 * Fires when ATTACH, DETACH, CREATE TABLE, DROP TABLE, etc. occur.
	 *
	 * @param listener - Callback to invoke on schema change
	 * @returns Unsubscribe function
	 */
	onSchemaChange(listener: () => void): () => void {
		if (this.mode !== "http") {
			// WASM mode doesn't have server-sent events
			return () => {};
		}

		const connector = this.connectors.get("duckdb");
		if (connector && "onSchemaChange" in connector) {
			return (connector as DuckDBHttpConnector).onSchemaChange(listener);
		}

		return () => {};
	}

	/**
	 * Execute a streaming query with pagination support
	 */
	async *executeStreamingQuery(
		sql: string,
		options: StreamingQueryOptions = {},
	): AsyncGenerator<DataChunk> {
		const queryId = `query_${Date.now()}_${Math.random()}`;
		const abortController = new AbortController();
		this.activeQueries.set(queryId, abortController);

		// Detect SET timezone commands and update the database timezone store
		detectAndUpdateTimezone(sql);

		const {
			limit,
			offset = 0,
			chunkSize = 1000,
			enablePagination = true,
			signal,
		} = options;

		try {
			const connector = this.getActiveConnector();

			// Invalidate any stream snapshot a mutating statement makes stale.
			this.maybeInvalidateStreamMaterialization(sql);

			// Pagination for DuckDB. Preferred path: materialise the query once
			// into a temp table and page it with ORDER BY rowid — deterministic
			// across page fetches (raw `sql LIMIT/OFFSET` per page re-executes
			// the query each time with no ordering guarantee under
			// preserve_insertion_order=false, so pages could repeat/skip rows).
			// This also handles queries whose own LIMIT lives in a subquery, and
			// large trailing user LIMITs (the temp table simply holds the
			// limited result). Fallback for HTTP mode or shapes CREATE TABLE AS
			// can't wrap: the legacy trailing-LIMIT injection, gated on the SAME
			// end-anchored user-LIMIT test the UI uses (the old anywhere-match
			// disagreed with the UI and made every "page" return the full set).
			let paginatedSql = sql;
			let materializedTotal: number | undefined;
			if (
				enablePagination &&
				this.activeConnector === "duckdb" &&
				limit !== undefined &&
				isPaginatableStatement(sql)
			) {
				const mat = await this.ensureStreamMaterialization(sql, signal);
				if (mat) {
					paginatedSql = `SELECT * FROM ${mat.table} ORDER BY rowid LIMIT ${limit} OFFSET ${offset}`;
					if (mat.rowCount >= 0) {
						materializedTotal = mat.rowCount;
					}
				} else if (getTrailingLimit(sql) === undefined) {
					paginatedSql += ` LIMIT ${limit}`;
					if (offset > 0) {
						paginatedSql += ` OFFSET ${offset}`;
					}
				}
			}

			let currentIndex = offset;
			let buffer: TableRow[] = [];
			let columns: ColumnMetadata[] = [];
			let totalRows: number | undefined = materializedTotal;
			let queryStats: QueryStats | undefined;
			let firstChunk = true;

			// Stream from connector
			for await (const chunk of connector.query(paginatedSql, options)) {
				// Extract queryStats from final chunk if available (DuckDB provides this)
				if (chunk.queryStats) {
					queryStats = chunk.queryStats;
				}
				// Check for abort from internal or external signal
				if (abortController.signal.aborted || signal?.aborted) {
					const error = new Error("Query cancelled by user");
					error.name = "AbortError";
					throw error;
				}

				// Extract totalRows from the connector when the materialisation
				// didn't already provide an exact one (BigQuery surfaces it).
				if (totalRows === undefined && chunk.totalRows !== undefined) {
					totalRows = chunk.totalRows;
					logger.debug("Got totalRows from connector", { totalRows });
				}

				// Extract schema from first chunk's schema property (preferred)
				// This gives us actual database types, not JavaScript types
				if (firstChunk && chunk.schema?.tables?.[0]?.columns) {
					columns = chunk.schema.tables[0].columns.map((col: ColumnInfo) => ({
						name: col.name,
						type: col.type,
						nullable: col.nullable,
					}));
					firstChunk = false;
				} else if (firstChunk && chunk.rows.length > 0) {
					// Fallback: infer from JavaScript types if schema not available
					columns = Object.keys(chunk.rows[0]).map((name) => ({
						name,
						type: typeof chunk.rows[0][name],
					}));
					firstChunk = false;
				}

				// Buffer rows and yield in chunks
				// Use concat instead of spread operator to avoid "Maximum call stack size exceeded"
				// when chunk.rows is very large (e.g., 1M rows)
				buffer = buffer.concat(chunk.rows);

				while (buffer.length >= chunkSize) {
					const chunkData = buffer.splice(0, chunkSize);

					yield {
						rows: chunkData,
						startIndex: currentIndex,
						endIndex: currentIndex + chunkData.length - 1,
						done: false,
						columns,
						totalRows,
					};

					currentIndex += chunkData.length;
				}
			}

			// Yield remaining buffered rows
			if (buffer.length > 0) {
				yield {
					rows: buffer,
					startIndex: currentIndex,
					endIndex: currentIndex + buffer.length - 1,
					done: true,
					columns,
					totalRows,
					queryStats,
				};
			}
		} catch (error: unknown) {
			// Enhance DuckDB-specific errors with helpful messages
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Check for common DuckDB-WASM browser limitations
			if (errorMessage.includes("HTML FileReaders do not support writing")) {
				const enhancedError = new Error(
					"Cannot write to attached database files in browser.\n\n" +
						"Solutions:\n" +
						'• Remove database prefix (e.g., use "CREATE TABLE allrecs" instead of "CREATE TABLE data.main.allrecs")\n' +
						'• Use TEMP tables: "CREATE TEMP TABLE allrecs AS ..."\n' +
						"• Export to Parquet: \"COPY (...) TO 'file.parquet' (FORMAT PARQUET)\"\n\n" +
						"Browser-based DuckDB can only write to the in-memory database and Parquet files.",
				);
				enhancedError.name =
					error instanceof Error ? error.name : "DuckDBError";
				throw enhancedError;
			}

			// Re-throw other errors as-is
			throw error;
		} finally {
			this.activeQueries.delete(queryId);
		}
	}

	/**
	 * Get a specific page of results using server-side pagination
	 * @param offset - Row offset (0-based), NOT page number
	 */
	async getPage(
		sql: string,
		offset: number,
		pageSize: number,
		signal?: AbortSignal,
	): Promise<DataChunk> {
		logger.debug(`[getPage] offset=${offset}, pageSize=${pageSize}`);
		const chunks: DataChunk[] = [];

		for await (const chunk of this.executeStreamingQuery(sql, {
			limit: pageSize,
			offset,
			chunkSize: pageSize,
			enablePagination: true,
			signal,
		})) {
			chunks.push(chunk);
			if (chunk.done) break;
		}

		// Combine chunks into single page
		const allRows = chunks.flatMap((c) => c.rows);
		// Get columns from first chunk that has them
		const columns = chunks.find((c) => c.columns)?.columns;
		// Get queryStats from last chunk (only present on final chunk from DuckDB)
		const queryStats = chunks.find((c) => c.queryStats)?.queryStats;

		return {
			rows: allRows,
			startIndex: offset,
			endIndex: offset + allRows.length - 1,
			done: true,
			columns,
			queryStats,
		};
	}

	/**
	 * Estimate memory requirements for a query
	 * Returns estimated bytes needed to load all results
	 */
	async estimateMemoryUsage(sql: string): Promise<{
		estimatedRows: number;
		estimatedBytes: number;
		estimatedMB: number;
		isLarge: boolean;
		recommendation: string;
	}> {
		try {
			// Get row count
			const { count: rowCount } = await this.getRowCount(sql);

			if (rowCount <= 0) {
				return {
					estimatedRows: -1,
					estimatedBytes: -1,
					estimatedMB: -1,
					isLarge: true,
					recommendation:
						"Unable to estimate - use virtual scrolling for safety",
				};
			}

			// Sample first few rows to estimate row size
			const connector = this.getActiveConnector();
			let avgRowSize = 200; // Default assumption: 200 bytes per row

			try {
				let sampleSize = 0;
				let rowsSampled = 0;
				const sampleLimit = Math.min(100, rowCount);

				for await (const chunk of connector.query(
					`${sql} LIMIT ${sampleLimit}`,
				)) {
					for (const row of chunk.rows) {
						// Rough estimation: JSON.stringify size
						sampleSize += JSON.stringify(row).length;
						rowsSampled++;
					}
					break; // Only need first chunk
				}

				if (rowsSampled > 0) {
					avgRowSize = Math.ceil(sampleSize / rowsSampled);
				}
			} catch (err) {
				logger.warn(
					"Could not sample rows for size estimation, using default",
					err,
				);
			}

			const estimatedBytes = rowCount * avgRowSize;
			const estimatedMB = estimatedBytes / (1024 * 1024);

			// Determine if query is large (>50MB or >100K rows)
			const isLarge = estimatedMB > 50 || rowCount > 100000;

			let recommendation = "";
			if (estimatedMB > 500) {
				recommendation =
					"Very large result set (>500MB). Consider adding WHERE clause to filter data.";
			} else if (estimatedMB > 100) {
				recommendation = "Large result set. Virtual scrolling recommended.";
			} else if (isLarge) {
				recommendation =
					"Moderate size. Virtual scrolling will be used for optimal performance.";
			} else {
				recommendation = "Small result set. Regular display will be used.";
			}

			return {
				estimatedRows: rowCount,
				estimatedBytes,
				estimatedMB: Math.round(estimatedMB * 10) / 10,
				isLarge,
				recommendation,
			};
		} catch (error) {
			logger.warn("Memory estimation failed", error);
			return {
				estimatedRows: -1,
				estimatedBytes: -1,
				estimatedMB: -1,
				isLarge: true,
				recommendation: "Unable to estimate - use virtual scrolling for safety",
			};
		}
	}

	/**
	 * Get estimated row count for a query without loading all data
	 * - BigQuery: Runs query with LIMIT 0 to get totalRows from metadata (free, exact!)
	 * - DuckDB: Uses EXPLAIN for fast estimation (subsecond vs 30s+ COUNT, estimated)
	 * Results are cached for 5 minutes to avoid repeated queries
	 * @returns Object with count and isEstimated flag
	 */
	async getRowCount(
		sql: string,
		signal?: AbortSignal,
		_timeoutMs: number = 30000,
	): Promise<{ count: number; isEstimated: boolean }> {
		// A live stream materialisation knows the exact count — no estimate,
		// no fabricated footer numbers.
		if (
			this.streamMaterialization?.sql === sql &&
			this.streamMaterialization.rowCount >= 0
		) {
			return {
				count: this.streamMaterialization.rowCount,
				isEstimated: false,
			};
		}

		// Check cache first
		const cacheKey = this.hashQuery(sql);
		const cached = this.countCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.COUNT_CACHE_TTL) {
			logger.debug("Using cached count", {
				count: cached.count,
				isEstimated: cached.isEstimated,
			});
			return { count: cached.count, isEstimated: cached.isEstimated };
		}

		const connector = this.getActiveConnector();

		try {
			let count = -1;

			// BigQuery: Run query with LIMIT 0 to get totalRows from response metadata (EXACT count)
			if (connector instanceof BigQueryConnector) {
				logger.debug(
					"BigQuery: Running query with LIMIT 0 to get metadata totalRows",
				);
				// Add LIMIT 0 to get metadata without fetching rows
				const metadataSql = `${sql} LIMIT 0`;

				for await (const chunk of connector.query(metadataSql, {
					maxRows: 0,
				})) {
					if (chunk.totalRows !== undefined) {
						count = chunk.totalRows;
						logger.debug("BigQuery totalRows from metadata (exact)", { count });
						break;
					}
				}

				// Cache the result (BigQuery metadata is exact, not estimated)
				if (count > 0) {
					this.countCache.set(cacheKey, {
						count,
						isEstimated: false,
						timestamp: Date.now(),
					});
				}

				return { count, isEstimated: false };
			}

			// DuckDB: Use EXPLAIN for fast estimation (ESTIMATED count)
			if (connector instanceof DuckDBConnector) {
				logger.debug("DuckDB: Using EXPLAIN for row estimation");
				count = await connector.getEstimatedRowCount(sql);
				logger.debug("DuckDB EXPLAIN estimate (estimated)", { count });

				// Cache the result (DuckDB EXPLAIN is estimated, not exact)
				if (count > 0) {
					this.countCache.set(cacheKey, {
						count,
						isEstimated: true,
						timestamp: Date.now(),
					});
				}

				return { count, isEstimated: true };
			}

			// Snowflake: wrap in SELECT COUNT(*) FROM (sql) with a 5-second
			// timeout. Without this, every Snowflake query falls through to the
			// `count = -1` path below and useQueryExecution interprets that as
			// "huge dataset, force streaming mode" — even for a 3-row SELECT.
			// On timeout we still return -1, but at that point streaming-mode
			// for a slow-counting query is the correct UX.
			if (connector instanceof SnowflakeConnector) {
				logger.debug("Snowflake: counting via SELECT COUNT(*) FROM (sql)");
				const COUNT_TIMEOUT_MS = 5_000;
				// Strip trailing semicolons + whitespace before wrapping —
				// otherwise `SELECT COUNT(*) AS c FROM (SELECT * FROM t;)` is a
				// Snowflake parse error, count fails, and useQueryExecution
				// falls into the misleading "Very large dataset" toast for a
				// query that's actually small.
				const innerSql = sql.replace(/[\s;]+$/, "");
				const countSql = `SELECT COUNT(*) AS c FROM (${innerSql})`;
				const countCtl = new AbortController();
				const timeout = setTimeout(
					() => countCtl.abort(),
					COUNT_TIMEOUT_MS,
				);
				// Combine the internal timeout signal with the caller's
				// signal so a Stop Query during the COUNT terminates the
				// Snowflake-side query (real billing-leak fix). Falls back
				// to AbortController.abort()-on-listener for older browsers
				// without AbortSignal.any.
				const combinedSignal: AbortSignal = signal
					? typeof AbortSignal.any === "function"
						? AbortSignal.any([countCtl.signal, signal])
						: (() => {
								const ctl = new AbortController();
								const onAbort = () => ctl.abort();
								countCtl.signal.addEventListener("abort", onAbort);
								signal.addEventListener("abort", onAbort);
								return ctl.signal;
							})()
					: countCtl.signal;
				try {
					for await (const chunk of connector.query(countSql, {
						signal: combinedSignal,
					})) {
						const row = chunk.rows?.[0];
						if (row !== undefined) {
							const v =
								typeof row === "object" && row !== null
									? (Object.values(row)[0] as unknown)
									: row;
							const n =
								typeof v === "number"
									? v
									: typeof v === "string"
										? Number(v)
										: -1;
							if (Number.isFinite(n) && n >= 0) {
								count = n;
								break;
							}
						}
					}
				} catch (err) {
					if (countCtl.signal.aborted) {
						logger.debug("Snowflake count timed out — returning -1");
					} else {
						logger.debug("Snowflake count failed; returning -1", err);
					}
				} finally {
					clearTimeout(timeout);
				}

				if (count >= 0) {
					this.countCache.set(cacheKey, {
						count,
						isEstimated: false,
						timestamp: Date.now(),
					});
					return { count, isEstimated: false };
				}
				return { count: -1, isEstimated: true };
			}

			// Fallback for other connectors: return -1 (unknown, treated as estimated)
			logger.warn("Unknown connector type, returning -1");
			return { count: -1, isEstimated: true };
		} catch (error) {
			// Re-throw abort errors
			if (error instanceof Error && error.name === "AbortError") {
				throw error;
			}

			logger.warn("Could not get row count", error);
			return { count: -1, isEstimated: true }; // Unknown count - treated as estimated
		}
	}

	/**
	 * Cancel an active query
	 */
	async cancelQuery(queryId: string) {
		const controller = this.activeQueries.get(queryId);
		if (controller) {
			controller.abort();
			this.activeQueries.delete(queryId);
		}
	}

	/**
	 * Cancel all active queries
	 */
	async cancelAllQueries() {
		for (const [_queryId, controller] of this.activeQueries) {
			controller.abort();
		}
		this.activeQueries.clear();
	}

	// Utility methods

	/**
	 * Set the active connector. This is the user's "current selection" — the
	 * connector the editor's Run button targets, the catalog explorer
	 * displays, etc. It is NOT a request-scoped scope.
	 *
	 * **Do NOT** use this in a try/finally swap-and-restore pattern. Errors,
	 * hot-reloads, navigations, and concurrent operations all orphan the
	 * restore and leave the global pointing at the wrong connector. Two
	 * production regressions in v0.4 came from exactly this anti-pattern.
	 *
	 * If you need to run an operation against a specific connector
	 * regardless of the active selection, use:
	 *   - `queryService.executeQueryOnConnector(type, sql, signal)`
	 *   - `queryService.getConnector(type)` (then call methods on it)
	 *   - the strategy registry under `components/table/exporters/` for
	 *     export work
	 */
	setActiveConnector(type: ConnectorType) {
		if (!this.connectors.has(type)) {
			throw new Error(`Connector ${type} not initialized`);
		}
		this.activeConnector = type;
	}

	getActiveConnector(): BaseConnector {
		const connector = this.connectors.get(this.activeConnector);
		if (!connector) {
			throw new Error(`No active connector available`);
		}
		return connector;
	}

	getActiveConnectorType(): ConnectorType {
		return this.activeConnector;
	}

	isConnectorReady(type: ConnectorType): boolean {
		return this.connectors.has(type);
	}

	async registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void> {
		const connector = this.connectors.get("duckdb");
		if (!connector) {
			throw new Error("DuckDB connector not initialized");
		}
		if (
			"registerFile" in connector &&
			typeof connector.registerFile === "function"
		) {
			await (connector as DuckDBConnectorExtended).registerFile(
				fileName,
				fileBuffer,
			);
		}
	}

	async registerFileHandle(fileName: string, file: File): Promise<void> {
		const connector = this.connectors.get("duckdb");
		if (!connector) {
			throw new Error("DuckDB connector not initialized");
		}
		if (
			"registerFileHandle" in connector &&
			typeof connector.registerFileHandle === "function"
		) {
			await (connector as DuckDBConnectorExtended).registerFileHandle(
				fileName,
				file,
			);
		}
	}

	async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
		const connector = this.connectors.get("duckdb");
		if (!connector) {
			throw new Error("DuckDB connector not initialized");
		}
		if (
			"copyFileToBuffer" in connector &&
			typeof connector.copyFileToBuffer === "function"
		) {
			return await (connector as DuckDBConnectorExtended).copyFileToBuffer(
				fileName,
			);
		}
		throw new Error("File copy not supported");
	}

	/**
	 * Drop a file from DuckDB's virtual filesystem
	 */
	async dropFile(fileName: string): Promise<void> {
		const connector = this.connectors.get("duckdb");
		if (!connector) {
			throw new Error("DuckDB connector not initialized");
		}
		if ("dropFile" in connector && typeof connector.dropFile === "function") {
			await (connector as DuckDBConnectorExtended).dropFile(fileName);
		} else {
			throw new Error("File drop not supported by this connector");
		}
	}

	/**
	 * Get a specific connector by type
	 */
	getConnector(type: ConnectorType): BaseConnector | null {
		return this.connectors.get(type) || null;
	}

	/**
	 * Convert BigInt values to numbers (safe for JSON serialization)
	 * Also handles Apache Arrow row objects
	 */
	private convertBigIntToNumber(obj: unknown): unknown {
		if (obj === null || obj === undefined) {
			return obj;
		}

		if (typeof obj === "bigint") {
			return Number(obj);
		}

		// Preserve Date objects as-is
		if (obj instanceof Date) {
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.convertBigIntToNumber(item));
		}

		if (typeof obj === "object") {
			const result: Record<string, unknown> = {};
			const objRecord = obj as Record<string, unknown>;
			const keys = Object.keys(objRecord);
			if (keys.length > 0) {
				for (const key of keys) {
					const value = objRecord[key];
					result[key] = this.convertBigIntToNumber(value);
				}
			} else {
				for (const key in objRecord) {
					result[key] = this.convertBigIntToNumber(objRecord[key]);
				}
			}
			return result;
		}

		return obj;
	}

	/**
	 * Execute a SQL query on a specific connector (non-streaming, all rows in memory)
	 * @param silent - If true, don't log errors (useful for expected failures like DETACH)
	 */
	async executeQueryOnConnector(
		connectorType: ConnectorType,
		sql: string,
		signal?: AbortSignal,
		silent?: boolean,
	): Promise<QueryResult> {
		const startTime = Date.now();
		const connector = this.getConnector(connectorType);

		if (!connector) {
			throw new Error(`Connector ${connectorType} not available`);
		}

		// Detect SET timezone commands and update the database timezone store
		detectAndUpdateTimezone(sql);

		const allRows: TableRow[] = [];
		const columns: string[] = [];
		let columnTypes: ColumnMetadata[] | undefined;
		let connectorQueryId: string | undefined;

		try {
			for await (const chunk of connector.query(sql, { signal })) {
				if (signal?.aborted) {
					const abortError = new Error("Query aborted by user");
					abortError.name = "AbortError";
					throw abortError;
				}

				// Capture connector-side query identifier from the first chunk that surfaces one.
				if (!connectorQueryId && chunk.connectorQueryId) {
					connectorQueryId = chunk.connectorQueryId;
				}

				// Extract schema information from the first chunk
				if (!columnTypes) {
					if (chunk.schema?.tables?.[0]?.columns) {
						columnTypes = chunk.schema.tables[0].columns.map(
							(col: ColumnInfo) => ({
								name: col.name,
								type: col.type,
								nullable: col.nullable,
								comment: col.comment,
							}),
						);
					}
				}

				if (chunk.rows) {
					const convertedRows = this.convertBigIntToNumber(
						chunk.rows,
					) as TableRow[];
					allRows.push(...convertedRows);

					if (columns.length === 0 && convertedRows.length > 0) {
						columns.push(...Object.keys(convertedRows[0]));
					}
				}

				if (chunk.done) {
					break;
				}
			}
		} catch (error) {
			if (!silent) {
				logger.error(`${connectorType} query failed`, error);
			}
			throw error;
		}

		return {
			columns,
			rows: allRows,
			totalRows: allRows.length,
			executionTime: Date.now() - startTime,
			columnTypes,
			connectorQueryId,
			connectorType,
		};
	}

	/**
	 * Execute a SQL query and return results (non-streaming, uses active connector)
	 */
	async executeQuery(sql: string, signal?: AbortSignal): Promise<QueryResult> {
		const startTime = Date.now();
		const connector = this.getActiveConnector();
		const connectorType = this.activeConnector;

		// Detect SET timezone commands and update the database timezone store
		detectAndUpdateTimezone(sql);
		// Mutations make any stream snapshot stale.
		this.maybeInvalidateStreamMaterialization(sql);

		let serverTotalRows: number | undefined;
		const allRows: TableRow[] = [];
		const columns: string[] = [];
		let columnTypes: ColumnMetadata[] | undefined;
		let connectorQueryId: string | undefined;

		try {
			for await (const chunk of connector.query(sql, { signal })) {
				if (signal?.aborted) {
					const abortError = new Error("Query aborted by user");
					abortError.name = "AbortError";
					throw abortError;
				}

				if (!connectorQueryId && chunk.connectorQueryId) {
					connectorQueryId = chunk.connectorQueryId;
				}

				// Server-reported result size (BigQuery surfaces it). Lets the
				// caller detect that maxRows truncated the fetch.
				if (chunk.totalRows !== undefined) {
					serverTotalRows = chunk.totalRows;
				}

				// Extract schema information from the first chunk
				if (!columnTypes) {
					if (chunk.schema?.tables?.[0]?.columns) {
						columnTypes = chunk.schema.tables[0].columns.map(
							(col: ColumnInfo) => ({
								name: col.name,
								type: col.type,
								nullable: col.nullable,
								comment: col.comment,
							}),
						);
					}
				}

				if (chunk.rows && chunk.rows.length > 0) {
					const convertedRows = chunk.rows.map((row) =>
						this.convertBigIntToNumber(row),
					) as TableRow[];
					allRows.push(...convertedRows);

					if (columns.length === 0 && chunk.rows[0]) {
						columns.push(...Object.keys(chunk.rows[0]));
					}
				}
			}

			return {
				rows: allRows,
				columns,
				columnTypes,
				totalRows: allRows.length,
				serverTotalRows,
				executionTime: Date.now() - startTime,
				connectorQueryId,
				connectorType,
			};
		} catch (error) {
			logger.error("Query execution error", error);
			throw error;
		}
	}

	/**
	 * Get schema information from the active connector
	 */
	async getSchema() {
		const connector = this.getActiveConnector();
		return await connector.getSchema();
	}

	// ============================================
	// BigQuery-specific methods
	// ============================================

	/**
	 * Set up BigQuery connector with OAuth
	 */
	async setupBigQuery(clientId: string, clientSecret: string) {
		if (!this.credentialStore) {
			throw new Error("Credential store not initialized");
		}

		// Persist OAuth client credentials for auto-reconnect
		await this.credentialStore.save("bigquery-oauth-config", {
			clientId,
			clientSecret,
		});

		const bigquery = new BigQueryConnector(
			this.credentialStore,
			clientId,
			clientSecret,
		);
		await bigquery.connect({
			options: {
				redirectUri: `${window.location.origin}/oauth-callback`,
			},
		});
		this.connectors.set("bigquery", bigquery);
	}

	/**
	 * Restore BigQuery connection from stored credentials
	 */
	async restoreBigQueryConnection(): Promise<boolean> {
		if (!this.credentialStore) {
			logger.debug("No credential store available for BigQuery restoration");
			return false;
		}

		try {
			const oauthConfig = await this.credentialStore.load(
				"bigquery-oauth-config",
			);
			if (!oauthConfig || !oauthConfig.clientId || !oauthConfig.clientSecret) {
				logger.debug(
					"No valid OAuth config found - skipping BigQuery restoration",
				);
				return false;
			}

			const token = await this.credentialStore.load("bigquery-token");
			if (!token) {
				logger.debug("No token found - skipping BigQuery restoration");
				return false;
			}

			const bigquery = new BigQueryConnector(
				this.credentialStore,
				oauthConfig.clientId,
				oauthConfig.clientSecret,
			);

			// Load token into memory so isConnected() returns true
			if (
				"initializeFromStorage" in bigquery &&
				typeof bigquery.initializeFromStorage === "function"
			) {
				const hasToken = await bigquery.initializeFromStorage();
				if (!hasToken) {
					logger.debug("BigQuery token not found or invalid in storage");
					return false;
				}
			}

			this.connectors.set("bigquery", bigquery);

			logger.info("BigQuery connection restored from storage");
			return true;
		} catch (error) {
			logger.error("Failed to restore BigQuery connection", error);
			return false;
		}
	}

	/**
	 * Check if BigQuery connector is available and connected
	 */
	isBigQueryConnected(): boolean {
		const connector = this.connectors.get("bigquery");
		if (!connector) return false;
		if (
			"isConnected" in connector &&
			typeof connector.isConnected === "function"
		) {
			return (connector as CloudConnector).isConnected?.() ?? false;
		}
		return false;
	}

	/**
	 * Disconnect from BigQuery and revoke credentials
	 */
	async disconnectBigQuery(): Promise<void> {
		const connector = this.connectors.get("bigquery");
		if (!connector) return;

		if ("revoke" in connector && typeof connector.revoke === "function") {
			await (connector as CloudConnector).revoke?.();
		}

		this.connectors.delete("bigquery");

		if (this.credentialStore) {
			await this.credentialStore.save("bigquery-oauth-config", null);
		}
		// Mirror Snowflake's revoke(): also clear the auto-connect flag so
		// the next page load doesn't try to restore a connection that the
		// user just explicitly removed.
		try {
			localStorage.removeItem("bigquery-auto-connect");
		} catch {
			// localStorage may be unavailable in some test envs
		}
	}

	/**
	 * Clear BigQuery metadata cache (projects, datasets, tables)
	 */
	clearBigQueryCache(): void {
		const connector = this.connectors.get("bigquery");
		if (!connector) return;

		if (
			"clearCache" in connector &&
			typeof connector.clearCache === "function"
		) {
			(connector as BigQueryConnectorExtended).clearCache();
		}
	}

	/**
	 * Attempt to reconnect to BigQuery using stored credentials
	 */
	async reconnectBigQuery(): Promise<boolean> {
		if (!this.credentialStore) {
			logger.debug("Cannot reconnect - credential store not initialized");
			return false;
		}

		if (this.isBigQueryConnected()) {
			logger.debug("BigQuery already connected");
			return true;
		}

		try {
			const config = await this.credentialStore.load("bigquery-oauth-config");
			if (!config || !config.clientId) {
				logger.debug("No stored BigQuery OAuth config found");
				return false;
			}

			logger.debug("Found stored OAuth config, attempting reconnect...");

			const bigqueryConnector = new BigQueryConnector(
				this.credentialStore,
				config.clientId,
				config.clientSecret,
			);

			if (
				"isConnected" in bigqueryConnector &&
				typeof bigqueryConnector.isConnected === "function"
			) {
				const connected = bigqueryConnector.isConnected();
				if (connected) {
					this.connectors.set("bigquery", bigqueryConnector);
					logger.info("BigQuery reconnected successfully");
					return true;
				}
			}

			logger.debug("BigQuery credentials expired or invalid");
			return false;
		} catch (error) {
			logger.error("Failed to reconnect to BigQuery", error);
			return false;
		}
	}

	/**
	 * List BigQuery projects
	 */
	async getBigQueryProjects(): Promise<CatalogInfo[]> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"listProjects" in connector &&
			typeof connector.listProjects === "function"
		) {
			return await (connector as CloudConnector).listProjects?.() ?? [];
		}
		throw new Error("Project listing not supported");
	}

	/**
	 * List BigQuery datasets in a project
	 */
	async getBigQueryDatasets(projectId: string): Promise<SchemaInfo[]> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"listDatasets" in connector &&
			typeof connector.listDatasets === "function"
		) {
			return await (connector as CloudConnector).listDatasets?.(projectId) ?? [];
		}
		throw new Error("Dataset listing not supported");
	}

	/**
	 * List BigQuery tables in a dataset
	 */
	async getBigQueryTables(
		projectId: string,
		datasetId: string,
	): Promise<TableMetadata[]> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"listTables" in connector &&
			typeof connector.listTables === "function"
		) {
			return await (connector as CloudConnector).listTables?.(
				projectId,
				datasetId,
			) ?? [];
		}
		throw new Error("Table listing not supported");
	}

	/**
	 * Get BigQuery table metadata
	 */
	async getBigQueryTableMetadata(
		projectId: string,
		datasetId: string,
		tableId: string,
	): Promise<TableMetadata> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"getTableMetadata" in connector &&
			typeof connector.getTableMetadata === "function"
		) {
			const result = await (connector as CloudConnector).getTableMetadata?.(
				projectId,
				datasetId,
				tableId,
			);
			if (!result) throw new Error("Table metadata not available");
			return result;
		}
		throw new Error("Table metadata not supported");
	}

	/**
	 * Estimate BigQuery query cost
	 */
	async estimateBigQueryCost(
		sql: string,
		projectId?: string,
	): Promise<QueryCostEstimate> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"estimateQueryCost" in connector &&
			typeof connector.estimateQueryCost === "function"
		) {
			const result = await (connector as CloudConnector).estimateQueryCost?.(
				sql,
				projectId,
			);
			if (!result) throw new Error("Cost estimate not available");
			return result;
		}
		throw new Error("Cost estimation not supported");
	}

	/**
	 * Test BigQuery connection
	 */
	async testBigQueryConnection(): Promise<ConnectionTestResult> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"testConnection" in connector &&
			typeof connector.testConnection === "function"
		) {
			const result = await (connector as CloudConnector).testConnection?.();
			if (!result) throw new Error("Connection test result not available");
			return result;
		}
		throw new Error("Connection testing not supported");
	}

	/**
	 * Get BigQuery default project
	 */
	async getBigQueryDefaultProject(): Promise<string | null> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			return null;
		}
		if (
			"getDefaultProject" in connector &&
			typeof connector.getDefaultProject === "function"
		) {
			return await (connector as CloudConnector).getDefaultProject?.() ?? null;
		}
		return null;
	}

	/**
	 * Set BigQuery default project
	 */
	async setBigQueryDefaultProject(projectId: string): Promise<void> {
		const connector = this.connectors.get("bigquery");
		if (!connector) {
			throw new Error("BigQuery connector not initialized");
		}
		if (
			"setDefaultProject" in connector &&
			typeof connector.setDefaultProject === "function"
		) {
			await (connector as CloudConnector).setDefaultProject?.(projectId);
			return;
		}
		throw new Error("Setting default project not supported");
	}

	/**
	 * Disconnect from a connector
	 */
	async disconnect(type: ConnectorType) {
		const connector = this.connectors.get(type);
		if (connector?.revoke) {
			await connector.revoke();
		}
		this.connectors.delete(type);
	}

	// ============================================
	// Snowflake-specific methods (mirrors BigQuery)
	// ============================================

	/**
	 * Set up Snowflake connector with OAuth and persist config.
	 * Triggers the OAuth popup flow.
	 */
	async setupSnowflake(opts: SnowflakeSetupOptions): Promise<void> {
		if (!this.credentialStore) {
			throw new Error("Credential store not initialized");
		}
		// Map the UI-facing options to the connector's auth discriminator.
		// PAT mode bypasses the OAuth popup; OAuth (default) keeps the
		// existing flow.
		const auth =
			opts.auth?.mode === "pat"
				? { mode: "pat" as const, token: opts.auth.token }
				: {
						mode: "oauth" as const,
						clientId: opts.clientId ?? "",
						clientSecret: opts.clientSecret,
					};
		const sf = new SnowflakeConnector({
			credentialStore: this.credentialStore,
			account: opts.account,
			auth,
			warehouse: opts.warehouse,
			role: opts.role,
			database: opts.database,
			schema: opts.schema,
		});
		await sf.connect({ options: {} });
		this.connectors.set("snowflake", sf);
	}

	/**
	 * Restore Snowflake connection from stored credentials.
	 * Returns true if restored successfully, false otherwise.
	 */
	async restoreSnowflakeConnection(): Promise<boolean> {
		if (!this.credentialStore) {
			logger.debug("No credential store available for Snowflake restoration");
			return false;
		}
		try {
			const config = (await this.credentialStore.load(
				"snowflake-config",
			)) as
				| (Partial<SnowflakeSetupOptions> & { authMode?: "oauth" | "pat" })
				| null;
			if (!config || !config.account) {
				logger.debug("No valid Snowflake config in storage");
				return false;
			}
			const storedMode = config.authMode ?? "oauth";

			// Mode-specific credential presence check + connector
			// instantiation. Legacy stored configs without authMode default
			// to OAuth (back-compat).
			let auth: { mode: "oauth"; clientId: string; clientSecret?: string } | { mode: "pat"; token: string };
			if (storedMode === "pat") {
				const pat = (await this.credentialStore.load("snowflake-pat")) as
					| string
					| null;
				if (!pat) {
					logger.debug("PAT mode but no token in storage");
					return false;
				}
				auth = { mode: "pat", token: pat };
			} else {
				const token = await this.credentialStore.load("snowflake-token");
				if (!token || !config.clientId) {
					logger.debug("No valid Snowflake OAuth token/clientId in storage");
					return false;
				}
				auth = {
					mode: "oauth",
					clientId: config.clientId,
					clientSecret: config.clientSecret,
				};
			}

			const sf = new SnowflakeConnector({
				credentialStore: this.credentialStore,
				account: config.account,
				auth,
				warehouse: config.warehouse ?? "",
				role: config.role,
				database: config.database,
				schema: config.schema,
			});
			const ok = await sf.initializeFromStorage();
			if (!ok) {
				logger.debug("Snowflake initializeFromStorage returned false");
				return false;
			}
			this.connectors.set("snowflake", sf);
			logger.info("Snowflake connection restored from storage", {
				authMode: storedMode,
			});
			return true;
		} catch (error) {
			logger.error("Failed to restore Snowflake connection", error);
			return false;
		}
	}

	/**
	 * Update Snowflake config (warehouse/database/schema/role) without re-auth.
	 */
	async updateSnowflakeConfig(config: {
		warehouse?: string;
		database?: string;
		schema?: string;
		role?: string;
	}): Promise<void> {
		const sf = this.getSnowflakeConnector();
		if (!sf) {
			throw new Error("Snowflake connector not initialized");
		}
		await sf.updateConfig(config);
	}

	/**
	 * Check if Snowflake connector is available and connected.
	 */
	isSnowflakeConnected(): boolean {
		const connector = this.connectors.get("snowflake");
		if (!connector) return false;
		if (
			"isConnected" in connector &&
			typeof connector.isConnected === "function"
		) {
			return (connector as CloudConnector).isConnected?.() ?? false;
		}
		return false;
	}

	/**
	 * Disconnect from Snowflake and revoke credentials.
	 */
	async disconnectSnowflake(): Promise<void> {
		const connector = this.connectors.get("snowflake");
		if (!connector) return;
		if ("revoke" in connector && typeof connector.revoke === "function") {
			await (connector as CloudConnector).revoke?.();
		}
		this.connectors.delete("snowflake");
	}

	/**
	 * Test Snowflake connection.
	 */
	async testSnowflakeConnection(): Promise<ConnectionTestResult> {
		const connector = this.connectors.get("snowflake");
		if (!connector) {
			throw new Error("Snowflake connector not initialized");
		}
		if (
			"testConnection" in connector &&
			typeof connector.testConnection === "function"
		) {
			const result = await (connector as CloudConnector).testConnection?.();
			if (!result) throw new Error("Connection test result not available");
			return result;
		}
		throw new Error("Connection testing not supported");
	}

	/**
	 * Get Snowflake connector instance (for direct API access in catalog UI).
	 */
	getSnowflakeConnector(): SnowflakeConnector | null {
		const connector = this.connectors.get("snowflake");
		return connector instanceof SnowflakeConnector ? connector : null;
	}

	/**
	 * List Snowflake databases (catalogs).
	 */
	async getSnowflakeDatabases(): Promise<CatalogInfo[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listProjects();
	}

	/**
	 * List Snowflake schemas in a database.
	 */
	async getSnowflakeSchemas(databaseName: string): Promise<SchemaInfo[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listDatasets(databaseName);
	}

	/**
	 * List Snowflake tables in a schema.
	 */
	async getSnowflakeTables(
		databaseName: string,
		schemaName: string,
	): Promise<TableMetadata[]> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.listTables(databaseName, schemaName);
	}

	/**
	 * Get Snowflake table metadata.
	 */
	async getSnowflakeTableMetadata(
		databaseName: string,
		schemaName: string,
		tableName: string,
	): Promise<TableMetadata> {
		const sf = this.getSnowflakeConnector();
		if (!sf) throw new Error("Snowflake connector not initialized");
		return await sf.getTableMetadata(databaseName, schemaName, tableName);
	}

	/**
	 * Clear Snowflake metadata cache.
	 */
	clearSnowflakeCache(): void {
		const sf = this.getSnowflakeConnector();
		sf?.clearCache();
	}
}

// Export singleton instance
export const streamingQueryService = new StreamingQueryService();

// Also export as queryService for backward compatibility during migration
export const queryService = streamingQueryService;
