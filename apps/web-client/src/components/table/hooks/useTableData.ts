import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryService } from "../../../services/streaming-query-service";
import type { ConnectorType } from "../../../types/data-source";
import type { CellValue } from "../../../types/table";
import { createLogger } from "../../../utils/logger";
import {
	getPageFromSortedRows,
	type SortDirection,
	sortRows,
} from "../sortUtils";
import type { ColumnInfo, RowData } from "../types";
import { formatCellValue } from "../utils";
import { calculateAutoColumnWidths } from "../utils/columnWidthUtils";

const logger = createLogger("useTableData");

/**
 * Estimate payload size by sampling rows and using JSON.stringify
 * This matches how the worker calculates actual size
 */
function estimatePayloadSize(rows: RowData[]): number {
	if (rows.length === 0) return 0;

	// Sample up to 50 rows distributed across the dataset
	const sampleSize = Math.min(50, rows.length);
	let sampleBytes = 0;

	for (let i = 0; i < sampleSize; i++) {
		const idx = Math.floor((i / sampleSize) * rows.length);
		try {
			sampleBytes += JSON.stringify(rows[idx]).length;
		} catch {
			// If stringify fails (circular ref, etc), use rough estimate
			sampleBytes += 500;
		}
	}

	const avgRowSize = sampleBytes / sampleSize;
	return Math.round(avgRowSize * rows.length);
}

/**
 * Format byte size for display
 */
