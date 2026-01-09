/**
 * useDataSourceState - Manages state and tree building for DataSourceExplorer
 */

import type { TableMetadata } from "@ide/connectors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryService } from "../services/streaming-query-service";
import type { ConnectorType, DataSource } from "../types/data-source";
import type { TreeSection, UnifiedTreeNode } from "../types/tree";
import { createLogger } from "../utils/logger";
import {
	convertBigQueryToTreeNodes,
	convertDatabasesToTreeNodes,
	convertFilesToTreeNodes,
	formatBytes,
} from "../utils/treeConverters";
import { ClockIcon, CloudIcon, ColumnsIcon, DatabaseIcon, EyeIcon, FileIcon, FolderIcon, RefreshIcon, TableIcon } from "../components/Icons";
import { useLocalDatabase } from "./useLocalDatabase";
import { useServerDatabases } from "./useServerDatabases";
import type React from "react";
import type { CatalogInfo, SchemaInfo } from "@ide/connectors";

const logger = createLogger("useDataSourceState");

// Type for BigQuery project with nested datasets
interface BigQueryProject extends CatalogInfo {
	datasets: (SchemaInfo & { tables: TableMetadata[] })[];
}

export interface DataSourceStateProps {
	dataSources: DataSource[];
	lastUploadedType?: "file" | "database" | null;
	explorerSortOrder?: "none" | "name" | "type" | "size";
	onInsertQuery: (sql: string, connectorType?: ConnectorType) => void;
	onReloadFile?: (file: DataSource) => Promise<void>;
	onRefreshMetadata?: (file: DataSource) => Promise<void>;
	onRestoreAccess?: (file: DataSource) => Promise<void>;
	onReattachDatabase?: (database: DataSource) => Promise<void>;
	onToggleWriteMode?: (database: DataSource) => Promise<void>;
	onBigQueryCacheClear?: (clearFn: () => void) => void;
	onBigQueryDataLoad?: (loadFn: () => Promise<void>) => void;
	onLocalDatabaseRefresh?: (refreshFn: () => Promise<void>) => void;
	onServerDatabaseRefresh?: (refreshFn: () => Promise<void>) => void;
	onFileDelete: (id: string) => void;
	onDatabaseDelete: (dbName: string) => void;
	onDeleteFolder: (domain: string, path: string) => void;
	onDeleteDomain: (domain: string) => void;
	showToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
	/** Whether running in HTTP/Server mode (hides browser-specific sections) */
	isHttpMode?: boolean;
}

