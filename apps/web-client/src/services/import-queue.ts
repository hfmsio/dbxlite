/**
 * Import Queue Service
 *
 * Manages background imports from cloud sources (BigQuery, Snowflake, Databricks)
 * to local DuckDB with OPFS persistence.
 *
 * Features:
 * - Queue management
 * - Pause/resume functionality
 * - Crash recovery via checkpoints
 * - Progress tracking
 * - Background import support
 */

import { opfsPersistence } from "../../../../packages/duckdb-wasm-adapter/src/opfs-persistence";
import type {
	ConnectionType,
	ImportJob,
	MaterializedTable,
} from "../types/materialization";
import type { TableRow } from "../types/table";
import { createLogger } from "../utils/logger";
import { persistenceMetadataStore } from "./persistence-metadata-store";

const logger = createLogger("ImportQueue");

// ==========================================================================
// Types
// ==========================================================================

type ImportListener = (event: ImportEvent) => void;

type ImportEvent =
	| { type: "job_started"; job: ImportJob }
	| { type: "job_progress"; job: ImportJob }
	| { type: "job_paused"; job: ImportJob }
	| { type: "job_resumed"; job: ImportJob }
	| { type: "job_completed"; job: ImportJob; table: MaterializedTable }
	| { type: "job_failed"; job: ImportJob; error: Error }
	| { type: "job_cancelled"; job: ImportJob };

interface ImportOptions {
	/**
	 * Chunk size for streaming (bytes)
	 * Default: 10MB
	 */
	chunkSize?: number;

	/**
	 * Checkpoint interval (rows)
	 * Default: 10,000 rows
	 */
	checkpointInterval?: number;

	/**
	 * Whether to run import in background
	 * Default: true
	 */
	runInBackground?: boolean;

	/**
	 * Max retries on failure
	 * Default: 3
	 */
	maxRetries?: number;
}

interface QueuedImport {
	job: ImportJob;
	options: ImportOptions;
	abortController?: AbortController;
}

// ==========================================================================
// Import Queue Manager
// ==========================================================================

export class ImportQueue {
	private queue: Map<string, QueuedImport> = new Map();
	private listeners: Set<ImportListener> = new Set();
	private isProcessing = false;

	constructor() {
		this.restoreJobs();
	}

	/**
	 * Restore incomplete jobs from previous session
	 */
	private async restoreJobs(): Promise<void> {
		try {
			const jobs = await persistenceMetadataStore.getActiveJobs();

			for (const job of jobs) {
				// Reset running jobs to queued (they were interrupted)
				if (job.status === "running") {
					job.status = "queued";
					await persistenceMetadataStore.saveJob(job);
				}

				// Add to queue
				if (job.status === "queued") {
					this.queue.set(job.id, {
						job,
						options: {
							runInBackground: true,
						},
					});
				}
			}

			// Start processing if we have jobs
			if (this.queue.size > 0) {
				logger.info(`Restored ${this.queue.size} jobs from previous session`);
				this.processQueue();
			}
		} catch (error) {
			logger.error("Failed to restore jobs:", error);
		}
	}

	/**
	 * Add a new import job to the queue
	 */
	async enqueue(
		tableName: string,
		schema: string,
		sourceQuery: string,
		sourceEngine: ConnectionType,
		connectionId: string,
		options: ImportOptions = {},
	): Promise<ImportJob> {
		// Create job
		const job: ImportJob = {
			id: this.generateJobId(),
			tableName,
			schema,
			sourceQuery,
			sourceEngine,
			connectionId,
			status: "queued",
			progress: {
				bytesProcessed: 0,
				totalBytes: 0,
				rowsProcessed: 0,
				percentComplete: 0,
				speedMBps: 0,
				estimatedSecondsRemaining: 0,
				lastUpdate: new Date(),
			},
			checkpoints: [],
			createdAt: new Date(),
		};

		// Save to persistence
		await persistenceMetadataStore.saveJob(job);

		// Add to queue
		this.queue.set(job.id, { job, options });

		logger.info(`Job ${job.id} queued: ${schema}.${tableName}`);

		// Start processing
		this.processQueue();

		return job;
	}

