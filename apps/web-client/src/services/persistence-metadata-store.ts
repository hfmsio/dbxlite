/**
 * Persistence Metadata Store
 *
 * Manages metadata for materialized tables using IndexedDB.
 * Tracks table information, refresh history, cost tracking, and import jobs.
 */

import type {
	Connection,
	ConnectionStorage,
	ImportCheckpoint,
	ImportJob,
	MaterializedTable,
	StorageSummary,
} from "../types/materialization";
import { createLogger } from "../utils/logger";

const logger = createLogger("PersistenceMetadataStore");

// Serialized versions with ISO date strings instead of Date objects
interface SerializedMaterializedTable
	extends Omit<
		MaterializedTable,
		"createdAt" | "lastRefreshedAt" | "lastAccessedAt"
	> {
	createdAt: string;
	lastRefreshedAt?: string;
	lastAccessedAt?: string;
}

interface SerializedImportCheckpoint
	extends Omit<ImportCheckpoint, "timestamp"> {
	timestamp: string;
}

interface SerializedImportJob
	extends Omit<
		ImportJob,
		| "createdAt"
		| "startedAt"
		| "pausedAt"
		| "completedAt"
		| "progress"
		| "checkpoints"
		| "error"
	> {
	createdAt: string;
	startedAt?: string;
	pausedAt?: string;
	completedAt?: string;
	progress: Omit<ImportJob["progress"], "lastUpdate"> & { lastUpdate: string };
	checkpoints: SerializedImportCheckpoint[];
	error?: { message: string; code?: string; timestamp: string };
}

interface SerializedConnection
	extends Omit<Connection, "createdAt" | "lastUsedAt"> {
	createdAt: string;
	lastUsedAt?: string;
}

// ==========================================================================
// IndexedDB Schema
// ==========================================================================

const DB_NAME = "dbxlite-persistence";
const DB_VERSION = 1;

const STORE_TABLES = "materialized_tables";
const STORE_JOBS = "import_jobs";
const STORE_CONNECTIONS = "connections";

// ==========================================================================
// Persistence Metadata Store
// ==========================================================================

export class PersistenceMetadataStore {
	private db: IDBDatabase | null = null;
	private isInitialized = false;

	/**
	 * Initialize IndexedDB
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				reject(new Error("Failed to open IndexedDB"));
			};

			request.onsuccess = () => {
				this.db = request.result;
				this.isInitialized = true;
				logger.info("Initialized");
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				// Materialized Tables Store
				if (!db.objectStoreNames.contains(STORE_TABLES)) {
					const tableStore = db.createObjectStore(STORE_TABLES, {
						keyPath: "id",
					});
					tableStore.createIndex("connectionId", "connectionId", {
						unique: false,
					});
					tableStore.createIndex("localName", "localName", { unique: true });
					tableStore.createIndex("status", "status", { unique: false });
					tableStore.createIndex("createdAt", "createdAt", { unique: false });
				}

				// Import Jobs Store
				if (!db.objectStoreNames.contains(STORE_JOBS)) {
					const jobStore = db.createObjectStore(STORE_JOBS, { keyPath: "id" });
					jobStore.createIndex("status", "status", { unique: false });
					jobStore.createIndex("connectionId", "connectionId", {
						unique: false,
					});
					jobStore.createIndex("createdAt", "createdAt", { unique: false });
				}

				// Connections Store
				if (!db.objectStoreNames.contains(STORE_CONNECTIONS)) {
					const connStore = db.createObjectStore(STORE_CONNECTIONS, {
						keyPath: "id",
					});
					connStore.createIndex("type", "type", { unique: false });
				}
			};
		});
	}

	private ensureInitialized(): void {
		if (!this.isInitialized || !this.db) {
			throw new Error("PersistenceMetadataStore not initialized");
		}
	}

	// ========================================================================
	// Materialized Tables
	// ========================================================================

	/**
	 * Save a materialized table
	 */
	async saveTable(table: MaterializedTable): Promise<void> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readwrite");
			const store = transaction.objectStore(STORE_TABLES);

