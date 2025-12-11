/**
 * Storage Manager Component
 *
 * Displays materialized tables, storage usage, and provides management actions.
 * This component is shown in the Settings modal under the "Storage" tab.
 */

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { materializationManager } from "../services/materialization-manager";
import { persistenceMetadataStore } from "../services/persistence-metadata-store";
import type { MaterializedTable, StorageQuota } from "../types/materialization";
import { createLogger } from "../utils/logger";

const logger = createLogger("StorageManager");

export const StorageManager: React.FC = () => {
	const [tables, setTables] = useState<MaterializedTable[]>([]);
	const [quota, setQuota] = useState<StorageQuota | null>(null);
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [refreshingTable, setRefreshingTable] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		setIsLoading(true);
		try {
			const [allTables, storageQuota] = await Promise.all([
				persistenceMetadataStore.getAllTables(),
				materializationManager.getStorageQuota(),
			]);
			setTables(
				allTables.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
			);
			setQuota(storageQuota);
		} catch (error) {
			logger.error("Failed to load storage data", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleRefresh = async (tableId: string) => {
		if (refreshingTable) return; // Prevent multiple simultaneous refreshes

		setRefreshingTable(tableId);
		try {
			await materializationManager.refreshTable(tableId);
			await loadData();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Refresh failed: ${message}`);
		} finally {
			setRefreshingTable(null);
		}
	};

	const handleDelete = async (tableId: string) => {
		const table = tables.find((t) => t.id === tableId);
		if (!table) return;

		if (window.confirm(`Delete materialized table "${table.localName}"?`)) {
			try {
				await materializationManager.deleteTable(tableId);
				await loadData();
				if (selectedTable === tableId) {
					setSelectedTable(null);
				}
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Delete failed: ${message}`);
			}
		}
	};

	const requestPersistence = async () => {
		try {
			const granted = await materializationManager.requestPersistence();
			if (granted) {
				await loadData();
				console.log(
					"Storage is now persistent and will not be cleared by the browser.",
				);
			} else {
				console.warn("Persistent storage request was denied.");
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to request persistence: ${message}`);
		}
	};

	const formatBytes = (bytes: number) => {
		const units = ["B", "KB", "MB", "GB", "TB"];
		let i = 0;
		let value = bytes;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(2)} ${units[i]}`;
	};

	const formatCost = (usd: number) => `$${usd.toFixed(4)}`;

	const formatDate = (date: Date) => {
		return new Date(date).toLocaleString();
	};

	const formatRelativeTime = (date: Date) => {
		const now = Date.now();
		const then = new Date(date).getTime();
		const diff = now - then;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
		return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
	};

	if (isLoading) {
		return <div className="storage-manager">Loading...</div>;
	}

	const availableTables = tables.filter((t) => t.status === "available");
	const unavailableTables = tables.filter((t) => t.status === "unavailable");
	const importingTables = tables.filter((t) => t.status === "importing");

	return (
		<div className="storage-manager">
			{/* Storage Quota Section */}
			<div className="quota-section">
				<h3>Storage Usage</h3>
				{quota && (
					<>
						<div className="quota-bar">
							<div
								className="quota-used"
								style={{
									width: `${Math.min(quota.percentUsed, 100)}%`,
									backgroundColor:
										quota.percentUsed > 90
											? "#f44336"
											: quota.percentUsed > 70
												? "#ff9800"
												: "#4caf50",
								}}
							/>
						</div>
						<div className="quota-text">
							{formatBytes(quota.usedBytes)} / {formatBytes(quota.totalBytes)} (
							{quota.percentUsed.toFixed(1)}%)
							{!quota.isPersisted && (
								<span className="warning">
									{" "}
									⚠️ Not persisted{" "}
									<button className="link-button" onClick={requestPersistence}>
										Request persistence
									</button>
								</span>
							)}
						</div>
					</>
				)}
			</div>

			{/* Summary Stats */}
			<div className="stats-section">
				<div className="stat-card">
					<div className="stat-value">{availableTables.length}</div>
					<div className="stat-label">Available</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">{importingTables.length}</div>
					<div className="stat-label">Importing</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">{unavailableTables.length}</div>
					<div className="stat-label">Unavailable</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">
						{formatCost(
							tables.reduce((sum, t) => sum + t.costTracking.totalCostUSD, 0),
						)}
					</div>
					<div className="stat-label">Total Cost</div>
				</div>
			</div>

			{/* Materialized Tables List */}
			<div className="tables-section">
				<div className="tables-header">
					<h3>Materialized Tables ({tables.length})</h3>
				</div>

				{tables.length === 0 ? (
					<div className="empty-state">
						<p>No materialized tables yet.</p>
						<p>
							Execute a BigQuery query and click "Save to DuckDB" to create one.
						</p>
					</div>
				) : (
					<div className="tables-list">
						{tables.map((table) => (
							<div
								key={table.id}
								className={`table-item ${selectedTable === table.id ? "selected" : ""} status-${table.status}`}
								onClick={() =>
									setSelectedTable(selectedTable === table.id ? null : table.id)
								}
							>
								<div className="table-header">
									<span className="table-name" title={table.localName}>
										{table.localName}
									</span>
									<span className={`status-badge status-${table.status}`}>
										{table.status}
									</span>
								</div>

								<div className="table-meta">
									<span title="Row count">
										{table.rowCount.toLocaleString()} rows
									</span>
									<span title="Storage size">
										{formatBytes(table.sizeBytes)}
									</span>
									<span title="Total cost">
										{formatCost(table.costTracking.totalCostUSD)}
									</span>
									{table.lastRefreshedAt && (
										<span title={formatDate(table.lastRefreshedAt)}>
											Refreshed {formatRelativeTime(table.lastRefreshedAt)}
										</span>
									)}
								</div>

								{selectedTable === table.id && (
									<div className="table-details">
										<div className="detail-row">
											<span className="detail-label">Source Type:</span>
											<span>
												{table.sourceType === "table_import"
													? "Table Import"
													: "Query Result"}
											</span>
										</div>
										<div className="detail-row">
											<span className="detail-label">Created:</span>
											<span>{formatDate(table.createdAt)}</span>
										</div>
										{table.lastRefreshedAt && (
											<div className="detail-row">
												<span className="detail-label">Last Refresh:</span>
												<span>{formatDate(table.lastRefreshedAt)}</span>
											</div>
										)}
										<div className="detail-row">
											<span className="detail-label">Refreshes:</span>
											<span>{table.costTracking.refreshCount}</span>
										</div>
										<div className="detail-row">
											<span className="detail-label">Columns:</span>
											<span>{table.columnCount}</span>
										</div>
										{table.costTracking.lastRefreshCostUSD !== undefined && (
											<div className="detail-row">
												<span className="detail-label">Last Refresh Cost:</span>
												<span>
													{formatCost(
														table.costTracking.lastRefreshCostUSD || 0,
													)}
												</span>
											</div>
										)}

										<div className="detail-row">
											<span className="detail-label">Source Query:</span>
										</div>
										<div className="source-query">
											<code>{table.sourceQuery}</code>
										</div>

										<div className="table-actions">
											{table.status === "available" && (
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleRefresh(table.id);
													}}
													disabled={refreshingTable === table.id}
													className="action-button refresh"
												>
													{refreshingTable === table.id
														? "⏳ Refreshing..."
														: "🔄 Refresh"}
												</button>
											)}
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDelete(table.id);
												}}
												className="action-button delete"
											>
												🗑️ Delete
											</button>
										</div>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<style>{`
        .storage-manager {
          padding: 20px;
        }

        .quota-section {
          margin-bottom: 24px;
        }

        .quota-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .quota-bar {
          width: 100%;
          height: 12px;
          background: #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .quota-used {
          height: 100%;
          transition: width 0.3s ease, background-color 0.3s ease;
        }

        .quota-text {
          font-size: 14px;
          color: #666;
        }

        .warning {
          color: #f44336;
        }

        .link-button {
          background: none;
          border: none;
          color: #2196f3;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
          margin-left: 4px;
        }

        .stats-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
        }

        .tables-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #666;
        }

        .tables-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .table-item {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .table-item:hover {
          border-color: #2196f3;
          background: #f5f9ff;
        }

        .table-item.selected {
          border-color: #2196f3;
          background: #e3f2fd;
        }

        .table-item.status-unavailable {
          opacity: 0.6;
          border-color: #f44336;
        }

        .table-item.status-importing {
          border-color: #ff9800;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .table-name {
          font-weight: 600;
          font-size: 14px;
          font-family: monospace;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .status-badge.status-available {
          background: #4caf50;
          color: white;
        }

        .status-badge.status-unavailable {
          background: #f44336;
          color: white;
        }

        .status-badge.status-importing {
          background: #ff9800;
          color: white;
        }

        .table-meta {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #666;
          flex-wrap: wrap;
        }

        .table-details {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e0e0e0;
        }

        .detail-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .detail-label {
          font-weight: 600;
          min-width: 120px;
        }

        .source-query {
          margin: 12px 0;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 4px;
          font-size: 12px;
          max-height: 200px;
          overflow-y: auto;
        }

        .source-query code {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .table-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .action-button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-button.refresh {
          background: #2196f3;
          color: white;
        }

        .action-button.refresh:hover:not(:disabled) {
          background: #1976d2;
        }

        .action-button.delete {
          background: #f44336;
          color: white;
        }

        .action-button.delete:hover:not(:disabled) {
          background: #d32f2f;
        }
      `}</style>
		</div>
	);
};
