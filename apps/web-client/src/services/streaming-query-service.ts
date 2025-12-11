import {
	type BaseConnector,
	BigQueryConnector,
	type CatalogInfo,
	type CloudConnector,
	type ColumnInfo,
	type ConnectionTestResult,
	DuckDBConnector,
	type QueryCostEstimate,
	type SchemaInfo,
	type TableMetadata,
} from "@ide/connectors";
import type { CredentialStore } from "@ide/storage";
import type { ConnectorType } from "../types/data-source";
import type { TableRow } from "../types/table";
import { createLogger } from "../utils/logger";

const logger = createLogger("QueryService");

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
	executionTime: number;
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
	// Cache results in IndexedDB for fast re-query
	cacheResults?: boolean;
	// Project ID for BigQuery
	projectId?: string;
	// Abort signal for cancellation
	signal?: AbortSignal;
}

/**
 * Result cache using IndexedDB for fast pagination
 */
class ResultCache {
	private db: IDBDatabase | null = null;
	private readonly DB_NAME = "QueryResultCache";
	private readonly STORE_NAME = "results";

	async init() {
		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, 1);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.STORE_NAME)) {
					const store = db.createObjectStore(this.STORE_NAME, {
						keyPath: "id",
					});
					store.createIndex("queryHash", "queryHash", { unique: false });
					store.createIndex("timestamp", "timestamp", { unique: false });
				}
			};
		});
	}

	async cacheChunk(queryHash: string, chunkIndex: number, data: TableRow[]) {
		if (!this.db) await this.init();

		const tx = this.db?.transaction([this.STORE_NAME], "readwrite");
		if (!tx) throw new Error("Failed to create transaction");
		const store = tx.objectStore(this.STORE_NAME);

		await new Promise<void>((resolve, reject) => {
			const request = store.put({
				id: `${queryHash}_${chunkIndex}`,
				queryHash,
				chunkIndex,
				data,
				timestamp: Date.now(),
			});
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});

		// Clean old cache if needed
		await this.cleanOldCache();
	}

	async getChunk(
		queryHash: string,
		chunkIndex: number,
	): Promise<TableRow[] | null> {
		if (!this.db) await this.init();

		const tx = this.db?.transaction([this.STORE_NAME], "readonly");
		if (!tx) throw new Error("Failed to create transaction");
		const store = tx.objectStore(this.STORE_NAME);

		return new Promise((resolve, reject) => {
			const request = store.get(`${queryHash}_${chunkIndex}`);
			request.onsuccess = () => resolve(request.result?.data || null);
			request.onerror = () => reject(request.error);
		});
	}

	async cleanOldCache() {
		// Remove entries older than 1 hour
		const cutoff = Date.now() - 3600000;

		const tx = this.db?.transaction([this.STORE_NAME], "readwrite");
		if (!tx) return;
		const store = tx.objectStore(this.STORE_NAME);
		const index = store.index("timestamp");

		const range = IDBKeyRange.upperBound(cutoff);
		const request = index.openCursor(range);

		request.onsuccess = (event) => {
			const cursor = (event.target as IDBRequest).result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			}
		};
	}
}

/**
 * Streaming query service with memory-efficient pagination
 */
class StreamingQueryService {
	private connectors: Map<ConnectorType, BaseConnector> = new Map();
	private activeConnector: ConnectorType = "duckdb";
	private credentialStore: CredentialStore | null = null;
	private cache = new ResultCache();
	private activeQueries = new Map<string, AbortController>();
	// Count cache with 5-minute TTL to avoid repeated COUNT queries
	private countCache = new Map<
		string,
		{ count: number; isEstimated: boolean; timestamp: number }
	>();
	private readonly COUNT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (reduced for memory)

