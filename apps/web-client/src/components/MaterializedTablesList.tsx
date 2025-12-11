/**
 * Materialized Tables List Component
 *
 * Displays materialized tables in the data source explorer.
 */

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { materializationManager } from "../services/materialization-manager";
import { persistenceMetadataStore } from "../services/persistence-metadata-store";
import type { MaterializedTable } from "../types/materialization";
import { createLogger } from "../utils/logger";

const logger = createLogger("MaterializedTables");

export interface MaterializedTablesListProps {
	onInsertQuery?: (query: string) => void;
}

export const MaterializedTablesList: React.FC<MaterializedTablesListProps> = ({
	onInsertQuery,
}) => {
	const [tables, setTables] = useState<MaterializedTable[]>([]);
	const [expandedConnection, setExpandedConnection] = useState<string | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(true);

	const loadTables = useCallback(async () => {
		setIsLoading(true);
		try {
			const allTables = await persistenceMetadataStore.getAllTables();
			setTables(allTables.filter((t) => t.status === "available"));
		} catch (error) {
			logger.error("Failed to load tables", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadTables();
	}, [loadTables]);

	const handleTableClick = (table: MaterializedTable) => {
		if (onInsertQuery) {
			onInsertQuery(`SELECT * FROM ${table.localName} LIMIT 100;`);
		}
	};

	const handleRefresh = async (
		table: MaterializedTable,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		try {
			await materializationManager.refreshTable(table.id);
			await loadTables();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Refresh failed: ${message}`);
		}
	};

	const formatBytes = (bytes: number) => {
		const units = ["B", "KB", "MB", "GB"];
		let i = 0;
		let value = bytes;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(2)} ${units[i]}`;
	};

	const formatRelativeTime = (date: Date) => {
		const now = Date.now();
		const then = new Date(date).getTime();
		const diff = now - then;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return "just now";
	};

	// Group tables by connection
	const tablesByConnection = tables.reduce(
		(acc, table) => {
			if (!acc[table.connectionId]) {
				acc[table.connectionId] = [];
			}
			acc[table.connectionId].push(table);
			return acc;
		},
		{} as Record<string, MaterializedTable[]>,
	);

	if (isLoading) {
		return <div className="loading">Loading materialized tables...</div>;
	}

	if (tables.length === 0) {
		return (
			<div className="empty-state">
				<p>No materialized tables yet.</p>
				<p>Run a BigQuery query and save results to create one.</p>
			</div>
		);
	}

	return (
		<div className="materialized-tables-list">
			{Object.entries(tablesByConnection).map(([connectionId, connTables]) => (
				<div key={connectionId} className="connection-group">
					<div
						className="connection-header"
						onClick={() =>
							setExpandedConnection(
								expandedConnection === connectionId ? null : connectionId,
							)
						}
					>
						<span className="expand-icon">
							{expandedConnection === connectionId ? "▼" : "▶"}
						</span>
						<span className="connection-name">{connectionId}</span>
						<span className="table-count">({connTables.length})</span>
					</div>

					{expandedConnection === connectionId && (
						<div className="tables-list">
							{connTables.map((table) => (
								<div
									key={table.id}
									className="table-item"
									onClick={() => handleTableClick(table)}
									title={`Click to query ${table.localName}`}
								>
									<div className="table-icon">📊</div>
									<div className="table-details">
										<div className="table-name">{table.localName}</div>
										<div className="table-meta">
											<span>{table.rowCount.toLocaleString()} rows</span>
											<span>{formatBytes(table.sizeBytes)}</span>
											{table.lastRefreshedAt && (
												<span>{formatRelativeTime(table.lastRefreshedAt)}</span>
											)}
										</div>
									</div>
									<button
										className="refresh-btn"
										onClick={(e) => handleRefresh(table, e)}
										title="Refresh from source"
									>
										🔄
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			))}

			<style>{`
        .materialized-tables-list {
          padding: 8px;
        }

        .loading,
        .empty-state {
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 13px;
        }

        .empty-state p {
          margin: 4px 0;
        }

        .connection-group {
          margin-bottom: 8px;
        }

        .connection-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px;
          background: #f5f5f5;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        }

        .connection-header:hover {
          background: #eeeeee;
        }

        .expand-icon {
          font-size: 10px;
          color: #666;
        }

        .connection-name {
          flex: 1;
        }

        .table-count {
          color: #666;
          font-size: 12px;
        }

        .tables-list {
          padding-left: 16px;
          margin-top: 4px;
        }

        .table-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .table-item:hover {
          background: #f5f9ff;
        }

        .table-icon {
          font-size: 16px;
        }

        .table-details {
          flex: 1;
          min-width: 0;
        }

        .table-name {
          font-size: 13px;
          font-weight: 500;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .table-meta {
          display: flex;
          gap: 12px;
          font-size: 11px;
          color: #666;
          margin-top: 2px;
        }

        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px 8px;
          opacity: 0.6;
          transition: opacity 0.2s ease;
        }

        .refresh-btn:hover {
          opacity: 1;
        }
      `}</style>
		</div>
	);
};