			// Serialize dates
			const serialized = this.serializeTable(table);
			const request = store.put(serialized);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to save table"));
		});
	}

	/**
	 * Get a table by ID
	 */
	async getTable(id: string): Promise<MaterializedTable | null> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readonly");
			const store = transaction.objectStore(STORE_TABLES);
			const request = store.get(id);

			request.onsuccess = () => {
				if (request.result) {
					resolve(this.deserializeTable(request.result));
				} else {
					resolve(null);
				}
			};

			request.onerror = () => reject(new Error("Failed to get table"));
		});
	}

	/**
	 * Get a table by local name
	 */
	async getTableByName(localName: string): Promise<MaterializedTable | null> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readonly");
			const store = transaction.objectStore(STORE_TABLES);
			const index = store.index("localName");
			const request = index.get(localName);

			request.onsuccess = () => {
				if (request.result) {
					resolve(this.deserializeTable(request.result));
				} else {
					resolve(null);
				}
			};

			request.onerror = () => reject(new Error("Failed to get table by name"));
		});
	}

	/**
	 * Get all tables
	 */
	async getAllTables(): Promise<MaterializedTable[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readonly");
			const store = transaction.objectStore(STORE_TABLES);
			const request = store.getAll();

			request.onsuccess = () => {
				resolve(request.result.map((t) => this.deserializeTable(t)));
			};

			request.onerror = () => reject(new Error("Failed to get all tables"));
		});
	}

	/**
	 * Get tables by connection
	 */
	async getTablesByConnection(
		connectionId: string,
	): Promise<MaterializedTable[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readonly");
			const store = transaction.objectStore(STORE_TABLES);
			const index = store.index("connectionId");
			const request = index.getAll(connectionId);

			request.onsuccess = () => {
				resolve(request.result.map((t) => this.deserializeTable(t)));
			};

			request.onerror = () =>
				reject(new Error("Failed to get tables by connection"));
		});
	}

	/**
	 * Update table status
	 */
	async updateTableStatus(
		id: string,
		status: MaterializedTable["status"],
	): Promise<void> {
		const table = await this.getTable(id);
		if (!table) throw new Error(`Table not found: ${id}`);

		table.status = status;

		if (status === "available") {
			table.lastAccessedAt = new Date();
		}

		await this.saveTable(table);
	}

	/**
	 * Mark table as unavailable
	 */
	async markUnavailable(id: string): Promise<void> {
		await this.updateTableStatus(id, "unavailable");
	}

	/**
	 * Update table refresh timestamp
	 */
	async recordRefresh(
		id: string,
		rowCount: number,
		sizeBytes: number,
		costUSD?: number,
	): Promise<void> {
		const table = await this.getTable(id);
		if (!table) throw new Error(`Table not found: ${id}`);

		table.lastRefreshedAt = new Date();
		table.rowCount = rowCount;
		table.sizeBytes = sizeBytes;

		if (costUSD !== undefined) {
			table.costTracking.lastRefreshCostUSD = costUSD;
			table.costTracking.totalCostUSD += costUSD;
			table.costTracking.refreshCount++;
		}

		await this.saveTable(table);
	}

	/**
	 * Delete a table
	 */
	async deleteTable(id: string): Promise<void> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_TABLES], "readwrite");
			const store = transaction.objectStore(STORE_TABLES);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to delete table"));
		});
	}

	/**
	 * Delete all tables for a connection
	 */
	async deleteTablesByConnection(connectionId: string): Promise<void> {
		const tables = await this.getTablesByConnection(connectionId);

		for (const table of tables) {
			await this.deleteTable(table.id);
		}
	}

	// ========================================================================
	// Import Jobs
	// ========================================================================

	/**
	 * Save an import job
	 */
	async saveJob(job: ImportJob): Promise<void> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_JOBS], "readwrite");
			const store = transaction.objectStore(STORE_JOBS);

			const serialized = this.serializeJob(job);
			const request = store.put(serialized);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to save job"));
		});
	}

	/**
	 * Get a job by ID
	 */
	async getJob(id: string): Promise<ImportJob | null> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_JOBS], "readonly");
			const store = transaction.objectStore(STORE_JOBS);
			const request = store.get(id);

			request.onsuccess = () => {
				if (request.result) {
					resolve(this.deserializeJob(request.result));
				} else {
					resolve(null);
				}
			};

			request.onerror = () => reject(new Error("Failed to get job"));
		});
	}

	/**
	 * Get all jobs
	 */
	async getAllJobs(): Promise<ImportJob[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_JOBS], "readonly");
			const store = transaction.objectStore(STORE_JOBS);
			const request = store.getAll();

			request.onsuccess = () => {
				resolve(request.result.map((j) => this.deserializeJob(j)));
			};

			request.onerror = () => reject(new Error("Failed to get all jobs"));
		});
	}

	/**
	 * Get jobs by status
	 */
	async getJobsByStatus(status: ImportJob["status"]): Promise<ImportJob[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_JOBS], "readonly");
			const store = transaction.objectStore(STORE_JOBS);
			const index = store.index("status");
			const request = index.getAll(status);

			request.onsuccess = () => {
				resolve(request.result.map((j) => this.deserializeJob(j)));
			};

			request.onerror = () => reject(new Error("Failed to get jobs by status"));
		});
	}

	/**
	 * Get active jobs (queued or running)
	 */
	async getActiveJobs(): Promise<ImportJob[]> {
		const [queued, running, paused] = await Promise.all([
			this.getJobsByStatus("queued"),
			this.getJobsByStatus("running"),
			this.getJobsByStatus("paused"),
		]);

		return [...queued, ...running, ...paused];
	}

	/**
	 * Delete a job
	 */
	async deleteJob(id: string): Promise<void> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_JOBS], "readwrite");
			const store = transaction.objectStore(STORE_JOBS);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to delete job"));
		});
	}

	/**
	 * Clean up completed jobs older than specified days
	 */
	async cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
		const allJobs = await this.getAllJobs();
		const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

		let deletedCount = 0;

		for (const job of allJobs) {
			if (
				(job.status === "completed" || job.status === "failed") &&
				job.completedAt &&
				job.completedAt.getTime() < cutoff
			) {
				await this.deleteJob(job.id);
				deletedCount++;
			}
		}

		return deletedCount;
	}

	// ========================================================================
	// Connections
	// ========================================================================

	/**
	 * Save a connection
	 */
	async saveConnection(connection: Connection): Promise<void> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction(
				[STORE_CONNECTIONS],
				"readwrite",
			);
			const store = transaction.objectStore(STORE_CONNECTIONS);

			const serialized = this.serializeConnection(connection);
			const request = store.put(serialized);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to save connection"));
		});
	}

	/**
	 * Get a connection by ID
	 */
	async getConnection(id: string): Promise<Connection | null> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_CONNECTIONS], "readonly");
			const store = transaction.objectStore(STORE_CONNECTIONS);
			const request = store.get(id);

			request.onsuccess = () => {
				if (request.result) {
					resolve(this.deserializeConnection(request.result));
				} else {
					resolve(null);
				}
			};

			request.onerror = () => reject(new Error("Failed to get connection"));
		});
	}

	/**
	 * Get all connections
	 */
	async getAllConnections(): Promise<Connection[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_CONNECTIONS], "readonly");
			const store = transaction.objectStore(STORE_CONNECTIONS);
			const request = store.getAll();

			request.onsuccess = () => {
				resolve(request.result.map((c) => this.deserializeConnection(c)));
			};

			request.onerror = () =>
				reject(new Error("Failed to get all connections"));
		});
	}

	/**
	 * Delete a connection
	 */
	async deleteConnection(id: string): Promise<void> {
		this.ensureInitialized();

		// Also delete all tables for this connection
		await this.deleteTablesByConnection(id);

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction(
				[STORE_CONNECTIONS],
				"readwrite",
			);
			const store = transaction.objectStore(STORE_CONNECTIONS);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(new Error("Failed to delete connection"));
		});
	}

	// ========================================================================
	// Storage Summary
	// ========================================================================

	/**
	 * Get storage summary
	 */
	async getStorageSummary(): Promise<Omit<StorageSummary, "quota">> {
		const tables = await this.getAllTables();

		// Group by connection
		const byConnection = new Map<string, ConnectionStorage>();

		for (const table of tables) {
			const existing = byConnection.get(table.connectionId) || {
				connectionId: table.connectionId,
				totalBytes: 0,
				tableCount: 0,
				totalCostUSD: 0,
			};

			existing.totalBytes += table.sizeBytes;
			existing.tableCount++;
			existing.totalCostUSD += table.costTracking.totalCostUSD;

			byConnection.set(table.connectionId, existing);
		}

		// Count tables by status
		const tablesByStatus = {
			available: tables.filter((t) => t.status === "available").length,
			unavailable: tables.filter((t) => t.status === "unavailable").length,
			importing: tables.filter((t) => t.status === "importing").length,
		};

		return {
			byConnection,
			totalTables: tables.length,
			tablesByStatus,
		};
	}

	// ========================================================================
	// Serialization/Deserialization
	// ========================================================================

	private serializeTable(
		table: MaterializedTable,
	): SerializedMaterializedTable {
		return {
			...table,
			createdAt: table.createdAt.toISOString(),
			lastRefreshedAt: table.lastRefreshedAt?.toISOString(),
			lastAccessedAt: table.lastAccessedAt?.toISOString(),
		};
	}

	private deserializeTable(
		data: SerializedMaterializedTable,
	): MaterializedTable {
		return {
			...data,
			createdAt: new Date(data.createdAt),
			lastRefreshedAt: data.lastRefreshedAt
				? new Date(data.lastRefreshedAt)
				: undefined,
			lastAccessedAt: data.lastAccessedAt
				? new Date(data.lastAccessedAt)
				: undefined,
		};
	}

	private serializeJob(job: ImportJob): SerializedImportJob {
		return {
			...job,
			createdAt: job.createdAt.toISOString(),
			startedAt: job.startedAt?.toISOString(),
			pausedAt: job.pausedAt?.toISOString(),
			completedAt: job.completedAt?.toISOString(),
			progress: {
				...job.progress,
				lastUpdate: job.progress.lastUpdate.toISOString(),
			},
			checkpoints: job.checkpoints.map((cp) => ({
				...cp,
				timestamp: cp.timestamp.toISOString(),
			})),
			error: job.error
				? {
						...job.error,
						timestamp: job.error.timestamp.toISOString(),
					}
				: undefined,
		};
	}

	private deserializeJob(data: SerializedImportJob): ImportJob {
		return {
			...data,
			createdAt: new Date(data.createdAt),
			startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
			pausedAt: data.pausedAt ? new Date(data.pausedAt) : undefined,
			completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
			progress: {
				...data.progress,
				lastUpdate: new Date(data.progress.lastUpdate),
			},
			checkpoints: data.checkpoints.map((cp: SerializedImportCheckpoint) => ({
				...cp,
				timestamp: new Date(cp.timestamp),
			})),
			error: data.error
				? {
						...data.error,
						timestamp: new Date(data.error.timestamp),
					}
				: undefined,
		};
	}

	private serializeConnection(connection: Connection): SerializedConnection {
		return {
			...connection,
			createdAt: connection.createdAt.toISOString(),
			lastUsedAt: connection.lastUsedAt?.toISOString(),
		};
	}

	private deserializeConnection(data: SerializedConnection): Connection {
		return {
			...data,
			createdAt: new Date(data.createdAt),
			lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : undefined,
		};
	}
}

// ==========================================================================
// Singleton Instance
// ==========================================================================

export const persistenceMetadataStore = new PersistenceMetadataStore();
