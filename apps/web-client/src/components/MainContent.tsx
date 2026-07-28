import type { CSSProperties, RefObject } from "react";
import type { QueryResult } from "../services/streaming-query-service";
import type { ResultsLayout } from "../stores/settingsStore";
import type { DataSource } from "../types/data-source";
import EditorPane, { type EditorPaneHandle } from "./EditorPane";
import { CloseIcon } from "./Icons";
import Overlays from "./Overlays";
import PaginatedTable, { type PaginatedTableHandle } from "./PaginatedTable";
import { computeExportSql } from "./table/exporters/exportSql";

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
	editorWidth: number;
	resultsLayout: ResultsLayout;
	maximizedPanel: "editor" | "results" | null;
	onExitMaximize: () => void;
	onFocusPanel: (panel: "editor" | "results") => void;
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
	editorWidth,
	resultsLayout,
	maximizedPanel,
	onExitMaximize,
	onFocusPanel,
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
	const isRight = resultsLayout === "right";
	const isHidden = resultsLayout === "hidden";
	const layoutClass = isRight
		? "layout-right"
		: isHidden
			? "layout-hidden"
			: "";

	// The editor's wrapper drives its size; EditorPane grows to fill it via flex
	// (not a percentage height, which collapses because the app uses min-height:
	// 100vh rather than a definite height). Bottom: fixed height. Right: fixed
	// width, full height via stretch. Hidden: grow to fill the whole pane.
	const isEditorMax = maximizedPanel === "editor";
	const isResultsMax = maximizedPanel === "results";
	// Focus overlay: ~90% of the viewport, positioned below the header so the
	// header stays visible and interactive. z-index sits under modals/toasts
	// (100+) so those still surface. Applied to whichever panel is maximized.
	const overlayStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		position: "fixed",
		top: "56px",
		left: "5vw",
		right: "5vw",
		bottom: "5vh",
		zIndex: 96,
	};

	// Chrome bar shown at the top of a maximized panel: title, Esc hint, close.
	const maximizeChrome = (label: string) => (
		<div className="maximize-chrome">
			<span className="maximize-chrome-title">{label}</span>
			<div className="maximize-chrome-actions">
				<span className="maximize-chrome-hint">Press Esc to close</span>
				<button
					type="button"
					className="maximize-chrome-close"
					onClick={onExitMaximize}
					title="Close (Esc)"
					aria-label="Close maximized panel"
				>
					<CloseIcon size={16} aria-hidden="true" />
				</button>
			</div>
		</div>
	);

	const editorContainerStyle: CSSProperties = isEditorMax
		? overlayStyle
		: {
				display: "flex",
				flexDirection: "column",
				...(isHidden
					? { flex: 1, minHeight: "150px" }
					: isRight
						? {
								width: `${editorWidth}px`,
								minWidth: "320px",
								// Cap so the results pane always keeps a usable width, even
								// if a stale/initial editorWidth would otherwise squeeze it out.
								maxWidth: "calc(100% - 360px)",
								alignSelf: "stretch",
								minHeight: 0,
							}
						: { height: `${editorHeight}px`, minHeight: "150px" }),
			};

	return (
		<main
			className={`main-compact ${showExplorer ? "with-explorer" : ""} ${layoutClass}`}
			ref={containerRef}
		>
			{/* Transparent overlay to capture all mouse events during resize */}
			{isDragging && (
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						zIndex: 1000,
						cursor: isRight ? "col-resize" : "row-resize",
					}}
				/>
			)}
			{/* Dim backdrop behind the maximized panel; click to restore.
			    Starts below the header so the header stays visible + clickable. */}
			{maximizedPanel !== null && (
				<div
					onClick={onExitMaximize}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onExitMaximize();
					}}
					role="button"
					tabIndex={-1}
					aria-label="Restore editor"
					style={{
						position: "fixed",
						top: "52px",
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0,0,0,0.5)",
						zIndex: 95,
					}}
				/>
			)}
			<div
				className={isEditorMax ? "maximize-overlay" : undefined}
				style={editorContainerStyle}
				onMouseDownCapture={() => onFocusPanel("editor")}
				onFocusCapture={() => onFocusPanel("editor")}
			>
				{isEditorMax && maximizeChrome("Editor")}
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

			{!isHidden && (
				<div
					className={`resize-handle-compact ${isRight ? "vertical" : ""} ${isDragging ? "dragging" : ""}`}
					onMouseDown={onMouseDown}
				>
					<div className="resize-handle-bar" />
				</div>
			)}

			{!isHidden && (
			<div
				className={`results-wrapper ${isResultsMax ? "maximize-overlay" : ""}`}
				style={isResultsMax ? overlayStyle : { position: "relative" }}
				onMouseDownCapture={() => onFocusPanel("results")}
				onFocusCapture={() => onFocusPanel("results")}
			>
				{isResultsMax && maximizeChrome("Results")}
				<PaginatedTable
					ref={gridRef}
					sql={activeTab.useVirtualTable ? activeTab.executedSql : undefined}
					result={!activeTab.useVirtualTable ? activeTab.result : undefined}
					exportSql={computeExportSql(activeTab)}
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
			)}
		</main>
	);
}
