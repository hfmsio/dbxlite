/**
 * DatabaseTree - Hierarchical tree view for DuckDB databases
 * Shows: Database → Schema → Table → Columns
 */

import type React from "react";
import { useEffect, useState } from "react";
import { useRemoveDataSource, useUpdateDataSource } from "../stores/dataSourceStore";
import { fileHandleStore } from "../services/file-handle-store";
import type { DataSource, Schema, Table } from "../types/data-source";
import { createLogger } from "../utils/logger";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";

const logger = createLogger("DatabaseTree");

interface DatabaseTreeProps {
	databases: DataSource[];
	onInsertQuery: (sql: string) => void;
	onReattachDatabase?: (database: DataSource) => Promise<void>;
}

export function DatabaseTree({
	databases,
	onInsertQuery,
	onReattachDatabase,
}: DatabaseTreeProps) {
	const removeDataSource = useRemoveDataSource();
	const updateDataSource = useUpdateDataSource();
	const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
		new Set(),
	);
	const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
		new Set(),
	);
	const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		type: "database" | "schema" | "table" | "column";
		data: { table?: Table; schema?: Schema; database: DataSource };
	} | null>(null);
	const [confirmDialog, setConfirmDialog] = useState<{
		title: string;
		message: string;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	} | null>(null);

	// Check database handle permissions periodically
	useEffect(() => {
		const checkPermissions = async () => {
			logger.debug("Checking permissions for databases", databases.length);
			for (const db of databases) {
				logger.debug(`Checking ${db.name}`, {
					hasFileHandle: db.hasFileHandle,
					permissionStatus: db.permissionStatus,
				});

				// Only check databases with handles
				if (!db.hasFileHandle) {
					continue;
				}

				try {
					const storedHandle = await fileHandleStore.getHandle(db.id);
					if (storedHandle) {
						// Try to actually read the file to verify permission (not just query cached state)
						let hasPermission = false;
						try {
							await storedHandle.handle.getFile();
							hasPermission = true;
						} catch (err) {
							// If we can't read the file, permission is not actually granted
							hasPermission = false;
							logger.debug(
								`${db.name} failed to read file: ${String(err).substring(0, 100)}`,
							);
						}

						const newStatus = hasPermission ? "granted" : "prompt";

						// Update status if changed
						if (db.permissionStatus !== newStatus) {
							logger.debug(
								`${db.name} updating status from ${db.permissionStatus} to ${newStatus}`,
							);
							updateDataSource(db.id, { permissionStatus: newStatus });
						}
					} else {
						// No handle found - this means the file handle was lost
						// Update the data source to reflect this
						logger.debug(
							`${db.name} no stored handle found - clearing hasFileHandle flag`,
						);
						if (
							db.permissionStatus !== "unknown" ||
							db.hasFileHandle
						) {
							updateDataSource(db.id, {
								permissionStatus: "unknown",
								hasFileHandle: false,
								isAttached: false,
							});
						}
					}
				} catch (error) {
					logger.warn(
						`Failed to check permission for database ${db.name}:`,
						error,
					);
					updateDataSource(db.id, { permissionStatus: "unknown" });
				}
			}
		};

		// Check immediately
		checkPermissions();

		// Check every 5 seconds
		const interval = setInterval(checkPermissions, 5000);
		return () => clearInterval(interval);
	}, [databases, updateDataSource]);

	// Helper to check if database is available
	const isDatabaseAvailable = (db: DataSource): boolean => {
		// Files with handles AND granted permission should be available
		if (db.hasFileHandle && db.permissionStatus === "granted") return true;

		// Check if attached (isAttached flag is true)
		if (db.isAttached) return true;

		// Otherwise, check if schema was introspected
		return (db.schemas && db.schemas.length > 0) || false;
	};

	// Request permission and reattach database
	const handleRequestPermission = async (
		db: DataSource,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();

		logger.debug(`handleRequestPermission called for: ${db.name}`, {
			permissionStatus: db.permissionStatus,
			isAttached: db.isAttached,
			hasFileHandle: db.hasFileHandle,
		});

		try {
			const storedHandle = await fileHandleStore.getHandle(db.id);
			if (!storedHandle) {
				logger.error("No file handle found for database", db.name);
				return;
			}

			logger.debug("Found stored handle, requesting permission...");
			const granted = await fileHandleStore.requestPermission(
				storedHandle.handle,
			);
			logger.debug("Permission request completed. Result:", granted);

			if (!granted) {
				logger.warn(
					"Permission was denied by user or browser, opening file picker...",
				);

				// Open file picker for user to re-select the same file
				if ("showOpenFilePicker" in window) {
					try {
						const handles = await window.showOpenFilePicker?.({
							types: [
								{
									description: "DuckDB Database Files",
									accept: { "application/x-duckdb": [".duckdb", ".db"] },
								},
							],
							multiple: false,
						});
						if (!handles) return;
						const [newHandle] = handles;

						// Store the new handle
						await fileHandleStore.storeHandle(db.id, newHandle.name, newHandle);
						logger.debug("New file handle stored:", newHandle.name);

						// Update permission status and trigger reattach
						updateDataSource(db.id, {
							permissionStatus: "granted",
							filePath: newHandle.name,
						});

						if (onReattachDatabase) {
							logger.debug("Calling onReattachDatabase with new handle...");
							await onReattachDatabase(db);
						}
					} catch (pickerErr: unknown) {
						if (pickerErr instanceof Error && pickerErr.name === "AbortError") {
							logger.debug("File picker cancelled");
						} else {
							logger.debug("File picker failed:", pickerErr);
						}
						updateDataSource(db.id, { permissionStatus: "denied" });
					}
				}
				return;
			}

			logger.debug("Permission granted! Updating data source...");
			updateDataSource(db.id, { permissionStatus: "granted" });

			// Verify we can actually read the file before attempting reattach
			logger.debug("Verifying file is readable...");
			try {
				const file = await storedHandle.handle.getFile();
				logger.debug(`File readable: ${file.name} ${file.size} bytes`);
			} catch (readErr) {
				logger.error(
					"File not readable even after permission granted:",
					readErr,
				);

				// Permission granted but file still not readable - likely large file issue
				// Open file picker for user to re-select
				if ("showOpenFilePicker" in window) {
					try {
						const handles = await window.showOpenFilePicker?.({
							types: [
								{
									description: "DuckDB Database Files",
									accept: { "application/x-duckdb": [".duckdb", ".db"] },
								},
							],
							multiple: false,
						});
						if (!handles) return;
						const [newHandle] = handles;

						// Store the new handle
						await fileHandleStore.storeHandle(db.id, newHandle.name, newHandle);
						logger.debug("New file handle stored:", newHandle.name);

						// Update data source and trigger reattach
						updateDataSource(db.id, {
							permissionStatus: "granted",
							filePath: newHandle.name,
						});

						if (onReattachDatabase) {
							logger.debug("Calling onReattachDatabase with new handle...");
							await onReattachDatabase(db);
						}
					} catch (pickerErr: unknown) {
						if (pickerErr instanceof Error && pickerErr.name === "AbortError") {
							logger.debug("File picker cancelled");
						} else {
							logger.debug("File picker failed:", pickerErr);
						}
						updateDataSource(db.id, { permissionStatus: "denied" });
					}
				}
				return;
			}

			if (onReattachDatabase) {
				logger.debug("Calling onReattachDatabase...");
				await onReattachDatabase(db);
			} else {
				logger.error("onReattachDatabase callback not provided!");
			}
		} catch (error) {
			logger.error("Failed to request permission:", error);
			updateDataSource(db.id, { permissionStatus: "denied" });
		}
	};

	// Get status badge for database
	const getStatusBadge = (db: DataSource) => {
		// Databases without handles don't need permission
		if (!db.hasFileHandle) {
			if (!isDatabaseAvailable(db)) {
				return {
					icon: "⚠️",
					title: "Database unavailable - needs re-upload",
					className: "unavailable-badge",
				};
			}
			return null;
		}

		// Databases with handles - show permission status
		switch (db.permissionStatus) {
			case "granted":
				// Check if attached
				if (!db.isAttached) {
					return {
						icon: "🔌",
						title: "Click to attach database",
						className: "permission-needed-badge",
					};
				}
				return {
					icon: "✓",
					title: "Attached and accessible",
					className: "permission-granted-badge",
				};
			case "prompt":
			case "unknown":
				return {
					icon: "🔒",
					title: "Click to select file and attach (file picker will open)",
					className: "permission-needed-badge",
				};
			case "denied":
				return {
					icon: "⛔",
					title: "Click to select file and attach (file picker will open)",
					className: "permission-needed-badge",
				};
			default:
				if (!isDatabaseAvailable(db)) {
					return {
						icon: "⚠️",
						title: "Database unavailable",
						className: "unavailable-badge",
					};
				}
				return null;
		}
	};

	// Remove all unavailable databases
	const removeStaleDBs = () => {
		const staleDBs = databases.filter((db) => !isDatabaseAvailable(db));
		if (staleDBs.length === 0) {
			return;
		}

		setConfirmDialog({
			title: "Remove Unavailable Databases",
			message: `Remove ${staleDBs.length} unavailable database(s) from the explorer? These databases couldn't be loaded and need to be re-uploaded.`,
			onConfirm: () => {
				staleDBs.forEach((db) => removeDataSource(db.id));
			},
			variant: "warning",
		});
	};

	const toggleDatabase = (dbId: string) => {
		setExpandedDatabases((prev) => {
			const next = new Set(prev);
			if (next.has(dbId)) {
				next.delete(dbId);
			} else {
				next.add(dbId);
			}
			return next;
		});
	};

	const toggleSchema = (schemaKey: string) => {
		setExpandedSchemas((prev) => {
			const next = new Set(prev);
			if (next.has(schemaKey)) {
				next.delete(schemaKey);
			} else {
				next.add(schemaKey);
			}
			return next;
		});
	};

	const toggleTable = (tableKey: string) => {
		setExpandedTables((prev) => {
			const next = new Set(prev);
			if (next.has(tableKey)) {
				next.delete(tableKey);
			} else {
				next.add(tableKey);
			}
			return next;
		});
	};

	const handleTableContextMenu = (
		e: React.MouseEvent,
		table: Table,
		schema: Schema,
		database: DataSource,
	) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			type: "table",
			data: { table, schema, database },
		});
	};

	const handleDatabaseContextMenu = (
		e: React.MouseEvent,
		database: DataSource,
	) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			type: "database",
			data: { database },
		});
	};

	const handleContextMenuAction = (action: string) => {
		if (!contextMenu) return;

		switch (action) {
			case "query":
				if (contextMenu.type === "table") {
					const { table, schema, database } = contextMenu.data;
					if (!table || !schema) return;
					const tableRef = database.attachedAs
						? `${database.attachedAs}."${schema.name}"."${table.name}"`
						: `"${schema.name}"."${table.name}"`;
					const sql = `SELECT * FROM ${tableRef} LIMIT 100;`;
					onInsertQuery(sql);
				}
				break;

			case "describe":
				if (contextMenu.type === "table") {
					const { table, schema, database } = contextMenu.data;
					if (!table || !schema) return;
					const tableRef = database.attachedAs
						? `${database.attachedAs}."${schema.name}"."${table.name}"`
						: `"${schema.name}"."${table.name}"`;
					const sql = `DESCRIBE ${tableRef};`;
					onInsertQuery(sql);
				}
				break;

			case "count":
				if (contextMenu.type === "table") {
					const { table, schema, database } = contextMenu.data;
					if (!table || !schema) return;
					const tableRef = database.attachedAs
						? `${database.attachedAs}."${schema.name}"."${table.name}"`
						: `"${schema.name}"."${table.name}"`;
					const sql = `SELECT COUNT(*) as row_count FROM ${tableRef};`;
					onInsertQuery(sql);
				}
				break;

			case "delete":
				if (contextMenu.type === "database") {
					const { database } = contextMenu.data;
					setConfirmDialog({
						title: "Delete Database",
						message: `Delete "${database.name}"? This will remove it from the explorer.`,
						onConfirm: () => {
							removeDataSource(database.id);
						},
						variant: "danger",
					});
				}
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

	const staleDBsCount = databases.filter(
		(db) => !isDatabaseAvailable(db),
	).length;

	return (
		<>
			{staleDBsCount > 0 && (
				<div className="file-list-warning">
					<span className="warning-icon">⚠️</span>
					<span className="warning-text">
						{staleDBsCount} database(s) unavailable (need re-upload)
					</span>
					<button
						className="warning-action-btn"
						onClick={removeStaleDBs}
						title="Remove unavailable databases"
					>
						Clear
					</button>
				</div>
			)}

			<div className="database-tree">
				{databases.map((db) => {
					const isExpanded = expandedDatabases.has(db.id);
					const available = isDatabaseAvailable(db);
					const statusBadge = getStatusBadge(db);

					return (
						<div key={db.id} className="tree-database">
							<div
								className={`tree-item database-item ${!available ? "file-unavailable" : ""}`}
								onClick={() => toggleDatabase(db.id)}
								onContextMenu={(e) => handleDatabaseContextMenu(e, db)}
								title={
									!available
										? "Database unavailable - needs re-upload after page refresh"
										: ""
								}
							>
								<span className="tree-icon">{isExpanded ? "📂" : "📁"}</span>
								<span className="tree-label">
									{db.name}
									{statusBadge && (
										<span
											className={statusBadge.className}
											title={statusBadge.title}
											onClick={(e) => {
												// Handle permission request or reattach
												if (
													db.permissionStatus === "prompt" ||
													db.permissionStatus === "unknown" ||
													(db.permissionStatus === "granted" && !db.isAttached)
												) {
													handleRequestPermission(db, e);
												}
											}}
											style={
												db.permissionStatus === "prompt" ||
												db.permissionStatus === "unknown" ||
												(db.permissionStatus === "granted" && !db.isAttached)
													? { cursor: "pointer" }
													: undefined
											}
										>
											{statusBadge.icon}
										</span>
									)}
								</span>
								{db.size && (
									<span className="tree-meta">{formatBytes(db.size)}</span>
								)}
							</div>

							{isExpanded && db.schemas && (
								<div className="tree-children">
									{db.schemas.map((schema) => {
										const schemaKey = `${db.id}-${schema.name}`;
										const isSchemaExpanded = expandedSchemas.has(schemaKey);

										return (
											<div key={schemaKey} className="tree-schema">
												<div
													className="tree-item schema-item"
													onClick={() => toggleSchema(schemaKey)}
												>
													<span className="tree-icon">
														{isSchemaExpanded ? "▼" : "▶"}
													</span>
													<span className="tree-label">📑 {schema.name}</span>
													<span className="tree-meta">
														{schema.tables.length}{" "}
														{schema.tables.length === 1 ? "table" : "tables"}
													</span>
												</div>

												{isSchemaExpanded && (
													<div className="tree-children">
														{schema.tables.map((table) => {
															const tableKey = `${schemaKey}-${table.name}`;
															const isTableExpanded =
																expandedTables.has(tableKey);

															return (
																<div key={tableKey} className="tree-table">
																	<div
																		className="tree-item table-item"
																		onClick={() => toggleTable(tableKey)}
																		onContextMenu={(e) =>
																			handleTableContextMenu(
																				e,
																				table,
																				schema,
																				db,
																			)
																		}
																	>
																		<span className="tree-icon">
																			{isTableExpanded ? "▼" : "▶"}
																		</span>
																		<span className="tree-label">
																			{table.type === "view" ? "👁️" : "📋"}{" "}
																			{table.name}
																		</span>
																		<span className="tree-meta">
																			{formatNumber(table.rowCount)} rows
																		</span>
																	</div>

																	{isTableExpanded && (
																		<div className="tree-children columns-list">
																			{table.columns.map((column) => (
																				<div
																					key={column.name}
																					className="tree-item column-item"
																					title={`${column.type}${column.nullable ? " (nullable)" : ""}`}
																				>
																					<span className="tree-icon">
																						{column.isPrimaryKey ? "🔑" : "📝"}
																					</span>
																					<span className="tree-label">
																						{column.name}
																					</span>
																					<span className="tree-type">
																						{column.type}
																					</span>
																				</div>
																			))}
																		</div>
																	)}
																</div>
															);
														})}
													</div>
												)}
											</div>
										);
									})}
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
					items={
						contextMenu.type === "table"
							? [
									{ label: "Query Table", action: "query", icon: "▶️" },
									{ label: "Describe Schema", action: "describe", icon: "📋" },
									{ label: "Count Rows", action: "count", icon: "#️⃣" },
								]
							: contextMenu.type === "database"
								? [{ label: "Delete Database", action: "delete", icon: "🗑️" }]
								: []
					}
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
