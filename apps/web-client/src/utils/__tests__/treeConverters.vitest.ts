/**
 * Tree Converters Tests
 * Tests for the tree data conversion utilities
 */

import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "../../types/data-source";
import {
	convertBigQueryToTreeNodes,
	convertDatabasesToTreeNodes,
	convertFilesToTreeNodes,
	formatBytes,
} from "../treeConverters";

describe("formatBytes", () => {
	it("formats 0 bytes correctly", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	it("formats bytes correctly", () => {
		expect(formatBytes(500)).toBe("500.0 B");
	});

	it("formats kilobytes correctly", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1536)).toBe("1.5 KB");
	});

	it("formats megabytes correctly", () => {
		expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
		expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
	});

	it("formats gigabytes correctly", () => {
		expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
	});
});

describe("convertFilesToTreeNodes", () => {
	const mockOnInsertQuery = vi.fn();
	const mockOnDeleteFile = vi.fn();
	const mockOnReloadFile = vi.fn();
	const mockOnRestoreAccess = vi.fn();
	const mockOnDeleteFolder = vi.fn();
	const mockOnDeleteDomain = vi.fn();
	const mockOnRefreshMetadata = vi.fn();

	it("converts empty file list to empty array", () => {
		const result = convertFilesToTreeNodes(
			[],
			mockOnInsertQuery,
			mockOnDeleteFile,
			mockOnReloadFile,
			mockOnRestoreAccess,
			mockOnDeleteFolder,
			mockOnDeleteDomain,
			mockOnRefreshMetadata,
		);
		expect(result).toEqual([]);
	});

	it("converts a CSV file to tree node", () => {
		const csvFile: DataSource = {
			id: "csv-1",
			name: "test.csv",
			type: "csv",
			uploadedAt: new Date(),
			size: 1024,
		};

		const result = convertFilesToTreeNodes(
			[csvFile],
			mockOnInsertQuery,
			mockOnDeleteFile,
			mockOnReloadFile,
			mockOnRestoreAccess,
			mockOnDeleteFolder,
			mockOnDeleteDomain,
			mockOnRefreshMetadata,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("csv-1");
		expect(result[0].name).toBe("test.csv");
		expect(result[0].type).toBe("file");
		expect(result[0].source).toBe("file");
		expect(result[0].actions).toBeDefined();
		expect(result[0].actions?.length).toBeGreaterThan(0);
	});

	it("converts a DuckDB database file to tree node", () => {
		const dbFile: DataSource = {
			id: "db-1",
			name: "test.duckdb",
			type: "duckdb",
			uploadedAt: new Date(),
			size: 2048,
			isAttached: true,
			attachedAs: "test_db",
		};

		const result = convertFilesToTreeNodes(
			[dbFile],
			mockOnInsertQuery,
			mockOnDeleteFile,
			mockOnReloadFile,
			mockOnRestoreAccess,
			mockOnDeleteFolder,
			mockOnDeleteDomain,
			mockOnRefreshMetadata,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("db-1");
		expect(result[0].type).toBe("file");
		// ATTACHED status is now shown as a badgeSuffix, not a primary badge
		expect(result[0].badgeSuffixes).toBeDefined();
		expect(result[0].badgeSuffixes?.some(s => s.icon === "🔗" && s.label === "ATTACHED")).toBe(true);
	});

	it("sorts files by name when requested", () => {
		const files: DataSource[] = [
			{ id: "1", name: "zebra.csv", type: "csv", uploadedAt: new Date() },
			{ id: "2", name: "alpha.csv", type: "csv", uploadedAt: new Date() },
			{ id: "3", name: "middle.csv", type: "csv", uploadedAt: new Date() },
		];

		const result = convertFilesToTreeNodes(
			files,
			mockOnInsertQuery,
			mockOnDeleteFile,
			mockOnReloadFile,
			mockOnRestoreAccess,
			mockOnDeleteFolder,
			mockOnDeleteDomain,
			mockOnRefreshMetadata,
			"name",
		);

		expect(result[0].name).toBe("alpha.csv");
		expect(result[1].name).toBe("middle.csv");
		expect(result[2].name).toBe("zebra.csv");
	});

	it("marks failed files with badge", () => {
		const failedFile: DataSource = {
			id: "failed-1",
			name: "failed.csv",
			type: "csv",
			uploadedAt: new Date(),
			restoreFailed: true,
			restoreError: "Permission denied",
		};

		const result = convertFilesToTreeNodes(
			[failedFile],
			mockOnInsertQuery,
			mockOnDeleteFile,
			mockOnReloadFile,
			mockOnRestoreAccess,
			mockOnDeleteFolder,
			mockOnDeleteDomain,
			mockOnRefreshMetadata,
		);

		expect(result[0].badge).toBe("❌ FAILED");
	});
});

describe("convertDatabasesToTreeNodes", () => {
	const mockOnInsertQuery = vi.fn();
	const mockOnDetachDatabase = vi.fn();
	const mockOnRestoreAccess = vi.fn();
	const mockOnReattachDatabase = vi.fn();

	it("converts empty database list to empty array", () => {
		const result = convertDatabasesToTreeNodes(
			[],
			mockOnInsertQuery,
			mockOnDetachDatabase,
			mockOnRestoreAccess,
			mockOnReattachDatabase,
		);
		expect(result).toEqual([]);
	});

	it("converts a database with schemas and tables", () => {
		const database: DataSource = {
			id: "db-1",
			name: "test_db",
			type: "duckdb",
			uploadedAt: new Date(),
			isAttached: true,
			attachedAs: "test_db",
			schemas: [
				{
					name: "main",
					tables: [
						{
							name: "users",
							schema: "main",
							columns: [
								{ name: "id", type: "INTEGER", isPrimaryKey: true },
								{ name: "name", type: "VARCHAR" },
							],
						},
					],
				},
			],
		};

		const result = convertDatabasesToTreeNodes(
			[database],
			mockOnInsertQuery,
			mockOnDetachDatabase,
			mockOnRestoreAccess,
			mockOnReattachDatabase,
		);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("test_db");
		expect(result[0].type).toBe("database");
		expect(result[0].children).toBeDefined();
		expect(result[0].children?.[0].name).toBe("main");
		expect(result[0].children?.[0].type).toBe("schema");
		expect(result[0].children?.[0].children?.[0].name).toBe("users");
		expect(result[0].children?.[0].children?.[0].type).toBe("table");
	});

	it("marks attached databases with badge", () => {
		const database: DataSource = {
			id: "db-1",
			name: "attached_db",
			type: "duckdb",
			uploadedAt: new Date(),
			isAttached: true,
		};

		const result = convertDatabasesToTreeNodes(
			[database],
			mockOnInsertQuery,
			mockOnDetachDatabase,
			mockOnRestoreAccess,
			mockOnReattachDatabase,
		);

		// ATTACHED status is now shown as a badgeSuffix, not a primary badge
		expect(result[0].badgeSuffixes).toBeDefined();
		expect(result[0].badgeSuffixes?.some(s => s.icon === "🔗" && s.label === "ATTACHED")).toBe(true);
	});
});

describe("convertBigQueryToTreeNodes", () => {
	const mockOnInsertQuery = vi.fn();
	const mockOnShowTableInfo = vi.fn();

	it("converts empty project list to empty array", () => {
		const result = convertBigQueryToTreeNodes(
			[],
			mockOnInsertQuery,
			mockOnShowTableInfo,
		);
		expect(result).toEqual([]);
	});

	it("converts a BigQuery project with datasets", () => {
		const projects = [
			{
				id: "my-project",
				name: "My Project",
				type: "project" as const,
				datasets: [
					{
						id: "my_dataset",
						name: "my_dataset",
						tables: [
							{
								id: "users",
								name: "users",
								columns: [
									{ name: "id", type: "INTEGER" },
									{ name: "email", type: "STRING" },
								],
							},
						],
					},
				],
			},
		];

		const result = convertBigQueryToTreeNodes(
			projects,
			mockOnInsertQuery,
			mockOnShowTableInfo,
		);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("my-project");
		expect(result[0].type).toBe("project");
		expect(result[0].source).toBe("bigquery");
		expect(result[0].children).toBeDefined();
		expect(result[0].children?.[0].name).toBe("my_dataset");
		expect(result[0].children?.[0].type).toBe("dataset");
	});

	it("creates proper actions for BigQuery tables", () => {
		const projects = [
			{
				id: "project-1",
				name: "Project 1",
				type: "project" as const,
				datasets: [
					{
						id: "dataset-1",
						name: "dataset-1",
						tables: [
							{
								id: "table-1",
								name: "table-1",
							},
						],
					},
				],
			},
		];

		const result = convertBigQueryToTreeNodes(
			projects,
			mockOnInsertQuery,
			mockOnShowTableInfo,
		);

		const table = result[0].children?.[0].children?.[0];
		expect(table).toBeDefined();
		if (!table) return; // Type guard
		expect(table.actions).toBeDefined();
		expect(table.actions?.some((a) => a.id === "select-all")).toBe(true);
		expect(table.actions?.some((a) => a.id === "preview")).toBe(true);
		expect(table.actions?.some((a) => a.id === "count")).toBe(true);
		expect(table.actions?.some((a) => a.id === "copy-name")).toBe(true);
		expect(table.actions?.some((a) => a.id === "show-info")).toBe(true);
	});
});
