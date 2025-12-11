import { useCallback, useState } from "react";
import type { TabState } from "./useTabManager";

interface UnsavedChangesDialogState {
	isOpen: boolean;
	tabId: string;
	tabName: string;
	isDirty: boolean;
}

interface UseUnsavedChangesDialogOptions {
	tabs: TabState[];
	closeTab: (tabId: string) => void;
}

interface UseUnsavedChangesDialogReturn {
	unsavedChangesDialog: UnsavedChangesDialogState;
	handleTabClose: (tabId: string, skipConfirmation?: boolean) => void;
	handleConfirmCloseTab: () => void;
	handleCancelCloseTab: () => void;
}

const INITIAL_STATE: UnsavedChangesDialogState = {
	isOpen: false,
	tabId: "",
	tabName: "",
	isDirty: false,
};

/**
 * Hook to manage unsaved changes confirmation dialog
 * - Shows confirmation before closing tabs
 * - Handles confirm/cancel actions
 */
export function useUnsavedChangesDialog({
	tabs,
	closeTab,
}: UseUnsavedChangesDialogOptions): UseUnsavedChangesDialogReturn {
	const [unsavedChangesDialog, setUnsavedChangesDialog] =
		useState<UnsavedChangesDialogState>(INITIAL_STATE);

	const handleTabClose = useCallback(
		(tabId: string, skipConfirmation: boolean = false) => {
			const tab = tabs.find((t) => t.id === tabId);

			// Always show confirmation unless explicitly skipped (e.g., via keyboard shortcut)
			if (!skipConfirmation) {
				setUnsavedChangesDialog({
					isOpen: true,
					tabId: tabId,
					tabName: tab?.name || "Query",
					isDirty: tab?.isDirty || false,
				});
				return;
			}

			// Close the tab directly using hook function
			closeTab(tabId);
		},
		[tabs, closeTab],
	);

	const handleConfirmCloseTab = useCallback(() => {
		closeTab(unsavedChangesDialog.tabId);
		setUnsavedChangesDialog(INITIAL_STATE);
	}, [closeTab, unsavedChangesDialog.tabId]);

	const handleCancelCloseTab = useCallback(() => {
		setUnsavedChangesDialog(INITIAL_STATE);
	}, []);

	return {
		unsavedChangesDialog,
		handleTabClose,
		handleConfirmCloseTab,
		handleCancelCloseTab,
	};
}