export function useDataSourceState({
	dataSources,
	lastUploadedType,
	explorerSortOrder = "none",
	onInsertQuery,
	onReloadFile,
	onRefreshMetadata,
	onRestoreAccess,
	onReattachDatabase,
	onToggleWriteMode,
	onBigQueryCacheClear,
	onBigQueryDataLoad,
	onLocalDatabaseRefresh,
	onServerDatabaseRefresh,
	onFileDelete,
	onDatabaseDelete,
	onDeleteFolder,
	onDeleteDomain,
	showToast,
	isHttpMode = false,
}: DataSourceStateProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isBigQueryConnected, setIsBigQueryConnected] = useState(false);

	// Local database (OPFS-backed) schema
	const localDatabase = useLocalDatabase();

	// Server databases (only in HTTP mode)
	const serverDatabases = useServerDatabases(isHttpMode);

	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		() => {
			const stored = localStorage.getItem("explorer-collapsed-sections");
			return stored ? new Set(JSON.parse(stored)) : new Set(["cloud"]); // Collapse cloud by default
		},
	);
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
		const stored = localStorage.getItem("explorer-expanded-nodes");
		return stored ? new Set(JSON.parse(stored)) : new Set();
	});
	const [selectedNodeId, setSelectedNodeId] = useState<string>();
	const [bigQueryData, setBigQueryData] = useState<BigQueryProject[]>([]);
	const [tableInfoModal, setTableInfoModal] = useState<{
		table: TableMetadata;
		fullName: string;
		databaseName?: string;
		schemaName?: string;
	} | null>(null);

	// Pinned BigQuery projects (e.g., bigquery-public-data)
	const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => {
		try {
			const stored = localStorage.getItem("bigquery-pinned-projects");
			return stored ? JSON.parse(stored) : [];
		} catch {
			return [];
		}
	});
	const [showAddProjectInput, setShowAddProjectInput] = useState(false);

	// Persist pinned projects
	useEffect(() => {
		localStorage.setItem("bigquery-pinned-projects", JSON.stringify(pinnedProjects));
	}, [pinnedProjects]);

	const addPinnedProject = useCallback((projectId: string) => {
		const trimmed = projectId.trim();
		if (trimmed && !pinnedProjects.includes(trimmed)) {
			setPinnedProjects((prev) => [...prev, trimmed]);
		}
		setShowAddProjectInput(false);
	}, [pinnedProjects]);

	const removePinnedProject = useCallback((projectId: string) => {
		setPinnedProjects((prev) => prev.filter((p) => p !== projectId));
		// Clear cached data for this project
		setBigQueryData((prev) => prev.filter((p) => p.id !== projectId));
	}, []);

	// Ref to store expanded nodes state before search (for restoration when search is cleared)
	const savedExpandedNodes = useRef<Set<string> | null>(null);

	// Persist expanded nodes to localStorage
	useEffect(() => {
		localStorage.setItem(
			"explorer-expanded-nodes",
			JSON.stringify(Array.from(expandedNodes)),
		);
	}, [expandedNodes]);

	// Check if BigQuery is connected (but don't auto-load data)
	useEffect(() => {
		const checkBigQueryConnection = () => {
			const isConnected = queryService.isBigQueryConnected();
			setIsBigQueryConnected(isConnected);
		};

		checkBigQueryConnection();
		// Check periodically in case connection status changes
		const interval = setInterval(checkBigQueryConnection, 5000);
		return () => clearInterval(interval);
	}, []);

	// ESC key handler for table info modal
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && tableInfoModal) {
				setTableInfoModal(null);
			}
		};

		if (tableInfoModal) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [tableInfoModal]);

	// Expose BigQuery cache clear function to parent
	useEffect(() => {
		if (onBigQueryCacheClear) {
			onBigQueryCacheClear(() => {
				setBigQueryData([]);
			});
		}
	}, [onBigQueryCacheClear]);

	// Expose local database refresh function to parent (for DDL statement detection)
	useEffect(() => {
		if (onLocalDatabaseRefresh) {
			onLocalDatabaseRefresh(localDatabase.refreshSchema);
		}
	}, [onLocalDatabaseRefresh, localDatabase.refreshSchema]);

	// Expose server database refresh function to parent (for ATTACH/DETACH detection)
	useEffect(() => {
		if (onServerDatabaseRefresh) {
			onServerDatabaseRefresh(serverDatabases.refreshDatabases);
		}
	}, [onServerDatabaseRefresh, serverDatabases.refreshDatabases]);

	// Manual BigQuery data loading
	const loadBigQueryData = useCallback(async () => {
		if (!isBigQueryConnected) return;

		try {
			logger.debug(
				"Loading BigQuery projects, datasets, and tables with columns...",
			);
			// Load BigQuery projects and their datasets
			const projects = await queryService.getBigQueryProjects();

			// Merge with pinned projects (add those not already in list)
			const existingIds = new Set(projects.map((p) => p.id));
			const pinnedCatalogInfos: CatalogInfo[] = pinnedProjects
				.filter((id) => !existingIds.has(id))
				.map((id) => ({
					id,
					name: id,
					type: "project" as const,
					description: "Pinned project",
				}));
			const allProjects = [...projects, ...pinnedCatalogInfos];

			const projectsWithData: BigQueryProject[] = await Promise.all(
				allProjects.map(async (project) => {
					try {
						const datasets = await queryService.getBigQueryDatasets(project.id);
						const datasetsWithTables = await Promise.all(
							datasets.map(async (dataset) => {
								try {
									const tables = await queryService.getBigQueryTables(
										project.id,
										dataset.id,
									);
									// Fetch full metadata (including columns) for each table
									const tablesWithColumns = await Promise.all(
										tables.map(async (table) => {
											try {
												const metadata =
													await queryService.getBigQueryTableMetadata(
														project.id,
														dataset.id,
														table.id,
													);
												return metadata;
											} catch (err) {
												logger.error(
													`Error loading metadata for ${project.id}.${dataset.id}.${table.id}:`,
													err,
												);
												return table; // Fallback to basic table info without columns
											}
										}),
									);
									return { ...dataset, tables: tablesWithColumns };
								} catch (err) {
									logger.error(
										`Error loading tables for ${project.id}.${dataset.id}:`,
										err,
									);
									return { ...dataset, tables: [] as TableMetadata[] };
								}
							}),
						);
						return { ...project, datasets: datasetsWithTables };
					} catch (err) {
						logger.error(
							`Error loading datasets for project ${project.id}:`,
							err,
						);
						return { ...project, datasets: [] };
					}
				}),
			);
			setBigQueryData(projectsWithData);
			logger.info(`Loaded ${projectsWithData.length} BigQuery projects`);
			if (projectsWithData.length > 0) {
				showToast?.(`Loaded ${projectsWithData.length} BigQuery project${projectsWithData.length > 1 ? 's' : ''}`, "success");
			}
		} catch (err) {
			logger.error("Error loading BigQuery data:", err);
			// Check for token refresh errors
			const errorMessage = err instanceof Error ? err.message : String(err);
			if (errorMessage.includes("refresh token") || errorMessage.includes("token")) {
				showToast?.("BigQuery session expired. Please reconnect in Settings → Connections", "error");
			} else {
				showToast?.(`BigQuery error: ${errorMessage}`, "error");
			}
		}
	}, [isBigQueryConnected, pinnedProjects, showToast]);

	// Expose BigQuery data load function to parent
	useEffect(() => {
		if (onBigQueryDataLoad) {
			onBigQueryDataLoad(loadBigQueryData);
		}
	}, [onBigQueryDataLoad, loadBigQueryData]);

	// Auto-expand section when file or database is uploaded
	useEffect(() => {
		if (lastUploadedType) {
			setCollapsedSections((prev) => {
				const newCollapsed = new Set(prev);
				if (lastUploadedType === "file") {
					newCollapsed.delete("files");
				} else if (lastUploadedType === "database") {
					newCollapsed.delete("databases");
				}
				localStorage.setItem(
					"explorer-collapsed-sections",
					JSON.stringify(Array.from(newCollapsed)),
				);
				return newCollapsed;
			});
		}
	}, [lastUploadedType]);

	// Save/restore expanded nodes when search starts/clears
	useEffect(() => {
		if (searchQuery && !savedExpandedNodes.current) {
			// Save state when starting to search
			savedExpandedNodes.current = new Set(expandedNodes);
		} else if (!searchQuery && savedExpandedNodes.current) {
			// Restore state when clearing search
			setExpandedNodes(savedExpandedNodes.current);
			savedExpandedNodes.current = null;
		}
	}, [searchQuery, expandedNodes]);

	// Filter data sources based on search query
	const filterDataSources = useCallback((sources: DataSource[]) => {
		if (!searchQuery) return sources;
		const query = searchQuery.toLowerCase();
		return sources.filter((ds) => {
			// Search in name
			if (ds.name.toLowerCase().includes(query)) return true;
			// Search in schemas/tables
			if (ds.schemas) {
				for (const schema of ds.schemas) {
					if (schema.name.toLowerCase().includes(query)) return true;
					for (const table of schema.tables) {
						if (table.name.toLowerCase().includes(query)) return true;
						// Search in columns
						for (const col of table.columns) {
							if (col.name.toLowerCase().includes(query)) return true;
						}
					}
				}
			}
			// Search in columns (for files)
			if (ds.columns) {
				for (const col of ds.columns) {
					if (col.name.toLowerCase().includes(query)) return true;
				}
			}
			return false;
		});
	}, [searchQuery]);

	// Recursively filter tree nodes based on search query
	// Returns filtered nodes and a set of node IDs to auto-expand
	const filterTreeNodes = useCallback((
		nodes: UnifiedTreeNode[],
		query: string,
	): { filtered: UnifiedTreeNode[]; toExpand: Set<string> } => {
		if (!query) return { filtered: nodes, toExpand: new Set() };

		const lowerQuery = query.toLowerCase();
		const toExpand = new Set<string>();

		const filterNode = (node: UnifiedTreeNode): UnifiedTreeNode | null => {
			// Check if this node matches
			const nameMatches = node.name.toLowerCase().includes(lowerQuery);

			// Recursively filter children
			let filteredChildren: UnifiedTreeNode[] = [];
			if (node.children && node.children.length > 0) {
				filteredChildren = node.children
					.map((child) => filterNode(child))
					.filter((child): child is UnifiedTreeNode => child !== null);
			}

			// Include this node if it matches OR has matching children
			if (nameMatches || filteredChildren.length > 0) {
				// If this node has matching children, expand it
				if (filteredChildren.length > 0) {
					toExpand.add(node.id);
				}

				return {
					...node,
					children:
						filteredChildren.length > 0 ? filteredChildren : node.children,
				};
			}

			return null;
		};

		const filtered = nodes
			.map((node) => filterNode(node))
			.filter((node): node is UnifiedTreeNode => node !== null);

		return { filtered, toExpand };
	}, []);

	// Group data sources by type and filter
	const databases = useMemo(
		() =>
			filterDataSources(dataSources.filter((ds) => ds.type === "duckdb")),
		[dataSources, filterDataSources],
	);

	const files = useMemo(
		() =>
			filterDataSources(
				dataSources.filter((ds) =>
					["parquet", "csv", "tsv", "json", "jsonl", "xlsx", "arrow"].includes(
						ds.type,
					),
				),
			),
		[dataSources, filterDataSources],
	);

	// Build unified tree sections and collect nodes to expand
	const { sections: treeSections, nodesToExpand } = useMemo((): {
		sections: TreeSection[];
		nodesToExpand: Set<string>;
	} => {
		const sections: TreeSection[] = [];
		const nodesToExpand = new Set<string>();

		// Local Database Section (Session Tables)
		// Only show when there are actual session tables (hide empty state)
		{
			const localDbNodes: UnifiedTreeNode[] = [];
			let hasSessionTables = false;

			if (localDatabase.isLoading) {
				// Don't show loading state - wait until loaded
			} else if (localDatabase.error) {
				// Show error state
				localDbNodes.push({
					id: "local-db-error",
					name: `Error: ${localDatabase.error}`,
					type: "table",
					icon: <RefreshIcon size={14} />,
					iconColor: "#f44336",
					source: "duckdb",
				});
				hasSessionTables = true; // Show section when there's an error
			} else if (localDatabase.schemas.length === 0) {
				// No session tables - don't show section at all
				hasSessionTables = false;
			} else {
				hasSessionTables = true;
				// Build tree from schemas
				for (const schema of localDatabase.schemas) {
					// For "main" schema, show tables directly
					// For other schemas, show schema as parent node
					if (schema.name === "main") {
						for (const table of schema.tables) {
							const isView = table.type === "view";
							// Different colors: purple for views, amber for temp tables, green for regular
							const tableColor = isView ? "#8b5cf6" : (table.isTemporary ? "#f59e0b" : "#10b981");
							const tableNode: UnifiedTreeNode = {
								id: `session-table-${table.name}`,
								name: table.name,
								type: isView ? "view" : "table",
								icon: isView ? <EyeIcon size={14} /> : <TableIcon size={14} />,
								iconColor: tableColor,
								source: "duckdb",
								metadata: {
									rowCount: table.rowCount,
									columnCount: table.columns.length,
									size: table.size,
									sizeFormatted: table.size ? formatBytes(table.size) : undefined,
								},
								children: table.columns.map((col) => ({
									id: `session-col-${table.name}-${col.name}`,
									name: col.name,
									type: "column" as const,
									icon: <ColumnsIcon size={14} />,
									iconColor: "#6b7280",
									source: "duckdb" as const,
									metadata: {
										dataType: col.type,
										nullable: col.nullable,
									},
								})),
								actions: [
									{
										id: `select-${table.name}`,
										label: "SELECT * FROM",
										onClick: () => onInsertQuery(`SELECT * FROM "${table.name}" LIMIT 100;`),
									},
									{
										id: `info-${table.name}`,
										label: "Show Info",
										onClick: () => setTableInfoModal({
											table: {
												id: table.name,
												name: table.name,
												type: table.type || "table",
												columns: table.columns,
												rowCount: table.rowCount,
											},
											fullName: `"${table.name}"`,
											databaseName: "memory",
											schemaName: "main",
										}),
									},
									{
										id: `drop-${table.name}`,
										label: isView ? "DROP VIEW" : "DROP TABLE",
										onClick: () => onInsertQuery(isView ? `DROP VIEW "${table.name}";` : `DROP TABLE "${table.name}";`),
									},
								],
							};
							localDbNodes.push(tableNode);
						}
					} else {
						// Non-main schema - create a parent node
						const schemaNode: UnifiedTreeNode = {
							id: `local-db-schema-${schema.name}`,
							name: schema.name,
							type: "schema",
							icon: <DatabaseIcon size={14} />,
							source: "duckdb",
							children: schema.tables.map((table) => ({
								id: `local-db-table-${schema.name}-${table.name}`,
								name: table.name,
								type: "table" as const,
								icon: <TableIcon size={14} />,
								iconColor: "#f59e0b", // Amber to match "Session Only" badge
								source: "duckdb" as const,
								metadata: {
									rowCount: table.rowCount,
									columnCount: table.columns.length,
									size: table.size,
									sizeFormatted: table.size ? formatBytes(table.size) : undefined,
								},
								children: table.columns.map((col) => ({
									id: `session-col-${schema.name}-${table.name}-${col.name}`,
									name: col.name,
									type: "column" as const,
									icon: <ColumnsIcon size={14} />,
									iconColor: "#6b7280",
									source: "duckdb" as const,
									metadata: {
										dataType: col.type,
										nullable: col.nullable,
									},
								})),
								actions: [
									{
										id: `select-${schema.name}-${table.name}`,
										label: "SELECT * FROM",
										onClick: () => onInsertQuery(`SELECT * FROM "${schema.name}"."${table.name}" LIMIT 100;`),
									},
								],
							})),
						};
						localDbNodes.push(schemaNode);
					}
				}
			}

			// Apply tree filtering
			const { filtered: filteredLocalDbNodes, toExpand: localDbToExpand } =
				filterTreeNodes(localDbNodes, searchQuery);

			// Only show Session Tables section when there are actual tables
			if (hasSessionTables) {
				sections.push({
					id: "session-tables",
					title: "Session Tables",
					icon: <ClockIcon size={16} />,
					iconColor: "#6b7280", // Neutral gray for section icon
					isCollapsed: collapsedSections.has("session-tables"),
					nodes: filteredLocalDbNodes,
					// Legend hint for temp tables
					hint: '<span style="color:#f59e0b">●</span> temp',
					className: "session-tables-section",
					actions: [
						{
							id: "refresh-session-tables",
							label: "Refresh",
							icon: <RefreshIcon size={14} />,
							onClick: () => localDatabase.refreshSchema(),
						},
					],
				});

				if (searchQuery) {
					localDbToExpand.forEach((id) => nodesToExpand.add(id));
				}
			}
		}

		// Server Databases Section (HTTP mode only)
		// Shows databases attached on the DuckDB server (discovered via duckdb_databases())
		if (isHttpMode && serverDatabases.databases.length > 0) {
			const serverDbNodes: UnifiedTreeNode[] = [];

			for (const db of serverDatabases.databases) {
				const dbNode: UnifiedTreeNode = {
					id: `server-db-${db.name}`,
					name: db.name,
					type: "database",
					icon: <DatabaseIcon size={14} />,
					iconColor: db.readonly ? "#9ca3af" : "#10b981", // Gray if readonly, green if writable
					source: "duckdb",
					metadata: {
						path: db.path,
						readonly: db.readonly,
					},
					children: [],
					actions: [
						{
							id: `detach-${db.name}`,
							label: "DETACH",
							onClick: () => onInsertQuery(`DETACH "${db.name}";`),
						},
					],
				};

				// Add schemas as children
				for (const schema of db.schemas) {
					// For "main" schema, show tables directly under database
					if (schema.name === "main" && db.schemas.length === 1) {
						// Single main schema - show tables directly
						for (const table of schema.tables) {
							const isView = table.type === "view";
							// Purple for views, amber for temp, blue for regular tables
							const tableColor = isView ? "#8b5cf6" : (table.isTemporary ? "#f59e0b" : "#3b82f6");
							const tableNode: UnifiedTreeNode = {
								id: `server-db-${db.name}-table-${table.name}`,
								name: table.name,
								type: isView ? "view" : "table",
								icon: isView ? <EyeIcon size={14} /> : <TableIcon size={14} />,
								iconColor: tableColor,
								source: "duckdb",
								metadata: {
									rowCount: table.rowCount,
									columnCount: table.columns.length,
								},
								children: table.columns.map((col) => ({
									id: `server-db-${db.name}-col-${table.name}-${col.name}`,
									name: col.name,
									type: "column" as const,
									icon: <ColumnsIcon size={14} />,
									iconColor: "#6b7280",
									source: "duckdb" as const,
									metadata: {
										dataType: col.type,
										nullable: col.nullable,
									},
								})),
								actions: [
									{
										id: `select-${db.name}-${table.name}`,
										label: "SELECT * FROM",
										onClick: () => onInsertQuery(`SELECT * FROM "${db.name}"."${schema.name}"."${table.name}" LIMIT 100;`),
									},
									{
										id: `info-${db.name}-${table.name}`,
										label: "Show Info",
										onClick: () => setTableInfoModal({
											table: {
												id: table.name,
												name: table.name,
												type: table.type || "table",
												columns: table.columns,
												rowCount: table.rowCount,
											},
											fullName: `"${db.name}"."${schema.name}"."${table.name}"`,
											databaseName: db.name,
											schemaName: schema.name,
										}),
									},
								],
							};
							dbNode.children!.push(tableNode);
						}
					} else {
						// Multiple schemas or non-main schema - show schema as intermediate node
						const schemaNode: UnifiedTreeNode = {
							id: `server-db-${db.name}-schema-${schema.name}`,
							name: schema.name,
							type: "schema",
							icon: <FolderIcon size={14} />,
							iconColor: "#6b7280",
							source: "duckdb",
							children: schema.tables.map((table) => {
								const isView = table.type === "view";
								const tableColor = isView ? "#8b5cf6" : (table.isTemporary ? "#f59e0b" : "#3b82f6");
								return {
									id: `server-db-${db.name}-table-${schema.name}-${table.name}`,
									name: table.name,
									type: isView ? "view" as const : "table" as const,
									icon: isView ? <EyeIcon size={14} /> : <TableIcon size={14} />,
									iconColor: tableColor,
									source: "duckdb" as const,
									metadata: {
										rowCount: table.rowCount,
										columnCount: table.columns.length,
									},
									children: table.columns.map((col) => ({
										id: `server-db-${db.name}-col-${schema.name}-${table.name}-${col.name}`,
										name: col.name,
										type: "column" as const,
										icon: <ColumnsIcon size={14} />,
										iconColor: "#6b7280",
										source: "duckdb" as const,
										metadata: {
											dataType: col.type,
											nullable: col.nullable,
										},
									})),
									actions: [
										{
											id: `select-${db.name}-${schema.name}-${table.name}`,
											label: "SELECT * FROM",
											onClick: () => onInsertQuery(`SELECT * FROM "${db.name}"."${schema.name}"."${table.name}" LIMIT 100;`),
										},
										{
											id: `info-${db.name}-${schema.name}-${table.name}`,
											label: "Show Info",
											onClick: () => setTableInfoModal({
												table: {
													id: table.name,
													name: table.name,
													type: table.type || "table",
													columns: table.columns,
													rowCount: table.rowCount,
												},
												fullName: `"${db.name}"."${schema.name}"."${table.name}"`,
												databaseName: db.name,
												schemaName: schema.name,
											}),
										},
									],
								};
							}),
						};
						dbNode.children!.push(schemaNode);
					}
				}

				serverDbNodes.push(dbNode);
			}

			// Apply tree filtering
			const { filtered: filteredServerDbNodes, toExpand: serverDbToExpand } =
				filterTreeNodes(serverDbNodes, searchQuery);

			sections.push({
				id: "server-databases",
				title: "Attached Databases",
				icon: <DatabaseIcon size={16} />,
				iconColor: "#10b981", // Green to indicate server connection
				isCollapsed: collapsedSections.has("server-databases"),
				nodes: filteredServerDbNodes,
				actions: [
					{
						id: "refresh-server-databases",
						label: "Refresh",
						icon: <RefreshIcon size={14} />,
						onClick: () => serverDatabases.refreshDatabases(),
					},
				],
			});

			if (searchQuery) {
				serverDbToExpand.forEach((id) => nodesToExpand.add(id));
			}
		}

		// Databases Section (attached DuckDB files) - WASM mode only
		// In HTTP mode, we use the Server Databases section instead
		if (!isHttpMode && databases.length > 0) {
			const dbNodes = convertDatabasesToTreeNodes(
				databases,
				onInsertQuery,
				onDatabaseDelete,
				(db) => {
					onRestoreAccess?.(db);
				},
				(db) => {
					onReattachDatabase?.(db);
				},
				(db) => {
					onToggleWriteMode?.(db);
				},
				(db) => {
					onRefreshMetadata?.(db);
				},
			);

			// Apply tree filtering if search query exists
			const { filtered: filteredDbNodes, toExpand: dbToExpand } =
				filterTreeNodes(dbNodes, searchQuery);

			// Calculate total size for all databases
			const totalDbSize = databases.reduce(
				(sum, db) => sum + (db.size || 0),
				0,
			);

			sections.push({
				id: "databases",
				title: "DuckDB Databases",
				icon: <DatabaseIcon size={16} />,
				isCollapsed: collapsedSections.has("databases"),
				nodes: filteredDbNodes,
				totalSize: totalDbSize > 0 ? totalDbSize : undefined,
			});

			// Collect nodes to expand (will be applied in useEffect)
			if (searchQuery) {
				dbToExpand.forEach((id) => nodesToExpand.add(id));
			}
		}

		// Local Files Section (files with file handles, not remote)
		// Skip in HTTP mode - server has direct filesystem access, no need for file handles
		const localFiles = files.filter((f) => !f.isRemote);
		if (!isHttpMode && localFiles.length > 0) {
			const localFileNodes = convertFilesToTreeNodes(
				localFiles,
				onInsertQuery,
				onFileDelete,
				(file) => {
					onReloadFile?.(file);
				},
				(file) => {
					onRestoreAccess?.(file);
				},
				onDeleteFolder,
				onDeleteDomain,
				async (file) => {
					await onRefreshMetadata?.(file);
				},
				explorerSortOrder,
			);

			// Apply tree filtering if search query exists
			const { filtered: filteredLocalNodes, toExpand: localToExpand } =
				filterTreeNodes(localFileNodes, searchQuery);
			const totalLocalSize = localFiles.reduce(
				(sum, f) => sum + (f.size || 0),
				0,
			);

			sections.push({
				id: "local-files",
				title: "Local Files",
				icon: <FileIcon size={16} />,
				isCollapsed: collapsedSections.has("local-files"),
				nodes: filteredLocalNodes,
				totalSize: totalLocalSize > 0 ? totalLocalSize : undefined,
			});

			// Collect nodes to expand (will be applied in useEffect)
			if (searchQuery) {
				localToExpand.forEach((id) => nodesToExpand.add(id));
			}
		}

		// Remote Files Section (remote URL files, grouped by domain)
		const remoteFiles = files.filter((f) => f.isRemote);
		if (remoteFiles.length > 0) {
			const remoteFileNodes = convertFilesToTreeNodes(
				remoteFiles,
				onInsertQuery,
				onFileDelete,
				(file) => {
					onReloadFile?.(file);
				},
				(file) => {
					onRestoreAccess?.(file);
				},
				onDeleteFolder,
				onDeleteDomain,
				async (file) => {
					await onRefreshMetadata?.(file);
				},
				explorerSortOrder,
			);

			// Apply tree filtering if search query exists
			const { filtered: filteredRemoteNodes, toExpand: remoteToExpand } =
				filterTreeNodes(remoteFileNodes, searchQuery);
			const totalRemoteSize = remoteFiles.reduce(
				(sum, f) => sum + (f.size || 0),
				0,
			);

			sections.push({
				id: "remote-files",
				title: "Remote Files",
				icon: <CloudIcon size={16} />,
				isCollapsed: collapsedSections.has("remote-files"),
				nodes: filteredRemoteNodes,
				totalSize: totalRemoteSize > 0 ? totalRemoteSize : undefined,
			});

			// Collect nodes to expand (will be applied in useEffect)
			if (searchQuery) {
				remoteToExpand.forEach((id) => nodesToExpand.add(id));
			}
		}

		// Cloud Connections Section (BigQuery)
		// Skip in HTTP mode - use native BigQuery extension instead
		if (!isHttpMode && isBigQueryConnected) {
			let bqNodes: UnifiedTreeNode[] = [];

			if (bigQueryData.length > 0) {
				// Data has been loaded, show the tree
				bqNodes = convertBigQueryToTreeNodes(
					bigQueryData,
					(sql) => onInsertQuery(sql, "bigquery"),
					(table, fullName) => setTableInfoModal({ table, fullName }),
				);
			} else {
				// Not loaded yet, show a load trigger (double-click or Enter to load)
				bqNodes = [
					{
						id: "bigquery-load-trigger",
						name: "Double-click to load",
						type: "connection",
						icon: <RefreshIcon size={14} />,
						iconColor: "#4285f4",
						source: "bigquery",
					},
				];
			}

			// Apply tree filtering if search query exists
			const { filtered: filteredBqNodes, toExpand: bqToExpand } =
				filterTreeNodes(bqNodes, searchQuery);

			sections.push({
				id: "cloud",
				title: "BigQuery (Cloud)",
				icon: <CloudIcon size={16} />,
				isCollapsed: collapsedSections.has("cloud"),
				nodes: filteredBqNodes,
			});

			// Collect nodes to expand (will be applied in useEffect)
			if (searchQuery) {
				bqToExpand.forEach((id) => nodesToExpand.add(id));
			}
		}

		return { sections, nodesToExpand };
	}, [
		isBigQueryConnected,
		bigQueryData,
		collapsedSections,
		onInsertQuery,
		onReloadFile,
		onFileDelete,
		onDatabaseDelete,
		loadBigQueryData,
		searchQuery,
		explorerSortOrder,
		databases,
		files,
		filterTreeNodes,
		onDeleteDomain,
		onDeleteFolder,
		onReattachDatabase,
		onRestoreAccess,
		localDatabase,
		isHttpMode,
		serverDatabases,
	]);

	// Apply node expansion in useEffect (not during render)
	useEffect(() => {
		if (nodesToExpand.size > 0) {
			setExpandedNodes((prev) => new Set([...prev, ...nodesToExpand]));
		}
	}, [nodesToExpand]);

	// Apply node expansion state
	const updateNodeExpansion = useCallback((nodes: UnifiedTreeNode[]): UnifiedTreeNode[] => {
		return nodes.map((node) => ({
			...node,
			isExpanded: expandedNodes.has(node.id) || node.isExpanded,
			children: node.children ? updateNodeExpansion(node.children) : undefined,
		}));
	}, [expandedNodes]);

	const sectionsWithExpansion = useMemo(() => {
		return treeSections.map((section) => ({
			...section,
			nodes: updateNodeExpansion(section.nodes),
		}));
	}, [treeSections, updateNodeExpansion]);

	// Handle section toggle
	const handleSectionToggle = useCallback((sectionId: string) => {
		setCollapsedSections((prev) => {
			const newCollapsed = new Set(prev);
			if (newCollapsed.has(sectionId)) {
				newCollapsed.delete(sectionId);
			} else {
				newCollapsed.add(sectionId);
			}
			localStorage.setItem(
				"explorer-collapsed-sections",
				JSON.stringify(Array.from(newCollapsed)),
			);
			return newCollapsed;
		});
	}, []);

	// Collect all expandable node IDs from tree sections
	const collectAllNodeIds = useCallback((nodes: UnifiedTreeNode[]): string[] => {
		const ids: string[] = [];
		const collect = (nodeList: UnifiedTreeNode[]) => {
			for (const node of nodeList) {
				if (node.children && node.children.length > 0) {
					ids.push(node.id);
					collect(node.children);
				}
			}
		};
		collect(nodes);
		return ids;
	}, []);

	// Expand all nodes
	const expandAll = useCallback(() => {
		const allIds: string[] = [];
		for (const section of treeSections) {
			allIds.push(...collectAllNodeIds(section.nodes));
		}
		setExpandedNodes(new Set(allIds));
		// Also expand all sections
		setCollapsedSections(new Set());
		localStorage.setItem("explorer-collapsed-sections", JSON.stringify([]));
	}, [treeSections, collectAllNodeIds]);

	// Collapse all nodes
	const collapseAll = useCallback(() => {
		setExpandedNodes(new Set());
	}, []);

	return {
		// State
		searchQuery,
		setSearchQuery,
		selectedNodeId,
		setSelectedNodeId,
		expandedNodes,
		setExpandedNodes,
		tableInfoModal,
		setTableInfoModal,
		isBigQueryConnected,

		// Processed data
		treeSections: sectionsWithExpansion,
		databases,
		files,

		// Handlers
		handleSectionToggle,
		loadBigQueryData,
		expandAll,
		collapseAll,

		// Local database
		refreshLocalDatabase: localDatabase.refreshSchema,

		// Server databases (HTTP mode)
		refreshServerDatabases: serverDatabases.refreshDatabases,

		// Pinned projects
		pinnedProjects,
		showAddProjectInput,
		setShowAddProjectInput,
		addPinnedProject,
		removePinnedProject,
	};
}
