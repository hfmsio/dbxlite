/**
 * useAutoSave Hook Tests
 * Tests for auto-saving file-backed tabs with debounce and conflict detection
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "../useAutoSave";

// Mock the file-handle-store module
vi.mock("../../services/file-handle-store", () => ({
	fileHandleStore: {
		getHandle: vi.fn(),
		queryWritePermission: vi.fn(),
		writeFile: vi.fn(),
	},
}));

// Import the mocked module
import { fileHandleStore } from "../../services/file-handle-store";

// Mock editor ref
const createMockEditorRef = (value: string = "SELECT * FROM test") => ({
	current: {
		getValue: vi.fn(() => value),
		focus: vi.fn(),
	},
});

// Mock file handle
const createMockFileHandle = (lastModified: number = Date.now()) => ({
	handle: {
		getFile: vi.fn().mockResolvedValue({
			lastModified,
		}),
	},
});

describe("useAutoSave", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("auto-save conditions", () => {
		it("should not auto-save when strategy is manual", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
					},
					saveStrategy: "manual",
					updateTab,
					showToast,
				}),
			);

			// Fast-forward past the debounce time
			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.getHandle).not.toHaveBeenCalled();
		});

		it("should not auto-save when tab has no file handle", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: undefined,
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.getHandle).not.toHaveBeenCalled();
		});

		it("should not auto-save when tab is not dirty", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: false,
						fileHandleId: "handle-1",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.getHandle).not.toHaveBeenCalled();
		});
	});

	describe("successful auto-save", () => {
		it("should auto-save after debounce when all conditions met", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(true);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef("SELECT * FROM users") as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT * FROM users",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "/path/to/file.sql",
						name: "file.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.getHandle).toHaveBeenCalledWith("handle-1");
			expect(fileHandleStore.writeFile).toHaveBeenCalledWith(
				"handle-1",
				"SELECT * FROM users",
			);
		});

		it("should update tab state after successful save", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle(1000);

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(true);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "test.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(updateTab).toHaveBeenCalledWith(
				"tab-1",
				expect.objectContaining({
					isDirty: false,
					hasWritePermission: true,
				}),
			);
		});

		it("should show success toast after save", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(true);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "test.sql",
						name: "test.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(showToast).toHaveBeenCalledWith(
				"Auto-saved: test.sql",
				"success",
				2000,
			);
		});
	});

	describe("file conflict detection", () => {
		it("should detect file conflict when disk timestamp is newer", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const onFileConflict = vi.fn();

			// Disk file is newer (2000) than our last known timestamp (1000)
			const mockHandle = createMockFileHandle(2000);
			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "/path/to/file.sql",
						name: "file.sql",
						fileLastModified: 1000, // Our last known timestamp
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
					onFileConflict,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(onFileConflict).toHaveBeenCalledWith({
				tabId: "tab-1",
				tabName: "file.sql",
				filePath: "/path/to/file.sql",
				diskTimestamp: 2000,
				ourTimestamp: 1000,
			});

			// Should NOT write when conflict detected
			expect(fileHandleStore.writeFile).not.toHaveBeenCalled();
		});

		it("should save normally when no conflict (disk timestamp same or older)", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const onFileConflict = vi.fn();

			// Disk file has same timestamp as our last known
			const mockHandle = createMockFileHandle(1000);
			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(true);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "/path/to/file.sql",
						name: "file.sql",
						fileLastModified: 1000,
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
					onFileConflict,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.writeFile).toHaveBeenCalled();
			expect(onFileConflict).not.toHaveBeenCalled();
		});
	});

	describe("permission handling", () => {
		it("should show info toast when permission needs to be requested", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(false);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(true);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "test.sql",
						name: "test.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("browser will ask permission"),
				"info",
				3000,
			);
		});

		it("should show warning when write fails", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockResolvedValue(false);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "test.sql",
						name: "test.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Auto-save failed"),
				"warning",
				5000,
			);
		});
	});

	describe("error handling", () => {
		it("should handle missing file handle gracefully", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(null);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(fileHandleStore.getHandle).toHaveBeenCalled();
			// Should not crash, should not try to write
			expect(fileHandleStore.writeFile).not.toHaveBeenCalled();
		});

		it("should show error toast on save exception", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);
			vi.mocked(fileHandleStore.queryWritePermission).mockResolvedValue(true);
			vi.mocked(fileHandleStore.writeFile).mockRejectedValue(
				new Error("Disk full"),
			);

			renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
						filePath: "test.sql",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Disk full"),
				"error",
				5000,
			);
		});
	});

	describe("cleanup", () => {
		it("should clear timer on unmount", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();

			const { unmount } = renderHook(() =>
				useAutoSave({
					editorRef: createMockEditorRef() as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			// Unmount before timer fires
			unmount();

			// Advance past debounce time
			await act(async () => {
				await vi.runAllTimersAsync();
			});

			// Timer should have been cleared, no save attempt
			expect(fileHandleStore.getHandle).not.toHaveBeenCalled();
		});
	});

	describe("editor ref handling", () => {
		it("should not save if editor ref is not available", async () => {
			const updateTab = vi.fn();
			const showToast = vi.fn();
			const mockHandle = createMockFileHandle();

			vi.mocked(fileHandleStore.getHandle).mockResolvedValue(mockHandle);

			renderHook(() =>
				useAutoSave({
					editorRef: { current: null } as any,
					activeTabId: "tab-1",
					activeTab: {
						query: "SELECT 1",
						isDirty: true,
						fileHandleId: "handle-1",
					},
					saveStrategy: "auto",
					updateTab,
					showToast,
				}),
			);

			await act(async () => {
				await vi.runAllTimersAsync();
			});

			// Hook returns early when editorRef.current is null (before calling getHandle)
			expect(fileHandleStore.getHandle).not.toHaveBeenCalled();
			expect(fileHandleStore.writeFile).not.toHaveBeenCalled();
		});
	});
});