	/**
	 * Pause a job
	 */
	async pause(jobId: string): Promise<void> {
		const queued = this.queue.get(jobId);
		if (!queued) {
			throw new Error(`Job not found: ${jobId}`);
		}

		if (queued.job.status !== "running") {
			throw new Error(`Job is not running: ${jobId}`);
		}

		// Signal abort
		queued.abortController?.abort();

		// Update status
		queued.job.status = "paused";
		queued.job.pausedAt = new Date();

		await persistenceMetadataStore.saveJob(queued.job);

		this.emit({ type: "job_paused", job: queued.job });

		logger.info(`Job ${jobId} paused`);
	}

	/**
	 * Resume a paused job
	 */
	async resume(jobId: string): Promise<void> {
		const queued = this.queue.get(jobId);
		if (!queued) {
			throw new Error(`Job not found: ${jobId}`);
		}

		if (queued.job.status !== "paused") {
			throw new Error(`Job is not paused: ${jobId}`);
		}

		// Update status
		queued.job.status = "queued";

		await persistenceMetadataStore.saveJob(queued.job);

		this.emit({ type: "job_resumed", job: queued.job });

		logger.info(`Job ${jobId} resumed`);

		// Start processing
		this.processQueue();
	}

	/**
	 * Cancel a job
	 */
	async cancel(jobId: string): Promise<void> {
		const queued = this.queue.get(jobId);
		if (!queued) {
			throw new Error(`Job not found: ${jobId}`);
		}

		// Signal abort
		queued.abortController?.abort();

		// Update status
		queued.job.status = "cancelled";
		queued.job.completedAt = new Date();

		await persistenceMetadataStore.saveJob(queued.job);

		// Remove from queue
		this.queue.delete(jobId);

		this.emit({ type: "job_cancelled", job: queued.job });

		logger.info(`Job ${jobId} cancelled`);

		// Clean up partial OPFS files
		await this.cleanupPartialImport(queued.job);
	}

	/**
	 * Get job status
	 */
	async getJob(jobId: string): Promise<ImportJob | null> {
		const queued = this.queue.get(jobId);
		if (queued) {
			return queued.job;
		}

		// Check persistence
		return await persistenceMetadataStore.getJob(jobId);
	}

	/**
	 * Get all active jobs
	 */
	getActiveJobs(): ImportJob[] {
		return Array.from(this.queue.values()).map((q) => q.job);
	}

