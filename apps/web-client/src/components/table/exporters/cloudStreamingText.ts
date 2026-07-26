/**
 * Cloud-streaming CSV/JSON export strategy.
 *
 * Re-runs the user's SQL against a cloud connector and writes each yielded
 * chunk straight to the file on disk via a FileSystemWritableFileStream. No
 * row cap and no whole-file buffer: peak memory is one chunk, so this handles
 * arbitrarily large results (a 70M-row table exports fine).
 *
 * This is the text-format counterpart to cloudStreaming (Parquet). Parquet
 * can't stream this way — DuckDB writes it as one VFS file that must be read
 * back whole — but CSV and JSON are append-only, so they can.
 *
 * It also closes a real gap: before this existed, a large (virtual) BigQuery/
 * Snowflake result had no CSV/JSON strategy at all — DuckDB's COPY can't wrap
 * a cloud query, the Parquet streamer only does Parquet, and the pre-loaded
 * fallback had no in-memory rows for a virtual result — so the export simply
 * threw "no strategy can handle".
 */
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import { showExportFilePicker } from "../exportUtils";
import type { ExportContext, ExportResult, ExportStrategy } from "./types";

const logger = createLogger("export:cloudStreamingText");

/** No cap: stream every page. The connector stops when the results run out. */
const NO_ROW_LIMIT = Number.MAX_SAFE_INTEGER;

export const cloudStreamingTextStrategy: ExportStrategy = {
	name: "cloud-streaming-text",

	canHandle(ctx: ExportContext): boolean {
		if (!ctx.sql) return false;
		if (ctx.format !== "csv" && ctx.format !== "json") return false;
		const active = queryService.getActiveConnectorType();
		return active === "bigquery" || active === "snowflake";
	},

	async execute(ctx: ExportContext): Promise<ExportResult> {
		const activeConnectorType = queryService.getActiveConnectorType();
		const cleanSql = (ctx.sql ?? "").trim().replace(/;+$/, "");

		ctx.onProgress({
			currentStage: "Step 1/2: Choose where to save...",
			currentStep: 1,
			totalSteps: 2,
		});
		const fileHandle = await showExportFilePicker(ctx.fileName, ctx.format);
		if (fileHandle === null) {
			throw new Error(
				`${ctx.format.toUpperCase()} export requires File System Access API support`,
			);
		}

		const sourceConnector = queryService.getConnector(activeConnectorType);
		if (!sourceConnector) {
			throw new Error(`${activeConnectorType} connector not available`);
		}

		const columns =
			ctx.result?.columns ?? ctx.columns.map((c) => c.name);

		const writable = await fileHandle.createWritable();
		let rowsExported = 0;

		const failIfAborted = () => {
			if (ctx.signal.aborted) throw new Error("Export cancelled by user");
		};

		try {
			ctx.onProgress({
				currentStage: `Step 2/2: Streaming ${activeConnectorType} → ${ctx.format.toUpperCase()}...`,
				currentStep: 2,
				totalSteps: 2,
			});

			if (ctx.format === "csv") {
				await writable.write(`${columns.map(csvCell).join(",")}\n`);
			} else {
				await writable.write("[\n");
			}

			const gen = sourceConnector.query(cleanSql, {
				maxRows: NO_ROW_LIMIT,
				signal: ctx.signal,
			});
			for await (const chunk of gen) {
				failIfAborted();
				const rows = chunk.rows ?? [];
				if (rows.length === 0) continue;

				let text: string;
				if (ctx.format === "csv") {
					text = `${rows
						.map((row) => columns.map((c) => csvCell(row[c])).join(","))
						.join("\n")}\n`;
				} else {
					// JSON array, element per row, comma-separated across chunks.
					const prefix = rowsExported === 0 ? "" : ",\n";
					text =
						prefix +
						rows.map((row) => JSON.stringify(row, jsonSafe)).join(",\n");
				}
				await writable.write(text);
				rowsExported += rows.length;

				ctx.onProgress({
					currentStage: `Streaming ${activeConnectorType}: ${rowsExported.toLocaleString()} rows...`,
					currentStep: 2,
					totalSteps: 2,
				});
			}

			if (ctx.format === "json") {
				await writable.write("\n]\n");
			}

			failIfAborted();
			await writable.close();
			logger.info(
				`[export] streamed ${rowsExported.toLocaleString()} rows to ${fileHandle.name}`,
			);
			return { fileHandleName: fileHandle.name, rowsExported };
		} catch (err) {
			// Abandon the partial file rather than leave a half-written export
			// looking complete.
			await writable.abort?.().catch(() => {});
			throw err;
		}
	},
};

/** CSV cell with the same escaping rule the in-memory exporter uses. */
function csvCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	const s = typeof value === "bigint" ? value.toString() : String(value);
	if (s.includes(",") || s.includes('"') || s.includes("\n")) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

/** JSON replacer: BigInt isn't serializable by default. */
function jsonSafe(_key: string, value: unknown): unknown {
	return typeof value === "bigint" ? value.toString() : value;
}
