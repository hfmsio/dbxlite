/**
 * Pre-loaded export strategy.
 *
 * Uses the rows already in memory (from the displayed result pane) to
 * write the file. CSV and JSON serialize via file-service helpers;
 * Parquet borrows DuckDB's writer.
 *
 * Picked when no SQL is available (e.g. a manually constructed result)
 * or when the other strategies decline.
 */
import { isParquetExportCapable } from "@ide/connectors";
import { exportToCSV, exportToJSON } from "../../../services/file-service";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import {
	saveToFileHandle,
	showExportFilePicker,
} from "../exportUtils";
import type { ExportContext, ExportResult, ExportStrategy } from "./types";

const logger = createLogger("export:preloaded");

export const preloadedStrategy: ExportStrategy = {
	name: "preloaded",

	canHandle(ctx: ExportContext): boolean {
		// This is the universal fallback — claim anything we have rows for.
		return !!ctx.result && ctx.result.rows.length >= 0;
	},

	async execute(ctx: ExportContext): Promise<ExportResult> {
		if (!ctx.result) throw new Error("No result data available for export");
		const { rows, columns, columnTypes } = ctx.result;

		ctx.onProgress({
			currentStage: "Step 1/2: Saving file...",
			currentStep: 1,
			totalSteps: 2,
		});

		if (ctx.format === "csv") {
			await exportToCSV(columns, rows, ctx.fileName);
			return {
				fileHandleName: ctx.fileName,
				rowsExported: rows.length,
			};
		}

		if (ctx.format === "json") {
			await exportToJSON(columns, rows, ctx.fileName);
			return {
				fileHandleName: ctx.fileName,
				rowsExported: rows.length,
			};
		}

		// parquet — needs DuckDB writer
		const fileHandle = await showExportFilePicker(ctx.fileName, "parquet");
		if (fileHandle === null) {
			throw new Error(
				"Parquet export requires File System Access API support",
			);
		}

		const duckdb = queryService.getConnector("duckdb");
		if (!isParquetExportCapable(duckdb)) {
			throw new Error("Parquet export not available");
		}

		ctx.onProgress({
			currentStage: "Step 2/2: Creating Parquet file...",
			currentStep: 2,
			totalSteps: 2,
		});

		await duckdb.exportToParquet(
			ctx.fileName,
			rows,
			columns,
			columnTypes as { name: string; type: string }[] | undefined,
		);

		if (ctx.signal.aborted) {
			queryService.dropFile(ctx.fileName).catch((e) => {
				logger.warn("Failed to clean up cancelled export:", e);
			});
			throw new Error("Export cancelled by user");
		}

		const buffer = await queryService.copyFileToBuffer(ctx.fileName);
		await saveToFileHandle(fileHandle, buffer);
		queryService.dropFile(ctx.fileName).catch((e) => {
			logger.warn("Failed to drop export file from VFS:", e);
		});

		return {
			fileHandleName: fileHandle.name,
			rowsExported: rows.length,
		};
	},
};
