import type { RefObject } from "react";
import type { QueryResult } from "../services/streaming-query-service";
import type { DataSource } from "../types/data-source";
import EditorPane, { type EditorPaneHandle } from "./EditorPane";
import Overlays from "./Overlays";
import PaginatedTable, { type PaginatedTableHandle } from "./PaginatedTable";

interface UploadProgress {
	currentFile: string;
	currentIndex: number;
	totalFiles: number;
}

interface ExportProgress {
	fileType: string;
	currentStage: string;
	fileName: string;
}

interface ActiveTabData {
	id: string;
	useVirtualTable?: boolean;
	executedSql?: string;
	result: QueryResult | null;
	estimatedRowCount?: number;
	rowCountIsEstimated?: boolean;
	loading: boolean;
	error?: string | null;
	abortSignal?: AbortSignal;
}

interface MainContentProps {
	// Refs
	containerRef: RefObject<HTMLDivElement>;
	editorRef: RefObject<EditorPaneHandle>;
	gridRef: RefObject<PaginatedTableHandle>;

	// Explorer state
	showExplorer: boolean;

	// Editor props
	editorHeight: number;
	isDragging: boolean;
	initializing: boolean;
	editorTheme: string;
	editorFontSize: number;
	editorFontFamily: string;
	dataSources?: DataSource[];

	// Editor handlers
	onMouseDown: () => void;
	onRunQuery: () => void;
	onSaveFile: () => void;
	onEditorFocus: () => void;
	onEditorBlur: () => void;
	onEditorChange: (value: string) => void;

	// Active tab data
	activeTab: ActiveTabData;
	activeTabId: string;

	// Results handlers
	onError: (error: string) => void;
	onLoadingChange: (loading: boolean, tabId?: string) => void;

	// Grid settings
	gridFontSize: number;
	gridRowHeight: number;
	pageSize: number;
	cacheThreshold: number;

	// Export handlers
	onExportStart: (params: {
		fileType: "csv" | "json" | "parquet";
		fileName: string;
		totalSteps: number;
	}) => void;
	onExportProgress: (params: {
		currentStage: string;
		currentStep: number;
	}) => void;
	onExportComplete: () => void;
	onExportError: (error: string) => void;

	// Toast
	showToast: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onShowHistory: () => void;
	historyCount: number;

	// Overlay props
	showLongRunningOverlay: boolean;
	queryElapsedSeconds: number;
	onStopQuery: () => void;
	isUploadingFiles: boolean;
	uploadProgress: UploadProgress;
	isExporting: boolean;
	exportProgress: ExportProgress;
	exportElapsedSeconds: number;
}

export default function MainContent({
	containerRef,
	editorRef,
	gridRef,
	showExplorer,
	editorHeight,
	isDragging,
	initializing,
	editorTheme,
	editorFontSize,
	editorFontFamily,
	onMouseDown,
	onRunQuery,
	onSaveFile,
	onEditorFocus,
	onEditorBlur,
	onEditorChange,
	activeTab,
	activeTabId: _activeTabId,
	onError,
	onLoadingChange,
	gridFontSize,
	gridRowHeight,
	pageSize,
	cacheThreshold,
	onExportStart,
	onExportProgress,
	onExportComplete,
	onExportError,
	showToast,
	onShowHistory,
	historyCount,
	showLongRunningOverlay,
	queryElapsedSeconds,
	onStopQuery,
	isUploadingFiles,
	uploadProgress,
	isExporting,
	exportProgress,
	exportElapsedSeconds,
	dataSources,
}: MainContentProps) {
	return (
		<main
			className={`main-compact ${showExplorer ? "with-explorer" : ""}`}
			ref={containerRef}
		>
			<div style={{ height: `${editorHeight}px`, minHeight: "150px" }}>
				<EditorPane
					ref={editorRef}
					onRunQuery={onRunQuery}
					onSaveFile={onSaveFile}
					onFocus={onEditorFocus}
					onBlur={onEditorBlur}
					disabled={initializing}
					height={editorHeight}
					onChange={onEditorChange}
					theme={editorTheme}
					fontSize={editorFontSize}
					fontFamily={editorFontFamily}
					dataSources={dataSources}
				/>
			</div>

			<div
				className={`resize-handle-compact ${isDragging ? "dragging" : ""}`}
				onMouseDown={onMouseDown}
			>
				<div className="resize-handle-bar" />
			</div>

			<div className="results-wrapper" style={{ position: "relative" }}>
				<PaginatedTable
					ref={gridRef}
					sql={activeTab.useVirtualTable ? activeTab.executedSql : undefined}
					result={!activeTab.useVirtualTable ? activeTab.result : undefined}
					tabId={activeTab.id}
					error={activeTab.error}
					estimatedRowCount={activeTab.estimatedRowCount}
					rowCountIsEstimated={activeTab.rowCountIsEstimated}
					onError={onError}
					onLoadingChange={onLoadingChange}
					showToast={showToast}
					gridFontSize={gridFontSize}
					gridRowHeight={gridRowHeight}
					pageSize={pageSize}
					cacheThreshold={cacheThreshold}
					abortSignal={activeTab.abortSignal}
					onExportStart={onExportStart}
					onExportProgress={onExportProgress}
					onExportComplete={onExportComplete}
					onExportError={onExportError}
					onShowHistory={onShowHistory}
					historyCount={historyCount}
				/>
				<Overlays
					showLongRunningOverlay={showLongRunningOverlay}
					queryElapsedSeconds={queryElapsedSeconds}
					onStopQuery={onStopQuery}
					isUploadingFiles={isUploadingFiles}
					uploadProgress={uploadProgress}
					isExporting={isExporting}
					exportProgress={exportProgress}
					exportElapsedSeconds={exportElapsedSeconds}
				/>
			</div>
		</main>
	);
}
