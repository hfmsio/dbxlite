import { useCallback, useEffect, useRef, useState } from "react";
import DataSourceExplorer from "./components/DataSourceExplorer";
import { CostWarningDialog } from "./components/CostWarningDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ExamplesPage from "./components/ExamplesPage";
import Header from "./components/Header";
import MainContent from "./components/MainContent";
import OAuthCallback from "./components/OAuthCallback";
import ScreenshotsPage from "./components/ScreenshotsPage";
import { ResizableExplorer } from "./components/ResizableExplorer";
import SettingsModalWrapper from "./components/SettingsModalWrapper";
import TabBar from "./components/TabBar";
import { ToastProvider, useToast } from "./components/Toast";
import { DialogsContainer } from "./containers";
import { createLogger, setupGlobalErrorHandlers } from "./utils/logger";

const logger = createLogger("App");

// Initialize global error handlers once
setupGlobalErrorHandlers();

import {
	useAppInitialization,
	useAutoSave,
	useEditorLayout,
	useExportProgress,
	useFileConflict,
	useFileOperations,
	useFileReload,
	useFileUpload,
	useKeyboardShortcuts,
	useOnboarding,
	useQueryExecution,
	useQueryOverlay,
	useSQLTemplates,
	useUIVisibility,
	useUnsavedChangesDialog,
	useUploadProgress,
	useURLExampleLoader,
} from "./hooks";
// Note: CredentialStore and file-service are now used in hooks
import { useDataSourcesLegacy as useDataSources } from "./stores/dataSourceStore";
import { TabProvider, QueryProvider, useTabContext, useQueryContext, type TabState } from "./contexts";
import { SettingsProvider, useSettings } from "./services/settings-store";
import { useEngineDetectionMode, useSettingsStore } from "./stores/settingsStore";
import { getNextTheme } from "./themes";
import "./styles.css";

