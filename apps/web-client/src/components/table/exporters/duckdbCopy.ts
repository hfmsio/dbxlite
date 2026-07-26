/**
 * DuckDB-COPY export strategy.
 *
 * Uses `COPY (sql) TO 'file' (FORMAT X)` against the DuckDB-WASM engine.
 * Fastest path because everything runs inside the WASM engine — no JS-
 * level row materialization, no Parquet round-trip through JS objects.
 *
 * Applies when the active connector is DuckDB and the user's SQL is
 * available. For Snowflake/BigQuery the COPY-subquery syntax is rejected
 * so this strategy steps aside and the cloud-streaming strategy takes over.
 */
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import {
	formatFileSize,
	getDuckDBFormatOption,
	saveToFileHandle,
	showExportFilePicker,
} from "../exportUtils";
import type { ExportContext, ExportResult, ExportStrategy } from "./types";

const logger = createLogger("export:duckdbCopy");

export const duckdbCopyStrategy: ExportStrategy = {
	name: "duckdb-copy",

	canHandle(ctx: ExportContext): boolean {
		return (
			!!ctx.sql && queryService.getActiveConnectorType() === "duckdb"
		);
	},

	async execute(ctx: ExportContext): Promise<ExportResult> {
		const cleanSql = (ctx.sql ?? "").trim().replace(/;+$/, "");

		ctx.onProgress({
			currentStage: "Step 1/3: Choose where to save...",
			currentStep: 1,
			totalSteps: 3,
		});
		const fileHandle = await showExportFilePicker(ctx.fileName, ctx.format);

		try {
			const formatOption = getDuckDBFormatOption(
				ctx.format,
				ctx.parquetCompression,
			);
			ctx.onProgress({
				currentStage: `Step 2/3: Exporting to ${ctx.format.toUpperCase()} (DuckDB processing)...`,
				currentStep: 2,
				totalSteps: 3,
			});

			// DuckDB's `COPY … TO` returns a single row with the number of rows
			// written, so we get the real count for free — no extra COUNT query.
			const copyResult = await queryService.executeQuery(
				`COPY (${cleanSql}) TO '${ctx.fileName}' (FORMAT ${formatOption})`,
				ctx.signal,
			);
			const rowsExported = copyRowCount(copyResult);

			if (ctx.signal.aborted) throw new Error("Export cancelled by user");

			ctx.onProgress({
				currentStage: "Step 3/3: Downloading file...",
				currentStep: 3,
				totalSteps: 3,
			});
			const buffer = await queryService.copyFileToBuffer(ctx.fileName);
			if (ctx.signal.aborted) throw new Error("Export cancelled by user");

			const fileSizeStr = formatFileSize(buffer.byteLength);

			if (fileHandle) {
				await saveToFileHandle(fileHandle, buffer);
				return {
					fileHandleName: fileHandle.name,
					rowsExported,
					fileSizeStr,
				};
			}
			// File System Access API not available — fall back to download
			const { downloadAsBlob } = await import("../exportUtils");
			downloadAsBlob(buffer, ctx.fileName, mimeFor(ctx.format));
			return {
				fileHandleName: ctx.fileName,
				rowsExported,
				fileSizeStr,
			};
		} finally {
			queryService.dropFile(ctx.fileName).catch((e) => {
				logger.warn("Failed to drop export file:", e);
			});
		}
	},
};

function mimeFor(format: ExportContext["format"]): string {
	if (format === "csv") return "text/csv";
	if (format === "json") return "application/json";
	return "application/octet-stream";
}

/**
 * Read the row count DuckDB returns from `COPY … TO`. The result is one row
 * whose (single) column holds the number of rows written — named "Count" in
 * current DuckDB, but read positionally to be resilient to a rename.
 */
function copyRowCount(result: {
	rows?: Array<Record<string, unknown>>;
}): number {
	const row = result.rows?.[0];
	if (!row) return 0;
	const value =
		(row.Count as unknown) ?? (row.count as unknown) ?? Object.values(row)[0];
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : 0;
}
