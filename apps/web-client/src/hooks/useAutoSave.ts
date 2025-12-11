import type * as Monaco from "monaco-editor";
import { type RefObject, useEffect } from "react";
import { fileHandleStore } from "../services/file-handle-store";
import { createLogger } from "../utils/logger";

const logger = createLogger("AutoSave");

export interface FileConflictInfo {
	tabId: string;
	tabName: string;
	filePath: string;
	diskTimestamp: number;
	ourTimestamp: number;
}

interface AutoSaveOptions {
	editorRef: RefObject<Monaco.editor.IStandaloneCodeEditor>;
	activeTabId: string;
	activeTab: {
		query?: string;
		isDirty?: boolean;
		fileHandleId?: string;
		filePath?: string;
		name?: string;
		fileLastModified?: number;
	};
	saveStrategy: "auto" | "manual";
	updateTab: (tabId: string, updates: Record<string, unknown>) => void;
	showToast: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onFileConflict?: (conflict: FileConflictInfo) => void;
}

/**
 * Hook for auto-saving file-backed tabs with debounce
 * Saves to file system after 3 seconds of inactivity when save strategy is 'auto'
 */
export function useAutoSave({
	editorRef,
	activeTabId,
	activeTab,
	saveStrategy,
	updateTab,
	showToast,
	onFileConflict,
}: AutoSaveOptions) {
	useEffect(() => {
		// Only auto-save if:
		// 1. Save strategy is 'auto'
		// 2. Active tab has a file handle
		// 3. Active tab is dirty
		if (
			saveStrategy !== "auto" ||
			!activeTab.fileHandleId ||
			!activeTab.isDirty
		) {
			return;
		}

		const timer = setTimeout(async () => {
			if (!editorRef.current) return;

			const query = editorRef.current.getValue();

			try {
				// Check if we need to request permission first
				const stored = await fileHandleStore.getHandle(activeTab.fileHandleId!);
				if (!stored) {
					logger.warn("File handle not found for auto-save");
					return;
				}

				// Check for file conflicts before saving
				// If another browser/app modified the file since we last read/wrote it, don't overwrite
				if (activeTab.fileLastModified && onFileConflict) {
					try {
						const currentFile = await stored.handle.getFile();
						if (currentFile.lastModified > activeTab.fileLastModified) {
							// File was modified externally - show conflict dialog
							logger.warn(
								`File conflict detected: ${activeTab.filePath || activeTab.name}. ` +
									`Disk: ${currentFile.lastModified}, Ours: ${activeTab.fileLastModified}`,
							);
							onFileConflict({
								tabId: activeTabId,
								tabName: activeTab.name || "Untitled",
								filePath: activeTab.filePath || activeTab.name || "Untitled",
								diskTimestamp: currentFile.lastModified,
								ourTimestamp: activeTab.fileLastModified,
							});
							return; // Don't auto-save - let user decide
						}
					} catch (err) {
						logger.warn("Failed to check file timestamp for conflict detection", err);
						// Continue with save - better to overwrite than lose data
					}
				}

				const hasPermission = await fileHandleStore.queryWritePermission(
					stored.handle,
				);
				if (!hasPermission) {
					// Show info toast before permission dialog appears
					showToast(
						`Your browser will ask permission to auto-save "${activeTab.filePath || activeTab.name}"`,
						"info",
						3000,
					);
				}

				const success = await fileHandleStore.writeFile(
					activeTab.fileHandleId!,
					query,
				);
				if (success) {
					// Get updated file timestamp after write for conflict detection
					let newFileLastModified: number | undefined;
					try {
						const updatedFile = await stored.handle.getFile();
						newFileLastModified = updatedFile.lastModified;
					} catch (err) {
						logger.warn("Failed to get file timestamp after auto-save", err);
					}

					updateTab(activeTabId, {
						isDirty: false,
						hasWritePermission: true,
						lastModified: Date.now(),
						fileLastModified: newFileLastModified,
					});
					showToast(
						`Auto-saved: ${activeTab.filePath || activeTab.name}`,
						"success",
						2000,
					);
					// Restore focus to editor after auto-save
					setTimeout(() => editorRef.current?.focus(), 0);
				} else {
					// Permission denied or other error - show message
					showToast(
						`Auto-save failed: ${activeTab.filePath || activeTab.name}. Use Cmd+S to save manually.`,
						"warning",
						5000,
					);
				}
			} catch (error) {
				logger.error("Auto-save error", error);
				showToast(
					`Auto-save error: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error",
					5000,
				);
			}
		}, 3000); // 3 second debounce

		return () => clearTimeout(timer);
	}, [
		activeTab.isDirty,
		activeTab.fileHandleId,
		activeTab.filePath,
		activeTab.name,
		activeTab.fileLastModified,
		activeTabId,
		saveStrategy,
		showToast,
		updateTab,
		editorRef,
		onFileConflict,
	]);
}
