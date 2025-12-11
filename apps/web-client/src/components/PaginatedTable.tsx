import React, {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import type { QueryResult } from "../services/streaming-query-service";
import { CellModal, type CellModalData } from "./table/CellModal";
import { ColumnContextMenu } from "./table/ColumnContextMenu";
import {
	useColumnResize,
	useContextMenu,
	useTableData,
	useTableExport,
	useTableKeyboard,
	useTableScroll,
	useTableSelection,
} from "./table/hooks";
import { SchemaModal } from "./table/SchemaModal";
import { TableBody } from "./table/TableBody";
import { TableFooter } from "./table/TableFooter";
import { TableHeader } from "./table/TableHeader";
import type { PaginatedTableHandle, PaginatedTableProps } from "./table/types";
import { calculateColumnContentWidth } from "./table/utils/columnWidthUtils";

// Re-export for backwards compatibility
export type { PaginatedTableHandle } from "./table/types";

/**
 * Simple paginated table component
 * - Shows fixed number of rows per page (100)
 * - Next/Previous buttons for navigation
 * - Footer always visible
 * - Loads pages on demand
 */
const PaginatedTable = React.memo(forwardRef<PaginatedTableHandle, PaginatedTableProps>(
	(
		{
			sql,
			result,
			tabId,
			error: externalError,
			onError,
			onLoadingChange,
			showToast,
			gridFontSize = 12,
			gridRowHeight = 32,
			pageSize = 100,
			abortSignal,
			estimatedRowCount,
			rowCountIsEstimated = false,
			cacheThreshold = 10000,
			onExportStart,
			onExportProgress,
			onExportComplete,
			onExportError,
			onShowHistory,
			historyCount = 0,
		},
		ref,
	) => {
		// Refs
		const scrollContainerRef = useRef<HTMLDivElement>(null);
		const headerScrollRef = useRef<HTMLDivElement>(null);
		const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
		const focusTimeoutRef = useRef<number | null>(null);
		const editInputRef = useRef<HTMLInputElement | null>(null);

		// UI state
		const [showSchemaModal, setShowSchemaModal] = useState(false);
		const [cellModal, setCellModal] = useState<{
			value: unknown;
			columnName: string;
			rowNum: number;
			rowIdx: number;
			colIdx: number;
		} | null>(null);
		const [pageInputValue, setPageInputValue] = useState<string>("");

		// Column resize hook
		const { resizing, handleResizeStart } = useColumnResize({
			onColumnsChange: (updateFn) => setColumns(updateFn),
		});

		// Data management hook
		const {
			columns,
			setColumns,
			pageData,
			formattedPageData,
			totalRows,
			isEstimatedCount,
			loading,
			error,
			executionTime,
			connectorType,
			currentPage,
			loadingPage,
			loadPage,
			sortColumn,
			sortDirection,
			handleColumnSort,
			cachedAllResults: _cachedAllResults,
			isCacheComplete: _isCacheComplete,
			isCaching: _isCaching,
		} = useTableData({
			sql,
			result: result as QueryResult,
			pageSize,
			cacheThreshold,
			abortSignal,
			estimatedRowCount,
			rowCountIsEstimated,
			resizing: !!resizing,
			scrollContainerRef,
			showToast,
			tabId,
			onLoadingChange,
			onError,
		});

		// Export functionality
		const { isExporting, exportComplete, setExportComplete, handleExport } =
			useTableExport({
				sql,
				result: result ?? undefined,
				columns,
				showToast,
				onExportStart: onExportStart
					? (params) => onExportStart(params)
					: undefined,
				onExportProgress: onExportProgress
					? (params) => onExportProgress(params)
					: undefined,
				onExportComplete,
				onExportError,
			});

		// Context menu hook
		const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();

		// Selection hook
		const {
			selectedCell,
			setSelectedCell,
			selectionStart,
			setSelectionStart,
			selectionEnd,
			setSelectionEnd,
			viewingCell,
			setViewingCell,
			handleCellMouseDown,
			handleCellDoubleClick,
			handleCellMouseEnter,
			handleCellMouseMove,
			handleColumnHeaderClick,
			handleRowNumberClick,
			isCellInSelection,
			clearSelection,
		} = useTableSelection({
			pageDataLength: pageData.length,
			columnsLength: columns.length,
			showToast,
			resizing: !!resizing,
		});

		// Expose methods via ref
		useImperativeHandle(ref, () => ({ clearSelection }));

		// Helper to close modal and restore grid focus
		const closeModalAndRestoreFocus = useCallback(() => {
			setCellModal(null);
			setTimeout(() => {
				if (selectedCell) {
					const cellKey = `${selectedCell.row}-${selectedCell.col}`;
					cellRefs.current.get(cellKey)?.focus();
				}
			}, 0);
		}, [selectedCell]);

		// Handler for cell navigation from within the modal
		const handleModalCellChange = useCallback(
			(data: CellModalData, rowIdx: number, colIdx: number) => {
				setSelectedCell({ row: rowIdx, col: colIdx });
				setSelectionStart(null);
				setSelectionEnd(null);
				setCellModal(data);

				// Scroll table to show the navigated-to cell
				// This ensures the underlying cell is visible while modal is open
				if (scrollContainerRef.current) {
					const container = scrollContainerRef.current;
					const containerRect = container.getBoundingClientRect();

					// Vertical scroll - ensure row is visible
					const rowTop = rowIdx * gridRowHeight;
					const rowBottom = rowTop + gridRowHeight;
					const scrollTop = container.scrollTop;
					const visibleHeight = containerRect.height;

					if (rowBottom > scrollTop + visibleHeight) {
						// Row is below visible area - scroll down
						container.scrollTop = rowBottom - visibleHeight + 20;
					} else if (rowTop < scrollTop) {
						// Row is above visible area - scroll up
						container.scrollTop = Math.max(0, rowTop - 20);
					}

					// Horizontal scroll - ensure column is visible
					// Calculate column left position
					let columnLeft = 0; // Will add ROW_NUM_WIDTH later
					for (let i = 0; i < columns.length && i < colIdx; i++) {
						columnLeft += columns[i]?.width || 150;
					}
					// Add row number width
					const rowNumWidth = Math.max(40, Math.min(80, (data.rowNum || 1).toString().length * 9 + 16));
					columnLeft += rowNumWidth;

					const columnWidth = columns[colIdx]?.width || 150;
					const columnRight = columnLeft + columnWidth;
					const scrollLeft = container.scrollLeft;
					const containerWidth = containerRect.width;

					if (columnRight > scrollLeft + containerWidth) {
						container.scrollLeft = columnRight - containerWidth + 20;
					} else if (columnLeft < scrollLeft + rowNumWidth) {
						container.scrollLeft = Math.max(0, columnLeft - rowNumWidth - 20);
					}
				}
			},
			[setSelectedCell, setSelectionEnd, setSelectionStart, columns, gridRowHeight],
		);

		// Virtual scrolling hook
		const { scrollTop, containerHeight, handleScroll } = useTableScroll({
			scrollContainerRef,
			headerScrollRef,
			currentPage,
			pageDataLength: pageData.length,
		});

		// Constants
		const ROW_HEIGHT = gridRowHeight;
		const BUFFER_ROWS = 5;

		// Calculate row number column width based on total rows
		const ROW_NUM_WIDTH = useMemo(() => {
			const digits = totalRows.toString().length;
			return Math.max(40, Math.min(80, digits * 9 + 16));
		}, [totalRows]);

		// Pagination calculations
		const totalPages = Math.ceil(totalRows / pageSize);
		const startRow = currentPage * pageSize;
		const endRow = Math.min(startRow + pageSize, totalRows);

		// Virtual scrolling calculations
		const visibleRowCount = Math.ceil(containerHeight / ROW_HEIGHT);
		const scrollStartRow = Math.floor(scrollTop / ROW_HEIGHT);
		const virtualStartRow = Math.max(0, scrollStartRow - BUFFER_ROWS);
		const virtualEndRow = Math.min(
			pageData.length,
			scrollStartRow + visibleRowCount + BUFFER_ROWS,
		);
		const visiblePageData = pageData.slice(virtualStartRow, virtualEndRow);
		const offsetY = virtualStartRow * ROW_HEIGHT;
		const totalHeight = pageData.length * ROW_HEIGHT;

		// Scroll horizontally to make a column visible
		const scrollToColumn = useCallback(
			(colIndex: number) => {
				if (!scrollContainerRef.current) return;
				const container = scrollContainerRef.current;
				const containerRect = container.getBoundingClientRect();

				let columnLeft = ROW_NUM_WIDTH;
				for (let i = 0; i < colIndex; i++) {
					columnLeft += columns[i]?.width || 150;
				}
				const columnWidth = columns[colIndex]?.width || 150;
				const columnRight = columnLeft + columnWidth;
				const scrollLeft = container.scrollLeft;
				const containerWidth = containerRect.width;

				if (columnRight > scrollLeft + containerWidth) {
					container.scrollLeft = columnRight - containerWidth + 20;
				} else if (columnLeft < scrollLeft + ROW_NUM_WIDTH) {
					container.scrollLeft = columnLeft - ROW_NUM_WIDTH - 20;
				}
			},
			[columns, ROW_NUM_WIDTH],
		);

		// Keyboard handling
		const { handleKeyDown } = useTableKeyboard({
			columns,
			pageData,
			connectorType,
			startRow,
			selectedCell,
			selectionStart,
			selectionEnd,
			viewingCell,
			cellModal,
			showSchemaModal,
			setSelectedCell,
			setSelectionStart,
			setSelectionEnd,
			setViewingCell,
			setCellModal,
			setShowSchemaModal,
			cellRefs,
			scrollContainerRef,
			editInputRef,
			focusTimeoutRef,
			scrollToColumn,
			closeModalAndRestoreFocus,
			showToast,
		});

		// Column header double-click handler
		const handleColumnHeaderDoubleClick = useCallback(
			(columnName: string) => {
				const optimalWidth = calculateColumnContentWidth(
					columnName,
					columns.find((c) => c.name === columnName)?.type,
					pageData,
					Math.min(100, pageData.length),
					connectorType,
					true,
				);
				setColumns((prev) =>
					prev.map((col) =>
						col.name === columnName ? { ...col, width: optimalWidth } : col,
					),
				);
			},
			[columns, pageData, connectorType, setColumns],
		);

		// Column header context menu handler
		const handleColumnHeaderContextMenu = useCallback(
			(colIdx: number, e: React.MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				showContextMenu(e.clientX, e.clientY, colIdx, columns[colIdx].name);
			},
			[columns, showContextMenu],
		);

		// Error state - show either external error (from useQueryExecution) or internal error (from useTableData)
		const displayError = externalError || error;

		return (
			<div className="results-pane-compact">
				{/* Show error in body area OR normal header+body */}
				{displayError && !loading ? (
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "40px 20px",
							color: "var(--error)",
							fontSize: "13px",
							lineHeight: 1.6,
							textAlign: "center",
							background: "var(--bg-primary)",
						}}
					>
						<div style={{ maxWidth: "600px" }}>
							<strong style={{ display: "block", marginBottom: "8px" }}>
								Query Error
							</strong>
							<div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>
								{displayError}
							</div>
						</div>
					</div>
				) : (
					<>
						{/* Header */}
						<TableHeader
							headerScrollRef={headerScrollRef}
							columns={columns}
							rowNumWidth={ROW_NUM_WIDTH}
							sortColumn={sortColumn}
							sortDirection={sortDirection}
							connectorType={connectorType}
							pageData={pageData}
							selectionStart={selectionStart}
							selectionEnd={selectionEnd}
							onColumnSort={handleColumnSort}
							onColumnHeaderClick={handleColumnHeaderClick}
							onColumnHeaderContextMenu={handleColumnHeaderContextMenu}
							onColumnHeaderDoubleClick={handleColumnHeaderDoubleClick}
							onResizeStart={handleResizeStart}
							setColumns={setColumns}
							showToast={showToast}
						/>

						{/* Body */}
						<TableBody
					scrollContainerRef={scrollContainerRef}
					cellRefs={cellRefs}
					editInputRef={editInputRef}
					columns={columns}
					pageData={pageData}
					formattedPageData={formattedPageData}
					visiblePageData={visiblePageData}
					virtualStartRow={virtualStartRow}
					startRow={startRow}
					connectorType={connectorType}
					rowNumWidth={ROW_NUM_WIDTH}
					rowHeight={ROW_HEIGHT}
					totalHeight={totalHeight}
					offsetY={offsetY}
					gridFontSize={gridFontSize}
					selectedCell={selectedCell}
					viewingCell={viewingCell}
					isCellInSelection={isCellInSelection}
					loadingPage={loadingPage}
					exportComplete={exportComplete}
					onScroll={handleScroll}
					onCellMouseDown={handleCellMouseDown}
					onCellDoubleClick={handleCellDoubleClick}
					onCellMouseEnter={handleCellMouseEnter}
					onCellMouseMove={handleCellMouseMove}
					onRowNumberClick={handleRowNumberClick}
					onKeyDown={handleKeyDown}
					setViewingCell={setViewingCell}
					setExportComplete={setExportComplete}
					setSelectedCell={setSelectedCell}
					setSelectionStart={setSelectionStart}
					setSelectionEnd={setSelectionEnd}
				/>
					</>
				)}

				{/* Footer */}
				<TableFooter
					currentPage={currentPage}
					totalPages={totalPages}
					startRow={startRow}
					endRow={endRow}
					totalRows={totalRows}
					isEstimatedCount={isEstimatedCount}
					columns={columns}
					executionTime={executionTime}
					selectionStart={selectionStart}
					selectionEnd={selectionEnd}
					loadingPage={loadingPage}
					loadPage={loadPage}
					pageInputValue={pageInputValue}
					setPageInputValue={setPageInputValue}
					showToast={showToast}
					loading={loading}
					isExporting={isExporting}
					handleExport={handleExport}
					setShowSchemaModal={setShowSchemaModal}
					onShowHistory={onShowHistory}
					historyCount={historyCount}
					hasError={!!displayError}
				/>

				{/* Cell content modal */}
				{cellModal && (
					<CellModal
						cellModal={cellModal}
						columns={columns}
						pageData={pageData}
						startRow={startRow}
						connectorType={connectorType}
						onClose={closeModalAndRestoreFocus}
						onCellChange={handleModalCellChange}
					/>
				)}

				{/* Schema Modal */}
				{showSchemaModal && columns.length > 0 && (
					<SchemaModal
						columns={columns}
						pageData={pageData}
						totalRows={totalRows}
						isEstimatedCount={isEstimatedCount}
						connectorType={connectorType}
						onClose={() => setShowSchemaModal(false)}
					/>
				)}

				{/* Context Menu */}
				{contextMenu && (
					<ColumnContextMenu
						contextMenu={contextMenu}
						sortColumn={sortColumn}
						sortDirection={sortDirection}
						pageDataLength={pageData.length}
						onSortAscending={() => {
							handleColumnSort(contextMenu.columnName);
							if (
								sortColumn === contextMenu.columnName &&
								sortDirection === "asc"
							)
								return;
						}}
						onSortDescending={() => {
							handleColumnSort(contextMenu.columnName);
							if (
								sortColumn === contextMenu.columnName &&
								sortDirection === "desc"
							)
								return;
						}}
						onClearSort={() => {
							// Clear sort handled by clicking same column twice when already sorted
						}}
						onSelectColumn={() => {
							setSelectionStart({ row: 0, col: contextMenu.columnIndex });
							setSelectionEnd({
								row: pageData.length - 1,
								col: contextMenu.columnIndex,
							});
							setSelectedCell({ row: 0, col: contextMenu.columnIndex });
							showToast?.(
								`Selected column ${contextMenu.columnName}`,
								"info",
								2000,
							);
						}}
						onAutoResizeColumn={() =>
							handleColumnHeaderDoubleClick(contextMenu.columnName)
						}
						onClose={hideContextMenu}
					/>
				)}
			</div>
		);
	},
));

PaginatedTable.displayName = "PaginatedTable";

export default PaginatedTable;
