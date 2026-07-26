/**
 * Result and option shapes shared by the query collaborators.
 *
 * Split out during the QueryExecutor extraction (WS-A / A8) so the executor
 * and the facade can both name them without one importing the other.
 * `streaming-query-service` re-exports every one of these, so all existing
 * import sites keep working unchanged.
 */

import type { ConnectorType } from "../../types/data-source";
import type { TableRow } from "../../types/table";

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