	/**
	 * Normalize SQL for statement classification by stripping leading comments/whitespace.
	 * Returns the first keyword in lowercase (e.g., "select", "show", "pragma").
	 */
	private getStatementKeyword(sql: string): string {
		const withoutLeadingComments = sql
			.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, "")
			.trim();
		const match = withoutLeadingComments.match(/^([a-zA-Z]+)/);
		return match ? match[1].toLowerCase() : "";
	}

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

	async initialize(credentialStore: CredentialStore) {
		this.credentialStore = credentialStore;
		await this.cache.init();

		// Initialize DuckDB connector
		const duckdb = new DuckDBConnector();
		await duckdb.connect({ options: {} });
		this.connectors.set("duckdb", duckdb);
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

			const {
				limit,
				offset = 0,
				chunkSize = 1000,
				enablePagination = true,
				cacheResults = false,
				signal,
			} = options;

		try {
			const connector = this.getActiveConnector();

			// Add pagination to SQL if enabled and query doesn't have user's LIMIT
			let paginatedSql = sql;
			if (enablePagination && this.activeConnector === "duckdb") {
				const hasUserLimit = /\bLIMIT\s+\d+/i.test(sql);

				// Check if this is a statement that doesn't support LIMIT (DDL/DML commands)
				// These commands don't return result sets in the traditional sense
				const statementKeyword = this.getStatementKeyword(sql);
				const isNonSelectStatement = /^(copy|insert|update|delete|create|alter|drop|truncate|export|import|attach|detach|install|load|show|pragma|describe|explain|set)$/i.test(
					statementKeyword,
				);

				// Only add pagination if:
				// 1. User didn't specify their own LIMIT
				// 2. This is not a DDL/DML statement (COPY, INSERT, etc.)
				if (!hasUserLimit && !isNonSelectStatement) {
					if (limit !== undefined) {
						paginatedSql += ` LIMIT ${limit}`;
					}
					if (offset > 0) {
						paginatedSql += ` OFFSET ${offset}`;
					}
				}
			}

			let currentIndex = offset;
			let buffer: TableRow[] = [];
			let columns: ColumnMetadata[] = [];
			let totalRows: number | undefined;
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

				// Extract totalRows from first chunk if available (BigQuery provides this)
				if (firstChunk && chunk.totalRows !== undefined) {
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

					// Cache if enabled
					if (cacheResults) {
						const queryHash = this.hashQuery(sql);
						await this.cache.cacheChunk(
							queryHash,
							Math.floor(currentIndex / chunkSize),
							chunkData,
						);
					}

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
				if (cacheResults) {
					const queryHash = this.hashQuery(sql);
					await this.cache.cacheChunk(
						queryHash,
						Math.floor(currentIndex / chunkSize),
						buffer,
					);
				}

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
		_signal?: AbortSignal,
		_timeoutMs: number = 30000,
	): Promise<{ count: number; isEstimated: boolean }> {
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

		const allRows: TableRow[] = [];
		const columns: string[] = [];
		let columnTypes: ColumnMetadata[] | undefined;

		try {
			for await (const chunk of connector.query(sql)) {
				if (signal?.aborted) {
					const abortError = new Error("Query aborted by user");
					abortError.name = "AbortError";
					throw abortError;
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
		};
	}

	/**
	 * Execute a SQL query and return results (non-streaming, uses active connector)
	 */
	async executeQuery(sql: string, signal?: AbortSignal): Promise<QueryResult> {
		const startTime = Date.now();
		const connector = this.getActiveConnector();

		const allRows: TableRow[] = [];
		const columns: string[] = [];
		let columnTypes: ColumnMetadata[] | undefined;

		try {
			for await (const chunk of connector.query(sql)) {
				if (signal?.aborted) {
					const abortError = new Error("Query aborted by user");
					abortError.name = "AbortError";
					throw abortError;
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
				executionTime: Date.now() - startTime,
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
}

// Export singleton instance
export const streamingQueryService = new StreamingQueryService();

// Also export as queryService for backward compatibility during migration
export const queryService = streamingQueryService;
