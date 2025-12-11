/**
 * FileList - List view for simple data files (CSV, Parquet, JSON)
 */

import type React from "react";
import { useEffect, useState } from "react";
import { useRemoveDataSource, useUpdateDataSource } from "../stores/dataSourceStore";
import { fileHandleStore } from "../services/file-handle-store";
import type { DataSource } from "../types/data-source";
import { createLogger } from "../utils/logger";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";

const logger = createLogger("FileList");

interface FileListProps {
	files: DataSource[];
	onInsertQuery: (sql: string) => void;
	onRefresh?: () => void;
	onReloadFile?: (file: DataSource) => Promise<void>;
}

export function FileList({
	files,
	onInsertQuery,
	onRefresh: _onRefresh,
	onReloadFile,
}: FileListProps) {
	const removeDataSource = useRemoveDataSource();
	const updateDataSource = useUpdateDataSource();
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		file: DataSource;
	} | null>(null);
	const [confirmDialog, setConfirmDialog] = useState<{
		title: string;
		message: string;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	} | null>(null);

	// Check file handle permissions periodically
	useEffect(() => {
		const checkPermissions = async () => {
			for (const file of files) {
				// Only check files with handles (not remote files)
				if (!file.hasFileHandle || file.isRemote) continue;

				try {
					const storedHandle = await fileHandleStore.getHandle(file.id);
					if (storedHandle) {
						// Try to actually read the file to verify permission (not just query cached state)
						let hasPermission = false;
						try {
							await storedHandle.handle.getFile();
							hasPermission = true;
						} catch (_err) {
							// If we can't read the file, permission is not actually granted
							hasPermission = false;
						}

						const newStatus = hasPermission ? "granted" : "prompt";

						// Update status if changed
						if (file.permissionStatus !== newStatus) {
							updateDataSource(file.id, { permissionStatus: newStatus });
						}
					} else {
						// No handle found - mark as unknown
						if (file.permissionStatus !== "unknown") {
							updateDataSource(file.id, { permissionStatus: "unknown" });
						}
					}
				} catch (error) {
					logger.warn(`Failed to check permission for ${file.name}`, error);
					updateDataSource(file.id, { permissionStatus: "unknown" });
				}
			}
		};

		// Check immediately
		checkPermissions();

		// Check every 5 seconds (permissions can be revoked)
		const interval = setInterval(checkPermissions, 5000);
		return () => clearInterval(interval);
	}, [files, updateDataSource]);

	// Helper to check if file is available in DuckDB
	const isFileAvailable = (file: DataSource): boolean => {
		// Remote files are always "available" (accessed via URL)
		if (file.isRemote) return true;

		// Files with handles should be available (auto-reloaded)
		if (file.hasFileHandle) return true;

		// Otherwise, check if schema was introspected (has columns)
		return (file.columns && file.columns.length > 0) || false;
	};

	// Remove all unavailable files
	const removeStaleFiles = () => {
		const staleFiles = files.filter((f) => !isFileAvailable(f));
		if (staleFiles.length === 0) {
			return;
		}

		setConfirmDialog({
			title: "Remove Unavailable Files",
			message: `Remove ${staleFiles.length} unavailable file(s) from the explorer? These files were cleared when the page was refreshed and need to be re-uploaded to query.`,
			onConfirm: () => {
				staleFiles.forEach((f) => removeDataSource(f.id));
			},
			variant: "warning",
		});
	};

	const toggleFile = (fileId: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(fileId)) {
				next.delete(fileId);
			} else {
				next.add(fileId);
			}
			return next;
		});
	};

	const handleFileContextMenu = (e: React.MouseEvent, file: DataSource) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			file,
		});
	};

	// Helper function to get proper table reference for file
	const getTableReference = (file: DataSource): string => {
		// If tableName is set, use it directly (for registered files)
		if (file.tableName) {
			return file.tableName;
		}

		// For files, use the filePath with single quotes
		// DuckDB handles file names with spaces when properly quoted
		return `'${file.filePath}'`;
	};

	const handleContextMenuAction = (action: string) => {
		if (!contextMenu) return;

		const file = contextMenu.file;
		const tableName = getTableReference(file);

		switch (action) {
			case "query":
				onInsertQuery(`SELECT * FROM ${tableName} LIMIT 100;`);
				break;

			case "describe":
				onInsertQuery(`DESCRIBE SELECT * FROM ${tableName};`);
				break;

			case "count":
				onInsertQuery(`SELECT COUNT(*) as row_count FROM ${tableName};`);
				break;

			case "profile": {
				// Generate profiling query
				const columns = file.columns?.slice(0, 5).map((c) => c.name) || [];
				if (columns.length > 0) {
					const profiling = columns
						.map(
							(col) =>
								`  COUNT(DISTINCT ${col}) as ${col}_distinct,\n  MIN(${col}) as ${col}_min,\n  MAX(${col}) as ${col}_max`,
						)
						.join(",\n");
					onInsertQuery(
						`SELECT\n  COUNT(*) as total_rows,\n${profiling}\nFROM ${tableName};`,
					);
				}
				break;
			}

			case "delete":
				setConfirmDialog({
					title: "Delete File",
					message: `Delete "${file.name}"? This will remove it from the explorer.`,
					onConfirm: () => {
						removeDataSource(file.id);
					},
					variant: "danger",
				});
				break;
		}

		setContextMenu(null);
	};

	const formatBytes = (bytes?: number) => {
		if (!bytes) return "N/A";
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
	};

	const formatNumber = (num?: number) => {
		if (num === undefined || num === null) return "N/A";
		return num.toLocaleString();
	};

	// Request permission for a file handle
	const handleRequestPermission = async (
		file: DataSource,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();

		try {
			const storedHandle = await fileHandleStore.getHandle(file.id);
			if (!storedHandle) {
				logger.error("No file handle found for", file.name);
				return;
			}

			const granted = await fileHandleStore.requestPermission(
				storedHandle.handle,
			);
			updateDataSource(file.id, {
				permissionStatus: granted ? "granted" : "denied",
			});

			if (granted && onReloadFile) {
				// Auto-reload the file if permission was granted
				await onReloadFile(file);
			}
		} catch (error) {
			logger.error("Failed to request permission", error);
			updateDataSource(file.id, { permissionStatus: "denied" });
		}
	};

	const getFileIcon = (file: DataSource) => {
		// Remote files get a globe icon
		if (file.isRemote) {
			return "🌐";
		}

		// Local files get type-specific icons
		switch (file.type) {
			case "csv":
				return "📊";
			case "parquet":
				return "📦";
			case "json":
				return "📄";
			default:
				return "📁";
		}
	};

	// Get status badge for file
	const getStatusBadge = (file: DataSource) => {
		// Remote files don't need permission
		if (file.isRemote) return null;

		// Files without handles don't need permission
		if (!file.hasFileHandle) {
			if (!isFileAvailable(file)) {
				return {
					icon: "⚠️",
					title: "File unavailable - needs re-upload",
					className: "unavailable-badge",
				};
			}
			return null;
		}

		// Files with handles - show permission status
		switch (file.permissionStatus) {
			case "granted":
				return {
					icon: "✓",
					title: "Permission granted - file accessible",
					className: "permission-granted-badge",
				};
			case "prompt":
			case "unknown":
				return {
					icon: "🔒",
					title: "Click to grant file access permission",
					className: "permission-needed-badge",
				};
			case "denied":
				return {
					icon: "⛔",
					title: "Permission denied - cannot access file",
					className: "permission-denied-badge",
				};
			default:
				if (!isFileAvailable(file)) {
					return {
						icon: "⚠️",
						title: "File unavailable",
						className: "unavailable-badge",
					};
				}
				return null;
		}
	};

	const staleFilesCount = files.filter((f) => !isFileAvailable(f)).length;

	return (
		<>
			{staleFilesCount > 0 && (
				<div className="file-list-warning">
					<span className="warning-icon">⚠️</span>
					<span className="warning-text">
						{staleFilesCount} file(s) unavailable (need re-upload)
					</span>
					<button
						className="warning-action-btn"
						onClick={removeStaleFiles}
						title="Remove unavailable files"
					>
						Clear
					</button>
				</div>
			)}

			<div className="file-list">
				{files.map((file) => {
					const isExpanded = expandedFiles.has(file.id);
					const available = isFileAvailable(file);
					const statusBadge = getStatusBadge(file);

					return (
						<div key={file.id} className="file-item-container">
							<div
								className={`tree-item file-item ${!available ? "file-unavailable" : ""} ${file.isRemote ? "file-remote" : ""}`}
								onClick={() => toggleFile(file.id)}
								onContextMenu={(e) => handleFileContextMenu(e, file)}
								title={
									file.isRemote
										? `Remote file: ${file.remoteURL}`
										: !available
											? "File unavailable - needs re-upload after page refresh"
											: ""
								}
							>
								<span className="tree-icon">{getFileIcon(file)}</span>
								<div className="file-info">
									<div className="file-name">
										{file.name}
										{file.isRemote && (
											<span className="remote-badge" title="Remote file">
												🌐
											</span>
										)}
										{statusBadge && (
											<span
												className={statusBadge.className}
												title={statusBadge.title}
												onClick={(e) => {
													// Allow clicking lock icon to request permission
													if (
														file.permissionStatus === "prompt" ||
														file.permissionStatus === "unknown"
													) {
														handleRequestPermission(file, e);
													}
												}}
												style={
													file.permissionStatus === "prompt" ||
													file.permissionStatus === "unknown"
														? { cursor: "pointer" }
														: undefined
												}
											>
												{statusBadge.icon}
											</span>
										)}
									</div>
									<div className="file-meta">
										{formatBytes(file.size)} •{" "}
										{formatNumber(file.stats?.rowCount)} rows •{" "}
										{formatNumber(file.stats?.columnCount)} cols
									</div>
								</div>
								{!available && onReloadFile && !file.hasFileHandle && (
									<button
										className="file-reload-btn"
										onClick={(e) => {
											e.stopPropagation();
											onReloadFile(file);
										}}
										title="Reload this file"
									>
										🔄
									</button>
								)}
								<span className="expand-icon">{isExpanded ? "▼" : "▶"}</span>
							</div>

							{isExpanded && file.columns && (
								<div className="tree-children columns-list">
									{file.columns.map((column) => (
										<div
											key={column.name}
											className="tree-item column-item"
											title={`${column.type}${column.nullable ? " (nullable)" : ""}`}
										>
											<span className="tree-icon">📝</span>
											<span className="tree-label">{column.name}</span>
											<span className="tree-type">{column.type}</span>
										</div>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{contextMenu && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={() => setContextMenu(null)}
					items={[
						{ label: "Query File", action: "query", icon: "▶️" },
						{ label: "Describe Schema", action: "describe", icon: "📋" },
						{ label: "Count Rows", action: "count", icon: "#️⃣" },
						{ label: "Profile Data", action: "profile", icon: "📊" },
						{ label: "Delete File", action: "delete", icon: "🗑️" },
					]}
					onAction={handleContextMenuAction}
				/>
			)}

			{confirmDialog && (
				<ConfirmDialog
					isOpen={true}
					title={confirmDialog.title}
					message={confirmDialog.message}
					onConfirm={confirmDialog.onConfirm}
					onCancel={() => setConfirmDialog(null)}
					variant={confirmDialog.variant}
					confirmText={confirmDialog.variant === "danger" ? "Delete" : "Remove"}
				/>
			)}
		</>
	);
}
