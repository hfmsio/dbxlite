/**
 * BigQuery Explorer - Component for browsing BigQuery catalogs
 */

import type {
	CatalogInfo,
	QueryCostEstimate,
	SchemaInfo,
	TableMetadata,
} from "@ide/connectors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { queryService } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("BigQueryExplorer");

interface BigQueryExplorerProps {
	onInsertQuery: (sql: string) => void;
	onSelectTable?: (table: TableMetadata) => void;
}

interface TreeNode {
	id: string;
	name: string;
	type: "connection" | "project" | "dataset" | "table";
	data?: CatalogInfo | SchemaInfo | TableMetadata | ConnectionInfo;
	children?: TreeNode[];
	isExpanded?: boolean;
	isLoading?: boolean;
}

interface ConnectionInfo {
	id: string;
	name: string;
	email?: string;
	projectId?: string;
}

function BigQueryExplorer({
	onInsertQuery,
	onSelectTable,
}: BigQueryExplorerProps) {
	const [connections, setConnections] = useState<ConnectionInfo[]>([]);
	const [expandedConnections, setExpandedConnections] = useState<Set<string>>(
		new Set(),
	);
	const [projects, setProjects] = useState<Map<string, CatalogInfo[]>>(
		new Map(),
	);
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(
		new Set(),
	);
	const [datasets, setDatasets] = useState<Map<string, SchemaInfo[]>>(
		new Map(),
	);
	const [tables, setTables] = useState<Map<string, TableMetadata[]>>(new Map());
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [selectedItem, setSelectedItem] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		item: TreeNode;
	} | null>(null);
	const [costEstimate, setCostEstimate] = useState<QueryCostEstimate | null>(
		null,
	);
	const [isEstimating, setIsEstimating] = useState(false);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	const loadConnections = useCallback(async () => {
		try {
			setLoadingItems(new Set(["root"]));
			// For now, we have a single connection (the current authenticated user)
			// In the future, this could load from CredentialStore.listKeys() for multiple connections
			const connection: ConnectionInfo = {
				id: "bigquery-default",
				name: "BigQuery Connection",
				email: undefined, // Could be populated from token info
			};
			setConnections([connection]);
			// Auto-expand the single connection
			setExpandedConnections(new Set(["bigquery-default"]));
			// Load projects for this connection
			await loadProjects("bigquery-default");
		} catch (error) {
			logger.error("Failed to load connections:", error);
		} finally {
			setLoadingItems(new Set());
		}
	}, []);

	// Load connections on mount
	useEffect(() => {
		loadConnections();
	}, [loadConnections]);

	// Handle clicks outside context menu
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				contextMenuRef.current &&
				!contextMenuRef.current.contains(event.target as Node)
			) {
				setContextMenu(null);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const refreshAll = async () => {
		try {
			setLoadingItems(new Set(["root"]));
			// Clear all cached data
			setProjects(new Map());
			setDatasets(new Map());
			setTables(new Map());
			// Reload connections and projects
			await loadConnections();
		} catch (error) {
			logger.error("Failed to refresh:", error);
		} finally {
			setLoadingItems(new Set());
		}
	};

	const loadProjects = async (connectionId: string) => {
		try {
			setLoadingItems(
				(prev) => new Set([...prev, `connection:${connectionId}`]),
			);
			const projectList = await queryService.getBigQueryProjects();
			setProjects((prev) => new Map(prev).set(connectionId, projectList));
		} catch (error) {
			logger.error("Failed to load projects:", error);
		} finally {
			setLoadingItems((prev) => {
				const next = new Set(prev);
				next.delete(`connection:${connectionId}`);
				return next;
			});
		}
	};

	const loadDatasets = async (projectId: string) => {
		const itemId = `project:${projectId}`;
		try {
			setLoadingItems((prev) => new Set([...prev, itemId]));
			const datasetList = await queryService.getBigQueryDatasets(projectId);
			setDatasets((prev) => new Map(prev).set(projectId, datasetList));
		} catch (error) {
			logger.error(`Failed to load datasets for ${projectId}:`, error);
		} finally {
			setLoadingItems((prev) => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		}
	};

	const loadTables = async (projectId: string, datasetId: string) => {
		const itemId = `dataset:${projectId}.${datasetId}`;
		try {
			setLoadingItems((prev) => new Set([...prev, itemId]));
			const tableList = await queryService.getBigQueryTables(
				projectId,
				datasetId,
			);
			setTables((prev) =>
				new Map(prev).set(`${projectId}.${datasetId}`, tableList),
			);
		} catch (error) {
			logger.error(
				`Failed to load tables for ${projectId}.${datasetId}:`,
				error,
			);
		} finally {
			setLoadingItems((prev) => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		}
	};

	const toggleConnection = async (connectionId: string) => {
		const isExpanded = expandedConnections.has(connectionId);
		if (isExpanded) {
			setExpandedConnections((prev) => {
				const next = new Set(prev);
				next.delete(connectionId);
				return next;
			});
		} else {
			setExpandedConnections((prev) => new Set([...prev, connectionId]));
			// Load projects if not already loaded
			if (!projects.has(connectionId)) {
				await loadProjects(connectionId);
			}
		}
	};

	const toggleProject = async (connectionId: string, projectId: string) => {
		const projectKey = `${connectionId}:${projectId}`;
		const isExpanded = expandedProjects.has(projectKey);
		if (isExpanded) {
			setExpandedProjects((prev) => {
				const next = new Set(prev);
				next.delete(projectKey);
				return next;
			});
		} else {
			setExpandedProjects((prev) => new Set([...prev, projectKey]));
			// Load datasets if not already loaded
			if (!datasets.has(projectId)) {
				await loadDatasets(projectId);
			}
		}
	};

	const toggleDataset = async (projectId: string, datasetId: string) => {
		const key = `${projectId}.${datasetId}`;
		const isExpanded = expandedDatasets.has(key);
		if (isExpanded) {
			setExpandedDatasets((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		} else {
			setExpandedDatasets((prev) => new Set([...prev, key]));
			// Load tables if not already loaded
			if (!tables.has(key)) {
				await loadTables(projectId, datasetId);
			}
		}
	};

	const handleContextMenu = (e: React.MouseEvent, item: TreeNode) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			item,
		});
	};

	const generateSelectQuery = (
		projectId: string,
		datasetId: string,
		tableId: string,
	) => {
		// Use backticks for BigQuery identifier escaping (handles hyphens in project IDs)
		return `SELECT *\nFROM \`${projectId}.${datasetId}.${tableId}\`\nLIMIT 100;`;
	};

	const generateCountQuery = (
		projectId: string,
		datasetId: string,
		tableId: string,
	) => {
		// Use backticks for BigQuery identifier escaping (handles hyphens in project IDs)
		return `SELECT COUNT(*) as total_count\nFROM \`${projectId}.${datasetId}.${tableId}\`;`;
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setContextMenu(null);
	};

	const handleTablePreview = async (table: TableMetadata) => {
		if (table.catalog && table.schema) {
			const query = generateSelectQuery(table.catalog, table.schema, table.id);
			onInsertQuery(query);
		}
		setContextMenu(null);
	};

	const handleEstimateCost = async (table: TableMetadata) => {
		if (table.catalog && table.schema) {
			setIsEstimating(true);
			try {
				const query = generateSelectQuery(
					table.catalog,
					table.schema,
					table.id,
				);
				const estimate = await queryService.estimateBigQueryCost(
					query,
					table.catalog,
				);
				setCostEstimate(estimate);
			} catch (error) {
				logger.error("Failed to estimate cost:", error);
			} finally {
				setIsEstimating(false);
			}
		}
		setContextMenu(null);
	};

	const formatBytes = (bytes: number): string => {
		const units = ["B", "KB", "MB", "GB", "TB"];
		let size = bytes;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		return `${size.toFixed(2)} ${units[unitIndex]}`;
	};

	const formatCost = (cost: number): string => {
		if (cost < 0.01) return "< $0.01";
		return `$${cost.toFixed(2)}`;
	};

	const renderTable = (
		table: TableMetadata,
		projectId: string,
		datasetId: string,
	) => {
		const tableKey = `table:${projectId}.${datasetId}.${table.id}`;
		const isSelected = selectedItem === tableKey;
		const isLoading = loadingItems.has(tableKey);

		return (
			<div
				key={table.id}
				className={`tree-item tree-table ${isSelected ? "selected" : ""}`}
				onClick={() => {
					setSelectedItem(tableKey);
					onSelectTable?.(table);
				}}
				onContextMenu={(e) =>
					handleContextMenu(e, {
						id: tableKey,
						name: table.name,
						type: "table",
						data: table,
					})
				}
			>
				<span className="tree-indent" style={{ width: "48px" }} />
				<span className="tree-icon">📊</span>
				<span className="tree-label">{table.name}</span>
				{isLoading && <span className="tree-loading">⏳</span>}
				{table.rowCount !== undefined && (
					<span className="tree-meta">
						{table.rowCount.toLocaleString()} rows
					</span>
				)}
				{table.sizeBytes !== undefined && (
					<span className="tree-meta">{formatBytes(table.sizeBytes)}</span>
				)}
			</div>
		);
	};

	const renderDataset = (dataset: SchemaInfo, projectId: string) => {
		const datasetKey = `${projectId}.${dataset.id}`;
		const isExpanded = expandedDatasets.has(datasetKey);
		const isLoading = loadingItems.has(`dataset:${datasetKey}`);
		const datasetTables = tables.get(datasetKey) || [];

		return (
			<div key={dataset.id} className="tree-node">
				<div
					className="tree-item tree-dataset"
					onClick={() => toggleDataset(projectId, dataset.id)}
					onContextMenu={(e) =>
						handleContextMenu(e, {
							id: `dataset:${datasetKey}`,
							name: dataset.name,
							type: "dataset",
							data: dataset,
						})
					}
				>
					<span className="tree-indent" style={{ width: "24px" }} />
					<span className="tree-toggle">{isExpanded ? "▼" : "▶"}</span>
					<span className="tree-icon">📁</span>
					<span className="tree-label">{dataset.name}</span>
					{isLoading && <span className="tree-loading">⏳</span>}
					{dataset.location && (
						<span className="tree-meta">{dataset.location}</span>
					)}
				</div>
				{isExpanded && (
					<div className="tree-children">
						{datasetTables.length === 0 && !isLoading && (
							<div className="tree-item tree-empty">
								<span className="tree-indent" style={{ width: "48px" }} />
								<span className="tree-label empty">No tables</span>
							</div>
						)}
						{datasetTables.map((table) =>
							renderTable(table, projectId, dataset.id),
						)}
					</div>
				)}
			</div>
		);
	};

	const renderProject = (project: CatalogInfo, connectionId: string) => {
		const projectKey = `${connectionId}:${project.id}`;
		const isExpanded = expandedProjects.has(projectKey);
		const isLoading = loadingItems.has(`project:${project.id}`);
		const projectDatasets = datasets.get(project.id) || [];

		return (
			<div key={project.id} className="tree-node">
				<div
					className="tree-item tree-project"
					onClick={() => toggleProject(connectionId, project.id)}
					onContextMenu={(e) =>
						handleContextMenu(e, {
							id: `project:${project.id}`,
							name: project.name,
							type: "project",
							data: project,
						})
					}
				>
					<span className="tree-indent" style={{ width: "24px" }} />
					<span className="tree-toggle">{isExpanded ? "▼" : "▶"}</span>
					<span className="tree-icon">🏗️</span>
					<span className="tree-label">{project.name}</span>
					{isLoading && <span className="tree-loading">⏳</span>}
					{project.id !== project.name && (
						<span className="tree-meta">({project.id})</span>
					)}
				</div>
				{isExpanded && (
					<div className="tree-children">
						{projectDatasets.length === 0 && !isLoading && (
							<div className="tree-item tree-empty">
								<span className="tree-indent" style={{ width: "48px" }} />
								<span className="tree-label empty">No datasets</span>
							</div>
						)}
						{projectDatasets.map((dataset) =>
							renderDataset(dataset, project.id),
						)}
					</div>
				)}
			</div>
		);
	};

	const renderConnection = (connection: ConnectionInfo) => {
		const isExpanded = expandedConnections.has(connection.id);
		const isLoading = loadingItems.has(`connection:${connection.id}`);
		const connectionProjects = projects.get(connection.id) || [];

		return (
			<div key={connection.id} className="tree-node">
				<div
					className="tree-item tree-connection"
					onClick={() => toggleConnection(connection.id)}
					onContextMenu={(e) =>
						handleContextMenu(e, {
							id: `connection:${connection.id}`,
							name: connection.name,
							type: "connection",
							data: connection,
						})
					}
				>
					<span className="tree-toggle">{isExpanded ? "▼" : "▶"}</span>
					<span className="tree-icon">🔗</span>
					<span className="tree-label">{connection.name}</span>
					{isLoading && <span className="tree-loading">⏳</span>}
					{connection.email && (
						<span className="tree-meta">{connection.email}</span>
					)}
				</div>
				{isExpanded && (
					<div className="tree-children">
						{connectionProjects.length === 0 && !isLoading && (
							<div className="tree-item tree-empty">
								<span className="tree-indent" style={{ width: "24px" }} />
								<span className="tree-label empty">No projects</span>
							</div>
						)}
						{connectionProjects.map((project) =>
							renderProject(project, connection.id),
						)}
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="bigquery-explorer">
			<div className="explorer-header">
				<h3 className="explorer-subtitle">BigQuery Catalog</h3>
				<button
					className="explorer-refresh-btn"
					onClick={refreshAll}
					title="Refresh all BigQuery data"
				>
					🔄
				</button>
			</div>

			<div className="explorer-tree">
				{loadingItems.has("root") && (
					<div className="loading-message">Loading connections...</div>
				)}

				{connections.length === 0 && !loadingItems.has("root") && (
					<div className="empty-state">
						<div className="empty-state-text">No BigQuery connections</div>
						<div className="empty-state-hint">
							Connect to BigQuery in Settings
						</div>
					</div>
				)}

				{connections.map((connection) => renderConnection(connection))}
			</div>

			{/* Context Menu */}
			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="context-menu"
					style={{
						position: "fixed",
						left: contextMenu.x,
						top: contextMenu.y,
						zIndex: 1000,
					}}
				>
					{contextMenu.item.type === "table" && (
						<>
							<div
								className="context-menu-item"
								onClick={() => {
									const table = contextMenu.item.data as TableMetadata;
									handleTablePreview(table);
								}}
							>
								Preview Table
							</div>
							<div
								className="context-menu-item"
								onClick={() => {
									const table = contextMenu.item.data as TableMetadata;
									if (table.catalog && table.schema) {
										const query = generateSelectQuery(
											table.catalog,
											table.schema,
											table.id,
										);
										onInsertQuery(query);
										setContextMenu(null);
									}
								}}
							>
								Generate SELECT Query
							</div>
							<div
								className="context-menu-item"
								onClick={() => {
									const table = contextMenu.item.data as TableMetadata;
									if (table.catalog && table.schema) {
										const query = generateCountQuery(
											table.catalog,
											table.schema,
											table.id,
										);
										onInsertQuery(query);
										setContextMenu(null);
									}
								}}
							>
								Generate COUNT Query
							</div>
							<div
								className="context-menu-item"
								onClick={() => {
									const table = contextMenu.item.data as TableMetadata;
									handleEstimateCost(table);
								}}
							>
								Estimate Query Cost
							</div>
							<div className="context-menu-separator" />
							<div
								className="context-menu-item"
								onClick={() => {
									const table = contextMenu.item.data as TableMetadata;
									if (table.catalog && table.schema) {
										const fullName = `\`${table.catalog}.${table.schema}.${table.id}\``;
										copyToClipboard(fullName);
									}
								}}
							>
								Copy Full Name
							</div>
						</>
					)}

					{contextMenu.item.type === "dataset" && (
						<div
							className="context-menu-item"
							onClick={() => {
								const dataset = contextMenu.item.data as SchemaInfo;
								if (dataset.catalog) {
									const fullName = `${dataset.catalog}.${dataset.id}`;
									copyToClipboard(fullName);
								}
							}}
						>
							Copy Dataset Name
						</div>
					)}

					{contextMenu.item.type === "project" && (
						<div
							className="context-menu-item"
							onClick={() => {
								const project = contextMenu.item.data as CatalogInfo;
								copyToClipboard(project.id);
							}}
						>
							Copy Project ID
						</div>
					)}
				</div>
			)}

			{/* Cost Estimate Modal */}
			{costEstimate && (
				<div className="modal-overlay" onClick={() => setCostEstimate(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Query Cost Estimate</h3>
							<button
								className="modal-close"
								onClick={() => setCostEstimate(null)}
							>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="estimate-row">
								<span className="estimate-label">Bytes to Process:</span>
								<span className="estimate-value">
									{formatBytes(costEstimate.estimatedBytes)}
								</span>
							</div>
							<div className="estimate-row">
								<span className="estimate-label">Estimated Cost:</span>
								<span className="estimate-value">
									{formatCost(costEstimate.estimatedCostUSD || 0)}
								</span>
							</div>
							{costEstimate.cachingPossible && (
								<div className="estimate-note">
									ℹ️ This query may use cached results
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Loading overlay for cost estimation */}
			{isEstimating && (
				<div className="modal-overlay">
					<div className="loading-spinner">Estimating query cost...</div>
				</div>
			)}

			<style>{`
        .bigquery-explorer {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .explorer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
        }

        .explorer-subtitle {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .explorer-refresh-btn {
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          padding: 6px 10px;
          font-size: 13px;
          color: var(--text-secondary);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .explorer-refresh-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--accent);
        }

        .explorer-tree {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
        }

        .tree-node {
          user-select: none;
        }

        .tree-item {
          display: flex;
          align-items: center;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.15s;
          border-left: 3px solid transparent;
        }

        .tree-item:hover {
          background-color: var(--bg-hover);
          border-left-color: var(--accent);
        }

        .tree-item.selected {
          background-color: var(--bg-selected);
          border-left-color: var(--accent);
          font-weight: 500;
        }

        .tree-indent {
          display: inline-block;
        }

        .tree-toggle {
          width: 16px;
          margin-right: 6px;
          font-size: 10px;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .tree-icon {
          margin-right: 8px;
          font-size: 16px;
          display: inline-flex;
          align-items: center;
        }

        .tree-label {
          flex: 1;
          font-size: 13px;
          color: var(--text-primary);
        }

        .tree-label.empty {
          color: var(--text-muted);
          font-style: italic;
          font-size: 12px;
        }

        .tree-meta {
          margin-left: 8px;
          font-size: 11px;
          color: var(--text-muted);
          background: var(--bg-tertiary);
          padding: 2px 6px;
          border-radius: 3px;
        }

        .tree-loading {
          margin-left: 8px;
          animation: spin 1s linear infinite;
          color: var(--accent);
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .tree-children {
          margin-left: 0;
        }

        .loading-message {
          padding: 24px 16px;
          text-align: center;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .empty-state {
          padding: 48px 24px;
          text-align: center;
        }

        .empty-state-text {
          color: var(--text-secondary);
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .empty-state-hint {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .context-menu {
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          overflow: hidden;
        }

        .context-menu-item {
          padding: 10px 14px;
          font-size: 13px;
          cursor: pointer;
          transition: background-color 0.15s;
          color: var(--text-primary);
        }

        .context-menu-item:hover {
          background-color: var(--bg-hover);
        }

        .context-menu-separator {
          height: 1px;
          background-color: var(--border);
          margin: 4px 0;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(2px);
        }

        .modal-content {
          background: var(--bg-primary);
          border: 2px solid var(--border);
          border-radius: 8px;
          width: 420px;
          max-width: 90vw;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
        }

        .modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .modal-close {
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 18px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .modal-body {
          padding: 20px;
        }

        .estimate-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 14px;
          padding: 8px 0;
        }

        .estimate-label {
          font-weight: 500;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .estimate-value {
          font-family: monospace;
          color: var(--text-primary);
          font-weight: 600;
          font-size: 14px;
        }

        .estimate-note {
          margin-top: 16px;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border-left: 3px solid var(--accent);
          border-radius: 4px;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .loading-spinner {
          background: var(--bg-primary);
          padding: 24px 32px;
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-primary);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
      `}</style>
		</div>
	);
}

export default React.memo(BigQueryExplorer);
