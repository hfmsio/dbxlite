import { useCallback, useState } from "react";
import { fileHandleStore } from "../services/file-handle-store";
import { saveSQLFile } from "../services/file-service";
import type { EditorPaneHandle } from "../components/EditorPane";
import type { FileConflictInfo } from "./useAutoSave";
import type { TabState } from "./useTabManager";

interface UseFileConflictOptions {
	tabs: TabState[];
	activeTabId: string;
	editorRef: React.MutableRefObject<EditorPaneHandle | null>;
	updateTab: (tabId: string, updates: Partial<TabState>) => void;
	showToast: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

export interface UseFileConflictReturn {
	conflict: FileConflictInfo | null;
	setConflict: (conflict: FileConflictInfo | null) => void;
	handleOverwrite: () => Promise<void>;
	handleReload: () => Promise<void>;
	handleSaveAs: () => Promise<void>;
}

export function useFileConflict({
	tabs,
	activeTabId,
	editorRef,
	updateTab,
	showToast,
}: UseFileConflictOptions): UseFileConflictReturn {
	const [conflict, setConflict] = useState<FileConflictInfo | null>(null);

	const handleOverwrite = useCallback(async () => {
		if (!conflict || !editorRef.current) return;

		const tab = tabs.find((t) => t.id === conflict.tabId);
		if (!tab?.fileHandleId) return;

		const query = editorRef.current.getValue();
		const success = await fileHandleStore.writeFile(tab.fileHandleId, query);

		if (success) {
			// Get new file timestamp
			const stored = await fileHandleStore.getHandle(tab.fileHandleId);
			let newTimestamp: number | undefined;
			if (stored) {
				const file = await stored.handle.getFile();
				newTimestamp = file.lastModified;
			}

			updateTab(conflict.tabId, {
				isDirty: false,
				fileLastModified: newTimestamp,
			});
			showToast("File overwritten successfully", "success", 2000);
		} else {
			showToast("Failed to overwrite file", "error", 3000);
		}

		setConflict(null);
	}, [conflict, tabs, updateTab, showToast, editorRef]);

	const handleReload = useCallback(async () => {
		if (!conflict) return;

		const tab = tabs.find((t) => t.id === conflict.tabId);
		if (!tab?.fileHandleId) return;

		const stored = await fileHandleStore.getHandle(tab.fileHandleId);
		if (!stored) {
			showToast("File handle not found", "error", 3000);
			setConflict(null);
			return;
		}

		try {
			const file = await stored.handle.getFile();
			const content = await file.text();

			updateTab(conflict.tabId, {
				query: content,
				isDirty: false,
				fileLastModified: file.lastModified,
			});

			// Update editor content
			if (editorRef.current && activeTabId === conflict.tabId) {
				editorRef.current.setValue(content);
			}

			showToast("File reloaded from disk", "success", 2000);
		} catch {
			showToast("Failed to reload file", "error", 3000);
		}

		setConflict(null);
	}, [conflict, tabs, updateTab, showToast, editorRef, activeTabId]);

	const handleSaveAs = useCallback(async () => {
		if (!conflict || !editorRef.current) return;

		const tab = tabs.find((t) => t.id === conflict.tabId);
		const query = editorRef.current.getValue();
		const suggestedName = tab?.name
			? `${tab.name}-copy.sql`
			: "query-copy.sql";

		const result = await saveSQLFile(query, suggestedName);
		if (result) {
			// Store the new file handle
			let newFileLastModified: number | undefined;
			let newHandleId: string | undefined;

			if (result.fileHandle) {
				newHandleId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				await fileHandleStore.storeHandle(
					newHandleId,
					result.name,
					result.fileHandle,
				);
				const file = await result.fileHandle.getFile();
				newFileLastModified = file.lastModified;
			}

			updateTab(conflict.tabId, {
				filePath: result.name,
				name: result.name.replace(".sql", ""),
				isDirty: false,
				fileHandleId: newHandleId,
				fileLastModified: newFileLastModified,
			});

			showToast(`Saved as: ${result.name}`, "success", 2000);
		}

		setConflict(null);
	}, [conflict, tabs, updateTab, showToast, editorRef]);

	return {
		conflict,
		setConflict,
		handleOverwrite,
		handleReload,
		handleSaveAs,
	};
}