	/**
	 * Add event listener
	 */
	on(listener: ImportListener): () => void {
		this.listeners.add(listener);

		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Emit event to all listeners
	 */
	private emit(event: ImportEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				logger.error("Listener error:", error);
			}
		}
	}

	// ========================================================================
	// Queue Processing
	// ========================================================================

	/**
	 * Process next job in queue
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing) return;
		if (this.queue.size === 0) return;

		this.isProcessing = true;

		try {
			// Get next queued job
			const next = this.getNextJob();
			if (!next) {
				this.isProcessing = false;
				return;
			}

			// Execute import
			await this.executeImport(next);

			// Move to next job
			this.isProcessing = false;
			this.processQueue();
		} catch (error) {
			logger.error("Processing error:", error);
			this.isProcessing = false;
		}
	}

	/**
	 * Get next job to process
	 */
	private getNextJob(): QueuedImport | null {
		for (const queued of this.queue.values()) {
			if (queued.job.status === "queued") {
				return queued;
			}
		}
		return null;
	}

	/**
	 * Execute an import job
	 */
	private async executeImport(queued: QueuedImport): Promise<void> {
		const { job, options } = queued;
		const abortController = new AbortController();
		queued.abortController = abortController;

		try {
			// Update status
			job.status = "running";
			job.startedAt = new Date();
			await persistenceMetadataStore.saveJob(job);

			this.emit({ type: "job_started", job });

			logger.info(`Starting job ${job.id}`);

			// Execute import based on source engine
			const table = await this.importFromSource(
				job,
				options,
				abortController.signal,
			);

			// Success
			job.status = "completed";
			job.completedAt = new Date();
			await persistenceMetadataStore.saveJob(job);

			// Remove from queue
			this.queue.delete(job.id);

			this.emit({ type: "job_completed", job, table });

			logger.info(`Job ${job.id} completed`);
		} catch (error: unknown) {
			// Check if aborted (paused)
			if (abortController.signal.aborted) {
				// Job was paused, keep in queue
				return;
			}

			// Job failed
			job.status = "failed";
			job.completedAt = new Date();
			const errorObj =
				error instanceof Error ? error : new Error(String(error));
			job.error = {
				message: errorObj.message || "Unknown error",
				code: (error as { code?: string })?.code,
				timestamp: new Date(),
			};

			await persistenceMetadataStore.saveJob(job);

			// Remove from queue
			this.queue.delete(job.id);

			this.emit({ type: "job_failed", job, error: errorObj });

			logger.error(`Job ${job.id} failed:`, error);

			// Clean up partial files
			await this.cleanupPartialImport(job);
		}
	}

	/**
	 * Import data from source
	 */
	private async importFromSource(
		job: ImportJob,
		_options: ImportOptions,
		signal: AbortSignal,
	): Promise<MaterializedTable> {
		// Create storage path
		const storagePath = `/tables/${job.schema}_${job.tableName}.parquet`;

		// Check for existing checkpoint (resume)
		const lastCheckpoint = job.checkpoints[job.checkpoints.length - 1];
		const resumeOffset = lastCheckpoint?.bytesProcessed || 0;

		logger.info(`Importing to ${storagePath}`);
		if (resumeOffset > 0) {
			logger.info(`Resuming from ${resumeOffset} bytes`);
		}

		// TODO: Integrate with actual connector
		// For now, simulate import
		const { rows, totalBytes } = await this.fetchFromSource(
			job.sourceEngine,
			job.connectionId,
			job.sourceQuery,
			resumeOffset,
			signal,
		);

		// Update progress
		job.progress.totalBytes = totalBytes;
		job.progress.rowsProcessed = rows.length;
		job.progress.bytesProcessed = totalBytes;
		job.progress.percentComplete = 100;
		job.progress.lastUpdate = new Date();

		await persistenceMetadataStore.saveJob(job);
		this.emit({ type: "job_progress", job });

		// Write to OPFS (this would be streaming in production)
		const parquetData = this.serializeToParquet(rows);
		await opfsPersistence.writeFile(storagePath, parquetData, {
			onProgress: (written: number, total: number) => {
				job.progress.bytesProcessed = written;
				job.progress.percentComplete = (written / total) * 100;
				job.progress.lastUpdate = new Date();

				// Emit progress every 1MB
				if (written % (1024 * 1024) === 0) {
					persistenceMetadataStore.saveJob(job);
					this.emit({ type: "job_progress", job });
				}
			},
		});

		// Create materialized table metadata
		const table: MaterializedTable = {
			id: this.generateJobId(),
			localName: `${job.schema}.${job.tableName}`,
			connectionId: job.connectionId,
			sourceType: "query_result",
			sourceQuery: job.sourceQuery,
			storagePath,
			sizeBytes: totalBytes,
			rowCount: rows.length,
			columnCount: rows.length > 0 ? Object.keys(rows[0]).length : 0,
			createdAt: new Date(),
			refreshStrategy: "manual",
			autoRefresh: false,
			costTracking: {
				totalCostUSD: 0,
				refreshCount: 0,
			},
			status: "available",
		};

		// Save table metadata
		await persistenceMetadataStore.saveTable(table);

		return table;
	}

	/**
	 * Fetch data from source (placeholder)
	 */
	private async fetchFromSource(
		_engine: ConnectionType,
		_connectionId: string,
		_query: string,
		_offset: number,
		_signal: AbortSignal,
	): Promise<{ rows: TableRow[]; totalBytes: number }> {
		// TODO: Implement actual connector integration
		// This is a placeholder that would be replaced with real BigQuery/Snowflake API calls

		return {
			rows: [],
			totalBytes: 0,
		};
	}

	/**
	 * Serialize rows to Parquet format (placeholder)
	 */
	private serializeToParquet(_rows: TableRow[]): ArrayBuffer {
		// TODO: Implement actual Parquet serialization
		// Could use libraries like parquetjs or arrow
		return new ArrayBuffer(0);
	}

	/**
	 * Clean up partial import files
	 */
	private async cleanupPartialImport(job: ImportJob): Promise<void> {
		try {
			const storagePath = `/tables/${job.schema}_${job.tableName}.parquet`;
			const exists = await opfsPersistence.fileExists(storagePath);

			if (exists) {
				await opfsPersistence.deleteFile(storagePath);
				logger.debug(`Cleaned up partial file: ${storagePath}`);
			}
		} catch (error) {
			logger.error("Cleanup failed:", error);
		}
	}

	/**
	 * Generate unique job ID
	 */
	private generateJobId(): string {
		return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}

// ==========================================================================
// Singleton Instance
// ==========================================================================

export const importQueue = new ImportQueue();
