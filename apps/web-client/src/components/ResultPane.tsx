import type React from "react";
import { useEffect, useRef, useState } from "react";
import { downloadRemoteFile } from "../services/file-service";
import { formatterSettings } from "../services/formatter-settings";
import {
	type QueryResult,
	queryService,
} from "../services/streaming-query-service";
import type { CellValue } from "../types/table";
import { getTypeCategory, TypeMapper } from "../utils/dataTypes";
import { formatValue } from "../utils/formatters";
import { createLogger } from "../utils/logger";
import {
	usePagination,
	useResultColumnResize,
	useResultExport,
	useSorting,
} from "./table/hooks";

const logger = createLogger("ResultPane");

interface ResultPaneProps {
	result: QueryResult | null;
	loading: boolean;
	error: string | null;
	onRunQuery?: () => void;
	lastQuery?: string;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	gridFontSize?: number;
	gridRowHeight?: number;
}

export default function ResultPane({
	result,
	loading,
	error,
	onRunQuery: _onRunQuery,
	lastQuery,
	showToast,
	gridFontSize = 12,
	gridRowHeight = 32,
}: ResultPaneProps) {
	// Hooks for table functionality
	const { sortColumn, sortDirection, sortedData, handleSort, resetSort } =
		useSorting({
			data: result?.rows || [],
		});

	const {
		currentPage,
		pageSize,
		totalPages,
		startRow,
		endRow,
		paginatedData: paginatedRows,
		customPageSize,
		showCustomInput,
		customPageInputRef,
		setCurrentPage,
		setPageSize,
		setCustomPageSize,
		setShowCustomInput,
		handleCustomPageSizeSubmit,
	} = usePagination({
		data: sortedData,
		initialPageSize: 100,
	});

	const { exportProgress, handleExport } = useResultExport({
		result,
		lastQuery,
		showToast,
	});

	const {
		columnWidths,
		resizing,
		handleResizeStart,
		handleColumnHeaderDoubleClick,
		rowNumberWidth,
	} = useResultColumnResize({
		result,
		formatCellValue,
		paginatedRows,
	});

	// Local state
	const [selectedCell, setSelectedCell] = useState<{
		row: number;
		col: number;
	} | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [gridFocused, setGridFocused] = useState(false);
	const [cellDetailValue, setCellDetailValue] = useState<string | null>(null);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showSchemaModal, setShowSchemaModal] = useState(false);
	const tableRef = useRef<HTMLDivElement>(null);
	const cellDetailRef = useRef<HTMLTextAreaElement>(null);

	// Reset sorting and selection when new results arrive
	useEffect(() => {
		if (result) {
			resetSort();
			setSelectedCell(null);
		}
	}, [result, resetSort]);

	// Clear selection when page changes
	useEffect(() => {
		setSelectedCell(null);
	}, [currentPage]);

	// Arrow key navigation and keyboard shortcuts
	useEffect(() => {
		if (!gridFocused || !result || paginatedRows.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd/Ctrl+I: Show schema
			if ((e.metaKey || e.ctrlKey) && e.key === "i") {
				e.preventDefault();
				setShowSchemaModal(true);
				return;
			}

			if (!selectedCell) return;

			const { row, col } = selectedCell;
			const maxRow = paginatedRows.length - 1;
			const maxCol = result.columns.length - 1;
			let newRow = row;
			let newCol = col;

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					newRow = Math.max(0, row - 1);
					break;
				case "ArrowDown":
					e.preventDefault();
					newRow = Math.min(maxRow, row + 1);
					break;
				case "ArrowLeft":
					e.preventDefault();
					newCol = Math.max(0, col - 1);
					break;
				case "ArrowRight":
					e.preventDefault();
					newCol = Math.min(maxCol, col + 1);
					break;
				case "Home":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						newRow = 0;
						newCol = 0;
					} else {
						newCol = 0;
					}
					break;
				case "End":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						newRow = maxRow;
						newCol = maxCol;
					} else {
						newCol = maxCol;
					}
					break;
				case "c":
					if (e.ctrlKey || e.metaKey) {
						// Copy selected cell
						e.preventDefault();
						const value = paginatedRows[row][result.columns[col]];
						const textValue = formatCellValue(value);
						navigator.clipboard.writeText(textValue).catch(() => {});
					}
					break;
				case "PageUp":
					e.preventDefault();
					newRow = Math.max(0, row - 10);
					break;
				case "PageDown":
					e.preventDefault();
					newRow = Math.min(maxRow, row + 10);
					break;
				case "Tab":
					e.preventDefault();
					if (e.shiftKey) {
						// Shift+Tab: go left, wrap to previous row
						if (col === 0 && row > 0) {
							newRow = row - 1;
							newCol = maxCol;
						} else {
							newCol = Math.max(0, col - 1);
						}
					} else {
						// Tab: go right, wrap to next row
						if (col === maxCol && row < maxRow) {
							newRow = row + 1;
							newCol = 0;
						} else {
							newCol = Math.min(maxCol, col + 1);
						}
					}
					break;
				case "Enter": {
					e.preventDefault();
					// Open cell detail view for the selected cell
					const value = paginatedRows[row][result.columns[col]];
					const textValue = formatCellValue(value);
					setCellDetailValue(textValue);
					// Focus the textarea after a short delay
					setTimeout(() => {
						cellDetailRef.current?.focus();
						cellDetailRef.current?.select();
					}, 100);
					break;
				}
				case "Escape":
					e.preventDefault();
					// Close cell detail if open, otherwise unfocus grid
					if (cellDetailValue !== null) {
						setCellDetailValue(null);
						tableRef.current?.focus();
					} else {
						setGridFocused(false);
						setSelectedCell(null);
					}
					break;
			}

			if (newRow !== row || newCol !== col) {
				setSelectedCell({ row: newRow, col: newCol });
				// Auto-copy on navigation for power users
				const value = paginatedRows[newRow][result.columns[newCol]];
				const textValue = formatCellValue(value);
				navigator.clipboard.writeText(textValue).catch(() => {});

				// Scroll selected cell into view
				setTimeout(() => {
					const cellElement = tableRef.current?.querySelector(
						`tbody tr:nth-child(${newRow + 1}) td:nth-child(${newCol + 2})`,
					);
					cellElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
				}, 0);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [gridFocused, selectedCell, result, paginatedRows, cellDetailValue]);

	const handleColumnHeaderClick = (column: string, _e: React.MouseEvent) => {
		// Don't sort if we just finished resizing
		if (resizing) {
			return;
		}
		handleSort(column);
	};

	const handleCellClick = (
		rowIdx: number,
		colIdx: number,
		value: CellValue,
	) => {
		setSelectedCell({ row: rowIdx, col: colIdx });
		setGridFocused(true);
		// Focus the table container for keyboard navigation
		tableRef.current?.focus();
		// Copy to clipboard
		const textValue = formatCellValue(value);
		navigator.clipboard.writeText(textValue).catch(() => {
			// Silently fail if clipboard access is denied
		});
	};

	// Extract URL from error message
	const extractUrlFromError = (errorMsg: string): string | null => {
		const match = errorMsg.match(/https?:\/\/[^\s'"]+/);
		return match ? match[0].replace(/[.']+$/, "") : null;
	};

	const handleDownloadAndQuery = async (url: string) => {
		setDownloading(true);
		try {
			// Download the file
			const fileData = await downloadRemoteFile(url);
			if (!fileData) {
				showToast?.(
					"Failed to download file. The server is blocking cross-origin requests. Please try: 1) Use a CORS-enabled URL 2) Download the file manually and use Upload Data button",
					"error",
					6000,
				);
				return;
			}

			// Register the file with DuckDB
			await queryService.registerFile(fileData.name, fileData.buffer);

			showToast?.(
				`File downloaded as "${fileData.name}"! You can now query it with: SELECT * FROM '${fileData.name}' LIMIT 10;`,
				"success",
				6000,
			);

			// Optionally trigger re-run - but don't auto-run, let user modify query first
		} catch (err) {
			logger.error("Failed to download and register file", err);
			const errMsg = err instanceof Error ? err.message : String(err);
			showToast?.(
				`Download failed: ${errMsg}. The server is blocking browser access with CORS restrictions. Solutions: 1) Try CORS-enabled URLs (HuggingFace datasets work well) 2) Download file manually, then use Upload Data button`,
				"error",
				8000,
			);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className="results-pane-compact">
			{loading && (
				<div className="loading-indicator">
					⏳ Executing query...
				</div>
			)}

			{error && (
				<div className="error-message" data-testid="error-message">
					<strong>Error:</strong> {error}
					{error.includes("NetworkError") &&
						error.includes("XMLHttpRequest") &&
						(() => {
							const url = extractUrlFromError(error);
							return (
								<div className="cors-error-hint">
									<strong>
										💡 CORS Error - Remote server is blocking browser access
									</strong>

									<div className="cors-error-option">
										<strong className="cors-error-option-title">
											Option 1: Try Download (may fail if server blocks all
											browser requests)
										</strong>
										{url && (
											<div style={{ marginTop: "6px" }}>
												<button
													className="control-btn-primary"
													onClick={() => handleDownloadAndQuery(url)}
													disabled={downloading}
												>
													{downloading
														? "⏳ Attempting Download..."
														: "📥 Try Download via Fetch"}
												</button>
											</div>
										)}
									</div>

									<div className="cors-error-option">
										<strong className="cors-error-option-title">Option 2: Manual Download</strong>
										<div style={{ marginTop: "4px", opacity: 0.9 }}>
											1. Download the file manually to your computer
											<br />
											2. Click "📤 Upload Data" button to load it into DuckDB
										</div>
									</div>

									<div className="cors-error-option">
										<strong className="cors-error-option-title">
											Option 3: Try CORS-Enabled URLs (Recommended)
										</strong>
										<div className="cors-error-code">
											-- HuggingFace dataset (movie reviews):
											<br />
											SELECT * FROM 'https://huggingface.co/datasets/
											<br />
											cornell-movie-review-data/rotten_tomatoes/
											<br />
											resolve/refs/convert/parquet/default/test/
											<br />
											0000.parquet' LIMIT 10;
										</div>
									</div>
								</div>
							);
						})()}
				</div>
			)}

			{result && !loading && (
				<>
					<div
						ref={tableRef}
						className="result-table-container"
						onFocus={() => setGridFocused(true)}
						onBlur={() => setGridFocused(false)}
						style={{
							outline: gridFocused ? "2px solid var(--accent)" : "none",
						}}
					>
						<table className="result-table-modern">
							<thead>
								<tr>
									<th
										className="row-number-header"
										style={{
											width: `${rowNumberWidth}px`,
											minWidth: `${rowNumberWidth}px`,
											maxWidth: `${rowNumberWidth}px`,
										}}
									>
										<div className="th-content centered">
											<span>#</span>
										</div>
									</th>
									{result.columns.map((col, idx) => (
										<th
											key={idx}
											style={{
												width: `${columnWidths[col] || 150}px`,
												cursor: "pointer",
											}}
											onClick={(e) => handleColumnHeaderClick(col, e)}
											onDoubleClick={() => handleColumnHeaderDoubleClick(col)}
										>
											<div className="th-content">
												<span className="column-name">
													{col}
													{sortColumn === col && (
														<span className="sort-indicator">
															{sortDirection === "asc" ? "▲" : "▼"}
														</span>
													)}
												</span>
												<div
													className="column-resizer"
													onMouseDown={(e) => {
														e.stopPropagation();
														handleResizeStart(col, e);
													}}
													onDoubleClick={(e) => {
														e.stopPropagation();
														handleColumnHeaderDoubleClick(col);
													}}
												/>
											</div>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{paginatedRows.length === 0 ? (
									<tr>
										<td
											colSpan={result.columns.length + 1}
											className="empty-row"
										>
											No results
										</td>
									</tr>
								) : (
									paginatedRows.map((row, rowIdx) => (
										<tr key={rowIdx}>
											<td
												className="row-number-cell"
												style={{
													width: `${rowNumberWidth}px`,
													minWidth: `${rowNumberWidth}px`,
													maxWidth: `${rowNumberWidth}px`,
												}}
											>
												{startRow + rowIdx + 1}
											</td>
											{result.columns.map((col, colIdx) => {
												const columnType = result.columnTypes?.find(
													(c) => c.name === col,
												)?.type;
												return (
													<td
														key={colIdx}
														className={`data-cell ${
															selectedCell?.row === rowIdx &&
															selectedCell?.col === colIdx
																? "selected-cell"
																: ""
														}`}
														onClick={() =>
															handleCellClick(rowIdx, colIdx, row[col])
														}
														style={{
															cursor: "pointer",
															fontSize: `${gridFontSize}px`,
															padding: `${gridRowHeight / 4}px 12px`,
															textAlign: getCellAlignment(columnType),
														}}
														title="Click to copy"
													>
														{formatCellValue(row[col], columnType)}
													</td>
												);
											})}
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>

					<div className="result-stats-footer">
						<div className="flex-row gap-md wrap">
							{/* Row count info */}
							<span>
								<strong>Showing:</strong>{" "}
								{sortedData.length === 0 ? 0 : startRow + 1}-{endRow} of{" "}
								{sortedData.length} rows
							</span>

							{/* Pagination controls */}
							{totalPages > 1 && (
								<div className="flex-row gap-sm">
									<button
										className="control-btn"
										onClick={() => setCurrentPage(currentPage - 1)}
										disabled={currentPage === 1}
									>
										← Prev
									</button>
									<span className="page-info">
										Page {currentPage} / {totalPages}
									</span>
									<button
										className="control-btn"
										onClick={() => setCurrentPage(currentPage + 1)}
										disabled={currentPage === totalPages}
									>
										Next →
									</button>
								</div>
							)}

							{/* Page size selector */}
							<div className="flex-row gap-sm">
								<label htmlFor="page-size" className="form-label">
									Rows/page:
								</label>
								<select
									id="page-size"
									className="form-select"
									value={showCustomInput ? "custom" : pageSize}
									onChange={(e) => {
										const val = e.target.value;
										if (val === "custom") {
											setShowCustomInput(true);
											setCustomPageSize("");
										} else {
											setShowCustomInput(false);
											setPageSize(Number(val));
										}
									}}
								>
									<option value={10}>10</option>
									<option value={50}>50</option>
									<option value={100}>100</option>
									<option value={200}>200</option>
									<option value={500}>500</option>
									<option value={1000}>1000</option>
									<option value={sortedData.length}>
										All ({sortedData.length})
									</option>
									<option value="custom">Custom...</option>
								</select>
								{showCustomInput && (
									<input
										ref={customPageInputRef}
										type="number"
										className="form-input-sm"
										placeholder="Enter #"
										value={customPageSize}
										onChange={(e) => setCustomPageSize(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleCustomPageSizeSubmit();
											if (e.key === "Escape") {
												setShowCustomInput(false);
												setCustomPageSize("");
											}
										}}
										onBlur={handleCustomPageSizeSubmit}
									/>
								)}
							</div>

							{/* Stats */}
							<span className="stats-text">
								<strong>Columns:</strong> {result.columns.length}
							</span>
							<span>
								<strong>Time:</strong> {result.executionTime}ms
							</span>

							{/* Export and Schema buttons */}
							<div className="flex-row gap-sm">
								<button
									className="export-btn"
									onClick={() => handleExport("csv")}
									title="Export as CSV"
								>
									📄 CSV
								</button>
								<button
									className="export-btn"
									onClick={() => handleExport("json")}
									title="Export as JSON"
								>
									🔤 JSON
								</button>
								<button
									className="export-btn"
									onClick={() => handleExport("parquet")}
									title="Export as Parquet"
								>
									📦 Parquet
								</button>
								<div className="divider-vertical" />
								<button
									className="export-btn"
									onClick={() => setShowSchemaModal(true)}
									title="View schema (Cmd/Ctrl+I)"
								>
									📋 Schema
								</button>
							</div>

							{/* Help text */}
							<span className="help-text">
								💡 Export results • ⌘I for schema • Click to sort • Arrow keys
								to navigate {gridFocused && "• ESC to exit"}
							</span>
						</div>
					</div>
				</>
			)}

			{!result && !loading && !error && (
				<div className="empty-state-enhanced">
					<div className="empty-icon">💡</div>
					<h3 className="empty-heading">Ready to query your data</h3>
					<p className="empty-hint">
						Try loading a file from the sidebar or run a query to begin
					</p>
					<div className="empty-shortcuts">
						<kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> to run query
					</div>
				</div>
			)}

			{/* Export Modal */}
			{showExportModal && (
				<div
					className="simple-modal-overlay"
					onClick={() => setShowExportModal(false)}
				>
					<div
						className="simple-modal-content sm"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="simple-modal-header">
							<h3 className="simple-modal-title">Export Results</h3>
							<button
								className="simple-modal-close"
								onClick={() => setShowExportModal(false)}
							>
								×
							</button>
						</div>
						<p className="simple-modal-description">
							Choose a format to export {result?.rows.length} rows:
						</p>
						<div className="flex-col gap-md">
							<button
								className="export-format-btn csv"
								onClick={() => {
									setShowExportModal(false);
									handleExport("csv");
								}}
							>
								📄 CSV (Comma-Separated Values)
							</button>
							<button
								className="export-format-btn parquet"
								onClick={() => {
									setShowExportModal(false);
									handleExport("parquet");
								}}
							>
								📦 Parquet (Columnar Format)
							</button>
							<button
								className="export-format-btn json"
								onClick={() => {
									setShowExportModal(false);
									handleExport("json");
								}}
							>
								🔤 JSON (JavaScript Object Notation)
							</button>
						</div>
						<div className="simple-modal-note">
							Note: Delta Lake and Iceberg require additional configuration and
							are not currently supported in browser-based DuckDB.
						</div>
					</div>
				</div>
			)}

			{/* Schema Modal */}
			{showSchemaModal && result && (
				<div
					className="simple-modal-overlay"
					onClick={() => setShowSchemaModal(false)}
				>
					<div
						className="simple-modal-content md"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="simple-modal-header">
							<h3 className="simple-modal-title">Result Set Schema</h3>
							<button
								className="simple-modal-close"
								onClick={() => setShowSchemaModal(false)}
							>
								×
							</button>
						</div>
						<div className="simple-modal-description">
							<strong>Total Columns:</strong> {result.columns.length} •{" "}
							<strong>Total Rows:</strong> {result.rows.length}
						</div>
						<table className="schema-table">
							<thead>
								<tr>
									<th>#</th>
									<th>Column Name</th>
									<th>Type</th>
									<th>Sample Value</th>
								</tr>
							</thead>
							<tbody>
								{result.columns.map((col, idx) => {
									const sampleValue = result.rows[0]?.[col];
									// Use actual column type from metadata if available, otherwise infer
									const columnMeta = result.columnTypes?.find(
										(c) => c.name === col,
									);
									const actualType =
										columnMeta?.type ||
										(typeof sampleValue === "number"
											? "NUMBER"
											: typeof sampleValue === "boolean"
												? "BOOLEAN"
												: sampleValue === null
													? "NULL"
													: "TEXT");

									// Get user-friendly display name for the type
									const connectorType = queryService.getActiveConnectorType();
									const dataType = TypeMapper.normalizeType(
										actualType,
										connectorType,
									);
									const displayType = TypeMapper.getDisplayName(dataType);

									return (
										<tr key={idx}>
											<td className="row-num">{idx + 1}</td>
											<td className="col-name">{col}</td>
											<td className="col-type" title={actualType}>
												{displayType}
											</td>
											<td className="col-sample">
												{formatCellValue(sampleValue, actualType)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						<div className="simple-modal-note">
							{result.columnTypes && result.columnTypes.length > 0
								? `✓ Types are from SQL result set metadata (${result.columnTypes.length} columns).`
								: "💡 Types are inferred from sample values. Use DESCRIBE or PRAGMA table_info for accurate schema information."}
							{/* Debug: Always show column types status */}
							<details className="debug-details">
								<summary>Debug: Column types info</summary>
								<pre>
									{JSON.stringify(
										{
											hasColumnTypes: !!result.columnTypes,
											columnTypesLength: result.columnTypes?.length || 0,
											columnTypesData: result.columnTypes || null,
										},
										null,
										2,
									)}
								</pre>
							</details>
						</div>
					</div>
				</div>
			)}

			{/* Cell Detail Modal */}
			{cellDetailValue !== null && (
				<div
					className="simple-modal-overlay"
					onClick={() => {
						setCellDetailValue(null);
						tableRef.current?.focus();
					}}
				>
					<div
						className="simple-modal-content lg flex"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="simple-modal-header" style={{ marginBottom: "12px" }}>
							<h3 className="simple-modal-title sm">Cell Value</h3>
							<button
								className="simple-modal-close"
								onClick={() => {
									setCellDetailValue(null);
									tableRef.current?.focus();
								}}
							>
								×
							</button>
						</div>
						<textarea
							ref={cellDetailRef}
							className="cell-detail-textarea"
							value={cellDetailValue}
							onChange={() => {}} // Allow selection and cursor movement
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setCellDetailValue(null);
									tableRef.current?.focus();
								}
								// Prevent modification but allow navigation
								if (
									e.key !== "ArrowLeft" &&
									e.key !== "ArrowRight" &&
									e.key !== "ArrowUp" &&
									e.key !== "ArrowDown" &&
									e.key !== "Home" &&
									e.key !== "End" &&
									e.key !== "PageUp" &&
									e.key !== "PageDown" &&
									!e.metaKey &&
									!e.ctrlKey &&
									e.key !== "Escape"
								) {
									if (
										e.key.length === 1 ||
										e.key === "Backspace" ||
										e.key === "Delete"
									) {
										e.preventDefault();
									}
								}
							}}
						/>
						<div className="simple-modal-hint">
							💡 Use Cmd/Ctrl+A to select all • Cmd/Ctrl+C to copy • ESC to
							close
						</div>
					</div>
				</div>
			)}

			{/* Export Progress Modal */}
			{exportProgress && (
				<div className="export-progress-overlay">
					<div className="export-progress-modal">
						<h3 className="export-progress-title">Exporting to Parquet</h3>

						<div className="export-progress-file">
							<strong>File:</strong> {exportProgress.fileName}
						</div>

						<div style={{ marginBottom: "16px" }}>
							<div className="export-progress-stats">
								<span>Progress</span>
								<span style={{ fontWeight: 600 }}>
									{exportProgress.rowsProcessed.toLocaleString()} rows
									{exportProgress.totalRows &&
										` / ${exportProgress.totalRows.toLocaleString()}`}
								</span>
							</div>

							{/* Progress bar */}
							<div className="export-progress-bar">
								{exportProgress.totalRows ? (
									// Determinate progress bar
									<div
										className="export-progress-fill"
										style={{
											width: `${Math.min(100, (exportProgress.rowsProcessed / exportProgress.totalRows) * 100)}%`,
										}}
									/>
								) : (
									// Indeterminate progress bar (pulsing)
									<div className="export-progress-fill indeterminate" />
								)}
							</div>
						</div>

						<div className="export-progress-hint">
							Streaming data from BigQuery to Parquet file... This may take a
							few minutes for large datasets.
						</div>

						{/* Note: Cancel functionality would require AbortController integration */}
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Get text alignment for a column based on its data type
 */
function getCellAlignment(columnType?: string): "left" | "center" | "right" {
	if (!columnType) return "left";

	const connectorType = queryService.getActiveConnectorType();
	const dataType = TypeMapper.normalizeType(columnType, connectorType);
	const category = getTypeCategory(dataType);

	const alignmentSettings = formatterSettings.getSettings().alignment;

	// Map TypeCategory to alignment setting key
	const alignmentKey = category.toLowerCase() as keyof typeof alignmentSettings;
	return alignmentSettings[alignmentKey] || "left";
}

/**
 * Format cell value using type-aware formatters
 *
 * @param value - The value to format
 * @param columnType - The database type (e.g., "TIMESTAMP", "DECIMAL", "INTEGER")
 */
function formatCellValue(value: CellValue, columnType?: string): string {
	// Get formatter settings
	const settings = formatterSettings.getFormatterOptions();

	// If no type information, use simple formatting
	if (!columnType) {
		if (value === null || value === undefined)
			return settings.nullDisplay || "";
		if (typeof value === "boolean") return value ? "true" : "false";
		if (typeof value === "object") return JSON.stringify(value, null, 0);
		return String(value);
	}

	// Get active connector type for proper type mapping
	const connectorType = queryService.getActiveConnectorType();

	// Normalize the database type to our DataType enum
	const dataType = TypeMapper.normalizeType(columnType, connectorType);

	// Use type-aware formatter with user settings
	return formatValue(value, dataType, settings);
}
