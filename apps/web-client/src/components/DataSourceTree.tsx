/**
 * DataSourceTree - Pure tree rendering component
 * Displays tree sections with nodes for data sources
 */

import type { ConnectorType } from "../types/data-source";
import type { TreeSection, UnifiedTreeNode } from "../types/tree";
import { ExamplesBanner } from "./ExamplesBanner";
import { DatabaseIcon, FolderIcon } from "./Icons";
import UnifiedTreeView from "./UnifiedTreeView";

export interface DataSourceTreeProps {
	sections: TreeSection[];
	selectedNodeId?: string;
	isBigQueryConnected: boolean;
	hasDataSources: boolean;
	/** Whether running in HTTP/Server mode */
	isHttpMode?: boolean;
	onSectionToggle: (sectionId: string) => void;
	onNodeClick: (node: UnifiedTreeNode) => void;
	onNodeExpand: (node: UnifiedTreeNode) => void;
	onNodeDoubleClick: (node: UnifiedTreeNode) => void;
	onInsertQuery?: (sql: string, connectorType?: ConnectorType) => void;
	onOpenExamples?: () => void;
	onAddProject?: () => void;
	onOpenServerSettings?: () => void;
}

export function DataSourceTree({
	sections,
	selectedNodeId,
	isBigQueryConnected,
	hasDataSources,
	isHttpMode = false,
	onSectionToggle,
	onNodeClick,
	onNodeExpand,
	onNodeDoubleClick,
	onInsertQuery,
	onOpenExamples,
	onAddProject,
	onOpenServerSettings,
}: DataSourceTreeProps) {
	// Check if there's any content to show (data sources, BigQuery, or session tables in sections)
	const hasContent = hasDataSources || isBigQueryConnected || sections.length > 0;

	// Empty state - different content for WASM vs Server mode
	if (!hasContent) {
		if (isHttpMode) {
			// Server mode empty state - spacious layout without examples
			return (
				<div className="empty-state server-mode">
					<div className="empty-state-icon">
						<DatabaseIcon size={48} color="var(--accent-color)" />
					</div>
					<div className="empty-state-text">DuckDB Server</div>
					<div className="empty-state-hint">
						Ready to query local files and databases
					</div>

					<div className="server-tips">
						<div className="server-tip">
							<div className="server-tip-icon">📁</div>
							<div className="server-tip-content">
								<div className="server-tip-title">Query Files Directly</div>
								<code>SELECT * FROM 'data/sales.csv'</code>
							</div>
						</div>

						<div className="server-tip">
							<div className="server-tip-icon">🗄️</div>
							<div className="server-tip-content">
								<div className="server-tip-title">Attach Databases</div>
								<code>ATTACH 'analytics.duckdb' AS analytics</code>
							</div>
						</div>

						<div className="server-tip">
							<div className="server-tip-icon">☁️</div>
							<div className="server-tip-content">
								<div className="server-tip-title">Cloud Extensions</div>
								<code>INSTALL httpfs; LOAD httpfs;</code>
							</div>
						</div>

						<button
							type="button"
							className="server-tip server-tip-clickable"
							onClick={onOpenServerSettings}
						>
							<div className="server-tip-icon">⚙️</div>
							<div className="server-tip-content">
								<div className="server-tip-title">Server Settings</div>
								<span className="server-tip-desc">View extensions, secrets, and configuration</span>
							</div>
						</button>
					</div>

					<div className="server-shortcuts">
						<span className="shortcut"><kbd>⌘</kbd><kbd>↵</kbd> Run</span>
						<span className="shortcut"><kbd>⌘</kbd><kbd>S</kbd> Save</span>
						<span className="shortcut"><kbd>⌘</kbd><kbd>O</kbd> Open</span>
					</div>
				</div>
			);
		}

		// WASM mode empty state (original)
		return (
			<div className="empty-state">
				<div className="empty-state-icon">
					<FolderIcon size={40} color="var(--text-muted)" />
				</div>
				<div className="empty-state-text">No data sources yet</div>
				<div className="empty-state-hint">
					<strong>Drop files here</strong> or click Upload
				</div>
				<div className="empty-state-size-note">
					No file size limit - uses zero-copy streaming
				</div>
				<div className="empty-state-details">
					<div className="empty-state-detail-row">
						<span className="detail-label">📁 Files:</span>
						<span className="detail-value">CSV, Parquet, JSON, Excel, Arrow</span>
					</div>
					<div className="empty-state-detail-row">
						<span className="detail-label">🗄️ Databases:</span>
						<span className="detail-value">DuckDB (.duckdb, .db)</span>
					</div>
					<div className="empty-state-detail-row">
						<span className="detail-label">☁️ Cloud:</span>
						<span className="detail-value">BigQuery via Settings → Connectors</span>
					</div>
				</div>

				{onInsertQuery && onOpenExamples && (
					<div className="empty-state-examples-section">
						<div className="empty-state-examples-header">
							Or explore SQL examples
						</div>
						<ExamplesBanner
							onInsertQuery={onInsertQuery}
							onOpenExamples={onOpenExamples}
						/>
					</div>
				)}
			</div>
		);
	}

	// Render tree
	return (
		<UnifiedTreeView
			sections={sections}
			onSectionToggle={onSectionToggle}
			onNodeClick={onNodeClick}
			onNodeExpand={onNodeExpand}
			onNodeDoubleClick={onNodeDoubleClick}
			selectedNodeId={selectedNodeId}
			onAddProject={onAddProject}
		/>
	);
}
