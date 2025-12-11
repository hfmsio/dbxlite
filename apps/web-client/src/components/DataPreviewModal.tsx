/**
 * DataPreviewModal - Quick data preview modal for tables and files
 */

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { queryService } from "../services/streaming-query-service";
import { TypeMapper } from "../utils/dataTypes";
import { formatValue as formatValueWithType } from "../utils/formatters";
import { createLogger } from "../utils/logger";
import type { CellValue } from "../types/table";

const logger = createLogger("DataPreview");

interface DataPreviewModalProps {
	tableName: string;
	schemaName?: string;
	onClose: () => void;
}

interface PreviewData {
	columns: string[];
	columnTypes?: { name: string; type?: string }[];
	rows: Record<string, unknown>[];
	totalRows: number;
}

export function DataPreviewModal({
	tableName,
	schemaName,
	onClose,
}: DataPreviewModalProps) {
	const [data, setData] = useState<PreviewData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadPreview = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const fullTableName = schemaName
				? `"${schemaName}"."${tableName}"`
				: tableName;

			// Fetch preview data (first 100 rows)
			// executeQuery now returns a QueryResult with columnTypes
			const result = await queryService.executeQuery(
				`SELECT * FROM ${fullTableName} LIMIT 100;`,
			);

			// Get total row count
			const countResult = await queryService.executeQuery(
				`SELECT COUNT(*) as total FROM ${fullTableName};`,
			);

			const totalRows =
				countResult.rows.length > 0 ? Number(countResult.rows[0].total) : 0;

			setData({
				columns: result.columns,
				columnTypes: result.columnTypes,
				rows: result.rows,
				totalRows,
			});
		} catch (err) {
			logger.error("Preview error", err);
			setError(err instanceof Error ? err.message : "Failed to load preview");
		} finally {
			setLoading(false);
		}
	}, [tableName, schemaName]);

	useEffect(() => {
		loadPreview();
	}, [loadPreview]);

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	/**
	 * Format cell value using type-aware formatters
	 */
	const formatValue = (value: unknown, columnName: string): string => {
		// If no type information, use simple formatting
		if (!data?.columnTypes) {
			if (value === null || value === undefined) return "NULL";
			if (typeof value === "object") return JSON.stringify(value, null, 0);
			return String(value);
		}

		// Find the column type
		const columnType = data.columnTypes.find(
			(c) => c.name === columnName,
		)?.type;

		if (!columnType) {
			// Fallback if type not found
			if (value === null || value === undefined) return "NULL";
			if (typeof value === "object") return JSON.stringify(value, null, 0);
			return String(value);
		}

		// Get active connector type for proper type mapping
		const connectorType = queryService.getActiveConnectorType();

		// Normalize the database type to our DataType enum
		const dataType = TypeMapper.normalizeType(columnType, connectorType);

		// Use type-aware formatter
		return formatValueWithType(value as CellValue, dataType, {
			dateFormat: "medium",
			timeFormat: "24h",
			booleanDisplay: "text",
			nullDisplay: "NULL",
		});
	};

	return (
		<div className="modal-backdrop" onClick={handleBackdropClick}>
			<div
				className="modal-content data-preview-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="preview-modal-title"
			>
				<div className="modal-header">
					<h3 id="preview-modal-title" className="modal-title">
						Preview: {schemaName ? `${schemaName}.${tableName}` : tableName}
					</h3>
					<button
						className="modal-close"
						onClick={onClose}
						aria-label="Close preview"
					>
						<span aria-hidden="true">×</span>
					</button>
				</div>

				<div className="modal-body">
					{loading && (
						<div className="preview-loading">
							<div className="spinner"></div>
							<p>Loading preview...</p>
						</div>
					)}

					{error && (
						<div className="preview-error">
							<p>Error: {error}</p>
							<button onClick={loadPreview} className="retry-btn">
								Retry
							</button>
						</div>
					)}

					{data && !loading && (
						<>
							<div className="preview-stats">
								<span>
									Showing {data.rows.length} of{" "}
									{data.totalRows.toLocaleString()} rows
								</span>
								<span>{data.columns.length} columns</span>
							</div>

							<div className="preview-table-container">
								<table className="preview-table">
									<thead>
										<tr>
											<th className="row-number-header">#</th>
											{data.columns.map((col) => (
												<th key={col}>{col}</th>
											))}
										</tr>
									</thead>
									<tbody>
										{data.rows.map((row, rowIndex) => (
											<tr key={rowIndex}>
												<td className="row-number">{rowIndex + 1}</td>
												{data.columns.map((col) => (
													<td key={col} title={formatValue(row[col], col)}>
														{formatValue(row[col], col)}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					)}
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn btn-secondary">
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
