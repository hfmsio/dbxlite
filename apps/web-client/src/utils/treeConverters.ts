/**
 * Tree Data Converters
 *
 * Utilities to convert BigQuery, DuckDB, and File data structures
 * into the unified tree format.
 */

import type { CatalogInfo, SchemaInfo, TableMetadata } from "@ide/connectors";
import React from "react";
import type { Column, ConnectorType, DataSource } from "../types/data-source";
import type { BadgeSuffix, TreeNodeAction, TreeNodeType, UnifiedTreeNode } from "../types/tree";
import { createLogger } from "./logger";

const logger = createLogger("TreeConverters");

/**
 * BigQuery project structure for tree conversion
 */
interface BigQueryProject extends CatalogInfo {
	datasets: BigQueryDataset[];
}

interface BigQueryDataset extends SchemaInfo {
	tables: TableMetadata[];
}

import {
	BarChartIcon,
	CloudIcon,
	ColumnsIcon,
	CopyIcon,
	DatabaseIcon,
	EditIcon,
	EyeIcon,
	FileIcon,
	FileTextIcon,
	FolderIcon,
	InfoIcon,
	KeyIcon,
	PackageIcon,
	RefreshIcon,
	TableIcon,
	TrashIcon,
} from "../components/Icons";
import { extractNestedFields, isComplexType } from "./typeFormatter";

/**
 * Format file size in human-readable format
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

/**
 * Recursively create tree nodes for nested type fields
 */
function createNestedTypeNodes(
	parentId: string,
	dataType: string,
	source: "bigquery" | "duckdb" | "file",
): UnifiedTreeNode[] {
	if (!isComplexType(dataType)) {
		return [];
	}

	const fields = extractNestedFields(dataType);
	return fields.map((field) => {
		const fieldId = `${parentId}.${field.name}`;
		const nestedChildren = createNestedTypeNodes(fieldId, field.type, source);

		return {
			id: fieldId,
			name: field.name,
			type: "column",
			// Only show icon for leaf columns (no children)
			icon:
				nestedChildren.length > 0
					? ""
					: React.createElement(ColumnsIcon, { size: 14 }),
			iconColor: "#6b7280",
			metadata: {
				dataType: field.type,
			},
			children: nestedChildren.length > 0 ? nestedChildren : undefined,
			isExpanded: false,
			source,
			sourceData: field,
		};
	});
}

/**
 * Helper: Group remote files by domain and path for hierarchical display
 */
function groupRemoteFiles(
	files: DataSource[],
): Map<string, Map<string, DataSource[]>> {
	const grouped = new Map<string, Map<string, DataSource[]>>();

	for (const file of files) {
		if (!file.remoteFileGroup) continue; // Skip files without grouping

		const { domain, path } = file.remoteFileGroup;

		if (!grouped.has(domain)) {
			grouped.set(domain, new Map());
		}

		const domainGroup = grouped.get(domain)!;
		if (!domainGroup.has(path)) {
			domainGroup.set(path, []);
		}

		domainGroup.get(path)?.push(file);
	}

	return grouped;
}

/**
 * Helper: Format row/column count for display
 */
