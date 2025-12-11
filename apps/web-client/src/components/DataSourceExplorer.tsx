/**
 * Data Source Explorer - Sidebar component for browsing databases, files, and connections
 */

import React, { useCallback, useRef, useState } from "react";
import {
	useDataSources,
	useRemoveDataSource,
	useIntrospectSheetColumns,
} from "../stores/dataSourceStore";
import type { ConnectorType, DataSource } from "../types/data-source";
import type { UnifiedTreeNode } from "../types/tree";
import { useDataSourceActions } from "../hooks/useDataSourceActions";
import { useDataSourceState } from "../hooks/useDataSourceState";
import { ConfirmDialog } from "./ConfirmDialog";
import { TrashIcon, UploadIcon, ChevronsDownIcon, ChevronsUpIcon } from "./Icons";
import { DataSourceTree } from "./DataSourceTree";
import { TableInfoModal } from "./TableInfoModal";
import { useToast } from "./Toast";

interface DataSourceExplorerProps {
	isVisible: boolean;
	onToggle: () => void;
	onInsertQuery: (sql: string, connectorType?: ConnectorType) => void;
	onUploadFile: () => Promise<void>;
	onDragDropUpload: (files: FileList) => Promise<void>;
	onReloadFile?: (file: DataSource) => Promise<void>;
	onRefreshMetadata?: (file: DataSource) => Promise<void>;
	onRestoreAccess?: (file: DataSource) => Promise<void>;
	onReattachDatabase?: (database: DataSource) => Promise<void>;
	onToggleWriteMode?: (database: DataSource) => Promise<void>;
	onClearFileHandles?: () => Promise<void>;
	isClearingDataSources?: boolean;
	lastUploadedType?: "file" | "database" | null;
	explorerSortOrder?: "none" | "name" | "type" | "size";
	onBigQueryCacheClear?: (clearFn: () => void) => void;
	onBigQueryDataLoad?: (loadFn: () => Promise<void>) => void;
	onLocalDatabaseRefresh?: (refreshFn: () => Promise<void>) => void;
	onOpenExamples?: () => void;
}