function AppContent() {
	const { showToast, toastHistory, clearHistory, setShowHistoryHandler } =
		useToast();

	// Get initialization state early (needed by useURLExampleLoader)
	const { initializing, initError } = useAppInitialization({ showToast });

	// Get UI visibility early (needed by useURLExampleLoader)
	const {
		showSettings,
		setShowSettings,
		settingsInitialTab,
		openSettings,
		closeSettings,
		showToastHistory,
		setShowToastHistory,
		showExamples,
		setShowExamples,
		showExplorer,
		setShowExplorer,
		toggleExplorer,
	} = useUIVisibility();

	// Auto-load examples/queries from URL parameters (pass initializing flag and setShowExplorer)
	useURLExampleLoader(initializing, setShowExplorer);

	// Use contexts instead of calling hooks directly (prevents duplicate state)
	const {
		activeConnector,
		isBigQueryConnected,
		handleConnectorChange,
		switchConnector,
		isConnectorAvailable,
	} = useQueryContext();

	const {
		tabs,
		activeTabId,
		activeTab: activeTabFromHook,
		setActiveTabId,
		closeTab,
		renameTab,
		updateTab,
		setTabs,
		canAddTab,
		nextTabId,
		editorRef,
		gridRef,
		createTabsWithQueries,
	} = useTabContext();

	const engineDetectionMode = useEngineDetectionMode();
	const {
		addDataSource,
		addRemoteURL,
		clearAllDataSources,
		dataSources,
		updateDataSource,
		removeDataSource,
		isLoadingFromStorage,
		introspectSchema,
	} = useDataSources();
	const {
		editorTheme,
		setEditorTheme: _setEditorTheme,
		editorFontSize,
		setEditorFontSize,
		editorFontFamily,
		setEditorFontFamily,
		gridFontSize,
		setGridFontSize,
		gridRowHeight,
		setGridRowHeight,
		pageSize,
		setPageSize,
		cacheThreshold,
		setCacheThreshold,
		explorerSortOrder,
		setExplorerSortOrder,
		saveStrategy,
		setSaveStrategy,
	} = useSettings();
	const {
		isExporting,
		exportElapsedSeconds,
		exportProgress,
		handleExportStart,
		handleExportProgress,
		handleExportComplete,
		handleExportError: handleExportErrorHook,
	} = useExportProgress();
	const bigQueryCacheClearRef = useRef<(() => void) | null>(null);
	const bigQueryDataLoadRef = useRef<(() => Promise<void>) | null>(null);
	const localDatabaseRefreshRef = useRef<(() => Promise<void>) | null>(null);
	const serverDatabaseRefreshRef = useRef<(() => Promise<void>) | null>(null);

	const [editorHasFocus, setEditorHasFocus] = useState(false);

	const { sqlTemplates } = useSQLTemplates({ tabs, setTabs });

	const {
		reloadingFiles,
		isClearingDataSources,
		reloadProgress,
		reloadFilesInBackground,
		handleReloadFile,
		handleRestoreFileAccess,
		handleReattachDatabase,
		handleToggleWriteMode,
		handleClearFileHandles,
	} = useFileReload({
		initializing,
		dataSources,
		showToast,
		addDataSource,
		updateDataSource,
		clearAllDataSources,
		introspectSchema,
	});

	const {
		isUploadingFiles,
		setIsUploadingFiles,
		uploadProgress,
		setUploadProgress,
	} = useUploadProgress();

	const {
		unsavedChangesDialog,
		handleTabClose,
		handleConfirmCloseTab,
		handleCancelCloseTab,
	} = useUnsavedChangesDialog({ tabs, closeTab });

	const [lastUploadedType, setLastUploadedType] = useState<
		"file" | "database" | null
	>(null);

	const containerRef = useRef<HTMLDivElement>(null);

	const {
		conflict: fileConflict,
		setConflict: setFileConflict,
		handleOverwrite: handleConflictOverwrite,
		handleReload: handleConflictReload,
		handleSaveAs: handleConflictSaveAs,
	} = useFileConflict({
		tabs,
		activeTabId,
		editorRef,
		updateTab,
		showToast,
	});

	const { handleUploadDataFile, handleDragDropUpload } = useFileUpload({
		initializing,
		activeConnector,
		isBigQueryConnected,
		showToast,
		handleConnectorChange,
		addDataSource,
		setIsUploadingFiles,
		setUploadProgress,
		setLastUploadedType,
	});

	const {
		isQueryExecuting,
		setIsQueryExecuting,
		handleRunQuery,
		handleStopQuery,
		costWarning,
		handleCostWarningConfirm,
		handleCostWarningCancel,
	} = useQueryExecution({
		initializing,
		initError,
		isUploadingFiles,
		isExporting,
		editorRef,
		activeConnector,
		activeTabId,
		updateTab,
		showToast,
		addRemoteURL: async (url: string, type: string) => {
			const result = await addRemoteURL(url, type as "parquet" | "csv" | "json");
			if (!result) {
				throw new Error(`Failed to add remote URL: ${url}`);
			}
			return result;
		},
		dataSources,
		engineDetectionMode,
		switchConnector,
		isConnectorAvailable,
		onSchemaChanged: async () => {
			await localDatabaseRefreshRef.current?.();
		},
		onDatabaseSchemaChanged: async (dbName: string) => {
			// Find the database by its attachedAs alias
			const db = dataSources.find((ds) => ds.attachedAs === dbName);
			if (db) {
				await introspectSchema(db.id);
			}
		},
		onDatabaseAttached: async ({ path, alias, readOnly }) => {
			// In HTTP mode, refresh server databases to reflect the ATTACH
			if (serverDatabaseRefreshRef.current) {
				await serverDatabaseRefreshRef.current();
				showToast(`Database "${alias}" attached`, "success", 3000);
				return;
			}

			// In WASM mode, add to dataSources
			// Check if database is already in explorer
			const existing = dataSources.find(
				(ds) => ds.attachedAs === alias || ds.filePath === path
			);
			if (existing) {
				// Just refresh the schema
				await introspectSchema(existing.id);
				return;
			}

			// Extract filename from path
			const fileName = path.split("/").pop() || path;

			// Add as new data source
			await addDataSource({
				name: fileName.replace(/\.duckdb$/i, "") + " (database)",
				type: "duckdb",
				filePath: path,
				isAttached: true,
				attachedAs: alias,
				isReadOnly: readOnly,
				hasFileHandle: false,
			});

			showToast(`Database "${alias}" added to explorer`, "success", 3000);
		},
		onDatabaseDetached: async (alias) => {
			// In HTTP mode, refresh server databases to reflect the DETACH
			if (serverDatabaseRefreshRef.current) {
				await serverDatabaseRefreshRef.current();
				showToast(`Database "${alias}" detached`, "success", 3000);
				return;
			}

			// In WASM mode, find the database by its attachedAs alias and remove
			const db = dataSources.find((ds) => ds.attachedAs === alias);
			if (db) {
				// Remove from explorer (skipDetach: true because DETACH was already executed)
				await removeDataSource(db.id, { skipDetach: true });
				showToast(`Database "${alias}" removed from explorer`, "success", 3000);
			}
		},
	});

	const { showLongRunningOverlay, queryElapsedSeconds } =
		useQueryOverlay(isQueryExecuting);

	// Onboarding - runs sample queries for first-time users
	const {
		showWelcomeModal,
		isRunningQueries: isWelcomeLoading,
		handleGetStarted: handleWelcomeGetStarted,
		handleSkip: handleWelcomeSkip,
	} = useOnboarding({
		hasDataSources: dataSources.length > 0,
		isBigQueryConnected,
		createTabsWithQueries,
		updateTab,
		setActiveTabId,
	});

	const { editorHeight, isDragging, handleMouseDown } =
		useEditorLayout(containerRef);

	const activeTab = activeTabFromHook || tabs[0];

	const { handleOpenFile, handleSaveFile, handleInsertQuery } =
		useFileOperations({
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
		});


	const handleEditorFocus = useCallback(() => {
		if (gridRef.current?.clearSelection) {
			gridRef.current.clearSelection();
		}
		setEditorHasFocus(true);
	}, []);

	const handleEditorBlur = useCallback(() => {
		setEditorHasFocus(false);
	}, []);

	// Sync editor content on tab switch
	const tabsRef = useRef(tabs);
	tabsRef.current = tabs; // Update ref on every render

	useEffect(() => {
		setEditorHasFocus(false);

		// Get the active tab from ref to avoid dependency on tabs array
		const currentTab = tabsRef.current.find((t) => t.id === activeTabId);

		// Step 1: Update editor content (EditorPane.setValue handles scroll/cursor reset)
		if (editorRef.current && currentTab && currentTab.query !== undefined) {
			try {
				editorRef.current.setValue(currentTab.query || "");
			} catch (err) {
				logger.error("Failed to sync editor content", err);
			}
		}

		// Step 2: Focus editor after content is set (delay allows React to settle after results grid re-render)
		const timeoutId = setTimeout(() => {
			editorRef.current?.focus();
		}, 50);

		return () => clearTimeout(timeoutId);
	}, [activeTabId]);

	// Register toast history handler with mutual exclusivity (closes examples when opening)
	useEffect(() => {
		setShowHistoryHandler(() => {
			setShowExamples(false);
			setShowToastHistory(true);
		});
	}, [setShowHistoryHandler, setShowToastHistory, setShowExamples]);

	// ESC key handler to stop running query
	useEffect(() => {
		if (activeTab.loading) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					handleStopQuery();
				}
			};

			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [activeTab.loading, handleStopQuery]);

	// Wait for localStorage to finish loading before restoring file handles from IndexedDB
	// This prevents race conditions where both storage mechanisms try to add the same files
	const hasStartedFileReload = useRef(false);
	useEffect(() => {
		if (!isLoadingFromStorage && !initializing && !hasStartedFileReload.current) {
			hasStartedFileReload.current = true;
			logger.info(
				"localStorage load complete, starting IndexedDB file handle restoration",
			);
			reloadFilesInBackground();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoadingFromStorage, initializing]);

	// Trigger local database schema refresh after DuckDB initialization completes
	// This ensures Session Tables are populated even if the initial refresh was too early
	const hasRefreshedLocalDb = useRef(false);
	useEffect(() => {
		if (!initializing && !hasRefreshedLocalDb.current) {
			hasRefreshedLocalDb.current = true;
			// Small delay to ensure the refresh ref has been set by DataSourceExplorer
			const timer = setTimeout(() => {
				if (localDatabaseRefreshRef.current) {
					logger.debug("DuckDB initialized, triggering local database schema refresh");
					localDatabaseRefreshRef.current();
				}
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [initializing]);

	// Save query text when editor changes
	const handleEditorChange = (value: string) => {
		setTabs((prev) =>
			prev.map((tab) =>
				tab.id === activeTabId
					? {
							...tab,
							query: value,
							isDirty: tab.filePath ? value !== tab.query : tab.isDirty,
							lastModified: Date.now(),
						}
					: tab,
			),
		);
	};

	// Auto-save timer for file-backed tabs (3 second debounce)
	useAutoSave({
		editorRef,
		activeTabId,
		activeTab,
		saveStrategy: saveStrategy === "prompt" ? "manual" : saveStrategy,
		updateTab,
		showToast,
		onFileConflict: setFileConflict,
	});

	// Tab management - handlers wrap hook functions with UI-specific logic
	const handleTabAdd = () => {
		if (!canAddTab) {
			showToast?.(
				"Maximum 3 tabs allowed. Close unused tabs to create new ones.",
				"warning",
				4000,
			);
			return;
		}

		// Create tab with current SQL template (may have loaded after hook init)
		const newTab: TabState = {
			id: String(nextTabId.current++),
			name: `Query ${nextTabId.current - 1}`,
			query: sqlTemplates.newTab,
			result: null,
			loading: false,
			error: null,
			isDirty: false,
		};
		setTabs((prev) => [...prev, newTab]);
		setActiveTabId(newTab.id);
	};

	const handleTabRename = (tabId: string, newName: string) => {
		renameTab(tabId, newName);
	};

	const handleExportError = useCallback(
		(error: string) => {
			handleExportErrorHook();
			showToast(`Export failed: ${error}`, "error");
		},
		[handleExportErrorHook, showToast],
	);

	const handleNextTab = useCallback(() => {
		const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
		const nextIndex = (currentIndex + 1) % tabs.length;
		setActiveTabId(tabs[nextIndex].id);
	}, [tabs, activeTabId, setActiveTabId]);

	const handlePrevTab = useCallback(() => {
		const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
		const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		setActiveTabId(tabs[prevIndex].id);
	}, [tabs, activeTabId, setActiveTabId]);

	const currentEditorTheme = useSettingsStore((s) => s.editorTheme);
	const setEditorThemeStore = useSettingsStore((s) => s.setEditorTheme);
	const handleRotateTheme = useCallback(() => {
		const nextTheme = getNextTheme(currentEditorTheme);
		setEditorThemeStore(nextTheme.id);
		showToast(`Theme: ${nextTheme.label}`, "info");
	}, [currentEditorTheme, setEditorThemeStore, showToast]);

	const showExamplesButton = useSettingsStore((s) => s.showExamplesButton);

	// Toggle examples with mutual exclusivity (closes toast history when opening)
	const toggleExamples = useCallback(() => {
		setShowExamples((prev) => {
			if (!prev) {
				setShowToastHistory(false);
			}
			return !prev;
		});
	}, [setShowExamples, setShowToastHistory]);

	useKeyboardShortcuts({
		onNewTab: handleTabAdd,
		onCloseTab: () => handleTabClose(activeTabId, true),
		onSave: handleSaveFile,
		onOpen: handleOpenFile,
		onToggleExplorer: toggleExplorer,
		onNextTab: handleNextTab,
		onPrevTab: handlePrevTab,
		onRotateTheme: handleRotateTheme,
		canCloseTab: tabs.length > 1,
	});

	return (
		<div className={`app ${showExplorer ? "app-with-explorer" : ""}`}>
			<Header
				initializing={initializing}
				reloadingFiles={reloadingFiles}
				initError={initError}
				filesTotal={reloadProgress.filesTotal}
				filesCompleted={reloadProgress.filesCompleted}
				currentLoadingFile={reloadProgress.currentLoadingFile}
				isLoading={activeTab.loading}
				isUploadingFiles={isUploadingFiles}
				isExporting={isExporting}
				showLongRunningOverlay={showLongRunningOverlay}
				showExplorer={showExplorer}
				onToggleExplorer={toggleExplorer}
				onOpenFile={handleOpenFile}
				onSaveFile={handleSaveFile}
				onRunQuery={handleRunQuery}
				onStopQuery={handleStopQuery}
				activeConnector={activeConnector}
				isBigQueryConnected={isBigQueryConnected}
				onConnectorChange={handleConnectorChange}
				showSettings={showSettings}
				onToggleSettings={() => setShowSettings(!showSettings)}
				onOpenServerSettings={() => openSettings("server")}
			/>

			<TabBar
				tabs={tabs.map((t) => ({
					id: t.id,
					name: t.name,
					query: t.query,
					isDirty: t.isDirty,
					filePath: t.filePath,
				}))}
				activeTabId={activeTabId}
				editorHasFocus={editorHasFocus}
			onTabChange={setActiveTabId}
				onTabClose={handleTabClose}
				onTabAdd={handleTabAdd}
				onTabRename={handleTabRename}
				onToggleExamples={toggleExamples}
				examplesOpen={showExamples}
				showExamplesButton={showExamplesButton}
				className={showExplorer ? "with-explorer" : ""}
				canAddTab={canAddTab}
				maxTabs={3}
			/>

			<ResizableExplorer isVisible={showExplorer} onToggle={toggleExplorer}>
				<DataSourceExplorer
					isVisible={showExplorer}
					onToggle={toggleExplorer}
					onInsertQuery={handleInsertQuery}
					onUploadFile={handleUploadDataFile}
					onDragDropUpload={handleDragDropUpload}
					onReloadFile={handleReloadFile}
					onRefreshMetadata={async (file) => {
						await introspectSchema(file.id);
						showToast(`Metadata refreshed for "${file.name}"`, "success", 2000);
					}}
					onRestoreAccess={handleRestoreFileAccess}
					onReattachDatabase={handleReattachDatabase}
					onToggleWriteMode={handleToggleWriteMode}
					onClearFileHandles={handleClearFileHandles}
					isClearingDataSources={isClearingDataSources}
					lastUploadedType={lastUploadedType}
					explorerSortOrder={explorerSortOrder}
					onBigQueryCacheClear={(clearFn) => {
						bigQueryCacheClearRef.current = clearFn;
					}}
					onBigQueryDataLoad={(loadFn) => {
						bigQueryDataLoadRef.current = loadFn;
					}}
					onLocalDatabaseRefresh={(refreshFn) => {
						localDatabaseRefreshRef.current = refreshFn;
					}}
					onServerDatabaseRefresh={(refreshFn) => {
						serverDatabaseRefreshRef.current = refreshFn;
					}}
					onOpenExamples={() => setShowExamples(true)}
					onOpenServerSettings={() => openSettings("server")}
				/>
			</ResizableExplorer>

			<MainContent
				containerRef={containerRef}
				editorRef={editorRef}
				gridRef={gridRef}
				showExplorer={showExplorer}
				editorHeight={editorHeight}
				isDragging={isDragging}
				initializing={initializing}
				editorTheme={editorTheme}
				editorFontSize={editorFontSize}
				editorFontFamily={editorFontFamily}
				onMouseDown={handleMouseDown}
				onRunQuery={handleRunQuery}
				onSaveFile={handleSaveFile}
				onEditorFocus={handleEditorFocus}
				onEditorBlur={handleEditorBlur}
				onEditorChange={handleEditorChange}
				activeTab={{
					id: activeTab.id,
					useVirtualTable: activeTab.useVirtualTable,
					executedSql: activeTab.executedSql,
					result: activeTab.result,
					estimatedRowCount: activeTab.estimatedRowCount,
					rowCountIsEstimated: activeTab.rowCountIsEstimated,
					loading: activeTab.loading,
					error: activeTab.error,
					abortSignal: activeTab.abortSignal,
				}}
				activeTabId={activeTabId}
				onError={(error) => {
					updateTab(activeTabId, { error, loading: false });
					setIsQueryExecuting(false);
				}}
				onLoadingChange={(loading, tabId) => {
					// Use tabId if provided (ensures correct tab is updated even if user switched tabs)
					const targetTabId = tabId || activeTabId;
					setTabs((prev) => {
						const tab = prev.find((t) => t.id === targetTabId);
						if (!tab || tab.loading === loading) return prev;
						return prev.map((t) =>
							t.id === targetTabId ? { ...t, loading } : t,
						);
					});
					if (!loading) setIsQueryExecuting(false);
				}}
				gridFontSize={gridFontSize}
				gridRowHeight={gridRowHeight}
				pageSize={pageSize}
				cacheThreshold={cacheThreshold}
				onExportStart={handleExportStart}
				onExportProgress={handleExportProgress}
				onExportComplete={handleExportComplete}
				onExportError={handleExportError}
				showToast={showToast}
				onShowHistory={() => {
					setShowExamples(false);
					setShowToastHistory(true);
				}}
				historyCount={toastHistory.length}
				showLongRunningOverlay={showLongRunningOverlay}
				queryElapsedSeconds={queryElapsedSeconds}
				onStopQuery={handleStopQuery}
				isUploadingFiles={isUploadingFiles}
				uploadProgress={uploadProgress}
				isExporting={isExporting}
				exportProgress={exportProgress}
				exportElapsedSeconds={exportElapsedSeconds}
				dataSources={dataSources}
			/>

			<SettingsModalWrapper
				isOpen={showSettings}
				onClose={closeSettings}
				initialTab={settingsInitialTab}
				fontSize={editorFontSize}
				fontFamily={editorFontFamily}
				gridFontSize={gridFontSize}
				gridRowHeight={gridRowHeight}
				pageSize={pageSize}
				cacheThreshold={cacheThreshold}
				explorerSortOrder={explorerSortOrder}
				saveStrategy={saveStrategy}
				onFontSizeChange={setEditorFontSize}
				onFontFamilyChange={setEditorFontFamily}
				onGridFontSizeChange={setGridFontSize}
				onGridRowHeightChange={setGridRowHeight}
				onPageSizeChange={setPageSize}
				onCacheThresholdChange={setCacheThreshold}
				onExplorerSortOrderChange={setExplorerSortOrder}
				onSaveStrategyChange={(strategy) => {
					setSaveStrategy(strategy);
					localStorage.setItem("data-ide-save-strategy", strategy);
					showToast(
						`Save strategy: ${strategy === "auto" ? "Auto-save (3s delay)" : strategy === "manual" ? "Manual (Cmd+S only)" : "Prompt on first edit"}`,
						"success",
						3000,
					);
				}}
				showToast={showToast}
				onConnectionChange={() => handleConnectorChange(activeConnector)}
				onClearBigQueryCache={() => bigQueryCacheClearRef.current?.()}
				onReloadBigQueryData={async () => bigQueryDataLoadRef.current?.()}
			/>

		{/* BigQuery Cost Warning Dialog */}
		{costWarning && (
			<CostWarningDialog
				isOpen={costWarning !== null}
				estimatedCost={costWarning?.cost ?? 0}
				estimatedBytes={costWarning?.bytes ?? 0}
				cachingPossible={costWarning?.cachingPossible ?? false}
				onConfirm={handleCostWarningConfirm}
				onCancel={handleCostWarningCancel}
			/>
		)}

			{/* All Dialogs and Panels */}
			<DialogsContainer
				showWelcome={showWelcomeModal}
				isWelcomeLoading={isWelcomeLoading}
				onWelcomeGetStarted={handleWelcomeGetStarted}
				onWelcomeSkip={handleWelcomeSkip}
				showToastHistory={showToastHistory}
				toastHistory={toastHistory}
				onCloseToastHistory={() => setShowToastHistory(false)}
				onClearHistory={clearHistory}
				showExamples={showExamples}
				onCloseExamples={() => setShowExamples(false)}
				onInsertQuery={handleInsertQuery}
				unsavedChangesDialog={unsavedChangesDialog}
				onConfirmCloseTab={handleConfirmCloseTab}
				onCancelCloseTab={handleCancelCloseTab}
				fileConflict={fileConflict}
				onConflictOverwrite={handleConflictOverwrite}
				onConflictReload={handleConflictReload}
				onConflictSaveAs={handleConflictSaveAs}
				onCancelConflict={() => setFileConflict(null)}
			/>
		</div>
	);
}

export default function App() {
	// Check for special routes
	const pathname = window.location.pathname;

	if (pathname === "/oauth-callback") {
		return <OAuthCallback />;
	}

	if (pathname === "/screenshots") {
		return <ScreenshotsPage />;
	}

	if (pathname === "/examples") {
		return <ExamplesPage />;
	}

	return (
		<ErrorBoundary>
			<ToastProvider>
				<SettingsProvider>
					<TabProvider>
						<QueryProvider>
							<AppContent />
						</QueryProvider>
					</TabProvider>
				</SettingsProvider>
			</ToastProvider>
		</ErrorBoundary>
	);
}
