/**
 * Cloud-streaming Parquet export strategy.
 *
 * Re-runs the user's SQL against the active cloud connector (BigQuery or
 * Snowflake), pipes each yielded chunk through DuckDB-WASM's Parquet
 * writer. Avoids materializing the full result in browser-JS memory —
 * each chunk is serialized to JSON, ingested via read_json, and freed
 * before the next chunk arrives.
 *
 * Picks any connector that:
 *   - is not DuckDB (DuckDB has its own faster path)
 *   - yields async chunks via the BaseConnector.query contract
 *
 * Capability-based, not name-based: a future Databricks connector that
 * implements the same chunk-yielding query() will be picked up
 * automatically.
 */
import { isParquetExportCapable } from "@ide/connectors";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import { saveToFileHandle, showExportFilePicker } from "../exportUtils";
import type { ExportContext, ExportResult, ExportStrategy } from "./types";

const logger = createLogger("export:cloudStreaming");

/**
 * Row ceiling for a cloud Parquet export.
 *
 * Not a policy choice so much as a memory one: the finished Parquet file is
 * read out of DuckDB's VFS as a single Uint8Array before being written to disk
 * (DuckDB-WASM exposes no ranged read), so the whole file must fit in browser
 * memory. Surfaced to the user via the export confirmation rather than applied
 * silently.
 */
export const CLOUD_PARQUET_ROW_CAP = 10_000_000;

export const cloudStreamingStrategy: ExportStrategy = {
	name: "cloud-streaming",

	canHandle(ctx: ExportContext): boolean {
		if (!ctx.sql || ctx.format !== "parquet") return false;
		const active = queryService.getActiveConnectorType();
		return active === "bigquery" || active === "snowflake";
	},

	async execute(ctx: ExportContext): Promise<ExportResult> {
		const activeConnectorType = queryService.getActiveConnectorType();
		const cleanSql = (ctx.sql ?? "").trim().replace(/;+$/, "");

		ctx.onProgress({
			currentStage: "Step 1/3: Choose where to save...",
			currentStep: 1,
			totalSteps: 3,
		});
		const fileHandle = await showExportFilePicker(ctx.fileName, "parquet");
		if (fileHandle === null) {
			throw new Error(
				"Parquet export requires File System Access API support",
			);
		}

		const sourceConnector = queryService.getConnector(activeConnectorType);
		if (!sourceConnector) {
			throw new Error(`${activeConnectorType} connector not available`);
		}

		// Parquet writer = DuckDB. Acquire by reference; the global active
		// connector flag is left alone for the entire export so concurrent
		// Snowflake/BigQuery work continues to route correctly.
		const duckdb = queryService.getConnector("duckdb");
		if (!isParquetExportCapable(duckdb)) {
			throw new Error("DuckDB Parquet writer not available");
		}

		ctx.onProgress({
			currentStage: `Step 2/3: Streaming ${activeConnectorType} → Parquet...`,
			currentStep: 2,
			totalSteps: 3,
		});

		const t0 = performance.now();
		const dataGenerator = sourceConnector.query(cleanSql, {
			maxRows: CLOUD_PARQUET_ROW_CAP,
		});

		const exportColumns =
			ctx.result?.columns ?? ctx.columns.map((c) => c.name);
		const exportColumnTypes = (ctx.result?.columnTypes ?? ctx.columns).map(
			(c) => ({ name: c.name, type: c.type ?? "VARCHAR" }),
		);

		const totalRows = await duckdb.exportToParquetStreaming(
			ctx.fileName,
			dataGenerator,
			exportColumns,
			exportColumnTypes,
			(rowsProcessed) => {
				ctx.onProgress({
					currentStage: `Streaming ${activeConnectorType}: ${rowsProcessed.toLocaleString()} rows...`,
					currentStep: 2,
					totalSteps: 3,
				});
			},
		);
		const tStreamDone = performance.now();
		logger.info(
			`[export-timing] streaming + COPY TO + DROP: ${(tStreamDone - t0).toFixed(0)} ms (${totalRows.toLocaleString()} rows)`,
		);

		ctx.onProgress({
			currentStage: "Step 3/3: Reading Parquet from DuckDB...",
			currentStep: 3,
			totalSteps: 3,
		});
		const buffer = await queryService.copyFileToBuffer(ctx.fileName);
		const tBufDone = performance.now();
		logger.info(
			`[export-timing] copyFileToBuffer: ${(tBufDone - tStreamDone).toFixed(0)} ms (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
		);

		ctx.onProgress({
			currentStage: `Step 3/3: Writing ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB to disk...`,
			currentStep: 3,
			totalSteps: 3,
		});
		await saveToFileHandle(fileHandle, buffer);
		logger.info(
			`[export-timing] saveToFileHandle: ${(performance.now() - tBufDone).toFixed(0)} ms · total ${(performance.now() - t0).toFixed(0)} ms`,
		);

		// Fire-and-forget VFS cleanup so the modal dismisses immediately.
		queryService.dropFile(ctx.fileName).catch((e) => {
			logger.warn("Failed to drop export file from VFS:", e);
		});

		return {
			fileHandleName: fileHandle.name,
			rowsExported: totalRows,
		};
	},
};
