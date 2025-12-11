/**
 * TableInfoModal - Displays detailed information about a table
 */

import type { TableMetadata } from "@ide/connectors";
import type React from "react";

export interface TableInfoModalProps {
	table: TableMetadata;
	fullName: string;
	onClose: () => void;
}

export function TableInfoModal({
	table,
	fullName,
	onClose,
}: TableInfoModalProps) {
	return (
		<div
			className="simple-modal-overlay"
			style={{ zIndex: 10000 }}
			onClick={onClose}
		>
			<div
				className="simple-modal-content md"
				style={{ background: "var(--bg-primary)" }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="simple-modal-header">
					<h3 className="simple-modal-title">Table Information</h3>
					<button className="simple-modal-close" onClick={onClose}>
						×
					</button>
				</div>

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
			</div>
		</div>
	);
}
