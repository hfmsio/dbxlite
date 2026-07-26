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
import {
	type BaseConnector,
	type OpfsExportCapable,
	type ParquetExportCapable,
	isOpfsExportCapable,
	isParquetExportCapable,
} from "@ide/connectors";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import { saveToFileHandle, showExportFilePicker } from "../exportUtils";
import {
	opfsExportName,
	removeOpfsFile,
	streamOpfsFileToWritable,
} from "./opfsExport";
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

		const exportColumns =
			ctx.result?.columns ?? ctx.columns.map((c) => c.name);
		const exportColumnTypes = (ctx.result?.columnTypes ?? ctx.columns).map(
			(c) => ({ name: c.name, type: c.type ?? "VARCHAR" }),
		);

		// Decide the path up front — the query generator is single-use, so the
		// choice has to be made before it's consumed. The probe is cached and
		// only trips OPFS on when a tiny round-trip actually worked in this
		// browser; otherwise we take the buffered+capped fallback.
		const opfsAvailable =
			isOpfsExportCapable(duckdb) && (await duckdb.probeOpfsExport());

		if (opfsAvailable && isOpfsExportCapable(duckdb)) {
			return runOpfsExport(ctx, {
				duckdb,
				sourceConnector,
				cleanSql,
				fileHandle,
				exportColumns,
				exportColumnTypes,
				activeConnectorType,
			});
		}

		return runBufferedExport(ctx, {
			duckdb,
			sourceConnector,
			cleanSql,
			fileHandle,
			exportColumns,
			exportColumnTypes,
			activeConnectorType,
		});
	},
};

interface ExportRunArgs {
	duckdb: ParquetExportCapable;
	sourceConnector: { query: BaseConnector["query"] };
	cleanSql: string;
	fileHandle: FileSystemFileHandle;
	exportColumns: string[];
	exportColumnTypes: Array<{ name: string; type: string }>;
	activeConnectorType: string;
}

/**
 * OPFS fast path: DuckDB COPYs the Parquet straight to an OPFS file, which is
 * then streamed to the Save-picker destination. No row cap and no whole-file
 * buffer — memory stays bounded even for a 70M-row table. Any failure cleans
 * up the scratch file and throws (the generator is already consumed, so we
 * can't silently retry) — it never leaves a partial file looking complete.
 */
async function runOpfsExport(
	ctx: ExportContext,
	args: ExportRunArgs & { duckdb: ParquetExportCapable & OpfsExportCapable },
): Promise<ExportResult> {
	const {
		duckdb,
		sourceConnector,
		cleanSql,
		fileHandle,
		exportColumns,
		exportColumnTypes,
		activeConnectorType,
	} = args;
	const opfsName = opfsExportName(activeConnectorType);

	ctx.onProgress({
		currentStage: `Step 2/3: Streaming ${activeConnectorType} → Parquet...`,
		currentStep: 2,
		totalSteps: 3,
	});

	// No cap: stream every page. Thread the abort signal so ESC stops the
	// fetch loop and cancels the server-side job (BigQuery keeps billing an
	// uncancelled job), not just the local write.
	const dataGenerator = sourceConnector.query(cleanSql, {
		maxRows: Number.MAX_SAFE_INTEGER,
		signal: ctx.signal,
	});

	try {
		await duckdb.registerOpfsOutput(opfsName);
		const totalRows = await duckdb.exportToParquetStreaming(
			opfsName,
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
		await duckdb.releaseOpfsOutput(opfsName);

		ctx.onProgress({
			currentStage: "Step 3/3: Writing to disk...",
			currentStep: 3,
			totalSteps: 3,
		});
		const writable = await fileHandle.createWritable();
		const bytes = await streamOpfsFileToWritable(
			opfsName,
			writable,
			(w, total) => {
				ctx.onProgress({
					currentStage: `Step 3/3: Writing ${(w / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB to disk...`,
					currentStep: 3,
					totalSteps: 3,
				});
			},
		);
		logger.info(
			`[export] OPFS-streamed ${totalRows.toLocaleString()} rows, ${(bytes / 1024 / 1024).toFixed(1)} MB, to ${fileHandle.name}`,
		);

		await removeOpfsFile(opfsName);
		return { fileHandleName: fileHandle.name, rowsExported: totalRows };
	} catch (err) {
		await removeOpfsFile(opfsName);
		await duckdb.releaseOpfsOutput(opfsName).catch(() => {});
		throw err;
	}
}

/**
 * Buffered fallback: the original path. DuckDB writes the Parquet to its
 * in-memory VFS, the whole file is copied into JS memory, then saved. Capped
 * at CLOUD_PARQUET_ROW_CAP because the whole file must fit in memory; the
 * caller surfaces that cap and warns on truncation.
 */
async function runBufferedExport(
	ctx: ExportContext,
	args: ExportRunArgs,
): Promise<ExportResult> {
	const {
		duckdb,
		sourceConnector,
		cleanSql,
		fileHandle,
		exportColumns,
		exportColumnTypes,
		activeConnectorType,
	} = args;

	ctx.onProgress({
		currentStage: `Step 2/3: Streaming ${activeConnectorType} → Parquet...`,
		currentStep: 2,
		totalSteps: 3,
	});

	const dataGenerator = sourceConnector.query(cleanSql, {
		maxRows: CLOUD_PARQUET_ROW_CAP,
		signal: ctx.signal,
	});

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

	ctx.onProgress({
		currentStage: "Step 3/3: Reading Parquet from DuckDB...",
		currentStep: 3,
		totalSteps: 3,
	});
	const buffer = await queryService.copyFileToBuffer(ctx.fileName);

	ctx.onProgress({
		currentStage: `Step 3/3: Writing ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB to disk...`,
		currentStep: 3,
		totalSteps: 3,
	});
	await saveToFileHandle(fileHandle, buffer);

	// Fire-and-forget VFS cleanup so the modal dismisses immediately.
	queryService.dropFile(ctx.fileName).catch((e) => {
		logger.warn("Failed to drop export file from VFS:", e);
	});

	return { fileHandleName: fileHandle.name, rowsExported: totalRows };
}