function formatCount(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}M`;
	} else if (count >= 1_000) {
		return `${(count / 1_000).toFixed(1)}K`;
	}
	return count.toString();
}

/**
 * Convert local files to unified tree nodes
 */
export function convertFilesToTreeNodes(
	files: DataSource[],
	onInsertQuery: (query: string, connectorType?: ConnectorType) => void,
	onDeleteFile: (id: string) => void,
	onReloadFile: (source: DataSource) => void,
	onRestoreAccess: (source: DataSource) => void,
	onDeleteFolder: (domain: string, path: string) => void,
	onDeleteDomain: (domain: string) => void,
	onRefreshMetadata: (source: DataSource) => Promise<void>,
	sortBy: "none" | "name" | "type" | "size" = "none",
): UnifiedTreeNode[] {
	// Apply sorting if requested
	const sortedFiles =
		sortBy === "none"
			? files
			: [...files].sort((a, b) => {
					switch (sortBy) {
						case "name":
							return a.name.localeCompare(b.name);
						case "type": {
							// First sort by type, then by name within each type
							const typeOrder = {
								duckdb: 0,
								parquet: 1,
								csv: 2,
								tsv: 3,
								json: 4,
								jsonl: 5,
								xlsx: 6,
								arrow: 7,
								connection: 8,
							};
							const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 99;
							const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 99;
							if (typeA !== typeB) return typeA - typeB;
							return a.name.localeCompare(b.name);
						}
						case "size":
							return (b.size || 0) - (a.size || 0); // Largest first
						default:
							return 0;
					}
				});

	// Separate remote files with grouping from other files
	const remoteGroupedFiles: DataSource[] = [];
	const regularFiles: DataSource[] = [];

	for (const file of sortedFiles) {
		if (file.isRemote && file.remoteFileGroup) {
			remoteGroupedFiles.push(file);
		} else {
			regularFiles.push(file);
		}
	}

	// Create helper function to build file node (extracted from the map below)
	const createFileNode = (file: DataSource): UnifiedTreeNode => {
		const isDatabase = file.type === "duckdb";
		const isDatabaseAttached = file.isAttached === true;

		// For SQL generation: use full URL for remote files, filename for local files
		const fileReference =
			file.isRemote && file.remoteURL ? file.remoteURL : file.name;

		// Determine icon based on file type
		let icon: React.ReactElement = React.createElement(FileIcon, { size: 14 });
		let iconColor;
		if (file.type === "csv" || file.type === "tsv") {
			icon = React.createElement(BarChartIcon, { size: 14 });
			iconColor = "#10b981"; // Green for CSV/TSV
		} else if (file.type === "parquet" || file.type === "arrow") {
			icon = React.createElement(PackageIcon, { size: 14 });
			iconColor = "#8b5cf6"; // Purple for Parquet/Arrow
		} else if (file.type === "json" || file.type === "jsonl") {
			icon = React.createElement(FileTextIcon, { size: 14 });
			iconColor = "#f59e0b"; // Orange for JSON/JSONL
		} else if (file.type === "xlsx") {
			icon = React.createElement(FileTextIcon, { size: 14 });
			iconColor = "#047857"; // Dark green for Excel (distinct from CSV)
		} else if (file.type === "duckdb") {
			icon = React.createElement(DatabaseIcon, { size: 14 });
			iconColor = "#3b82f6"; // Blue for DuckDB
		}

		// Build actions
		const actions: TreeNodeAction[] = [];

		if (isDatabase && isDatabaseAttached) {
			// Database file actions
			actions.push({
				id: "browse",
				label: "Browse Tables",
				icon: React.createElement(EyeIcon, { size: 14 }),
				onClick: () => {
					// This will be handled by the parent component
					logger.debug("Browse database:", file.name);
				},
			});
		} else {
			// Data file actions
			actions.push({
				id: "select-all",
				label: "Select All Columns",
				icon: React.createElement(TableIcon, { size: 14 }),
				onClick: () => {
					onInsertQuery(`SELECT * FROM '${fileReference}';`, "duckdb");
				},
			});

			if (file.columns && file.columns.length > 0) {
				actions.push({
					id: "select-columns",
					label: "Select with Columns",
					icon: React.createElement(ColumnsIcon, { size: 14 }),
					onClick: () => {
						const cols = file.columns?.map((c) => c.name).join(", ");
						onInsertQuery(`SELECT ${cols} FROM '${fileReference}';`, "duckdb");
					},
				});
			}

			actions.push({
				id: "preview",
				label: "Preview Data",
				icon: React.createElement(EyeIcon, { size: 14 }),
				onClick: () => {
					onInsertQuery(
						`SELECT * FROM '${fileReference}' LIMIT 100;`,
						"duckdb",
					);
				},
			});

			actions.push({
				id: "describe",
				label: "Describe Schema",
				icon: React.createElement(TableIcon, { size: 14 }),
				onClick: () => {
					onInsertQuery(`DESCRIBE SELECT * FROM '${fileReference}';`, "duckdb");
				},
			});

			actions.push({
				id: "profile",
				label: "Profile Data",
				icon: React.createElement(BarChartIcon, { size: 14 }),
				onClick: () => {
					onInsertQuery(
						`SUMMARIZE SELECT * FROM '${fileReference}';`,
						"duckdb",
					);
				},
			});
		}

		// Refresh metadata action - re-introspects schema and row count without re-uploading
		actions.push({
			id: "refresh-metadata",
			label: "Refresh Metadata",
			icon: React.createElement(RefreshIcon, { size: 14 }),
			separator: true,
			onClick: () => onRefreshMetadata(file),
			tooltip: "Re-introspect schema and row count (quick refresh)",
		});

		// Re-upload file action - opens file picker to replace the file
		actions.push({
			id: "reupload",
			label: "Re-upload File",
			icon: React.createElement(RefreshIcon, { size: 14 }),
			onClick: () => onReloadFile(file),
			tooltip: "Replace file from disk (opens file picker)",
		});

		// Add "Restore Access" action for files with failed restoration
		if (file.restoreFailed || file.introspectionError) {
			actions.push({
				id: "restore-access",
				label: "Restore Access",
				icon: React.createElement(RefreshIcon, { size: 14 }),
				onClick: () => onRestoreAccess(file),
				style: { color: "#10b981" }, // Green to indicate positive action
				tooltip: "Re-grant file permissions (use after page refresh)",
			});
		}

		actions.push({
			id: "delete",
			label: "Remove from Workspace",
			icon: React.createElement(TrashIcon, { size: 14 }),
			onClick: () => onDeleteFile(file.id),
			style: { color: "#ef4444" },
		});

		// Determine badge, color, and suffixes based on file state
		let badge: string | undefined;
		let badgeColor: string | undefined;
		const badgeSuffixes: BadgeSuffix[] = [];

		// Primary badge (only for error states and remote files)
		if (file.restoreFailed || file.introspectionError) {
			badge = "❌ FAILED";
			badgeColor = "rgba(239, 68, 68, 0.15)"; // Subtle red for failed restoration
			iconColor = "#ef4444"; // Also make icon red
		} else if (file.isRemote) {
			badge = "☁️ REMOTE";
			badgeColor = "rgba(245, 158, 11, 0.15)"; // Subtle orange for remote files
		}

		// Suffix icons - Order by priority descending: ZERO-COPY (2), ATTACHED (1), RW/RO (0)
		// Collapse progression: RW/RO label first, ATTACHED label second, ZERO-COPY label last
		if (!file.isRemote && !file.restoreFailed && !file.introspectionError) {
			// ZERO-COPY or VOLATILE (mutually exclusive)
			if (file.hasFileHandle) {
				badgeSuffixes.push({
					icon: "⚡",
					label: "ZERO-COPY",
					tooltip: "Persistent file access - no re-upload needed",
					priority: 2, // Collapse last (leftmost)
				});
			} else if (file.isVolatile) {
				badgeSuffixes.push({
					icon: "💾",
					label: "VOLATILE",
					tooltip: "In-memory only - will be lost on refresh",
					priority: 2, // Same priority as ZERO-COPY (mutually exclusive)
				});
			}
		}

		// ATTACHED badge for DuckDB databases
		if (isDatabase && isDatabaseAttached) {
			badgeSuffixes.push({
				icon: "🔗",
				label: "ATTACHED",
				tooltip: "Database is attached to DuckDB session",
				priority: 1, // Collapse second (middle)
			});

			// Access mode suffix (RW/RO)
			if (file.isReadOnly === false) {
				badgeSuffixes.push({
					icon: "✏️",
					label: "RW",
					tooltip: "Database is writable (READ_WRITE mode)",
					priority: 0, // Collapse first (rightmost)
				});
			} else {
				badgeSuffixes.push({
					icon: "🔒",
					label: "RO",
					tooltip: "Database is read-only",
					priority: 0, // Collapse first (rightmost)
				});
			}
		}

		// Add children for files with known structure
		// Phase 1: For XLSX with multiple sheets, show sheet nodes (no columns yet)
		// Phase 2: Can add lazy column loading per sheet on expand
		const children: UnifiedTreeNode[] = [];

		if (!isDatabaseAttached) {
			// XLSX files with multiple sheets: Create sheet nodes
			if (file.type === "xlsx" && file.sheets && file.sheets.length > 1) {
				for (const sheet of file.sheets) {
					const sheetId = `${file.id}.sheet.${sheet.name}`;

					// Phase 2: Create column nodes if sheet has been introspected
					const sheetChildren: UnifiedTreeNode[] = [];
					if (
						sheet.columns &&
						Array.isArray(sheet.columns) &&
						sheet.columns.length > 0
					) {
						for (const column of sheet.columns) {
							const columnId = `${sheetId}.${column.name}`;
							const nestedChildren = createNestedTypeNodes(
								columnId,
								column.type,
								"file",
							);

							sheetChildren.push({
								id: columnId,
								name: column.name,
								type: "column",
								icon: column.isPrimaryKey
									? React.createElement(KeyIcon, { size: 14 })
									: nestedChildren.length > 0
										? ""
										: React.createElement(ColumnsIcon, { size: 14 }),
								iconColor: column.isPrimaryKey ? "#f59e0b" : "#6b7280",
								metadata: {
									dataType: column.type,
									nullable: column.nullable,
									isPrimaryKey: column.isPrimaryKey,
								},
								children:
									nestedChildren.length > 0 ? nestedChildren : undefined,
								isExpanded: false,
								source: "file",
								sourceData: column,
							});
						}
					}

					children.push({
						id: sheetId,
						name: sheet.name,
						type: "table", // Treat sheets like tables
						icon: React.createElement(TableIcon, { size: 14 }),
						iconColor: "#059669", // Green for Excel sheets
						badge: sheet.rowCount ? formatCount(sheet.rowCount) : undefined,
						// Phase 2: Show columns when available (undefined = not loaded, [] = no columns, [...] = columns)
						children: sheetChildren.length > 0 ? sheetChildren : undefined,
						isExpanded: false,
						metadata: {
							sheetIndex: sheet.index,
							rowCount: sheet.rowCount,
							columnCount: sheet.columnCount,
						},
						actions: [
							{
								id: "query-sheet",
								label: "Query Sheet",
								icon: React.createElement(TableIcon, { size: 14 }),
								onClick: () => {
									// Use DuckDB's native read_xlsx function with sheet parameter
									onInsertQuery(
										`SELECT * FROM read_xlsx('${fileReference}', sheet='${sheet.name}') LIMIT 100;`,
										"duckdb",
									);
								},
							},
							{
								id: "select-all-sheet",
								label: "Select All from Sheet",
								icon: React.createElement(TableIcon, { size: 14 }),
								onClick: () => {
									onInsertQuery(
										`SELECT * FROM read_xlsx('${fileReference}', sheet='${sheet.name}');`,
										"duckdb",
									);
								},
							},
						],
						source: "file",
						sourceData: sheet,
					});
				}
			} else if (
				file.columns &&
				Array.isArray(file.columns) &&
				file.columns.length > 0
			) {
				// Non-XLSX or single-sheet XLSX: Show columns directly
				for (const column of file.columns) {
					const columnId = `${file.id}.${column.name}`;
					const nestedChildren = createNestedTypeNodes(
						columnId,
						column.type,
						"file",
					);

					children.push({
						id: columnId,
						name: column.name,
						type: "column",
						// Only show icon for leaf columns (no children) or primary keys
						icon: column.isPrimaryKey
							? React.createElement(KeyIcon, { size: 14 })
							: nestedChildren.length > 0
								? ""
								: React.createElement(ColumnsIcon, { size: 14 }),
						iconColor: column.isPrimaryKey ? "#f59e0b" : "#6b7280",
						metadata: {
							dataType: column.type,
							nullable: column.nullable,
							isPrimaryKey: column.isPrimaryKey,
						},
						children: nestedChildren.length > 0 ? nestedChildren : undefined,
						isExpanded: false,
						source: "file",
						sourceData: column,
					});
				}
			}
		}

		// Sheet count for XLSX files
		const sheetCount = file.type === "xlsx" && file.sheets && file.sheets.length > 1
			? file.sheets.length
			: undefined;

		// Multi-sheet XLSX files: show sheet count as primary badge
		if (sheetCount && !badge) {
			badge = `📑 ${sheetCount} sheets`;
			badgeColor = "rgba(16, 185, 129, 0.15)"; // Subtle green
		}

		return {
			id: file.id,
			name: file.name,
			type: "file",
			icon,
			iconColor,
			badge,
			badgeColor,
			badgeSuffixes: badgeSuffixes.length > 0 ? badgeSuffixes : undefined,
			children: children.length > 0 ? children : undefined,
			isExpanded: false, // Start collapsed like database tables
			metadata: {
				size: file.size,
				sizeFormatted: file.size ? formatBytes(file.size) : undefined,
				rowCount: file.isIntrospecting ? undefined : file.stats?.rowCount,
				columnCount: file.isIntrospecting ? undefined : file.columns?.length,
				sheetCount, // For XLSX with multiple sheets
				isRemote: file.isRemote,
				hasFileHandle: file.hasFileHandle,
				isAttached: file.isAttached,
				attachedAs: file.attachedAs,
			},
			actions,
			source: "file",
			sourceData: file,
		};
	};

	// Build tree nodes for regular files (non-grouped)
	const regularNodes: UnifiedTreeNode[] = regularFiles.map(createFileNode);

	// Build hierarchical tree for remote grouped files
	const remoteGrouped = groupRemoteFiles(remoteGroupedFiles);
	const remoteNodes: UnifiedTreeNode[] = [];

	// Create domain → path → file hierarchy
	for (const [domain, pathMap] of remoteGrouped.entries()) {
		const pathNodes: UnifiedTreeNode[] = [];

		for (const [path, filesInPath] of pathMap.entries()) {
			const fileNodes = filesInPath.map(createFileNode);

			// Create path folder node
			pathNodes.push({
				id: `remote-path-${domain}-${path}`,
				name: path || "(root)",
				type: "dataset" as TreeNodeType,
				icon: React.createElement(FolderIcon, { size: 14 }),
				iconColor: "#6b7280",
				badge: `${filesInPath.length} file${filesInPath.length > 1 ? "s" : ""}`,
				badgeColor: "rgba(156, 163, 175, 0.15)",
				children: fileNodes,
				isExpanded: false,
				source: "file",
				sourceData: { domain, path }, // Metadata for debugging
				actions: [
					{
						id: "delete-folder",
						label: "Remove from Workspace",
						icon: React.createElement(TrashIcon, { size: 14 }),
						onClick: () => onDeleteFolder(domain, path),
						style: { color: "#ef4444" },
						tooltip: `Remove all ${filesInPath.length} file${filesInPath.length > 1 ? "s" : ""} from this folder`,
					},
				],
			});
		}

		// Calculate total files in this domain
		const totalFilesInDomain = Array.from(pathMap.values()).reduce(
			(sum, files) => sum + files.length,
			0,
		);

		// Create domain folder node
		remoteNodes.push({
			id: `remote-domain-${domain}`,
			name: domain,
			type: "dataset" as TreeNodeType,
			icon: React.createElement(CloudIcon, { size: 14 }),
			iconColor: "#3b82f6",
			badge: `${pathNodes.length} location${pathNodes.length > 1 ? "s" : ""}`,
			badgeColor: "rgba(59, 130, 246, 0.15)",
			children: pathNodes,
			isExpanded: false,
			source: "file",
			sourceData: { domain }, // Metadata for debugging
			actions: [
				{
					id: "delete-domain",
					label: "Remove from Workspace",
					icon: React.createElement(TrashIcon, { size: 14 }),
					onClick: () => onDeleteDomain(domain),
					style: { color: "#ef4444" },
					tooltip: `Remove all ${totalFilesInDomain} file${totalFilesInDomain > 1 ? "s" : ""} from this domain`,
				},
			],
		});
	}

	// Return combined array: remote folders first, then regular files
	return [...remoteNodes, ...regularNodes];
}

/**
 * Convert DuckDB databases to unified tree nodes
 */
export function convertDatabasesToTreeNodes(
	databases: DataSource[],
	onInsertQuery: (query: string, connectorType?: ConnectorType) => void,
	onDetachDatabase: (dbName: string) => void,
	onRestoreAccess: (database: DataSource) => void,
	onReattachDatabase: (database: DataSource) => void,
	onToggleWriteMode?: (database: DataSource) => void,
	onRefreshMetadata?: (database: DataSource) => void,
): UnifiedTreeNode[] {
	return databases.map((db): UnifiedTreeNode => {
		const children: UnifiedTreeNode[] = [];

		// Convert schemas
		if (db.schemas && Array.isArray(db.schemas)) {
			for (const schema of db.schemas) {
				const schemaChildren: UnifiedTreeNode[] = [];

				// Convert tables
				if (schema.tables && Array.isArray(schema.tables)) {
					for (const table of schema.tables) {
						const tableChildren: UnifiedTreeNode[] = [];

						// Convert columns
						if (table.columns && Array.isArray(table.columns)) {
							for (const column of table.columns) {
								const columnId = `${db.name}.${schema.name}.${table.name}.${column.name}`;
								const nestedChildren = createNestedTypeNodes(
									columnId,
									column.type,
									"duckdb",
								);

								tableChildren.push({
									id: columnId,
									name: column.name,
									type: "column",
									// Only show icon for leaf columns (no children) or primary keys
									icon: column.isPrimaryKey
										? React.createElement(KeyIcon, { size: 14 })
										: nestedChildren.length > 0
											? ""
											: React.createElement(ColumnsIcon, { size: 14 }),
									iconColor: column.isPrimaryKey ? "#f59e0b" : "#6b7280",
									metadata: {
										dataType: column.type,
										nullable: column.nullable,
										isPrimaryKey: column.isPrimaryKey,
									},
									children:
										nestedChildren.length > 0 ? nestedChildren : undefined,
									isExpanded: false,
									source: "duckdb",
									sourceData: column,
								});
							}
						}

						// Use attachedAs (the actual DB alias) instead of name (which may have display suffix)
						const dbAlias = db.attachedAs || db.name;
						const tableName = `${dbAlias}.${schema.name}.${table.name}`;
						const tableActions: TreeNodeAction[] = [
							{
								id: "select-all",
								label: "Select All Columns",
								icon: React.createElement(TableIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(`SELECT * FROM ${tableName};`, "duckdb"),
							},
							{
								id: "select-columns",
								label: "Select with Columns",
								icon: React.createElement(ColumnsIcon, { size: 14 }),
								onClick: () => {
									const cols = table.columns
										.map((c: Column) => c.name)
										.join(", ");
									onInsertQuery(`SELECT ${cols} FROM ${tableName};`, "duckdb");
								},
							},
							{
								id: "preview",
								label: "Preview Data",
								icon: React.createElement(EyeIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(
										`SELECT * FROM ${tableName} LIMIT 100;`,
										"duckdb",
									),
							},
							{
								id: "count",
								label: "Count Rows",
								icon: React.createElement(BarChartIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(`SELECT COUNT(*) FROM ${tableName};`, "duckdb"),
							},
						];

						schemaChildren.push({
							id: `${db.name}.${schema.name}.${table.name}`,
							name: table.name,
							type: "table",
							icon: React.createElement(TableIcon, { size: 14 }),
							children: tableChildren,
							isExpanded: false,
							metadata: {
								rowCount: table.rowCount,
								tableType: table.type === "materialized_view" ? "view" : (table.type as "table" | "view" | "external" | undefined) || "table",
							},
							actions: tableActions,
							source: "duckdb",
							sourceData: {
								...table,
								fullName: tableName, // Include full qualified name for SQL generation
							},
						});
					}
				}

				children.push({
					id: `${db.name}.${schema.name}`,
					name: schema.name,
					type: "schema",
					icon: React.createElement(FolderIcon, { size: 14 }),
					iconColor: "#6b7280",
					children: schemaChildren,
					isExpanded: false, // Collapsed by default, user can expand
					source: "duckdb",
					sourceData: schema,
				});
			}
		}

		const dbActions: TreeNodeAction[] = [];
		if (db.name !== "memory" && db.name !== "system") {
			// Add "Refresh Metadata" for attached databases
			if (db.isAttached && onRefreshMetadata) {
				dbActions.push({
					id: "refresh-metadata",
					label: "Refresh Metadata",
					icon: React.createElement(RefreshIcon, { size: 14 }),
					onClick: () => onRefreshMetadata(db),
					tooltip: "Refresh schema and table information",
				});
			}

			// Add "Enable Write Mode" / "Enable Read-Only" toggle for attached databases
			if (db.isAttached && onToggleWriteMode) {
				dbActions.push({
					id: "toggle-write-mode",
					label: db.isReadOnly !== false ? "Enable Write Mode" : "Enable Read-Only",
					icon: React.createElement(EditIcon, { size: 14 }),
					onClick: () => onToggleWriteMode(db),
					tooltip: db.isReadOnly !== false
						? "Reattach database with write permissions (allows CREATE/INSERT/UPDATE)"
						: "Reattach database in read-only mode (safer, prevents modifications)",
				});
			}

			// Add "Reattach Database" for attached databases (for schema refresh)
			if (db.isAttached) {
				dbActions.push({
					id: "reattach",
					label: "Reattach Database",
					icon: React.createElement(RefreshIcon, { size: 14 }),
					separator: true,
					onClick: () => onReattachDatabase(db),
					tooltip: "Re-introspect schema (use when database changed on disk)",
				});
			}

			// Add "Restore Access" for databases with failed restoration
			if (db.restoreFailed || db.introspectionError) {
				dbActions.push({
					id: "restore-access",
					label: "Restore Access",
					icon: React.createElement(RefreshIcon, { size: 14 }),
					onClick: () => onRestoreAccess(db),
					style: { color: "#10b981" }, // Green to indicate positive action
					tooltip:
						"Re-grant database file permissions (use after page refresh)",
				});
			}

			dbActions.push({
				id: "detach",
				label: "Detach Database",
				icon: React.createElement(TrashIcon, { size: 14 }),
				// Use attachedAs (actual DB alias) instead of name (display name with suffix)
				onClick: () => onDetachDatabase(db.attachedAs || db.name),
				style: { color: "#ef4444" },
			});
		}

		// Determine badge, color, and suffixes based on database state
		let badge: string | undefined;
		let badgeColor: string | undefined;
		let dbIconColor = "#3b82f6";
		const badgeSuffixes: BadgeSuffix[] = [];

		// Primary badge (only for error states)
		if (db.restoreFailed || db.introspectionError) {
			badge = "❌ FAILED";
			badgeColor = "rgba(239, 68, 68, 0.15)"; // Subtle red for failed restoration
			dbIconColor = "#ef4444"; // Also make icon red
		}

		// Suffix icons - Order by priority descending: ZERO-COPY (2), ATTACHED (1), RW/RO (0)
		// Collapse progression: RW/RO label first, ATTACHED label second, ZERO-COPY label last
		if (db.hasFileHandle && !db.isRemote) {
			badgeSuffixes.push({
				icon: "⚡",
				label: "ZERO-COPY",
				tooltip: "Direct file access - no re-upload needed",
				priority: 2, // Collapse last (leftmost)
			});
		}

		if (db.isAttached) {
			badgeSuffixes.push({
				icon: "🔗",
				label: "ATTACHED",
				tooltip: "Database is attached to DuckDB session",
				priority: 1, // Collapse second (middle)
			});

			// Access mode suffix (RW/RO)
			if (db.isReadOnly === false) {
				badgeSuffixes.push({
					icon: "✏️",
					label: "RW",
					tooltip: "Database is writable (READ_WRITE mode)",
					priority: 0, // Collapse first (rightmost)
				});
			} else {
				badgeSuffixes.push({
					icon: "🔒",
					label: "RO",
					tooltip: "Database is read-only",
					priority: 0, // Collapse first (rightmost)
				});
			}
		}

		return {
			id: db.name,
			name: db.name,
			type: "database",
			icon: React.createElement(DatabaseIcon, { size: 14 }),
			iconColor: dbIconColor,
			badge,
			badgeColor,
			badgeSuffixes: badgeSuffixes.length > 0 ? badgeSuffixes : undefined,
			children,
			isExpanded: false, // Collapsed by default, user can expand
			metadata: {
				isAttached: db.isAttached,
				size: db.size,
				sizeFormatted: db.size ? formatBytes(db.size) : undefined,
				hasFileHandle: db.hasFileHandle,
				isRemote: db.isRemote,
			},
			actions: dbActions.length > 0 ? dbActions : undefined,
			source: "duckdb",
			sourceData: db,
		};
	});
}

/**
 * Convert BigQuery connection data to unified tree nodes
 */
export function convertBigQueryToTreeNodes(
	projects: BigQueryProject[],
	onInsertQuery: (query: string) => void,
	onShowTableInfo: (table: TableMetadata, fullTableName: string) => void,
): UnifiedTreeNode[] {
	return projects.map((project): UnifiedTreeNode => {
		const children: UnifiedTreeNode[] = [];

		// Convert datasets
		if (project.datasets && Array.isArray(project.datasets)) {
			for (const dataset of project.datasets) {
				const datasetChildren: UnifiedTreeNode[] = [];

				// Convert tables
				if (dataset.tables && Array.isArray(dataset.tables)) {
					for (const table of dataset.tables) {
						const tableChildren: UnifiedTreeNode[] = [];

						// Convert columns (if available)
						if (table.columns && Array.isArray(table.columns)) {
							for (const column of table.columns) {
								const columnId = `bq-${project.id}.${dataset.id}.${table.id}.${column.name}`;
								const nestedChildren = createNestedTypeNodes(
									columnId,
									column.type,
									"bigquery",
								);

								tableChildren.push({
									id: columnId,
									name: column.name,
									type: "column",
									// Only show icon for leaf columns (no children)
									icon:
										nestedChildren.length > 0
											? ""
											: React.createElement(ColumnsIcon, { size: 14 }),
									iconColor: "#6b7280",
									metadata: {
										dataType: column.type,
										nullable: column.nullable,
									},
									children:
										nestedChildren.length > 0 ? nestedChildren : undefined,
									isExpanded: false,
									source: "bigquery",
									sourceData: column,
								});
							}
						}

						const fullTableName = `\`${project.id}.${dataset.id}.${table.id}\``;
						const tableActions: TreeNodeAction[] = [
							{
								id: "select-all",
								label: "Select All Columns",
								icon: React.createElement(TableIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(`SELECT * FROM ${fullTableName} LIMIT 1000;`),
							},
							{
								id: "preview",
								label: "Preview Data",
								icon: React.createElement(EyeIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(`SELECT * FROM ${fullTableName} LIMIT 100;`),
							},
							{
								id: "count",
								label: "Count Rows",
								icon: React.createElement(BarChartIcon, { size: 14 }),
								onClick: () =>
									onInsertQuery(`SELECT COUNT(*) FROM ${fullTableName};`),
							},
							{
								id: "copy-name",
								label: "Copy Table Name",
								icon: React.createElement(CopyIcon, { size: 14 }),
								separator: true,
								onClick: () => {
									navigator.clipboard.writeText(fullTableName);
								},
							},
							{
								id: "show-info",
								label: "Show Table Info",
								icon: React.createElement(InfoIcon, { size: 14 }),
								onClick: () => onShowTableInfo(table, fullTableName),
							},
						];

						datasetChildren.push({
							id: `bq-${project.id}.${dataset.id}.${table.id}`,
							name: table.id,
							type: "table",
							icon: React.createElement(TableIcon, { size: 14 }),
							children: tableChildren.length > 0 ? tableChildren : undefined,
							isExpanded: false,
							metadata: {
								rowCount: table.rowCount,
								size: table.sizeBytes,
								sizeFormatted: table.sizeBytes
									? formatBytes(table.sizeBytes)
									: undefined,
								tableType: (table.type as "table" | "view" | "external" | undefined) || "table",
							},
							actions: tableActions,
							source: "bigquery",
							sourceData: {
								...table,
								fullName: fullTableName, // Include full qualified name for SQL generation
							},
						});
					}
				}

				children.push({
					id: `bq-${project.id}.${dataset.id}`,
					name: dataset.id,
					type: "dataset",
					icon: React.createElement(FolderIcon, { size: 14 }),
					iconColor: "#6b7280",
					children: datasetChildren,
					isExpanded: false,
					metadata: {
						location: dataset.location,
					},
					source: "bigquery",
					sourceData: dataset,
				});
			}
		}

		return {
			id: `bq-${project.id}`,
			name: project.id,
			type: "project",
			icon: React.createElement(CloudIcon, { size: 14 }),
			iconColor: "#4285f4",
			children,
			isExpanded: false,
			source: "bigquery",
			sourceData: project,
		};
	});
}
