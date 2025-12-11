// Custom hooks for Data IDE
// Re-exports all hooks for easy importing

// Stage 1 hooks - extracted from App.tsx
export { useAppInitialization } from "./useAppInitialization";
export { useAutoSave } from "./useAutoSave";
export type { FileConflictInfo } from "./useAutoSave";
export { useConnector } from "./useConnector";
export { useEditorLayout } from "./useEditorLayout";
export { useExportProgress } from "./useExportProgress";
export { useFileConflict } from "./useFileConflict";
export { useFileOperations } from "./useFileOperations";
export { useFileReload } from "./useFileReload";
export { useFileUpload } from "./useFileUpload";
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useOnboarding } from "./useOnboarding";
export { useQueryExecution } from "./useQueryExecution";
export { useQueryOverlay } from "./useQueryOverlay";
export { useSQLTemplates } from "./useSQLTemplates";
export type { TabState, UseTabManagerReturn } from "./useTabManager";
export { useTabManager } from "./useTabManager";
export { useUIVisibility } from "./useUIVisibility";
export { useUnsavedChangesDialog } from "./useUnsavedChangesDialog";
export { useUploadProgress } from "./useUploadProgress";
export { useURLExampleLoader } from "./useURLExampleLoader";
