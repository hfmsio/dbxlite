import { formatExecutionTime } from "../../utils/timeFormatter";
import { HistoryIcon } from "../Icons";
import type { CellPosition } from "./hooks/useTableSelection";
import type { ColumnInfo } from "./types";

interface TableFooterProps {
	// Stats
	currentPage: number;
	totalPages: number;
	startRow: number;
	endRow: number;
	totalRows: number;
	isEstimatedCount: boolean;
	columns: ColumnInfo[];
	executionTime: number;
	selectionStart: CellPosition | null;
	selectionEnd: CellPosition | null;

	// Pagination
	loadingPage: boolean;
	loadPage: (page: number) => void;
	pageInputValue: string;
	setPageInputValue: (value: string) => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;

	// Export
	loading: boolean;
	isExporting: boolean;
	handleExport: (format: "csv" | "json" | "parquet") => void;
	setShowSchemaModal: (show: boolean) => void;

	// History (optional)
	onShowHistory?: () => void;
	historyCount?: number;

	// Error state - show minimal footer
	hasError?: boolean;
}

/**
 * Footer component for PaginatedTable.
 * Contains stats, pagination controls, and export buttons.
 */
export function TableFooter({
	currentPage,
	totalPages,
	startRow,
	endRow,
	totalRows,
	isEstimatedCount,
	columns,
	executionTime,
	selectionStart,
	selectionEnd,
	loadingPage,
	loadPage,
	pageInputValue,
	setPageInputValue,
	showToast,
	loading,
	isExporting,
	handleExport,
	setShowSchemaModal,
	onShowHistory,
	historyCount = 0,
	hasError = false,
}: TableFooterProps) {
	// Error state: show minimal footer with just history button
	if (hasError) {
		return (
			<div className="result-stats-footer table-footer minimal">
				{onShowHistory && (
					<button onClick={onShowHistory} className="history-btn" title="View message history">
						<HistoryIcon size={10} />
						{historyCount > 0 && (
							<span className="history-badge">
								{historyCount > 99 ? "99+" : historyCount}
							</span>
						)}
					</button>
				)}
			</div>
		);
	}

	const hasSelection = selectionStart && selectionEnd;

	return (
		<div className="result-stats-footer table-footer">
			{/* Left: Stats */}
			<div className="table-footer-stats">
				<span>
					<strong>Page:</strong> {currentPage + 1} / {totalPages}
				</span>
				<span>
					<strong>Rows:</strong> {startRow + 1}-{endRow} of{" "}
					{isEstimatedCount ? "~" : ""}
					{totalRows.toLocaleString()}
					{isEstimatedCount ? "+" : ""}
				</span>
				<span>
					<strong>Columns:</strong> {columns.length}
				</span>
				{executionTime > 0 && (
					<span>
						<strong>Time:</strong> {formatExecutionTime(executionTime)}
					</span>
				)}
				{/* Always reserve space for selection indicator to prevent layout shift */}
				<span className={`table-footer-selection ${hasSelection ? "" : "hidden"}`}>
					<strong>Selected:</strong>{" "}
					{hasSelection
						? (() => {
								const minRow = Math.min(selectionStart.row, selectionEnd.row);
								const maxRow = Math.max(selectionStart.row, selectionEnd.row);
								const minCol = Math.min(selectionStart.col, selectionEnd.col);
								const maxCol = Math.max(selectionStart.col, selectionEnd.col);
								const rowCount = maxRow - minRow + 1;
								const colCount = maxCol - minCol + 1;
								return `${rowCount} × ${colCount} ${rowCount === 1 && colCount === 1 ? "cell" : "cells"}`;
							})()
						: "0 × 0 cells"}
				</span>
			</div>

			{/* Center: Pagination controls */}
			<div className="pagination-controls">
				<button
					data-testid="pagination-first"
					onClick={() => loadPage(0)}
					disabled={currentPage === 0 || loadingPage}
					className="control-btn"
					title="First page"
				>
					First
				</button>
				<button
					data-testid="pagination-prev"
					onClick={() => loadPage(currentPage - 1)}
					disabled={currentPage === 0 || loadingPage}
					className="control-btn"
					title="Previous page"
				>
					Prev
				</button>
				<div className="flex-row gap-sm" style={{ fontSize: "11px" }}>
					<span style={{ color: "var(--text-secondary)" }}>Page</span>
					<input
						type="number"
						min="1"
						max={totalPages}
						value={pageInputValue || currentPage + 1}
						onChange={(e) => setPageInputValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								const targetPage =
									parseInt(pageInputValue || String(currentPage + 1), 10) - 1;
								if (targetPage >= 0 && targetPage < totalPages) {
									loadPage(targetPage);
									setPageInputValue("");
								} else {
									showToast?.(
										`Page must be between 1 and ${totalPages}`,
										"error",
										2000,
									);
								}
							}
						}}
						onBlur={() => setPageInputValue("")}
						className="pagination-input"
						title="Enter page number and press Enter"
					/>
					<span style={{ color: "var(--text-muted)" }}>/ {totalPages}</span>
				</div>
				<button
					data-testid="pagination-next"
					onClick={() => loadPage(currentPage + 1)}
					disabled={currentPage >= totalPages - 1 || loadingPage}
					className="control-btn"
					title="Next page"
				>
					Next
				</button>
				<button
					data-testid="pagination-last"
					onClick={() => loadPage(totalPages - 1)}
					disabled={
						currentPage >= totalPages - 1 || loadingPage || isEstimatedCount
					}
					className="control-btn"
					title={
						isEstimatedCount
							? "Last page unavailable with estimated counts"
							: "Last page"
					}
				>
					Last
				</button>
				<span className="pagination-badge">Paginated</span>
			</div>

			{/* Right: Export buttons */}
			<div className="flex-row gap-sm">
				<button
					data-testid="export-csv"
					onClick={() => handleExport("csv")}
					disabled={loading || columns.length === 0 || isExporting}
					className="export-btn"
					title={isExporting ? "Export in progress..." : "Export as CSV"}
				>
					CSV
				</button>
				<button
					data-testid="export-json"
					onClick={() => handleExport("json")}
					disabled={loading || columns.length === 0 || isExporting}
					className="export-btn"
					title={isExporting ? "Export in progress..." : "Export as JSON"}
				>
					JSON
				</button>
				<button
					data-testid="export-parquet"
					onClick={() => handleExport("parquet")}
					disabled={loading || columns.length === 0 || isExporting}
					className="export-btn"
					title={isExporting ? "Export in progress..." : "Export as Parquet"}
				>
					Parquet
				</button>
				<button
					data-testid="show-schema"
					onClick={() => setShowSchemaModal(true)}
					disabled={loading || columns.length === 0}
					className="export-btn"
					title="View schema"
				>
					Schema
				</button>
				{onShowHistory && (
					<button onClick={onShowHistory} className="history-btn" title="View message history">
						<HistoryIcon size={10} />
						{historyCount > 0 && (
							<span className="history-badge">
								{historyCount > 99 ? "99+" : historyCount}
							</span>
						)}
					</button>
				)}
			</div>
		</div>
	);
}
