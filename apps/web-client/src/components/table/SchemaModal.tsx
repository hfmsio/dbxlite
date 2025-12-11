import type { ConnectorType } from "../../services/streaming-query-service";
import type { CellValue } from "../../types/table";
import { TypeMapper } from "../../utils/dataTypes";
import type { ColumnInfo, RowData } from "./types";
import { formatCellValue } from "./utils";

interface SchemaModalProps {
	columns: ColumnInfo[];
	pageData: RowData[];
	totalRows: number;
	isEstimatedCount: boolean;
	connectorType: ConnectorType;
	onClose: () => void;
}

/**
 * Modal component for displaying result set schema information.
 * Shows column names, types, and sample values.
 */
export function SchemaModal({
	columns,
	pageData,
	totalRows,
	isEstimatedCount,
	connectorType,
	onClose,
}: SchemaModalProps) {
	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={onClose}
		>
			<div
				data-testid="schema-modal"
				style={{
					background: "var(--bg-secondary)",
					borderRadius: "8px",
					padding: "24px",
					maxWidth: "600px",
					width: "90%",
					maxHeight: "80vh",
					overflow: "auto",
					border: "1px solid var(--border-light)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "20px",
					}}
				>
					<h3
						style={{
							margin: 0,
							color: "var(--text-primary)",
							fontSize: "18px",
						}}
					>
						Result Set Schema
					</h3>
					<button
						data-testid="schema-modal-close"
						onClick={onClose}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							fontSize: "24px",
							padding: "0 8px",
						}}
					>
						×
					</button>
				</div>
				<div style={{ marginBottom: "16px" }}>
					<span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
						<strong>Total Columns:</strong> {columns.length} |{" "}
						<strong>Total Rows:</strong> {isEstimatedCount ? "~" : ""}
						{totalRows.toLocaleString()}
						{isEstimatedCount ? "+" : ""}
					</span>
				</div>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr
							style={{
								background: "var(--bg-primary)",
								borderBottom: "2px solid var(--border-light)",
							}}
						>
							<th
								style={{
									padding: "10px",
									textAlign: "left",
									color: "var(--text-muted)",
									fontWeight: 600,
									fontSize: "12px",
								}}
							>
								#
							</th>
							<th
								style={{
									padding: "10px",
									textAlign: "left",
									color: "var(--text-muted)",
									fontWeight: 600,
									fontSize: "12px",
								}}
							>
								Column Name
							</th>
							<th
								style={{
									padding: "10px",
									textAlign: "left",
									color: "var(--text-muted)",
									fontWeight: 600,
									fontSize: "12px",
								}}
							>
								Type
							</th>
							<th
								style={{
									padding: "10px",
									textAlign: "left",
									color: "var(--text-muted)",
									fontWeight: 600,
									fontSize: "12px",
								}}
							>
								Sample Value
							</th>
						</tr>
					</thead>
					<tbody>
						{columns.map((col, idx) => {
							const sampleValue =
								pageData.length > 0 ? (pageData[0][col.name] as CellValue) : null;
							const actualType = col.type || "TEXT";

							// Get user-friendly display name for the type
							const dataType = TypeMapper.normalizeType(
								actualType,
								connectorType,
							);
							const displayType = TypeMapper.getDisplayName(dataType);

							return (
								<tr
									key={idx}
									style={{ borderBottom: "1px solid var(--border)" }}
								>
									<td
										style={{
											padding: "10px",
											color: "var(--text-muted)",
											fontSize: "12px",
										}}
									>
										{idx + 1}
									</td>
									<td
										style={{
											padding: "10px",
											color: "var(--text-primary)",
											fontSize: "13px",
											fontFamily: "monospace",
											fontWeight: 500,
										}}
									>
										{col.name}
									</td>
									<td
										style={{
											padding: "10px",
											color: "var(--accent)",
											fontSize: "12px",
											fontFamily: "monospace",
										}}
										title={actualType}
									>
										{displayType}
									</td>
									<td
										style={{
											padding: "10px",
											color: "var(--text-secondary)",
											fontSize: "12px",
											fontFamily: "monospace",
											maxWidth: "200px",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{formatCellValue(sampleValue, actualType, connectorType)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				<div
					style={{
						marginTop: "16px",
						fontSize: "11px",
						color: "var(--text-muted)",
					}}
				>
					Types are from SQL result set metadata ({columns.length} columns).
				</div>
			</div>
		</div>
	);
}
