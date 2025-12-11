/**
 * DataSourceTree - Pure tree rendering component
 * Displays tree sections with nodes for data sources
 */

import type { ConnectorType } from "../types/data-source";
import type { TreeSection, UnifiedTreeNode } from "../types/tree";
import { ExamplesBanner } from "./ExamplesBanner";
import { FolderIcon } from "./Icons";
import UnifiedTreeView from "./UnifiedTreeView";

export interface DataSourceTreeProps {
	sections: TreeSection[];
	selectedNodeId?: string;
	isBigQueryConnected: boolean;
	hasDataSources: boolean;
	onSectionToggle: (sectionId: string) => void;
	onNodeClick: (node: UnifiedTreeNode) => void;
	onNodeExpand: (node: UnifiedTreeNode) => void;
	onNodeDoubleClick: (node: UnifiedTreeNode) => void;
	onInsertQuery?: (sql: string, connectorType?: ConnectorType) => void;
	onOpenExamples?: () => void;
}

export function DataSourceTree({
	sections,
	selectedNodeId,
	isBigQueryConnected,
	hasDataSources,
	onSectionToggle,
	onNodeClick,
	onNodeExpand,
	onNodeDoubleClick,
	onInsertQuery,
	onOpenExamples,
}: DataSourceTreeProps) {
	// Check if there's any content to show (data sources, BigQuery, or session tables in sections)
	const hasContent = hasDataSources || isBigQueryConnected || sections.length > 0;

	// Empty state
	if (!hasContent) {
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
					✨ No file size limit — uses zero-copy streaming
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
		/>
	);
}
