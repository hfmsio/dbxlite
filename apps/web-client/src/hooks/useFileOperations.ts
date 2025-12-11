import { useCallback } from "react";
import { fileHandleStore } from "../services/file-handle-store";
import { openSQLFile, saveSQLFile } from "../services/file-service";
import type { ConnectorType } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";
import type { TabState } from "./useTabManager";

const logger = createLogger("FileOperations");

interface UseFileOperationsOptions {
	tabs: TabState[];
	activeTabId: string;
	activeTab: TabState;
	nextTabId: React.MutableRefObject<number>;
	editorRef: React.MutableRefObject<unknown>;
	setTabs: React.Dispatch<React.SetStateAction<TabState[]>>;
	setActiveTabId: (id: string) => void;
	updateTab: (tabId: string, updates: Partial<TabState>) => void;
	showToast: (
		message: string,
		type: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	activeConnector: ConnectorType;
	handleConnectorChange: (connector: ConnectorType) => void;
}

interface UseFileOperationsReturn {
	handleOpenFile: () => Promise<void>;
	handleSaveFile: () => Promise<void>;
	handleInsertQuery: (sql: string, connectorType?: ConnectorType) => void;
}

/**
 * Hook to manage file operations (open, save, insert)
 * - Opens SQL files and creates new tabs
 * - Saves queries to files (with file handle persistence)
 * - Inserts SQL into editor with optional connector switching
 */
export function useFileOperations({
	tabs,
	activeTabId,
	activeTab,
	nextTabId,
	editorRef,
	setTabs,
	setActiveTabId,
	updateTab,
	showToast,
	activeConnector,
	handleConnectorChange,
}: UseFileOperationsOptions): UseFileOperationsReturn {
	const handleOpenFile = useCallback(async () => {
		const file = await openSQLFile();
		if (file) {
			let fileHandleId: string | undefined;

			// Store file handle if available
			let hasWritePermission: boolean | undefined;
			if (file.fileHandle) {
				// Check for duplicate files by comparing file handles
				for (const tab of tabs) {
					if (tab.fileHandleId) {
						try {
							const storedHandle = await fileHandleStore.getHandle(
								tab.fileHandleId,
							);
							if (
								storedHandle &&
								(await file.fileHandle.isSameEntry(storedHandle.handle))
							) {
								showToast(
									`File "${file.name}" is already open in tab "${tab.name}"`,
									"info",
									3000,
								);
								setActiveTabId(tab.id);
								return;
							}
						} catch (err) {
							logger.error("Failed to check for duplicate file", err);
						}
					}
				}

				fileHandleId = crypto.randomUUID();

				try {
					await fileHandleStore.storeHandle(
						fileHandleId,
						file.name,
						file.fileHandle,
					);
					// Check write permission status
					hasWritePermission = await fileHandleStore.queryWritePermission(
						file.fileHandle,
					);
				} catch (err) {
					logger.error("Failed to store file handle", err);
					// Continue without file handle - fallback gracefully
					fileHandleId = undefined;
				}
			}

			const newTab: TabState = {
				id: String(nextTabId.current++),
				name: file.name.replace(".sql", ""),
				query: file.content,
				result: null,
				loading: false,
				error: null,
				isDirty: false,
				filePath: file.path,
				fileHandleId,
				hasWritePermission,
				lastModified: Date.now(),
				fileLastModified: file.fileLastModified, // Track file's disk timestamp for conflict detection
			};
			setTabs((prev) => [...prev, newTab]);
			setActiveTabId(newTab.id);
		}
	}, [tabs, nextTabId, setTabs, setActiveTabId, showToast]);

	const handleSaveFile = useCallback(async () => {
		if (!editorRef.current) return;

		const query = editorRef.current.getValue();
		const fileName = activeTab.filePath || `${activeTab.name}.sql`;

		// Try to save to existing file handle if available
		if (activeTab.fileHandleId) {
			// Check if we need to request permission first
			const stored = await fileHandleStore.getHandle(activeTab.fileHandleId);
			if (stored) {
				const hasPermission = await fileHandleStore.queryWritePermission(
					stored.handle,
				);
				if (!hasPermission) {
					// Show info toast before permission dialog appears
					showToast(
						`Your browser will ask permission to save "${activeTab.filePath || activeTab.name}"`,
						"info",
						3000,
					);
				}
			}

			const success = await fileHandleStore.writeFile(
				activeTab.fileHandleId,
				query,
			);
			if (success) {
				// Get updated file timestamp after write for conflict detection
				let newFileLastModified: number | undefined;
				try {
					const updatedHandle = await fileHandleStore.getHandle(
						activeTab.fileHandleId,
					);
					if (updatedHandle) {
						const file = await updatedHandle.handle.getFile();
						newFileLastModified = file.lastModified;
					}
				} catch (err) {
					logger.warn("Failed to get file timestamp after save", err);
				}

				updateTab(activeTabId, {
					isDirty: false,
					hasWritePermission: true,
					lastModified: Date.now(),
					fileLastModified: newFileLastModified,
				});
				showToast(
					`Saved: ${activeTab.filePath || activeTab.name}`,
					"success",
					2000,
				);
				// Restore focus to editor after save
				setTimeout(() => editorRef.current?.focus(), 0);
				return;
			} else {
				// Permission denied or file handle no longer valid - fall through to save dialog
				showToast(
					"Could not save to original file. Opening save dialog...",
					"info",
					3000,
				);
			}
		}

		// No file handle or save failed - use save dialog
		const result = await saveSQLFile(query, fileName);
		if (result) {
			const updates: Partial<TabState> = {
				filePath: result.name,
				isDirty: false,
				name: result.name.replace(".sql", ""),
				lastModified: Date.now(),
			};

			// Store the file handle if available
			if (result.fileHandle) {
				const handleId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				await fileHandleStore.storeHandle(
					handleId,
					result.name,
					result.fileHandle,
				);
				updates.fileHandleId = handleId;
				// Check write permission (should be granted after save dialog)
				updates.hasWritePermission = await fileHandleStore.queryWritePermission(
					result.fileHandle,
				);
				// Get file's lastModified for conflict detection
				try {
					const file = await result.fileHandle.getFile();
					updates.fileLastModified = file.lastModified;
				} catch (err) {
					logger.warn("Failed to get file timestamp after save dialog", err);
				}
			}

			updateTab(activeTabId, updates);
			showToast(`Saved: ${result.name}`, "success", 2000);
			// Restore focus to editor after save
			setTimeout(() => editorRef.current?.focus(), 0);
		}
	}, [editorRef, activeTab, activeTabId, updateTab, showToast]);

	const handleInsertQuery = useCallback(
		(sql: string, connectorType?: ConnectorType) => {
			if (editorRef.current) {
				const currentQuery = editorRef.current.getValue() || "";
				const hasContent = currentQuery.trim().length > 0;
				const needsTrailingNewline =
					hasContent && !currentQuery.endsWith("\n");

				const insertion = sql.endsWith("\n") ? sql : `${sql}\n`;
				const separator = hasContent ? (needsTrailingNewline ? "\n\n" : "\n") : "";
				const insertionStart = currentQuery.length + separator.length;
				const newQuery = `${currentQuery}${separator}${insertion}`;

				editorRef.current.setValue(newQuery);

				// Focus editor and move cursor to end of inserted text
				editorRef.current.focus();
				editorRef.current.setCursorPosition(insertionStart);

				// Switch to the appropriate connector if specified (from explorer buttons)
				if (connectorType && connectorType !== activeConnector) {
					handleConnectorChange(connectorType);
					showToast(
						`Switched to ${connectorType === "bigquery" ? "BigQuery" : "DuckDB"} connector`,
						"info",
						2000,
					);
				}
			}
		},
		[editorRef, activeConnector, handleConnectorChange, showToast],
	);

	return {
		handleOpenFile,
		handleSaveFile,
		handleInsertQuery,
	};
}
