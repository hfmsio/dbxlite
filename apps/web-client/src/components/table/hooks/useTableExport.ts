/**
 * useTableExport
 *
 * Thin orchestrator over the export-strategy registry. Owns:
 *   - the isExporting / exportComplete React state
 *   - the AbortController + ESC-key handler
 *   - the user-facing toasts and progress callbacks
 *
 * The actual export work lives in `../exporters/`. Each strategy is a
 * standalone module with its own canHandle() + execute(). Adding a new
 * strategy means dropping a file into `../exporters/` and adding it to
 * the registry list — no changes here.
 */
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryService } from "../../../services/streaming-query-service";
import type { QueryResult } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import type { ExportPreview } from "../ExportConfirmDialog";
import {
	type ExportCompletionStatus,
	type ExportFormat,
	createExportCompletionStatus,
	formatFileSize,
	generateExportFileName,
} from "../exportUtils";
import { type ExportContext, pickStrategy } from "../exporters";
import { CLOUD_PARQUET_ROW_CAP } from "../exporters/cloudStreaming";
import type { ColumnInfo } from "../types";

const logger = createLogger("useTableExport");

interface UseTableExportOptions {
	sql?: string;
	result?: QueryResult | null;
	columns: ColumnInfo[];
	/** Best-known total row count, for the cost preview + truncation warning. */
	estimatedRowCount?: number;
	rowCountIsEstimated?: boolean;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onExportStart?: (params: {
		fileType: ExportFormat;
		fileName: string;
		totalSteps: number;
	}) => void;
	onExportProgress?: (params: {
		currentStage: string;
		currentStep: number;
	}) => void;
	onExportComplete?: () => void;
	onExportError?: (error: string) => void;
}

export interface UseTableExportReturn {
	isExporting: boolean;
	exportComplete: ExportCompletionStatus | null;
	setExportComplete: React.Dispatch<
		React.SetStateAction<ExportCompletionStatus | null>
	>;
	handleExport: (format: ExportFormat) => Promise<void>;
	cancelExport: () => void;
	clearExportComplete: () => void;
	/** Cost/scope preview awaiting the user's decision, or null. */
	exportPreview: ExportPreview | null;
	/** Resolve the preview: proceed with the export. */
	confirmExportPreview: () => void;
	/** Resolve the preview: abort the export. */
	cancelExportPreview: () => void;
	/** True while the ESC-triggered "cancel export?" prompt is showing. */
	cancelPrompt: boolean;
	/** Confirm the prompt: actually abort the running export. */
	confirmCancelExport: () => void;
	/** Dismiss the prompt: keep exporting. */
	dismissCancelExport: () => void;
}

