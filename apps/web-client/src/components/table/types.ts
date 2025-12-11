/**
 * Type definitions for PaginatedTable component
 */

import type { QueryResult } from "../../services/streaming-query-service";

export interface PaginatedTableProps {
	// Mode 1: Streaming mode (DuckDB large datasets)
	sql?: string;
	// Mode 2: Pre-loaded mode (BigQuery, small datasets)
	result?: QueryResult | null;

	// Tab ID for loading state management (prevents wrong tab updates on tab switch)
	tabId?: string;

	// External error from parent (e.g., from useQueryExecution)
	error?: string | null;

	onError?: (error: string) => void;
	onLoadingChange?: (loading: boolean, tabId?: string) => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	gridFontSize?: number;
	gridRowHeight?: number;
	pageSize?: number;
	abortSignal?: AbortSignal;
	// Optional: Pre-computed row count from App.tsx (avoids duplicate getRowCount call)
	estimatedRowCount?: number;
	// Optional: Whether the row count is estimated (true) or exact (false)
	rowCountIsEstimated?: boolean;
	// Optional: Cache threshold - if result size is below this, cache all results for in-memory sorting
	cacheThreshold?: number;

	// Export progress callbacks
	onExportStart?: (params: {
		fileType: "csv" | "json" | "parquet";
		fileName: string;
		totalSteps: number;
	}) => void;
	onExportProgress?: (params: {
		currentStage: string;
		currentStep: number;
	}) => void;
	onExportComplete?: () => void;
	onExportError?: (error: string) => void;

	// Toast history
	onShowHistory?: () => void;
	historyCount?: number;
}

export interface RowData {
	[key: string]: unknown;
}

export interface ColumnInfo {
	name: string;
	width: number;
	type?: string;
}

export interface PaginatedTableHandle {
	clearSelection: () => void;
}
