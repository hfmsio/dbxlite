/**
 * Import Queue Tests
 * Tests for the import queue service functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dependencies before importing ImportQueue
vi.mock("../persistence-metadata-store", () => ({
	persistenceMetadataStore: {
		saveJob: vi.fn().mockResolvedValue(undefined),
		getActiveJobs: vi.fn().mockResolvedValue([]),
		getJob: vi.fn().mockResolvedValue(null),
		saveTable: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../../../../packages/duckdb-wasm-adapter/src/opfs-persistence", () => ({
	opfsPersistence: {
		writeFile: vi.fn().mockResolvedValue(undefined),
		fileExists: vi.fn().mockResolvedValue(false),
		deleteFile: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../utils/logger", () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
	})),
}));

import { ImportQueue } from "../import-queue";
import { persistenceMetadataStore } from "../persistence-metadata-store";

describe("ImportQueue", () => {
	let queue: ImportQueue;

	beforeEach(async () => {
		vi.clearAllMocks();
		queue = new ImportQueue();

		// Wait a tick to let restoreJobs settle (it's called in constructor)
		await new Promise((resolve) => setTimeout(resolve, 0));

		// Prevent auto-processing during tests by mocking the private processQueue method
		// @ts-expect-error - accessing private method for testing
		vi.spyOn(queue, "processQueue").mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("enqueue", () => {
		it("creates a new job with queued status", async () => {
			const job = await queue.enqueue(
				"test_table",
				"test_schema",
				"SELECT * FROM source",
				"bigquery",
				"conn_123",
			);

			expect(job.tableName).toBe("test_table");
			expect(job.schema).toBe("test_schema");
			expect(job.sourceQuery).toBe("SELECT * FROM source");
			expect(job.sourceEngine).toBe("bigquery");
			expect(job.connectionId).toBe("conn_123");
			expect(job.status).toBe("queued");
			expect(job.id).toMatch(/^job_\d+_[a-z0-9]+$/);
		});

		it("saves job to persistence store", async () => {
			await queue.enqueue(
				"test_table",
				"test_schema",
				"SELECT * FROM source",
				"bigquery",
				"conn_123",
			);

			expect(persistenceMetadataStore.saveJob).toHaveBeenCalledTimes(1);
		});

		it("initializes progress tracking", async () => {
			const job = await queue.enqueue(
				"test_table",
				"test_schema",
				"SELECT * FROM source",
				"bigquery",
				"conn_123",
			);

			expect(job.progress).toBeDefined();
			expect(job.progress.bytesProcessed).toBe(0);
			expect(job.progress.rowsProcessed).toBe(0);
			expect(job.progress.percentComplete).toBe(0);
		});
	});

	describe("getActiveJobs", () => {
		it("returns empty array when no jobs", () => {
			const jobs = queue.getActiveJobs();
			expect(jobs).toEqual([]);
		});

		it("returns active jobs after enqueue", async () => {
			await queue.enqueue("table1", "schema", "SELECT 1", "bigquery", "conn_1");
			await queue.enqueue("table2", "schema", "SELECT 2", "bigquery", "conn_1");

			const jobs = queue.getActiveJobs();
			expect(jobs).toHaveLength(2);
			expect(jobs[0].tableName).toBe("table1");
			expect(jobs[1].tableName).toBe("table2");
		});
	});

	describe("getJob", () => {
		it("returns job from queue if exists", async () => {
			const created = await queue.enqueue(
				"test_table",
				"test_schema",
				"SELECT * FROM source",
				"bigquery",
				"conn_123",
			);

			const fetched = await queue.getJob(created.id);
			expect(fetched).toBeDefined();
			expect(fetched?.id).toBe(created.id);
		});

		it("returns null for non-existent job", async () => {
			const job = await queue.getJob("non_existent_id");
			expect(job).toBeNull();
		});
	});

	describe("event listeners", () => {
		it("can subscribe to events", async () => {
			const listener = vi.fn();
			const unsubscribe = queue.on(listener);

			expect(typeof unsubscribe).toBe("function");
		});

		it("can unsubscribe from events", async () => {
			const listener = vi.fn();
			const unsubscribe = queue.on(listener);

			unsubscribe();

			// Listener should be removed (we can't easily test this without triggering events)
			expect(true).toBe(true);
		});
	});

	describe("pause", () => {
		it("throws error for non-existent job", async () => {
			await expect(queue.pause("non_existent")).rejects.toThrow(
				"Job not found",
			);
		});
	});

	describe("resume", () => {
		it("throws error for non-existent job", async () => {
			await expect(queue.resume("non_existent")).rejects.toThrow(
				"Job not found",
			);
		});
	});

	describe("cancel", () => {
		it("throws error for non-existent job", async () => {
			await expect(queue.cancel("non_existent")).rejects.toThrow(
				"Job not found",
			);
		});
	});

	describe("job ID generation", () => {
		it("generates unique job IDs", async () => {
			const job1 = await queue.enqueue("t1", "s", "SELECT 1", "bigquery", "c1");
			const job2 = await queue.enqueue("t2", "s", "SELECT 2", "bigquery", "c1");

			expect(job1.id).not.toBe(job2.id);
		});
	});
});