export function useTableExport({
	sql,
	result,
	columns,
	estimatedRowCount,
	rowCountIsEstimated,
	showToast,
	onExportStart,
	onExportProgress,
	onExportComplete,
	onExportError,
}: UseTableExportOptions): UseTableExportReturn {
	const [isExporting, setIsExporting] = useState(false);
	const [exportComplete, setExportComplete] =
		useState<ExportCompletionStatus | null>(null);
	const exportAbortControllerRef = useRef<AbortController | null>(null);
	// Cost/scope confirmation gate. The promise resolver is held in a ref so
	// the dialog's confirm/cancel buttons can settle the awaited handleExport.
	const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
	const previewResolveRef = useRef<((proceed: boolean) => void) | null>(null);

	const settlePreview = useCallback((proceed: boolean) => {
		previewResolveRef.current?.(proceed);
		previewResolveRef.current = null;
		setExportPreview(null);
	}, []);

	const confirmExportPreview = useCallback(
		() => settlePreview(true),
		[settlePreview],
	);
	const cancelExportPreview = useCallback(
		() => settlePreview(false),
		[settlePreview],
	);

	// ESC asks before cancelling an in-flight export. Cancelling a nearly-done
	// 70M-row export on a stray keypress would waste all the progress (and the
	// BigQuery scan already billed), so ESC opens a confirmation rather than
	// aborting outright.
	const [cancelPrompt, setCancelPrompt] = useState(false);
	// Read the latest prompt state from the stable capture handler below.
	const cancelPromptRef = useRef(false);
	cancelPromptRef.current = cancelPrompt;

	useEffect(() => {
		if (!isExporting) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// If the prompt is already open, let ConfirmDialog handle Esc
			// (its Esc = "keep exporting", the safe default).
			if (cancelPromptRef.current) return;
			// Capture + stop so the editor's own Esc handling doesn't also fire.
			e.preventDefault();
			e.stopPropagation();
			setCancelPrompt(true);
		};
		// Capture phase: reliably intercept Esc even when the editor is focused.
		document.addEventListener("keydown", onKey, true);
		return () => document.removeEventListener("keydown", onKey, true);
	}, [isExporting]);

	const confirmCancelExport = useCallback(() => {
		setCancelPrompt(false);
		exportAbortControllerRef.current?.abort();
	}, []);

	const dismissCancelExport = useCallback(() => setCancelPrompt(false), []);

	// Dismiss completion message on user interaction
	useEffect(() => {
		if (!exportComplete) return;
		const dismiss = () => setExportComplete(null);
		document.addEventListener("mousemove", dismiss, { once: true });
		document.addEventListener("keydown", dismiss, { once: true });
		return () => {
			document.removeEventListener("mousemove", dismiss);
			document.removeEventListener("keydown", dismiss);
		};
	}, [exportComplete]);

	const cancelExport = useCallback(() => {
		exportAbortControllerRef.current?.abort();
	}, []);

	const clearExportComplete = useCallback(() => setExportComplete(null), []);

	const handleExport = useCallback(
		async (format: ExportFormat) => {
			if ((!sql && !result) || columns.length === 0) {
				showToast?.("No data to export", "error", 3000);
				return;
			}
			if (isExporting) {
				showToast?.("Export already in progress", "warning", 2000);
				return;
			}

			// Cost/scope gate. A cloud export re-runs the query and scans the
			// data again (BigQuery bills for it), which is not obvious from a
			// "Download" click — so confirm before spending. DuckDB is local and
			// free, so it skips the gate entirely.
			const connectorType = queryService.getActiveConnectorType();
			const rerunsRemotely =
				!!sql &&
				(connectorType === "bigquery" || connectorType === "snowflake");
			if (rerunsRemotely) {
				let estimatedBytes: number | undefined;
				let estimatedCostUSD: number | undefined;
				let cachingPossible: boolean | undefined;
				if (connectorType === "bigquery" && sql) {
					try {
						// A BigQuery dry-run: free, scans nothing, just sizes the job.
						const est = await queryService.estimateBigQueryCost(sql);
						estimatedBytes = est.estimatedBytes;
						estimatedCostUSD = est.estimatedCostUSD;
						cachingPossible = est.cachingPossible;
					} catch (e) {
						logger.debug("Export cost estimate failed", e);
					}
				}
				const proceed = await new Promise<boolean>((resolve) => {
					previewResolveRef.current = resolve;
					setExportPreview({
						format,
						connectorType,
						rerunsRemotely: true,
						estimatedBytes,
						estimatedCostUSD,
						cachingPossible,
						estimatedRows: estimatedRowCount,
						rowCountIsEstimated,
						rowCap:
							format === "parquet" ? CLOUD_PARQUET_ROW_CAP : undefined,
					});
				});
				if (!proceed) return; // user declined; nothing ran, nothing billed
			}

			const fileName = generateExportFileName(format);
			exportAbortControllerRef.current = new AbortController();
			setIsExporting(true);

			let totalStepsHint = 2;
			const onProgress: ExportContext["onProgress"] = ({
				currentStage,
				currentStep,
				totalSteps,
			}) => {
				totalStepsHint = totalSteps;
				onExportProgress?.({ currentStage, currentStep });
			};

			const ctx: ExportContext = {
				format,
				fileName,
				sql,
				result,
				columns,
				signal: exportAbortControllerRef.current.signal,
				onProgress,
			};

			try {
				const strategy = pickStrategy(ctx);
				logger.info(`[export] strategy=${strategy.name} format=${format}`);
				onExportStart?.({
					fileType: format,
					fileName,
					totalSteps: totalStepsHint,
				});
				const result = await strategy.execute(ctx);

				// Loud truncation: a cloud Parquet export stops at the row cap.
				// Never let a partial file look complete — say what was dropped.
				const cap =
					format === "parquet" && rerunsRemotely
						? CLOUD_PARQUET_ROW_CAP
						: undefined;
				const truncated =
					cap !== undefined && result.rowsExported >= cap;

				const sizeNote = result.fileSizeStr ? ` (${result.fileSizeStr})` : "";
				const rowsNote = result.rowsExported
					? `${result.rowsExported.toLocaleString()} rows`
					: result.fileSizeStr ?? "";

				if (truncated) {
					const droppedNote =
						estimatedRowCount && estimatedRowCount > result.rowsExported
							? ` of ${rowCountIsEstimated ? "~" : ""}${estimatedRowCount.toLocaleString()}`
							: "";
					showToast?.(
						`⚠️ Export TRUNCATED at ${rowsNote}${droppedNote}. The file is incomplete — the browser can't hold a larger ${format.toUpperCase()} file in memory.`,
						"warning",
						12000,
					);
				} else {
					showToast?.(
						`✓ Exported ${rowsNote} to ${result.fileHandleName}${sizeNote}`,
						"success",
						5000,
					);
				}
				setExportComplete(
					createExportCompletionStatus(
						result.fileHandleName,
						result.rowsExported,
						format,
						"success",
					),
				);
				onExportComplete?.();
			} catch (error) {
				const errorMsg =
					error instanceof Error ? error.message : String(error);
				logger.error("Export failed:", errorMsg);

				// An aborted export can surface as our own message or as the
				// connector's AbortError (e.g. "Query aborted by user" from the
				// cancelled BigQuery job) — all are user cancellations.
				const cancelled =
					errorMsg === "Export cancelled by user" ||
					(error instanceof Error && error.name === "AbortError") ||
					/aborted|cancelled/i.test(errorMsg);
				if (cancelled) {
					setExportComplete(
						createExportCompletionStatus(fileName, 0, format, "cancelled"),
					);
					showToast?.("Export cancelled", "info", 3000);
					onExportComplete?.();
				} else {
					setExportComplete(
						createExportCompletionStatus(
							fileName,
							0,
							format,
							"error",
							errorMsg,
						),
					);
					showToast?.(`Export failed: ${errorMsg}`, "error", 5000);
					onExportError?.(errorMsg);
				}
			} finally {
				setIsExporting(false);
				exportAbortControllerRef.current = null;
				setCancelPrompt(false);
			}
		},
		[
			sql,
			result,
			columns,
			estimatedRowCount,
			rowCountIsEstimated,
			showToast,
			isExporting,
			onExportStart,
			onExportProgress,
			onExportComplete,
			onExportError,
		],
	);

	// Quiet the unused-import warning until a future refactor uses it
	void formatFileSize;

	return {
		isExporting,
		exportComplete,
		setExportComplete,
		handleExport,
		cancelExport,
		clearExportComplete,
		exportPreview,
		confirmExportPreview,
		cancelExportPreview,
		cancelPrompt,
		confirmCancelExport,
		dismissCancelExport,
	};
}
