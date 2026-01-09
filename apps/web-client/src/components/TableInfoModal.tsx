/**
 * TableInfoModal - Displays detailed information about a table
 *
 * Shows table metadata in a tabbed interface:
 * - Overview: Basic info, row count, columns
 * - Indexes: Table indexes with unique/primary indicators
 * - Constraints: Table constraints (PK, FK, UNIQUE, CHECK, NOT NULL)
 */

import { useEffect, useRef, useState } from "react";
import type { TableMetadata } from "@ide/connectors";
import type {
	IndexInfo,
	ConstraintInfo,
	TableInfoTab,
	TableInfoTabState,
} from "../types/table-info";
import { queryService } from "../services/streaming-query-service";
import { useMode } from "../hooks/useMode";
import { createLogger } from "../utils/logger";

const logger = createLogger("TableInfoModal");

export interface TableInfoModalProps {
	table: TableMetadata;
	fullName: string;
	onClose: () => void;
	databaseName?: string; // 'memory' for session, db name for attached
	schemaName?: string; // defaults to 'main'
}

export function TableInfoModal({
	table,
	fullName,
	onClose,
	databaseName = "memory",
	schemaName = "main",
}: TableInfoModalProps) {
	const { isHttpMode } = useMode();
	const [activeTab, setActiveTab] = useState<TableInfoTab>("overview");
	const [tabState, setTabState] = useState<TableInfoTabState>({
		indexes: null,
		constraints: null,
		indexesLoading: false,
		constraintsLoading: false,
		indexesError: null,
		constraintsError: null,
	});

	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);

	// Focus management
	useEffect(() => {
		previouslyFocusedRef.current = document.activeElement as HTMLElement;
		setTimeout(() => closeButtonRef.current?.focus(), 0);

		return () => {
			previouslyFocusedRef.current?.focus();
		};
	}, []);

	// Escape key handler
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Lazy load indexes when tab is selected
	useEffect(() => {
		if (activeTab === "indexes" && tabState.indexes === null && !tabState.indexesLoading) {
			fetchIndexes();
		}
	}, [activeTab, tabState.indexes, tabState.indexesLoading]);

	// Lazy load constraints when tab is selected
	useEffect(() => {
		if (activeTab === "constraints" && tabState.constraints === null && !tabState.constraintsLoading) {
			fetchConstraints();
		}
	}, [activeTab, tabState.constraints, tabState.constraintsLoading]);

	const fetchIndexes = async () => {
		if (!isHttpMode) {
			setTabState((prev) => ({
				...prev,
				indexes: [],
				indexesError: "Indexes only available in Server mode",
			}));
			return;
		}

		setTabState((prev) => ({ ...prev, indexesLoading: true, indexesError: null }));

		try {
			const result = await queryService.executeQuery(`
				SELECT index_name, table_name, is_unique, is_primary, sql
				FROM duckdb_indexes()
				WHERE database_name = '${databaseName}'
				  AND schema_name = '${schemaName}'
				  AND table_name = '${table.name}'
				ORDER BY is_primary DESC, is_unique DESC, index_name
			`);

			const indexes: IndexInfo[] = result.rows.map((row) => ({
				index_name: String(row.index_name),
				table_name: String(row.table_name),
				is_unique: Boolean(row.is_unique),
				is_primary: Boolean(row.is_primary),
				sql: row.sql ? String(row.sql) : null,
			}));

			setTabState((prev) => ({ ...prev, indexes, indexesLoading: false }));
			logger.debug("Fetched indexes:", indexes.length);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to fetch indexes:", err);
			setTabState((prev) => ({
				...prev,
				indexes: [],
				indexesLoading: false,
				indexesError: errorMsg,
			}));
		}
	};

	const fetchConstraints = async () => {
		if (!isHttpMode) {
			setTabState((prev) => ({
				...prev,
				constraints: [],
				constraintsError: "Constraints only available in Server mode",
			}));
			return;
		}

		setTabState((prev) => ({ ...prev, constraintsLoading: true, constraintsError: null }));

		try {
			const result = await queryService.executeQuery(`
				SELECT constraint_type, constraint_column_names, constraint_column_indexes, expression
				FROM duckdb_constraints()
				WHERE database_name = '${databaseName}'
				  AND schema_name = '${schemaName}'
				  AND table_name = '${table.name}'
				ORDER BY constraint_type, constraint_column_names
			`);

			const constraints: ConstraintInfo[] = result.rows.map((row) => ({
				constraint_type: String(row.constraint_type) as ConstraintInfo["constraint_type"],
				constraint_column_names: Array.isArray(row.constraint_column_names)
					? row.constraint_column_names.map(String)
					: [],
				constraint_column_indexes: Array.isArray(row.constraint_column_indexes)
					? row.constraint_column_indexes.map(Number)
					: undefined,
				expression: row.expression ? String(row.expression) : null,
			}));

			setTabState((prev) => ({ ...prev, constraints, constraintsLoading: false }));
			logger.debug("Fetched constraints:", constraints.length);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to fetch constraints:", err);
			setTabState((prev) => ({
				...prev,
				constraints: [],
				constraintsLoading: false,
				constraintsError: errorMsg,
			}));
		}
	};

	const tabs: { id: TableInfoTab; label: string }[] = [
		{ id: "overview", label: "Overview" },
		{ id: "indexes", label: "Indexes" },
		{ id: "constraints", label: "Constraints" },
	];

	return (
		<div
			className="simple-modal-overlay"
			style={{ zIndex: 10000 }}
			onClick={onClose}
			data-testid="modal-overlay"
		>
			<div
				className="simple-modal-content md"
				style={{
					background: "var(--bg-primary)",
					maxHeight: "80vh",
					display: "flex",
					flexDirection: "column",
				}}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="table-info-title"
			>
				{/* Header */}
				<div className="simple-modal-header">
					<h3 id="table-info-title" className="simple-modal-title">
						Table Information
					</h3>
					<button
						ref={closeButtonRef}
						className="simple-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						×
					</button>
				</div>

				{/* Tabs */}
				<div className="table-info-tabs" role="tablist">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`table-info-tab ${activeTab === tab.id ? "active" : ""}`}
							role="tab"
							aria-selected={activeTab === tab.id}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Tab Content */}
				<div className="table-info-content">
					{activeTab === "overview" && (
						<OverviewTab table={table} fullName={fullName} />
					)}
					{activeTab === "indexes" && (
						<IndexesTab
							indexes={tabState.indexes}
							loading={tabState.indexesLoading}
							error={tabState.indexesError}
							isHttpMode={isHttpMode}
						/>
					)}
					{activeTab === "constraints" && (
						<ConstraintsTab
							constraints={tabState.constraints}
							loading={tabState.constraintsLoading}
							error={tabState.constraintsError}
							isHttpMode={isHttpMode}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

// Overview Tab - Original table info content
function OverviewTab({ table, fullName }: { table: TableMetadata; fullName: string }) {
	return (
		<>
			<div className="table-info-field">
				<div className="table-info-label">Full Name</div>
				<div className="table-info-value mono">{fullName}</div>
			</div>

			{table.rowCount !== undefined && (
				<div className="table-info-field">
					<div className="table-info-label">Row Count</div>
					<div className="table-info-value">
						{table.rowCount.toLocaleString()}
					</div>
				</div>
			)}

			{table.sizeBytes !== undefined && (
				<div className="table-info-field">
					<div className="table-info-label">Size</div>
					<div className="table-info-value">
						{(table.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB (
						{table.sizeBytes.toLocaleString()} bytes)
					</div>
				</div>
			)}

			{table.type && (
				<div className="table-info-field">
					<div className="table-info-label">Type</div>
					<div className="table-info-value">{table.type}</div>
				</div>
			)}

			{table.created && (
				<div className="table-info-field">
					<div className="table-info-label">Created</div>
					<div className="table-info-value">
						{new Date(table.created).toLocaleString()}
					</div>
				</div>
			)}

			{table.modified && (
				<div className="table-info-field">
					<div className="table-info-label">Last Modified</div>
					<div className="table-info-value">
						{new Date(table.modified).toLocaleString()}
					</div>
				</div>
			)}

			{table.description && (
				<div className="table-info-field">
					<div className="table-info-label">Description</div>
					<div className="table-info-value">{table.description}</div>
				</div>
			)}

			{table.columns && table.columns.length > 0 && (
				<div>
					<div className="table-info-label" style={{ marginBottom: 8 }}>
						Columns ({table.columns.length})
					</div>
					<div className="table-info-columns-list">
						{table.columns?.map((col, idx) => (
							<div key={idx} className="table-info-column-row">
								<div className="table-info-column-name">{col.name}</div>
								<div className="table-info-column-type">{col.type}</div>
								{col.nullable === false && (
									<div className="table-info-column-not-null">NOT NULL</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</>
	);
}

// Indexes Tab
function IndexesTab({
	indexes,
	loading,
	error,
	isHttpMode,
}: {
	indexes: IndexInfo[] | null;
	loading: boolean;
	error: string | null;
	isHttpMode: boolean;
}) {
	if (!isHttpMode) {
		return (
			<div className="table-info-empty">
				Index information is only available in Server mode.
			</div>
		);
	}

	if (loading) {
		return <div className="table-info-loading">Loading indexes...</div>;
	}

	if (error) {
		return <div className="table-info-error">Error: {error}</div>;
	}

	if (!indexes || indexes.length === 0) {
		return <div className="table-info-empty">No indexes defined on this table.</div>;
	}

	return (
		<table className="table-info-table">
			<thead>
				<tr>
					<th>Index Name</th>
					<th>Type</th>
					<th>SQL</th>
				</tr>
			</thead>
			<tbody>
				{indexes.map((idx) => (
					<tr key={idx.index_name}>
						<td style={{ fontFamily: "monospace", fontWeight: 500 }}>
							{idx.index_name}
						</td>
						<td>
							{idx.is_primary ? (
								<span className="table-info-badge primary">PRIMARY KEY</span>
							) : idx.is_unique ? (
								<span className="table-info-badge unique">UNIQUE</span>
							) : (
								<span className="table-info-badge">INDEX</span>
							)}
						</td>
						<td style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
							{idx.sql || "(auto-generated)"}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

// Constraints Tab
function ConstraintsTab({
	constraints,
	loading,
	error,
	isHttpMode,
}: {
	constraints: ConstraintInfo[] | null;
	loading: boolean;
	error: string | null;
	isHttpMode: boolean;
}) {
	if (!isHttpMode) {
		return (
			<div className="table-info-empty">
				Constraint information is only available in Server mode.
			</div>
		);
	}

	if (loading) {
		return <div className="table-info-loading">Loading constraints...</div>;
	}

	if (error) {
		return <div className="table-info-error">Error: {error}</div>;
	}

	if (!constraints || constraints.length === 0) {
		return <div className="table-info-empty">No constraints defined on this table.</div>;
	}

	return (
		<table className="table-info-table">
			<thead>
				<tr>
					<th>Type</th>
					<th>Columns</th>
					<th>Expression</th>
				</tr>
			</thead>
			<tbody>
				{constraints.map((constraint, i) => (
					<tr key={`${constraint.constraint_type}-${i}`}>
						<td>
							<span
								className={`table-info-badge ${constraint.constraint_type.toLowerCase().replace(" ", "-")}`}
							>
								{constraint.constraint_type}
							</span>
						</td>
						<td style={{ fontFamily: "monospace", fontSize: "12px" }}>
							{constraint.constraint_column_names.join(", ") || "-"}
						</td>
						<td style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
							{constraint.expression || "-"}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
