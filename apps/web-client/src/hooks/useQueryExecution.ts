import { useCallback, useRef, useState } from "react";
import {
	type ConnectorType,
	queryService,
} from "../services/streaming-query-service";
import type { EngineDetectionMode } from "../stores/settingsStore";
import { errorMonitor } from "../utils/errorMonitor";
import { detectQueryEngine } from "../utils/engineDetectors";
import { createLogger } from "../utils/logger";
import { formatQueryError } from "../utils/queryErrorFormatter";
import { extractQueryAtCursor } from "../utils/queryExtractor";
import { formatExecutionTime } from "../utils/timeFormatter";
import { detectRemoteURLs } from "../utils/urlDetector";
import { useBigQueryCostWarning } from "./useBigQueryCostWarning";

import type { DataSource } from "../types/data-source";
import type { CostWarningState } from "./useBigQueryCostWarning";

const logger = createLogger("QueryExecution");

// Threshold for switching to virtual scrolling (rows)
const VIRTUAL_TABLE_THRESHOLD = 100;

interface UseQueryExecutionOptions {
	initializing: boolean;
	initError: string | null;
	isUploadingFiles: boolean;
	isExporting: boolean;
	editorRef: React.MutableRefObject<unknown>;
	activeConnector: ConnectorType;
	activeTabId: string;
	updateTab: (tabId: string, updates: Partial<Record<string, unknown>>) => void;
	showToast: (
		message: string,
		type?: "success" | "error" | "warning" | "info",
		duration?: number,
	) => void;
	addRemoteURL: (url: string, type: string) => Promise<DataSource>;
	dataSources: DataSource[];
	// Engine detection options
	engineDetectionMode: EngineDetectionMode;
	switchConnector: (type: ConnectorType) => boolean;
	isConnectorAvailable: (type: ConnectorType) => boolean;
	// Schema change callback (for DDL statements on session tables)
	onSchemaChanged?: () => Promise<void>;
	// Schema change callback for attached databases (for DDL on attached DBs)
	onDatabaseSchemaChanged?: (dbName: string) => Promise<void>;
	// Callback when a database is attached via ATTACH command
	onDatabaseAttached?: (info: { path: string; alias: string; readOnly: boolean }) => Promise<void>;
	// Callback when a database is detached via DETACH command
	onDatabaseDetached?: (alias: string) => Promise<void>;
}

interface UseQueryExecutionReturn {
	isQueryExecuting: boolean;
	setIsQueryExecuting: (executing: boolean) => void;
	abortControllerRef: React.MutableRefObject<AbortController | null>;
	handleRunQuery: () => Promise<void>;
	handleStopQuery: () => void;
	costWarning: CostWarningState | null;
	handleCostWarningConfirm: () => void;
	handleCostWarningCancel: () => void;
}

/**
 * Hook for handling query execution with DuckDB and BigQuery support.
 * Manages query state, abort controllers, and streaming vs pre-loaded mode decisions.
 */
/**
 * Check if a SQL statement is a DDL statement that modifies schema
 */
function isDDLStatement(sql: string): boolean {
	// Match statements that modify schema: CREATE, DROP, ALTER on tables/views
	// Handles: CREATE TABLE, CREATE TEMP TABLE, CREATE OR REPLACE TEMP TABLE, CREATE MACRO, etc.
	return /^\s*(CREATE|DROP|ALTER)\s+(OR\s+REPLACE\s+)?(TEMP\s+|TEMPORARY\s+)?(TABLE|VIEW|SCHEMA|INDEX|MACRO)/i.test(sql);
}

/**
 * Extract the target database name from a DDL statement.
 * Returns null if no database qualifier is found or if it's the default "memory" database.
 *
 * Matches patterns like:
 * - CREATE TABLE dbname.schema.table
 * - CREATE TABLE dbname.table
 * - DROP TABLE dbname.schema.table
 * - ALTER TABLE dbname.table
 */