function DataSourceExplorer({
	isVisible,
	onToggle,
	onInsertQuery,
	onUploadFile,
	onDragDropUpload,
	onReloadFile,
	onRefreshMetadata,
	onRestoreAccess,
	onReattachDatabase,
	onToggleWriteMode,
	onClearFileHandles,
	isClearingDataSources = false,
	lastUploadedType,
	explorerSortOrder = "none",
	onBigQueryCacheClear,
	onBigQueryDataLoad,
	onLocalDatabaseRefresh,
	onOpenExamples,
}: DataSourceExplorerProps) {
	const dataSources = useDataSources();
	const removeDataSource = useRemoveDataSource();
	const introspectSheetColumns = useIntrospectSheetColumns();
	const { showToast } = useToast();
	const [isDragging, setIsDragging] = useState(false);
	const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);

	// Use custom hooks for state and actions
	const actions = useDataSourceActions({
		files: dataSources.filter((ds) =>
			["parquet", "csv", "tsv", "json", "jsonl", "xlsx", "arrow"].includes(
				ds.type,
			),
		),
		databases: dataSources.filter((ds) => ds.type === "duckdb"),
		removeDataSource,
		introspectSheetColumns,
	});

	const state = useDataSourceState({
		dataSources,
		lastUploadedType,
		explorerSortOrder,
		onInsertQuery,
		onReloadFile,
		onRefreshMetadata,
		onRestoreAccess,
		onReattachDatabase,
		onToggleWriteMode,
		onBigQueryCacheClear,
		onBigQueryDataLoad,
		onLocalDatabaseRefresh,
		onFileDelete: actions.handleFileDelete,
		onDatabaseDelete: actions.handleDatabaseDelete,
		onDeleteFolder: actions.handleDeleteFolder,
		onDeleteDomain: actions.handleDeleteDomain,
		showToast,
	});

	// Handle node click
	const handleNodeClick = useCallback((node: UnifiedTreeNode) => {
		state.setSelectedNodeId(node.id);
	}, [state]);

	// Handle node expand
	const handleNodeExpand = useCallback(
		async (node: UnifiedTreeNode) => {
			const newExpanded = new Set(state.expandedNodes);
			const isExpanding = !newExpanded.has(node.id);

			if (newExpanded.has(node.id)) {
				newExpanded.delete(node.id);
			} else {
				newExpanded.add(node.id);
			}
			state.setExpandedNodes(newExpanded);

			// Handle XLSX sheet column introspection
			await actions.handleNodeExpand(node, isExpanding);
		},
		[state, actions],
	);

	// Handle node double-click - insert SELECT query with LIMIT
	const handleNodeDoubleClick = useCallback(
		(node: UnifiedTreeNode) => {
			// Handle BigQuery load trigger
			if (node.id === "bigquery-load-trigger") {
				state.loadBigQueryData();
				return;
			}

			// Generate and insert SQL query for tables and files
			if (node.type === "table" && node.sourceData) {
				const nodeSourceData =
					node.sourceData as Record<string, unknown> | undefined;
				const tableName =
					typeof nodeSourceData?.fullName === "string"
						? nodeSourceData.fullName
						: node.name;
				const sql = `SELECT * FROM ${tableName} LIMIT 1000;`;
				const connectorType =
					node.source === "bigquery" ? "bigquery" : "duckdb";
				onInsertQuery(sql, connectorType);
			} else if (node.type === "file") {
				// Only insert query for data files (not attached database files)
				const fileData = node.sourceData as DataSource;
				if (fileData?.isAttached) {
					// Attached database files are containers, don't generate queries
					return;
				}
				const sql = `SELECT * FROM '${node.name}' LIMIT 1000;`;
				onInsertQuery(sql, "duckdb");
			}
		},
		[onInsertQuery, state],
	);

	// Handle drag and drop (only for external file uploads)
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		// Only handle external file drags, not internal tree node drags
		if (e.dataTransfer.types.includes("Files")) {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		if (e.dataTransfer.types.includes("Files")) {
			e.preventDefault();
			e.stopPropagation();
			// Only clear drag state if we're leaving the explorer entirely
			// Check if relatedTarget (where mouse is going) is outside the explorer
			const relatedTarget = e.relatedTarget as Node | null;
			if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
				setIsDragging(false);
			}
		}
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		// Only handle external file drags
		if (e.dataTransfer.types.includes("Files")) {
			e.preventDefault();
			e.stopPropagation();
		}
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			// Only handle external file drags
			if (e.dataTransfer.types.includes("Files")) {
				e.preventDefault();
				e.stopPropagation();
				setIsDragging(false);

				const files = e.dataTransfer.files;
				if (files && files.length > 0) {
					onDragDropUpload(files);
				}
			}
		},
		[onDragDropUpload],
	);

	// Handle trash drop
	const handleTrashDrop = useCallback(
		(e: React.DragEvent) => {
			setIsDraggingOverTrash(false);
			actions.handleTrashDrop(e);
		},
		[actions],
	);

	if (!isVisible) return null;

	return (
		<div
			className={`data-source-explorer ${isDragging ? "drag-over" : ""}`}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{isDragging && (
				<div className="drag-drop-overlay">
					<div className="drag-drop-message">
						<div className="drag-drop-icon">
							<UploadIcon size={48} />
						</div>
						<div>Drop files here to upload</div>
						<div className="drag-drop-hint">
							Files will be stored in memory only (lost on refresh)
						</div>
						<div
							className="drag-drop-hint"
							style={{ marginTop: 4, fontSize: 12 }}
						>
							Supported: CSV, Parquet, JSON, DuckDB
						</div>
					</div>
				</div>
			)}

			<div className="explorer-header">
				<h2 className="explorer-title">Data Sources</h2>
				<div className="explorer-header-actions">
					<button
						className="explorer-action-btn"
						onClick={onUploadFile}
						title="Upload File (supports zero-copy for large files)"
					>
						<UploadIcon size={16} />
					</button>
					{onClearFileHandles && (
						<button
							className="explorer-action-btn"
							onClick={() => {
								if (!isClearingDataSources) {
									actions.setConfirmDialog({
										isOpen: true,
										title: "Clear File Handles",
										message:
											"Are you sure you want to clear all stored file handles? This will free memory but you'll need to re-upload files.",
										variant: "warning",
										onConfirm: () => {
											onClearFileHandles();
										},
									});
								}
							}}
							disabled={isClearingDataSources}
							title={
								isDraggingOverTrash
									? "Drop to remove from workspace"
									: isClearingDataSources
										? "Clearing..."
										: "Clear all stored file handles (frees memory) or drag files here to remove"
							}
							style={{
								color: isClearingDataSources ? "#9ca3af" : "#ef4444",
								borderColor: isClearingDataSources ? "#9ca3af" : "#ef4444",
								opacity: isClearingDataSources ? 0.5 : 1,
								cursor: isClearingDataSources ? "not-allowed" : "pointer",
								background: isDraggingOverTrash
									? "rgba(239, 68, 68, 0.3)"
									: "transparent",
								transform: isDraggingOverTrash ? "scale(1.3)" : "scale(1)",
								transition: "all 0.2s ease-in-out",
								position: "relative",
								zIndex: isDraggingOverTrash ? 100 : 1,
							}}
							onMouseEnter={(e) => {
								if (!isClearingDataSources && !isDraggingOverTrash) {
									e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
								}
							}}
							onMouseLeave={(e) => {
								if (!isDraggingOverTrash) {
									e.currentTarget.style.background = "transparent";
								}
							}}
							onDragOver={(e) => {
								// Only allow dropping tree nodes
								if (e.dataTransfer.types.includes("application/tree-node")) {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move"; // Show move cursor instead of copy (+)
									setIsDraggingOverTrash(true);
								}
							}}
							onDragLeave={(_e) => {
								setIsDraggingOverTrash(false);
							}}
							onDrop={handleTrashDrop}
						>
							<TrashIcon size={isDraggingOverTrash ? 20 : 16} />
							{isDraggingOverTrash && (
								<span
									style={{
										position: "absolute",
										top: "-2px",
										right: "-2px",
										fontSize: "14px",
										animation: "pulse 0.5s infinite",
									}}
								>
									❌
								</span>
							)}
						</button>
					)}
					<button
						className="explorer-close-btn"
						onClick={onToggle}
						title="Close explorer"
					>
						×
					</button>
				</div>
			</div>

			{/* Search Bar */}
			<div className="explorer-search">
				<input
					type="text"
					className="search-input"
					placeholder="Search tables, columns..."
					value={state.searchQuery}
					onChange={(e) => state.setSearchQuery(e.target.value)}
				/>
				<div className="search-actions">
					<button
						className="search-action-btn"
						onClick={state.expandAll}
						title="Expand all"
					>
						<ChevronsDownIcon size={14} />
					</button>
					<button
						className="search-action-btn"
						onClick={state.collapseAll}
						title="Collapse all"
					>
						<ChevronsUpIcon size={14} />
					</button>
					{state.searchQuery && (
						<button
							className="search-clear-btn"
							onClick={() => state.setSearchQuery("")}
							title="Clear search"
						>
							×
						</button>
					)}
				</div>
			</div>

			<div className="explorer-content unified" ref={contentRef}>
				<DataSourceTree
					sections={state.treeSections}
					selectedNodeId={state.selectedNodeId}
					isBigQueryConnected={state.isBigQueryConnected}
					hasDataSources={dataSources.length > 0}
					onSectionToggle={state.handleSectionToggle}
					onNodeClick={handleNodeClick}
					onNodeExpand={handleNodeExpand}
					onNodeDoubleClick={handleNodeDoubleClick}
					onInsertQuery={onInsertQuery}
					onOpenExamples={onOpenExamples}
				/>
			</div>

			{/* Table Info Modal */}
			{state.tableInfoModal && (
				<TableInfoModal
					table={state.tableInfoModal.table}
					fullName={state.tableInfoModal.fullName}
					onClose={() => state.setTableInfoModal(null)}
				/>
			)}

			{/* Confirmation Dialog */}
			<ConfirmDialog
				isOpen={actions.confirmDialog.isOpen}
				title={actions.confirmDialog.title}
				message={actions.confirmDialog.message}
				variant={actions.confirmDialog.variant}
				onConfirm={actions.confirmDialog.onConfirm}
				onCancel={() =>
					actions.setConfirmDialog({
						...actions.confirmDialog,
						isOpen: false,
					})
				}
			/>
		</div>
	);
}

export default React.memo(DataSourceExplorer);
