/**
 * useFileUpload Hook Tests
 * Tests for file upload handling (button and drag-drop)
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFileUpload } from "../useFileUpload";

// Mock dependencies
vi.mock("../../services/file-handle-store", () => ({
	fileHandleStore: {
		isSupported: vi.fn(() => true),
		storeHandle: vi.fn(),
	},
}));

vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		executeQueryOnConnector: vi.fn(),
		registerFile: vi.fn(),
		registerFileHandle: vi.fn(),
		isHttpMode: vi.fn().mockReturnValue(false), // Default to WASM mode in tests
	},
}));

vi.mock("../../services/file-service", () => ({
	openDataFiles: vi.fn(),
	detectDataSourceType: vi.fn(),
}));

vi.mock("../../utils/errorMonitor", () => ({
	errorMonitor: {
		logError: vi.fn(),
	},
}));

// Import mocked modules
import { fileHandleStore } from "../../services/file-handle-store";
import { queryService } from "../../services/streaming-query-service";
import { openDataFiles, detectDataSourceType } from "../../services/file-service";

// Default hook options
const createDefaultOptions = (overrides = {}) => ({
	initializing: false,
	activeConnector: "duckdb" as const,
	isBigQueryConnected: false,
	showToast: vi.fn(),
	handleConnectorChange: vi.fn(),
	addDataSource: vi.fn().mockResolvedValue({ id: "ds-1" }),
	setIsUploadingFiles: vi.fn(),
	setUploadProgress: vi.fn(),
	setLastUploadedType: vi.fn(),
	...overrides,
});

// Helper to create mock file data
const createMockFileData = (overrides = {}) => ({
	name: "test.csv",
	buffer: new ArrayBuffer(100),
	type: "csv",
	size: 100,
	extension: "csv",
	file: new File(["test"], "test.csv"),
	fileHandle: { kind: "file" } as FileSystemFileHandle,
	...overrides,
});

describe("useFileUpload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(queryService.registerFile).mockResolvedValue(undefined);
		vi.mocked(queryService.registerFileHandle).mockResolvedValue(undefined);
		vi.mocked(detectDataSourceType).mockReturnValue("csv");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("initialization", () => {
		it("should return upload handlers", () => {
			const { result } = renderHook(() =>
				useFileUpload(createDefaultOptions()),
			);

			expect(typeof result.current.handleUploadDataFile).toBe("function");
			expect(typeof result.current.handleDragDropUpload).toBe("function");
		});
	});

	describe("button upload", () => {
		it("should not upload when initializing", async () => {
			const showToast = vi.fn();
			const options = createDefaultOptions({
				initializing: true,
				showToast,
			});
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("wait for the database"),
				"warning",
				3000,
			);
			expect(openDataFiles).not.toHaveBeenCalled();
		});

		it("should do nothing when no files selected", async () => {
			vi.mocked(openDataFiles).mockResolvedValue([]);
			const setIsUploadingFiles = vi.fn();
			const options = createDefaultOptions({ setIsUploadingFiles });
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(setIsUploadingFiles).not.toHaveBeenCalled();
		});

		it("should process uploaded files", async () => {
			const mockFile = createMockFileData();
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);

			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const setIsUploadingFiles = vi.fn();
			const setUploadProgress = vi.fn();
			const showToast = vi.fn();

			const options = createDefaultOptions({
				addDataSource,
				setIsUploadingFiles,
				setUploadProgress,
				showToast,
			});
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(setIsUploadingFiles).toHaveBeenCalledWith(true);
			expect(queryService.registerFileHandle).toHaveBeenCalled();
			expect(addDataSource).toHaveBeenCalled();
			expect(setIsUploadingFiles).toHaveBeenCalledWith(false);
		});

		it("should switch to DuckDB when using BigQuery", async () => {
			const mockFile = createMockFileData();
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);

			const handleConnectorChange = vi.fn();
			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });

			const options = createDefaultOptions({
				activeConnector: "bigquery",
				isBigQueryConnected: true,
				handleConnectorChange,
				addDataSource,
			});
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			// Should switch to DuckDB for file operations
			expect(handleConnectorChange).toHaveBeenCalledWith("duckdb");
			// Should switch back to BigQuery after upload
			expect(handleConnectorChange).toHaveBeenCalledWith("bigquery");
		});
	});

	describe("drag-drop upload", () => {
		it("should not upload when initializing", async () => {
			const showToast = vi.fn();
			const options = createDefaultOptions({
				initializing: true,
				showToast,
			});
			const { result } = renderHook(() => useFileUpload(options));

			const fileList = createMockFileList([
				createMockFile("test.csv", "test content"),
			]);

			await act(async () => {
				await result.current.handleDragDropUpload(fileList);
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("wait for the database"),
				"warning",
				3000,
			);
		});

		it("should process dropped files", async () => {
			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const setIsUploadingFiles = vi.fn();
			const setUploadProgress = vi.fn();
			const showToast = vi.fn();

			const options = createDefaultOptions({
				addDataSource,
				setIsUploadingFiles,
				setUploadProgress,
				showToast,
			});
			const { result } = renderHook(() => useFileUpload(options));

			const fileList = createMockFileList([
				createMockFile("test.csv", "test data"),
			]);

			await act(async () => {
				await result.current.handleDragDropUpload(fileList);
			});

			expect(setIsUploadingFiles).toHaveBeenCalledWith(true);
			expect(queryService.registerFile).toHaveBeenCalled();
			expect(addDataSource).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "test.csv",
					isVolatile: true, // Drag-drop files are volatile
				}),
			);
		});

		it("should show progress for multiple files", async () => {
			const setUploadProgress = vi.fn();
			const showToast = vi.fn();
			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });

			const options = createDefaultOptions({
				setUploadProgress,
				showToast,
				addDataSource,
			});
			const { result } = renderHook(() => useFileUpload(options));

			const fileList = createMockFileList([
				createMockFile("file1.csv", "test1"),
				createMockFile("file2.csv", "test2"),
			]);

			await act(async () => {
				await result.current.handleDragDropUpload(fileList);
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Reading 2 files"),
				"info",
				3000,
			);
		});
	});

	describe("DuckDB database handling", () => {
		it("should attach DuckDB database files", async () => {
			const mockFile = createMockFileData({
				name: "mydb.duckdb",
				type: "duckdb",
				extension: "duckdb",
			});
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);
			vi.mocked(queryService.executeQueryOnConnector).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 10,
			});

			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const showToast = vi.fn();
			const setLastUploadedType = vi.fn();

			const options = createDefaultOptions({
				addDataSource,
				showToast,
				setLastUploadedType,
			});
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			// Should execute ATTACH query
			expect(queryService.executeQueryOnConnector).toHaveBeenCalledWith(
				"duckdb",
				expect.stringContaining("ATTACH"),
			);

			// Should set type as database
			expect(setLastUploadedType).toHaveBeenCalledWith("database");

			// Should add with isAttached flag
			expect(addDataSource).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "duckdb",
					isAttached: true,
				}),
			);
		});

		it("should handle database attach errors gracefully", async () => {
			const mockFile = createMockFileData({
				name: "corrupt.duckdb",
				type: "duckdb",
				extension: "duckdb",
			});
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);
			vi.mocked(queryService.executeQueryOnConnector).mockRejectedValue(
				new Error("Invalid database file"),
			);

			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const showToast = vi.fn();

			const options = createDefaultOptions({
				addDataSource,
				showToast,
			});
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			// Should still add to data sources
			expect(addDataSource).toHaveBeenCalled();

			// Should show warning toast
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("could not attach"),
				"warning",
				10000,
			);
		});
	});

	describe("file handle storage", () => {
		it("should store file handle when supported", async () => {
			const mockFile = createMockFileData();
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);
			vi.mocked(fileHandleStore.isSupported).mockReturnValue(true);

			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const options = createDefaultOptions({ addDataSource });
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(fileHandleStore.storeHandle).toHaveBeenCalledWith(
				"ds-1",
				"test.csv",
				mockFile.fileHandle,
			);
		});

		it("should not store handle for drag-drop uploads", async () => {
			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const options = createDefaultOptions({ addDataSource });
			const { result } = renderHook(() => useFileUpload(options));

			const fileList = createMockFileList([
				createMockFile("test.csv", "test"),
			]);

			await act(async () => {
				await result.current.handleDragDropUpload(fileList);
			});

			// Should NOT store handle for drag-drop (no file handle available)
			expect(fileHandleStore.storeHandle).not.toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("should handle file registration errors", async () => {
			const mockFile = createMockFileData();
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);
			vi.mocked(queryService.registerFileHandle).mockRejectedValue(
				new Error("Registration failed"),
			);

			const showToast = vi.fn();
			const options = createDefaultOptions({ showToast });
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Failed to upload"),
				"error",
				5000,
			);
		});

		it("should handle file read errors in drag-drop", async () => {
			const showToast = vi.fn();
			const options = createDefaultOptions({ showToast });
			const { result } = renderHook(() => useFileUpload(options));

			// Create a file that will fail to read
			const badFile = createMockFile("bad.csv", "");
			badFile.arrayBuffer = () => Promise.reject(new Error("Read failed"));

			const fileList = createMockFileList([badFile]);

			await act(async () => {
				await result.current.handleDragDropUpload(fileList);
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Failed to read file"),
				"error",
				3000,
			);
		});
	});

	describe("Excel file handling", () => {
		it("should handle Excel files with sheets", async () => {
			const mockFile = createMockFileData({
				name: "data.xlsx",
				type: "xlsx",
				extension: "xlsx",
				sheets: [
					{ name: "Sheet1", index: 0 },
					{ name: "Sheet2", index: 1 },
				],
			});
			vi.mocked(openDataFiles).mockResolvedValue([mockFile]);

			const addDataSource = vi.fn().mockResolvedValue({ id: "ds-1" });
			const options = createDefaultOptions({ addDataSource });
			const { result } = renderHook(() => useFileUpload(options));

			await act(async () => {
				await result.current.handleUploadDataFile();
			});

			expect(addDataSource).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "data.xlsx",
					type: "xlsx",
					sheets: [
						{ name: "Sheet1", index: 0 },
						{ name: "Sheet2", index: 1 },
					],
					selectedSheet: "Sheet1",
				}),
			);
		});
	});
});

// Helper to create a mock File with arrayBuffer support
function createMockFile(name: string, content: string): File & { arrayBuffer: () => Promise<ArrayBuffer> } {
	const blob = new Blob([content]);
	const file = new File([blob], name) as File & { arrayBuffer: () => Promise<ArrayBuffer> };

	// Add arrayBuffer method that jsdom doesn't support
	file.arrayBuffer = async () => {
		const encoder = new TextEncoder();
		return encoder.encode(content).buffer;
	};

	return file;
}

// Helper to create mock FileList
function createMockFileList(files: (File | (File & { arrayBuffer: () => Promise<ArrayBuffer> }))[]): FileList {
	const fileList = {
		length: files.length,
		item: (index: number) => files[index] || null,
		[Symbol.iterator]: function* () {
			for (const file of files) {
				yield file;
			}
		},
	};

	// Add numeric indices
	files.forEach((file, index) => {
		(fileList as any)[index] = file;
	});

	return fileList as FileList;
}
