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
import type { QueryResult } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import {
	type ExportCompletionStatus,
	type ExportFormat,
	createExportCompletionStatus,
	formatFileSize,
	generateExportFileName,
} from "../exportUtils";
import { type ExportContext, pickStrategy } from "../exporters";
import type { ColumnInfo } from "../types";

const logger = createLogger("useTableExport");

interface UseTableExportOptions {
	sql?: string;
	result?: QueryResult | null;
	columns: ColumnInfo[];
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
}

export function useTableExport({
	sql,
	result,
	columns,
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

	// ESC cancels in-flight export
	useEffect(() => {
		if (!isExporting) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				exportAbortControllerRef.current?.abort();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [isExporting]);

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

				const sizeNote = result.fileSizeStr ? ` (${result.fileSizeStr})` : "";
				const rowsNote = result.rowsExported
					? `${result.rowsExported.toLocaleString()} rows`
					: result.fileSizeStr ?? "";
				showToast?.(
					`✓ Exported ${rowsNote} to ${result.fileHandleName}${sizeNote}`,
					"success",
					5000,
				);
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

				if (errorMsg === "Export cancelled by user") {
					setExportComplete(
						createExportCompletionStatus(fileName, 0, format, "cancelled"),
					);
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
			}
		},
		[
			sql,
			result,
			columns,
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
	};
}