function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${Math.round(bytes / 1024)} KB`;
}

export interface UseTableDataProps {
	sql?: string;
	result?: {
		rows: RowData[];
		columns: string[];
		columnTypes?: { name: string; type: string }[];
		executionTime?: number;
	};
	pageSize: number;
	cacheThreshold: number;
	abortSignal?: AbortSignal;
	estimatedRowCount?: number;
	rowCountIsEstimated?: boolean;
	resizing?: boolean;
	scrollContainerRef: React.RefObject<HTMLDivElement>;
	showToast?: (
		message: string,
		type?: "success" | "error" | "warning" | "info",
		duration?: number,
	) => void;
	// Tab ID for loading state management (prevents wrong tab updates on tab switch)
	tabId?: string;
	onLoadingChange?: (loading: boolean, tabId?: string) => void;
	onError?: (error: string) => void;
}

export interface UseTableDataReturn {
	// Core state
	columns: ColumnInfo[];
	setColumns: React.Dispatch<React.SetStateAction<ColumnInfo[]>>;
	pageData: RowData[];
	formattedPageData: Record<string, string>[]; // Pre-formatted cell values for performance
	totalRows: number;
	isEstimatedCount: boolean;
	loading: boolean;
	error: string | null;
	executionTime: number;
	connectorType: ConnectorType;

	// Pagination
	currentPage: number;
	loadingPage: boolean;
	loadPage: (pageNumber: number) => Promise<void>;

	// Sorting
	sortColumn: string | null;
	sortDirection: SortDirection;
	handleColumnSort: (columnName: string) => void;

	// Caching
	cachedAllResults: RowData[] | null;
	isCacheComplete: boolean;
	isCaching: boolean;
}

/**
 * Hook for managing table data fetching, pagination, and caching.
 * Handles both streaming mode (SQL-based) and pre-loaded mode (result-based).
 */
export function useTableData({
	sql,
	result,
	pageSize,
	cacheThreshold,
	abortSignal,
	estimatedRowCount,
	rowCountIsEstimated = false,
	resizing = false,
	scrollContainerRef,
	showToast,
	tabId,
	onLoadingChange,
	onError,
}: UseTableDataProps): UseTableDataReturn {
	// Determine mode
	const isStreamingMode = !!sql && !result;
	const isPreLoadedMode = !!result;

	// Core state
	const [columns, setColumns] = useState<ColumnInfo[]>([]);
	const [totalRows, setTotalRows] = useState<number>(0);
	const [isEstimatedCount, setIsEstimatedCount] =
		useState<boolean>(rowCountIsEstimated);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [executionTime, setExecutionTime] = useState<number>(0);

	// Pagination state
	const [currentPage, setCurrentPage] = useState(0);
	const [pageData, setPageData] = useState<RowData[]>([]);
	const [loadingPage, setLoadingPage] = useState(false);

	// Sorting state
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	// Caching state
	const [cachedAllResults, setCachedAllResults] = useState<RowData[] | null>(
		null,
	);
	const [isCacheComplete, setIsCacheComplete] = useState(false);
	const [isCaching, setIsCaching] = useState(false);

	// Get active connector type
	const connectorType = queryService.getActiveConnectorType();

	// Pre-compute formatted cell values once when data changes
	// This prevents expensive formatCellValue calls on every render/keystroke
	const formattedPageData = useMemo(() => {
		if (!pageData.length || !columns.length) return [];

		return pageData.map((row) => {
			const formattedRow: Record<string, string> = {};
			for (const col of columns) {
				try {
					formattedRow[col.name] = formatCellValue(
						row[col.name] as CellValue,
						col.type,
						connectorType,
					);
				} catch (e) {
					// If formatting fails, show a placeholder to prevent crash
					logger.warn(`Failed to format cell ${col.name}:`, e);
					formattedRow[col.name] = "[Error]";
				}
			}
			return formattedRow;
		});
	}, [pageData, columns, connectorType]);

	// Refs
	const currentQueryIdRef = useRef<string>("");
	const initialSortRef = useRef(true);

	// Stable callback refs to prevent infinite loops when callbacks change
	const showToastRef = useRef(showToast);
	const onLoadingChangeRef = useRef(onLoadingChange);
	const onErrorRef = useRef(onError);
	// Store the tabId that was active when query started (captured in executeQuery)
	const queryTabIdRef = useRef<string | undefined>(undefined);

	// Keep refs updated (except queryTabIdRef which is captured at query start)
	showToastRef.current = showToast;
	onLoadingChangeRef.current = onLoadingChange;
	onErrorRef.current = onError;

	// Pagination calculations
	const totalPages = Math.ceil(totalRows / pageSize);

	/**
	 * Handle column sort toggle
	 */
	const handleColumnSort = useCallback(
		(columnName: string) => {
			if (sortColumn === columnName) {
				const newDirection = sortDirection === "asc" ? "desc" : "asc";
				setSortDirection(newDirection);
			} else {
				setSortColumn(columnName);
				setSortDirection("asc");
			}
		},
		[sortColumn, sortDirection],
	);

	// Reset to first page when page size changes
	useEffect(() => {
		setCurrentPage(0);
	}, []);

	/**
	 * Execute the initial query to get row count and first page
	 */
	const executeQuery = useCallback(async () => {
		if (!sql) {
			logger.error("executeQuery called without SQL");
			return;
		}
		const queryId = `${Date.now()}_${Math.random()}`;
		currentQueryIdRef.current = queryId;
		// Capture the tabId at query start - this ensures the correct tab's loading
		// state is updated even if user switches tabs during query execution
		queryTabIdRef.current = tabId;

		const queryStartTime = Date.now();
		setLoading(true);
		logger.debug("[LOADING] Setting loading=true for tab:", queryTabIdRef.current);
		onLoadingChangeRef.current?.(true, queryTabIdRef.current);
		setError(null);
		setCurrentPage(0);

		// Clear cache state AND sort state at the start of every new query
		setCachedAllResults(null);
		setIsCacheComplete(false);
		setIsCaching(false);
		setSortColumn(null);
		setSortDirection("asc");

		try {
			if (abortSignal?.aborted) {
				throw Object.assign(new Error("Query cancelled by user"), {
					name: "AbortError",
				});
			}

			// Get total row count
			let count: number;
			let isEstimated: boolean;
			if (estimatedRowCount !== undefined) {
				count = estimatedRowCount;
				isEstimated = rowCountIsEstimated;
			} else {
				const result = await queryService.getRowCount(sql, abortSignal);
				count = result.count;
				isEstimated = result.isEstimated;
			}

			if (currentQueryIdRef.current !== queryId) return;

			// Update state with count
			setIsEstimatedCount(isEstimated);
			if (count > 0) {
				setTotalRows(count);
			} else if (count === -1) {
				setTotalRows(10000000); // Placeholder for very large
			} else {
				setTotalRows(100000); // Default
			}

			// Get first page to determine columns
			const firstPage = await queryService.getPage(
				sql,
				0,
				pageSize,
				abortSignal,
			);

			if (currentQueryIdRef.current !== queryId) return;

			// Set page data
			setPageData(firstPage.rows || []);

			// Set columns from schema
			if (firstPage.columns && firstPage.columns.length > 0) {
				setColumns(() => {
					const initialColumns = (firstPage.columns ?? []).map((col) => ({
						name: col.name,
						width: undefined,
						type: col.type,
					}));

					// Auto-calculate widths if we have data
					if (firstPage.rows.length > 0) {
						const containerWidth =
							scrollContainerRef.current?.clientWidth || 1200;
						return calculateAutoColumnWidths(
							initialColumns,
							firstPage.rows,
							containerWidth,
							connectorType,
						);
					}

					return initialColumns.map((col) => ({
						...col,
						width: col.width || 150,
					}));
				});
			} else if (firstPage.rows.length > 0) {
				// Fallback: infer from JavaScript types
				const columnNames = Object.keys(firstPage.rows[0]);
				setColumns(() => {
					const initialColumns = columnNames.map((name) => ({
						name,
						width: undefined,
						type: typeof firstPage.rows[0][name],
					}));

					const containerWidth =
						scrollContainerRef.current?.clientWidth || 1200;
					return calculateAutoColumnWidths(
						initialColumns,
						firstPage.rows,
						containerWidth,
						connectorType,
					);
				});
			} else {
				setColumns([]);
			}

			const queryTime = Date.now() - queryStartTime;
			setExecutionTime(queryTime);

			showToastRef.current?.(
				`Query complete (${count > 0 ? count.toLocaleString() : "many"} rows) in ${queryTime}ms`,
				"success",
				3000,
			);

			// Show warning for large payloads to help users understand memory impact
			// Note: firstPage.queryStats only covers the first page, not full dataset
			// Full stats are available after caching completes
			if (firstPage.queryStats) {
				logger.debug("First page stats", firstPage.queryStats);
			}

			// Reset loading state immediately after first page is shown
			// Caching continues in background but shouldn't block the UI
			setLoading(false);
			onLoadingChangeRef.current?.(false, queryTabIdRef.current);

			// Caching logic for in-memory sorting:
			// - Always attempt to fetch up to cacheThreshold rows
			// - If we get ALL rows before hitting threshold → cache complete, sorting allowed
			// - If we hit threshold → dataset too large, abort cache, require ORDER BY in SQL
			// This ensures sorting only works on COMPLETE data (no partial/misleading results)
			if (isStreamingMode && !isCacheComplete) {
				const firstPageHasAllResults = firstPage.rows.length < pageSize;

				// If first page already has all results, cache immediately
				if (firstPageHasAllResults) {
					setCachedAllResults(firstPage.rows);
					setIsCacheComplete(true);
					setIsCaching(false);
					const actualCount = firstPage.rows.length;
					setTotalRows(actualCount);
					setIsEstimatedCount(false);

					if (actualCount > 0) {
						// Calculate size using JSON.stringify sampling (accurate for nested objects)
						const totalBytes = estimatePayloadSize(firstPage.rows);
						const estimatedMB = totalBytes / (1024 * 1024);
						showToastRef.current?.(
							`Cached ${actualCount.toLocaleString()} rows (~${formatSize(totalBytes)})`,
							estimatedMB >= 10 ? "warning" : "info",
							estimatedMB >= 10 ? 5000 : 3000,
						);
					}
				} else {
					// Fetch pages in background to determine actual size
					setIsCaching(true);

					try {
						const allResults: RowData[] = [...firstPage.rows];
						let page = 1;
						const maxPagesToFetch = Math.ceil(cacheThreshold / pageSize) + 1;
						let consecutivePartialPages = 0;

						while (page < maxPagesToFetch) {
							if (currentQueryIdRef.current !== queryId) {
								setIsCaching(false);
								// Loading already reset after first page
								return;
							}

							const pageResult = await queryService.getPage(
								sql,
								page * pageSize,
								pageSize,
								abortSignal,
							);

							// Reached end of data - only trust completely empty pages
							// Safari's DuckDB WASM may return partial pages incorrectly
							if (pageResult.rows.length === 0) {
								break;
							}

							allResults.push(...pageResult.rows);
							page++;

							// Check if we've exceeded threshold - dataset too large
							if (allResults.length >= cacheThreshold) {
								// Abort caching - dataset is too large for in-memory sorting
								// Loading already reset after first page, so just clean up cache state
								setIsCaching(false);
								setCachedAllResults(null);
								setIsCacheComplete(false);
								// Update totalRows: estimate may be wrong, so assume 10x what we've discovered
								// This enables on-demand pagination beyond the initial estimate
								setTotalRows(allResults.length * 10);
								setIsEstimatedCount(true);
								showToastRef.current?.(
									`Dataset has ${allResults.length.toLocaleString()}+ rows. Use ORDER BY in SQL for sorting.`,
									"info",
									3000,
								);
								return;
							}

							// Track partial pages - require 2 consecutive partial pages to confirm end of data
							// This handles Safari's DuckDB WASM which may return partial pages mid-stream
							if (pageResult.rows.length < pageSize) {
								consecutivePartialPages++;
								if (consecutivePartialPages >= 2) {
									break;
								}
							} else {
								consecutivePartialPages = 0;
							}
						}

						// Successfully fetched ALL rows (stayed under threshold)
						if (currentQueryIdRef.current === queryId) {
							setCachedAllResults(allResults);
							setIsCacheComplete(true);
							setIsCaching(false);
							setTotalRows(allResults.length);
							setIsEstimatedCount(false);

							// Calculate size using JSON.stringify sampling (accurate for nested objects)
							const estimatedTotalBytes = estimatePayloadSize(allResults);
							const estimatedMB = estimatedTotalBytes / (1024 * 1024);

							showToastRef.current?.(
								`Cached ${allResults.length.toLocaleString()} rows (~${formatSize(estimatedTotalBytes)})`,
								estimatedMB >= 10 ? "warning" : "info",
								estimatedMB >= 10 ? 5000 : 3000,
							);
						}
					} catch (cacheErr) {
						logger.error("Caching failed:", cacheErr);
						setIsCaching(false);
						setCachedAllResults(null);
						setIsCacheComplete(false);
						// Loading already reset after first page
					}
				}
			}

			// Loading already reset after first page was shown (line 293-294)
		} catch (err) {
			if (currentQueryIdRef.current !== queryId) return;

			if (err instanceof Error && err.name === "AbortError") {
				setError("Query cancelled by user");
				onErrorRef.current?.("Query cancelled by user");
				showToastRef.current?.("Query cancelled", "info", 2000);
				setLoading(false);
				onLoadingChangeRef.current?.(false, queryTabIdRef.current);
				return;
			}

			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Query execution failed:", errorMsg, err);

			let userMsg = errorMsg;
			if (errorMsg.includes("Catalog") && errorMsg.includes("does not exist")) {
				userMsg = `Database error: ${errorMsg}. You may need to ATTACH the database file first.`;
			}

			setError(userMsg);
			onErrorRef.current?.(userMsg);
			showToastRef.current?.(`Query failed: ${userMsg}`, "error", 7000);
			setLoading(false);
			onLoadingChangeRef.current?.(false, queryTabIdRef.current);
		}
		// Note: isCacheComplete is intentionally NOT in deps - it's checked but setting it during execution
		// would cause an infinite loop if it was a dependency. Callbacks use refs for stability.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		sql,
		tabId,
		pageSize,
		abortSignal,
		estimatedRowCount,
		rowCountIsEstimated,
		cacheThreshold,
		scrollContainerRef,
		connectorType,
		isStreamingMode,
	]);

	/**
	 * Load a specific page of data
	 */
	const loadPage = useCallback(
		async (pageNumber: number) => {
			if (pageNumber < 0 || pageNumber >= totalPages) {
				return;
			}

			setLoadingPage(true);
			try {
				// Check if requested page is within cached data
				const pageStartRow = pageNumber * pageSize;
				const cachedRowCount = cachedAllResults?.length || 0;
				const pageIsInCache = cachedAllResults && pageStartRow < cachedRowCount;

				if (pageIsInCache && (isCacheComplete || sortColumn)) {
					// Use cached results if:
					// 1. Cache is complete (we have all data), OR
					// 2. User has applied sorting (must use cache for consistent order)
					const pageRows = getPageFromSortedRows(
						cachedAllResults!,
						pageNumber,
						pageSize,
						sortColumn,
						sortDirection,
					);
					setPageData(pageRows);
				} else if (isStreamingMode && sql) {
					// Streaming mode: load from database (no sort applied or page beyond cache)
					const pageResult = await queryService.getPage(
						sql,
						pageNumber * pageSize,
						pageSize,
						abortSignal,
					);
					setPageData(pageResult.rows);
				} else if (isPreLoadedMode && result) {
					// Pre-loaded mode: slice from in-memory data
					const pageRows = getPageFromSortedRows(
						result.rows,
						pageNumber,
						pageSize,
						sortColumn,
						sortDirection,
					);
					setPageData(pageRows);
				}
				setCurrentPage(pageNumber);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logger.error("Failed to load page:", errorMsg);
				showToastRef.current?.(
					`Failed to load page: ${errorMsg}`,
					"error",
					3000,
				);
			} finally {
				setLoadingPage(false);
			}
		},
		[
			sql,
			result,
			totalPages,
			pageSize,
			abortSignal,
			isStreamingMode,
			isPreLoadedMode,
			sortColumn,
			sortDirection,
			isCacheComplete,
			cachedAllResults,
		],
	);

	// Effect for streaming mode (SQL-based)
	useEffect(() => {
		if (!isStreamingMode || !sql) return;

		setError(null);
		setPageData([]);
		setColumns([]);
		executeQuery();

		return () => {
			// Cleanup handled by abort signal
		};
	}, [sql, isStreamingMode, executeQuery]);

	// Effect to clear state when neither sql nor result is provided
	useEffect(() => {
		if (!sql && !result) {
			setPageData([]);
			setColumns([]);
			setTotalRows(0);
			setError(null);
			setSortColumn(null);
			setSortDirection("asc");
		}
	}, [sql, result]);

	// Effect for pre-loaded mode (result-based)
	useEffect(() => {
		if (!isPreLoadedMode || !result) return;

		setPageData([]);
		setColumns([]);

		// Clear sort state when result changes
		setSortColumn(null);
		setSortDirection("asc");

		// Extract columns with types
		const initialColumns: ColumnInfo[] = result.columns.map((col) => {
			const columnType = result.columnTypes?.find((c) => c.name === col);
			return {
				name: col,
				width: 150,
				type: columnType?.type,
			};
		});

		// Auto-calculate widths
		let resultColumns: ColumnInfo[];
		if (result.rows.length > 0) {
			const containerWidth = scrollContainerRef.current?.clientWidth || 1200;
			resultColumns = calculateAutoColumnWidths(
				initialColumns,
				result.rows,
				containerWidth,
				connectorType,
			);
		} else {
			resultColumns = initialColumns.map((col) => ({
				...col,
				width: 150,
			}));
		}

		setColumns(resultColumns);
		setTotalRows(result.rows.length);
		setExecutionTime(result.executionTime || 0);
		setError(null);
		setCurrentPage(0);

		// Load first page
		const firstPage = result.rows.slice(0, pageSize);
		setPageData(firstPage);

		// Calculate payload size for transparency (pre-loaded mode)
		if (result.rows.length > 0) {
			const estimatedTotalBytes = estimatePayloadSize(result.rows);
			const estimatedMB = estimatedTotalBytes / (1024 * 1024);

			showToastRef.current?.(
				`Cached ${result.rows.length.toLocaleString()} rows (~${formatSize(estimatedTotalBytes)})`,
				estimatedMB >= 10 ? "warning" : "info",
				estimatedMB >= 10 ? 5000 : 3000,
			);
		}
	}, [result, isPreLoadedMode, pageSize, scrollContainerRef, connectorType]);

	// Handle sorting for pre-loaded mode
	useEffect(() => {
		if (!isPreLoadedMode || !result || !sortColumn) return;

		const sortedRows = sortRows(result.rows, sortColumn, sortDirection);
		setCurrentPage(0);
		setPageData(sortedRows.slice(0, pageSize));
	}, [sortColumn, sortDirection, isPreLoadedMode, result, pageSize]);

	// Handle sorting changes in streaming mode
	// - Only allow sorting when we have COMPLETE cached data (isCacheComplete && cachedAllResults)
	// - If caching is in progress, wait for it to complete
	// - If dataset is too large (cache aborted), require ORDER BY in SQL
	useEffect(() => {
		if (!isStreamingMode || !sql || columns.length === 0) return;

		// Skip on initial render
		if (initialSortRef.current) {
			initialSortRef.current = false;
			return;
		}

		// Don't do anything if there's no sort applied
		if (!sortColumn || !sortDirection) {
			return;
		}

		// Don't re-execute if we're currently resizing columns
		if (resizing) {
			return;
		}

		// If caching is in progress, wait for it to complete
		if (isCaching) {
			showToastRef.current?.("Caching results, please wait...", "info", 2000);
			return;
		}

		// Only allow sorting when we have COMPLETE cached data
		// This ensures sorting results are accurate and not misleading
		if (isCacheComplete && cachedAllResults && cachedAllResults.length > 0) {
			const sortedRows = sortRows(cachedAllResults, sortColumn, sortDirection);
			setCurrentPage(0);
			setPageData(sortedRows.slice(0, pageSize));
			showToastRef.current?.(
				`Sorted ${cachedAllResults.length.toLocaleString()} rows by "${sortColumn}"`,
				"success",
				2000,
			);
		} else {
			// Cache not complete - either still loading, failed, or dataset too large
			showToastRef.current?.(
				"Dataset too large to sort. Add ORDER BY to your SQL query.",
				"warning",
				4000,
			);
			// Clear sort state since we can't apply it
			setSortColumn(null);
			setSortDirection("asc");
		}
	}, [
		sortColumn,
		sortDirection,
		isStreamingMode,
		sql,
		columns.length,
		resizing,
		isCaching,
		isCacheComplete,
		cachedAllResults,
		pageSize,
	]);

	return {
		columns,
		setColumns,
		pageData,
		formattedPageData,
		totalRows,
		isEstimatedCount,
		loading,
		error,
		executionTime,
		connectorType,
		currentPage,
		loadingPage,
		loadPage,
		sortColumn,
		sortDirection,
		handleColumnSort,
		cachedAllResults,
		isCacheComplete,
		isCaching,
	};
}
