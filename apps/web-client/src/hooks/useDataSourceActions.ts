/**
 * useDataSourceActions - Handles file operations and actions for DataSourceExplorer
 */

import type React from "react";
import { useCallback, useState } from "react";
import { queryService } from "../services/streaming-query-service";
import type { DataSource } from "../types/data-source";
import type { UnifiedTreeNode } from "../types/tree";
import { createLogger } from "../utils/logger";
import { buildDetachSQL } from "../utils/sqlSanitizer";

const logger = createLogger("useDataSourceActions");

export interface DataSourceActionsProps {
	files: DataSource[];
	databases: DataSource[];
	removeDataSource: (id: string) => void;
	introspectSheetColumns: (fileId: string, sheetName: string) => Promise<void>;
}

export interface ConfirmDialogState {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

export function useDataSourceActions({
	files,
	databases,
	removeDataSource,
	introspectSheetColumns,
}: DataSourceActionsProps) {
	const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {},
	});

	// Stable callback for handling file deletion
	const handleFileDelete = useCallback(
		(id: string) => {
			const file = files.find((f) => f.id === id);
			const fileName = file?.name || "this file";
			setConfirmDialog({
				isOpen: true,
				title: "Remove File",
				message: `Are you sure you want to remove "${fileName}" from the workspace? This will not delete the actual file.`,
				variant: "danger",
				onConfirm: () => {
					logger.debug("Delete file:", id);
					removeDataSource(id);
				},
			});
		},
		[files, removeDataSource],
	);

	// Stable callback for handling folder deletion (path level)
	const handleDeleteFolder = useCallback(
		(domain: string, path: string) => {
			// Find all files in this folder
			const filesToDelete = files.filter(
				(f) =>
					f.isRemote &&
					f.remoteFileGroup?.domain === domain &&
					f.remoteFileGroup?.path === path,
			);

			if (filesToDelete.length === 0) {
				logger.warn("No files found in folder:", { domain, path });
				return;
			}

			const folderName = `${domain}/${path}`;
			setConfirmDialog({
				isOpen: true,
				title: "Remove Folder",
				message: `Are you sure you want to remove all ${filesToDelete.length} file${filesToDelete.length > 1 ? "s" : ""} from "${folderName}"? This will not delete the actual files.`,
				variant: "danger",
				onConfirm: () => {
					logger.debug(
						`Removing ${filesToDelete.length} files from folder:`,
						folderName,
					);
					filesToDelete.forEach((file) => removeDataSource(file.id));
				},
			});
		},
		[files, removeDataSource],
	);

	// Stable callback for handling domain deletion
	const handleDeleteDomain = useCallback(
		(domain: string) => {
			// Find all files in this domain (all paths)
			const filesToDelete = files.filter(
				(f) => f.isRemote && f.remoteFileGroup?.domain === domain,
			);

			if (filesToDelete.length === 0) {
				logger.warn("No files found in domain:", domain);
				return;
			}

			setConfirmDialog({
				isOpen: true,
				title: "Remove Domain",
				message: `Are you sure you want to remove all ${filesToDelete.length} file${filesToDelete.length > 1 ? "s" : ""} from "${domain}"? This will not delete the actual files.`,
				variant: "danger",
				onConfirm: () => {
					logger.debug(
						`Removing ${filesToDelete.length} files from domain:`,
						domain,
					);
					filesToDelete.forEach((file) => removeDataSource(file.id));
				},
			});
		},
		[files, removeDataSource],
	);

	// Stable callback for handling database deletion
	const handleDatabaseDelete = useCallback(
		async (dbName: string) => {
			setConfirmDialog({
				isOpen: true,
				title: "Detach Database",
				message: `Are you sure you want to detach and remove database "${dbName}" from the workspace? This will not delete the actual database file.`,
				variant: "danger",
				onConfirm: async () => {
					try {
						// Find the database data source to check if it's actually attached
						const dbDataSource = databases.find(
							(db) => (db.attachedAs || db.name) === dbName,
						);

						// Only run DETACH if the database is actually attached to DuckDB
						if (dbDataSource?.isAttached) {
							await queryService.executeQueryOnConnector(
								"duckdb",
								buildDetachSQL(dbName),
							);
							logger.debug(`Detached database: ${dbName}`);
						} else {
							logger.debug(
								`Database ${dbName} was not attached, skipping DETACH command`,
							);
						}

						// Remove from data source store and refresh UI
						if (dbDataSource) {
							removeDataSource(dbDataSource.id);
						}
					} catch (err) {
						logger.error(`Failed to detach database ${dbName}:`, err);
					}
				},
			});
		},
		[databases, removeDataSource],
	);

	// Handle dropping nodes onto trash icon
	const handleTrashDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();

			const nodeData = e.dataTransfer.getData("application/tree-node");
			if (!nodeData) return;

			try {
				const node = JSON.parse(nodeData);

				// Handle different node types
				if (node.type === "file") {
					handleFileDelete(node.sourceData.id);
				} else if (node.type === "database") {
					handleDatabaseDelete(
						node.sourceData.attachedAs || node.sourceData.name,
					);
				} else if (node.type === "folder") {
					// Check if it's a domain or path folder
					if (node.sourceData.path !== undefined) {
						handleDeleteFolder(node.sourceData.domain, node.sourceData.path);
					} else {
						handleDeleteDomain(node.sourceData.domain);
					}
				}
			} catch (err) {
				logger.error("Failed to parse dropped node data:", err);
			}
		},
		[
			handleFileDelete,
			handleDatabaseDelete,
			handleDeleteFolder,
			handleDeleteDomain,
		],
	);

	// Handle node expand - introspect XLSX sheet columns when expanding a sheet node
	const handleNodeExpand = useCallback(
		async (node: UnifiedTreeNode, isExpanded: boolean) => {
			if (!isExpanded) return; // Only process when expanding

			// Phase 2: Introspect XLSX sheet columns when expanding a sheet node
			if (
				node.type === "table" &&
				node.source === "file" &&
				node.metadata?.sheetIndex !== undefined
			) {
				const fileNodeId = node.id.split(".sheet.")[0];
				const sourceData = node.sourceData as Record<string, unknown> | undefined;
				const sheetName =
					typeof sourceData?.name === "string" ? sourceData.name : node.name;

				try {
					await introspectSheetColumns(fileNodeId, sheetName);
				} catch (error) {
					logger.error(`Failed to introspect sheet "${sheetName}":`, error);
				}
			}
		},
		[introspectSheetColumns],
	);

	return {
		confirmDialog,
		setConfirmDialog,
		handleFileDelete,
		handleDeleteFolder,
		handleDeleteDomain,
		handleDatabaseDelete,
		handleTrashDrop,
		handleNodeExpand,
	};
}
