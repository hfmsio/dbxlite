/**
 * Export-strategy contract.
 *
 * Each strategy owns one path from "user clicked Export" to "file on disk":
 *   - exportViaDuckDBCopy:        DuckDB-only, fastest, uses COPY (sql) TO ...
 *   - exportViaCloudStreaming:    re-queries cloud connector, pipes through DuckDB
 *   - exportViaPreloaded:         in-memory rows, no SQL re-execution
 *
 * Strategies are pure functions over ExportContext + return ExportResult.
 * Picking a strategy is a capability check (NOT a connector-name check)
 * so adding a new connector type doesn't require changing the dispatcher.
 */
import type { QueryResult } from "../../../services/streaming-query-service";
import type { ColumnInfo } from "../types";

export type ExportFormat = "csv" | "json" | "parquet";

export interface ExportContext {
	format: ExportFormat;
	fileName: string;
	/** Original SQL the user ran. Available for streaming strategies. */
	sql?: string;
	/** Currently displayed result (rows already in memory). */
	result?: QueryResult | null;
	/** Column info from the table — used when no result is available. */
	columns: ColumnInfo[];
	/** Aborted by user (ESC) or unmount. */
	signal: AbortSignal;
	/** Progress reporting hook. */
	onProgress: (params: {
		currentStage: string;
		currentStep: number;
		totalSteps: number;
	}) => void;
}

export interface ExportResult {
	/** Display name reported in the success toast / completion modal. */
	fileHandleName: string;
	/** Number of rows actually written. */
	rowsExported: number;
	/** Optional human-readable file size for non-streaming strategies. */
	fileSizeStr?: string;
}

export interface ExportStrategy {
	/** Stable name for logs / telemetry / tests. */
	readonly name: string;
	/** True if this strategy can handle the given context. */
	canHandle(ctx: ExportContext): boolean;
	/** Run the export. Throws on user cancel or fatal failure. */
	execute(ctx: ExportContext): Promise<ExportResult>;
}
