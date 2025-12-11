import { ConfirmDialog } from "../components/ConfirmDialog";
import { ExamplesPanel } from "../components/ExamplesPanel";
import { FileConflictDialog } from "../components/FileConflictDialog";
import { ToastHistory, type ToastHistoryEntry } from "../components/ToastHistory";
import { WelcomeModal } from "../components/WelcomeModal";
import type { FileConflictInfo } from "../hooks/useAutoSave";

interface DialogsContainerProps {
	// Welcome Modal (Onboarding)
	showWelcome: boolean;
	isWelcomeLoading?: boolean;
	onWelcomeGetStarted: () => void;
	onWelcomeSkip: () => void;
	// Toast History
	showToastHistory: boolean;
	toastHistory: ToastHistoryEntry[];
	onCloseToastHistory: () => void;
	onClearHistory: () => void;
	// Examples Panel
	showExamples: boolean;
	onCloseExamples: () => void;
	onInsertQuery: (sql: string, connector: string) => void;
	// Unsaved Changes Dialog
	unsavedChangesDialog: {
		isOpen: boolean;
		isDirty: boolean;
		tabName: string;
	};
	onConfirmCloseTab: () => void;
	onCancelCloseTab: () => void;
	// File Conflict Dialog
	fileConflict: FileConflictInfo | null;
	onConflictOverwrite: () => void;
	onConflictReload: () => void;
	onConflictSaveAs: () => void;
	onCancelConflict: () => void;
}

export function DialogsContainer({
	showWelcome,
	isWelcomeLoading,
	onWelcomeGetStarted,
	onWelcomeSkip,
	showToastHistory,
	toastHistory,
	onCloseToastHistory,
	onClearHistory,
	showExamples,
	onCloseExamples,
	onInsertQuery,
	unsavedChangesDialog,
	onConfirmCloseTab,
	onCancelCloseTab,
	fileConflict,
	onConflictOverwrite,
	onConflictReload,
	onConflictSaveAs,
	onCancelConflict,
}: DialogsContainerProps) {
	return (
		<>
			{/* Welcome Modal (Onboarding) */}
			<WelcomeModal
				isOpen={showWelcome}
				isLoading={isWelcomeLoading}
				onGetStarted={onWelcomeGetStarted}
				onSkip={onWelcomeSkip}
			/>

			{/* Toast History Panel */}
			{showToastHistory && (
				<ToastHistory
					history={toastHistory}
					onClose={onCloseToastHistory}
					onClear={onClearHistory}
				/>
			)}

			{/* Examples Panel */}
			{showExamples && (
				<ExamplesPanel onClose={onCloseExamples} onInsertQuery={onInsertQuery} />
			)}

			{/* Close Tab Confirmation Dialog */}
			<ConfirmDialog
				isOpen={unsavedChangesDialog.isOpen}
				title={unsavedChangesDialog.isDirty ? "Unsaved Changes" : "Close Tab"}
				message={
					unsavedChangesDialog.isDirty
						? `"${unsavedChangesDialog.tabName}" has unsaved changes. Close anyway?`
						: `Close tab "${unsavedChangesDialog.tabName}"?`
				}
				variant="warning"
				confirmText="Close Tab"
				onConfirm={onConfirmCloseTab}
				onCancel={onCancelCloseTab}
			/>

			{/* File Conflict Dialog */}
			<FileConflictDialog
				conflict={fileConflict}
				onOverwrite={onConflictOverwrite}
				onReload={onConflictReload}
				onSaveAs={onConflictSaveAs}
				onCancel={onCancelConflict}
			/>
		</>
	);
}