function extractTargetDatabase(sql: string): string | null {
	// Normalize whitespace and remove comments
	const normalizedSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

	// Match CREATE/DROP/ALTER TABLE/VIEW followed by qualified name (dbname.schema.table or dbname.table)
	// The pattern captures the first identifier before the dot
	const match = normalizedSql.match(
		/^\s*(CREATE|DROP|ALTER)\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?(?:TABLE|VIEW)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["'`]?(\w+)["'`]?\s*\./i
	);

	if (match) {
		const dbName = match[2];
		// Ignore if it's the default memory database or main schema
		if (dbName && dbName.toLowerCase() !== 'memory' && dbName.toLowerCase() !== 'main') {
			return dbName;
		}
	}

	return null;
}

/**
 * Check if a SQL statement is a non-SELECT statement (DML, DDL, or other commands)
 * These should be executed directly without row count estimation or pagination
 */
function isNonSelectStatement(sql: string): boolean {
	// Match statements that don't return result sets in the traditional sense
	// Also includes EXPLAIN/SHOW/DESCRIBE which should run directly without row count estimation
	return /^\s*(COPY|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|SET|PRAGMA|CHECKPOINT|VACUUM|ANALYZE|BEGIN|COMMIT|ROLLBACK|CALL|EXECUTE|EXPLAIN|SHOW|DESCRIBE)\b/i.test(sql);
}

/**
 * Parse an ATTACH statement to extract the database path and alias
 * Supports: ATTACH 'path' AS alias, ATTACH 'path' AS alias (READ_ONLY), etc.
 */
function parseAttachStatement(sql: string): { path: string; alias: string; readOnly: boolean } | null {
	// Normalize whitespace and remove comments
	const normalizedSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

	// Match ATTACH 'path' AS alias with optional READ_ONLY
	// Patterns:
	//   ATTACH 'path/to/db.duckdb' AS mydb
	//   ATTACH 'path/to/db.duckdb' AS mydb (READ_ONLY)
	//   ATTACH "path/to/db.duckdb" AS mydb
	const attachMatch = normalizedSql.match(
		/^\s*ATTACH\s+['"]([^'"]+)['"]\s+AS\s+["'`]?(\w+)["'`]?\s*(?:\(\s*(READ_ONLY)\s*\))?/i
	);

	if (attachMatch) {
		return {
			path: attachMatch[1],
			alias: attachMatch[2],
			readOnly: !!attachMatch[3],
		};
	}

	return null;
}

/**
 * Parse a DETACH statement to extract the database alias
 * Supports: DETACH alias, DETACH DATABASE alias, DETACH IF EXISTS alias
 */
function parseDetachStatement(sql: string): { alias: string } | null {
	// Normalize whitespace and remove comments
	const normalizedSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

	// Match DETACH [DATABASE] [IF EXISTS] alias
	const detachMatch = normalizedSql.match(
		/^\s*DETACH\s+(?:DATABASE\s+)?(?:IF\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*;?\s*$/i
	);

	if (detachMatch) {
		return {
			alias: detachMatch[1],
		};
	}

	return null;
}

export function useQueryExecution({
	initializing,
	initError,
	isUploadingFiles,
	isExporting,
	editorRef,
	activeConnector,
	activeTabId,
	updateTab,
	showToast,
	addRemoteURL,
	dataSources,
	engineDetectionMode,
	switchConnector,
	isConnectorAvailable,
	onSchemaChanged,
	onDatabaseSchemaChanged,
	onDatabaseAttached,
	onDatabaseDetached,
}: UseQueryExecutionOptions): UseQueryExecutionReturn {
	const [isQueryExecuting, setIsQueryExecuting] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Initialize BigQuery cost warning hook
	const { checkCost, costWarning, handleConfirm, handleCancel } =
		useBigQueryCostWarning(showToast);

	/**
	 * Stop the currently running query
	 */
	const handleStopQuery = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		// Also cancel any active streaming queries at the service layer (DuckDB/BigQuery)
		try {
			queryService.cancelAllQueries();
		} catch (err) {
			logger.warn("Failed to cancel active queries", err);
		}
		// Clear loading state on the active tab and overlay flag
		updateTab(activeTabId, { loading: false });
		setIsQueryExecuting(false);
		showToast("Query cancelled", "info", 2000);
	}, [activeTabId, showToast, updateTab]);

	/**
	 * Execute a SQL query with automatic mode selection (streaming vs pre-loaded)
	 */
	const handleRunQuery = useCallback(async () => {
		if (initializing || initError || isUploadingFiles || isExporting) {
			return;
		}

		if (!editorRef.current) {
			updateTab(activeTabId, { error: "Editor not ready" });
			return;
		}

		// Get full editor content, selection, and cursor position
		const fullText = editorRef.current.getValue();
		const selectedText = editorRef.current.getSelection();
		const cursorPosition = editorRef.current.getCursorPosition();

		// Extract the query to execute (selected text or query at cursor)
		const sql = extractQueryAtCursor(fullText, cursorPosition, selectedText);

		if (!sql.trim()) {
			updateTab(activeTabId, { error: "Please enter a SQL query" });
			return;
		}

		// Track which connector to use for this execution
		// Start with the currently selected connector, may be updated by auto-detection
		let effectiveConnector: ConnectorType = activeConnector;

		// Engine detection - check if query is intended for a different engine
		// Strategy: BigQuery uses backticks, everything else defaults to DuckDB
		if (engineDetectionMode !== "off") {
			const detection = detectQueryEngine(sql);

			// Determine target engine:
			// - If BigQuery detected with confidence → use BigQuery
			// - Otherwise → default to DuckDB
			let targetEngine: ConnectorType = "duckdb"; // Default
			let signalSummary = "";

			if (
				detection.engine === "bigquery" &&
				detection.confidence !== "low"
			) {
				targetEngine = "bigquery";
				signalSummary =
					detection.signals.length > 0
						? ` (${detection.signals.slice(0, 2).join(", ")})`
						: "";
			}

			// Only act if target differs from current connector
			if (targetEngine !== effectiveConnector) {
				if (engineDetectionMode === "auto") {
					// Auto mode: switch and continue
					if (!isConnectorAvailable(targetEngine)) {
						showToast(
							`Detected ${targetEngine} syntax${signalSummary}, but ${targetEngine} is not connected. Configure it in Settings first.`,
							"error",
							5000,
						);
						return; // Don't execute - incompatible query would fail anyway
					} else {
						const switched = switchConnector(targetEngine);
						if (switched) {
							showToast(
								`Auto-switched to ${targetEngine}${signalSummary || " (default)"}`,
								"info",
								3000,
							);
							// Use the switched connector for this execution
							effectiveConnector = targetEngine;
						}
					}
				} else if (engineDetectionMode === "suggest") {
					// Suggest mode: warn and block execution
					if (!isConnectorAvailable(targetEngine)) {
						showToast(
							`This looks like ${targetEngine} syntax${signalSummary}, but ${targetEngine} is not connected. Configure it in Settings.`,
							"error",
							5000,
						);
						return; // Don't execute - incompatible query would fail anyway
					} else {
						showToast(
							`This looks like ${targetEngine} syntax${signalSummary || " (default)"}. Switch connector to run.`,
							"warning",
							5000,
						);
						return; // Don't execute - user must manually switch
					}
				}
			}
		}

		// Create new AbortController for this query
		abortControllerRef.current = new AbortController();

		// Set query executing flag for overlay tracking
		setIsQueryExecuting(true);

		// Ensure service is in sync with the effective connector for this execution
		if (queryService.getActiveConnectorType() !== effectiveConnector) {
			queryService.setActiveConnector(effectiveConnector);
		}

		const activeConnectorType = effectiveConnector;
		let isStreamingMode = false; // Track if we're using streaming mode

		// Check for LIMIT clause at the END of query (not in subqueries/CTEs)
		// Only match LIMIT followed by optional semicolon or end of string
		const finalLimitMatch = sql.trim().match(/\bLIMIT\s+(\d+)\s*(?:;|\s*)$/i);
		const userLimit = finalLimitMatch
			? parseInt(finalLimitMatch[1], 10)
			: undefined;
		const hasUserLimit = finalLimitMatch !== null;
		const hasLargeLimit = userLimit !== undefined && userLimit > 10000;

		if (finalLimitMatch && userLimit !== undefined) {
			// For large LIMITs, inform user that pagination will be used for memory safety
			if (userLimit > 10000) {
				showToast(
					`📊 Large LIMIT (${userLimit.toLocaleString()} rows) will use paginated streaming for memory safety. You can still access all rows.`,
					"info",
					5000,
				);
			}
		}

		updateTab(activeTabId, {
			loading: true,
			error: null,
			useVirtualTable: false,
			executedSql: undefined,
			estimatedRowCount: undefined,
			abortSignal: abortControllerRef.current.signal,
		});

		try {
			// For BigQuery, skip row count estimation and use regular query execution
			// BigQuery queries are handled via REST API with built-in pagination
			if (activeConnectorType === "bigquery") {
				// Check if query was aborted
				if (abortControllerRef.current?.signal.aborted) {
					updateTab(activeTabId, {
						error: "Query cancelled by user",
						loading: false,
						result: null,
					});
					return;
				}

			// Check BigQuery cost before execution
			const shouldProceed = await checkCost(sql);
			if (!shouldProceed) {
				// User cancelled due to high cost
				updateTab(activeTabId, {
					loading: false,
					error: null,
					result: null,
				});
				setIsQueryExecuting(false);
				showToast("Query cancelled - cost warning declined", "info", 2000);
				return;
			}

			// Execute BigQuery query directly without row count estimation
			updateTab(activeTabId, {
					useVirtualTable: false,
					executedSql: sql,
					estimatedRowCount: undefined,
					loading: true,
					result: null,
					error: null,
			});

			showToast("Running BigQuery query...", "info", 2000);

			const result = await queryService.executeQuery(
					sql,
					abortControllerRef.current.signal,
			);

			// Check if query was aborted during execution
			if (abortControllerRef.current?.signal.aborted) {
					updateTab(activeTabId, {
						error: "Query cancelled by user",
						loading: false,
						result: null,
					});
					return;
			}

			updateTab(activeTabId, {
					result,
					loading: false,
					error: null,
					useVirtualTable: false,
			});
			setIsQueryExecuting(false);

			showToast(
					`✓ Query completed in ${formatExecutionTime(result.executionTime)} (${result.rows.length} rows)`,
					"success",
					3000,
			);
			return;
			}

			// For DML/DDL statements, execute directly without row count estimation
			// These don't return result sets that need pagination
			if (isNonSelectStatement(sql)) {
				const result = await queryService.executeQuery(
					sql,
					abortControllerRef.current.signal,
				);

				if (abortControllerRef.current?.signal.aborted) {
					updateTab(activeTabId, {
						error: "Query cancelled by user",
						loading: false,
						result: null,
					});
					return;
				}

				updateTab(activeTabId, {
					result,
					loading: false,
					useVirtualTable: false,
					executedSql: sql,
				});
				setIsQueryExecuting(false);

				// Refresh schema if this was a DDL statement
				if (isDDLStatement(sql)) {
					// Check if DDL targets an attached database
					const targetDb = extractTargetDatabase(sql);
					if (targetDb && onDatabaseSchemaChanged) {
						await onDatabaseSchemaChanged(targetDb);
					} else if (onSchemaChanged) {
						// Default to session tables refresh
						await onSchemaChanged();
					}
				}

				// Check if this was an ATTACH statement and add to explorer
				const attachInfo = parseAttachStatement(sql);
				if (attachInfo && onDatabaseAttached) {
					await onDatabaseAttached(attachInfo);
				}

				// Check if this was a DETACH statement and remove from explorer
				const detachInfo = parseDetachStatement(sql);
				if (detachInfo && onDatabaseDetached) {
					await onDatabaseDetached(detachInfo.alias);
				}

				showToast(
					`✓ Query completed in ${formatExecutionTime(result.executionTime)}`,
					"success",
					3000,
				);
				return;
			}

			// For DuckDB queries, estimate row count to determine if we should use virtual scrolling
			// Times out after 10 seconds for very large datasets
			const { count: estimatedCount, isEstimated: rowCountIsEstimated } =
				await queryService.getRowCount(sql, abortControllerRef.current.signal);

			// Check if query was aborted during row count estimation
			if (abortControllerRef.current?.signal.aborted) {
				updateTab(activeTabId, {
					error: "Query cancelled by user",
					loading: false,
					result: null,
				});
				return;
			}

			// Detect aggregation queries that produce small results regardless of input size
			// These should always use pre-loaded mode for fast cached pagination
			const isAggregationQuery =
				/\b(GROUP\s+BY|HAVING|COUNT\s*\(|SUM\s*\(|AVG\s*\(|MAX\s*\(|MIN\s*\()\b/i.test(
					sql,
				);

			// Use paginated virtual scrolling if:
			// 1. No user LIMIT and large result set (original behavior)
			// 2. User LIMIT > 10K (force streaming for memory safety)
			// BUT: Never use streaming for aggregation queries (they produce small results)
			const shouldUseStreaming =
				((!hasUserLimit &&
					(estimatedCount >= VIRTUAL_TABLE_THRESHOLD ||
						estimatedCount === -1)) ||
					hasLargeLimit) &&
				!isAggregationQuery;
			if (shouldUseStreaming) {
				updateTab(activeTabId, {
					useVirtualTable: true,
					executedSql: sql,
					estimatedRowCount: estimatedCount,
					rowCountIsEstimated: rowCountIsEstimated,
					loading: true, // Keep loading true until PaginatedTable fetches data
					result: null,
					error: null,
				});

				const message =
					estimatedCount > 0
						? `📊 Query will scan ~${estimatedCount.toLocaleString()} rows. Using optimized pagination.`
						: estimatedCount === -1
							? "⚡ Very large dataset detected (count timed out). Using optimized pagination."
							: "📊 Large result set detected. Using optimized pagination.";

				showToast(message, "info", 5000);

				// Auto-detect and add remote URLs after successful streaming query start
				await addRemoteURLsFromQuery(sql);

				// Mark as streaming mode - PaginatedTable needs the abort controller
				// The abort controller will be cleared when a new query starts
				isStreamingMode = true;
				setIsQueryExecuting(false);
				return;
			} else {
				// For smaller result sets, use regular query execution

				const result = await queryService.executeQuery(
					sql,
					abortControllerRef.current.signal,
				);

				// Check if query was aborted
				if (abortControllerRef.current.signal.aborted) {
					updateTab(activeTabId, {
						error: "Query cancelled by user",
						loading: false,
						result: null,
					});
					return;
				}

				updateTab(activeTabId, {
					result,
					loading: false,
					useVirtualTable: false,
					executedSql: sql,
					estimatedRowCount: estimatedCount,
				});
				setIsQueryExecuting(false);

				// Auto-detect and add remote URLs after successful non-streaming query
				await addRemoteURLsFromQuery(sql);

				// Refresh schema if this was a DDL statement that modifies tables/views
				if (isDDLStatement(sql)) {
					// Check if DDL targets an attached database
					const targetDb = extractTargetDatabase(sql);
					if (targetDb && onDatabaseSchemaChanged) {
						await onDatabaseSchemaChanged(targetDb);
					} else if (onSchemaChanged) {
						// Default to session tables refresh
						await onSchemaChanged();
					}
				}

				// Check if this was an ATTACH statement and add to explorer
				const attachInfo = parseAttachStatement(sql);
				if (attachInfo && onDatabaseAttached) {
					await onDatabaseAttached(attachInfo);
				}

				// Check if this was a DETACH statement and remove from explorer
				const detachInfo = parseDetachStatement(sql);
				if (detachInfo && onDatabaseDetached) {
					await onDatabaseDetached(detachInfo.alias);
				}
			}
		} catch (err) {
			// Check if this was an abort error
			if (err instanceof Error && err.name === "AbortError") {
				updateTab(activeTabId, {
					error: "Query cancelled by user",
					loading: false,
					result: null,
					useVirtualTable: false,
				});
				showToast("Query cancelled", "info", 2000);
				return;
			}

			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("Query error", err);
			logger.debug("Query that failed", sql);

			// Format error into user-friendly message
			const { userMessage: userMsg, catalogName } = formatQueryError({
				errorMessage,
				sql,
				connectorType: activeConnectorType,
				dataSources,
			});

			// For catalog errors, also insert helpful attach command in editor
			if (catalogName && editorRef.current) {
				const attachCommand = `-- Fix: Attach the missing database\nATTACH '${catalogName}.duckdb' AS ${catalogName};\n\n-- Then run your query\n`;
				const currentQuery = editorRef.current.getValue();
				if (!currentQuery.includes(`ATTACH '${catalogName}.duckdb'`)) {
					editorRef.current.setValue(attachCommand + currentQuery);
				}
			}

			// Log to error monitor
			errorMonitor.logError("Query Execution", err, "error", {
				sql,
				errorMessage: userMsg,
			});

			updateTab(activeTabId, {
				error: userMsg,
				loading: false,
				result: null,
				useVirtualTable: false,
			});
			setIsQueryExecuting(false);
			showToast(`Query failed: ${userMsg}`, "error", 7000);
		} finally {
			// Only clear abort controller if NOT in streaming mode
			// Streaming mode (PaginatedTable) needs to keep the controller alive
			if (!isStreamingMode) {
				abortControllerRef.current = null;
			}
		}

		/**
		 * Helper to detect and add remote URLs from the SQL query
		 */
		async function addRemoteURLsFromQuery(sql: string) {
			const detectedURLs = detectRemoteURLs(sql);
			if (detectedURLs.length > 0) {
				for (const detected of detectedURLs) {
					try {
						await addRemoteURL(detected.url, detected.type);
					} catch (error) {
						const errorMsg =
							error instanceof Error ? error.message : String(error);
						// Show warning for failed remote files but don't block query execution
						if (
							errorMsg.includes("CORS") ||
							errorMsg.includes("Access-Control-Allow-Origin")
						) {
							showToast(
								`⚠️ Remote file blocked by CORS policy: ${detected.url}`,
								"warning",
								5000,
							);
						} else if (
							errorMsg.includes("404") ||
							errorMsg.includes("Not Found")
						) {
							showToast(
								`⚠️ Remote file not found: ${detected.url}`,
								"warning",
								5000,
							);
						} else if (
							errorMsg.includes("Failed to fetch") ||
							errorMsg.includes("timeout")
						) {
							showToast(
								`⚠️ Failed to access remote file (network error): ${detected.url}`,
								"warning",
								5000,
							);
						} else {
							showToast(
								`⚠️ Failed to add remote file to explorer: ${errorMsg}`,
								"warning",
								5000,
							);
						}
					}
				}
			}
		}
	}, [
		initializing,
		initError,
		isUploadingFiles,
		isExporting,
		editorRef,
		activeConnector,
		activeTabId,
		updateTab,
		showToast,
		addRemoteURL,
		dataSources,
		engineDetectionMode,
		switchConnector,
		isConnectorAvailable,
		onSchemaChanged,
		onDatabaseSchemaChanged,
	]);

	return {
		isQueryExecuting,
		setIsQueryExecuting,
		abortControllerRef,
		handleRunQuery,
		handleStopQuery,
		costWarning,
		handleCostWarningConfirm: handleConfirm,
		handleCostWarningCancel: handleCancel,
	};
}
