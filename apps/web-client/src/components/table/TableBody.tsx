import type React from "react";
import type { ConnectorType } from "../../types/data-source";
import type { CellValue } from "../../types/table";
import { ExportOverlay } from "./ExportOverlay";
import { ExportCompletionStatus } from "./exportUtils";
import type { CellPosition } from "./hooks/useTableSelection";
import type { ColumnInfo, RowData } from "./types";
import { formatCellValue, getCellAlignment } from "./utils";

export interface TableBodyProps {
	// Refs
	scrollContainerRef: React.RefObject<HTMLDivElement>;
	cellRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
	editInputRef: React.MutableRefObject<HTMLInputElement | null>;

	// Data
	columns: ColumnInfo[];
	pageData: RowData[];
	formattedPageData: Record<string, string>[]; // Pre-formatted cell values for performance
	visiblePageData: RowData[];
	virtualStartRow: number;
	startRow: number;
	connectorType: ConnectorType;

	// Dimensions
	rowNumWidth: number;
	rowHeight: number;
	totalHeight: number;
	offsetY: number;
	gridFontSize: number;

	// Selection state
	selectedCell: CellPosition | null;
	viewingCell: CellPosition | null;
	isCellInSelection: (row: number, col: number) => boolean;

	// Loading/export state
	loadingPage: boolean;
	exportComplete: ExportCompletionStatus | null;

	// Handlers
	onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
	onCellMouseDown: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
	) => void;
	onCellDoubleClick: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
	) => void;
	onCellMouseEnter: (rowIdx: number, colIdx: number) => void;
	onCellMouseMove: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
		containerRef: React.RefObject<HTMLDivElement>,
	) => void;
	onRowNumberClick: (rowIdx: number, e: React.MouseEvent) => void;
	onKeyDown: (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => void;
	setViewingCell: (cell: CellPosition | null) => void;
	setExportComplete: (status: ExportCompletionStatus | null) => void;
	setSelectedCell: (cell: CellPosition | null) => void;
	setSelectionStart: (cell: CellPosition | null) => void;
	setSelectionEnd: (cell: CellPosition | null) => void;
}

/**
 * Table body with virtual scrolling, cell rendering, and selection
 */
export function TableBody({
	scrollContainerRef,
	cellRefs,
	editInputRef,
	columns,
	pageData,
	formattedPageData,
	visiblePageData,
	virtualStartRow,
	startRow,
	connectorType,
	rowNumWidth,
	rowHeight,
	totalHeight,
	offsetY,
	gridFontSize,
	selectedCell,
	viewingCell,
	isCellInSelection,
	loadingPage,
	exportComplete,
	onScroll,
	onCellMouseDown,
	onCellDoubleClick,
	onCellMouseEnter,
	onCellMouseMove,
	onRowNumberClick,
	onKeyDown,
	setViewingCell,
	setExportComplete,
	setSelectedCell,
	setSelectionStart,
	setSelectionEnd,
}: TableBodyProps) {
	// Handle keyboard events at container level for when focus is lost from cells
	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		// Only handle PageUp/PageDown at container level
		if (e.key === "PageUp" || e.key === "PageDown") {
			// If a cell is selected, forward the event to the cell handler
			if (selectedCell) {
				onKeyDown(e, selectedCell.row, selectedCell.col);
			}
		}
	};

	return (
		<div
			ref={scrollContainerRef}
			onScroll={onScroll}
			onKeyDown={handleContainerKeyDown}
			tabIndex={0}
			style={{
				flex: "1 1 0",
				minHeight: 0,
				height: 0,
				overflowY: "auto",
				overflowX: "auto",
				background: "var(--bg-primary)",
				position: "relative",
				outline: "none",
			}}
		>
			{/* Export completion overlay */}
			{exportComplete && (
				<ExportOverlay
					exportComplete={exportComplete}
					onDismiss={() => setExportComplete(null)}
				/>
			)}

			{loadingPage ? (
				<div style={{ padding: "20px", textAlign: "center" }}>
					<div className="spinner" style={{ display: "inline-block" }} />
					<span style={{ marginLeft: "12px" }}>Loading page...</span>
				</div>
			) : pageData.length === 0 ? (
				<div
					data-testid="no-data-message"
					style={{
						padding: "20px",
						textAlign: "center",
						color: "var(--text-muted)",
					}}
				>
					No data to display
				</div>
			) : (
				<div
					style={{
						height: `${totalHeight}px`,
						position: "relative",
						minWidth: "fit-content",
					}}
				>
					<div
						style={{
							transform: `translateY(${offsetY}px)`,
							willChange: "transform",
						}}
					>
						{visiblePageData.map((row, idx) => {
							const rowIdx = virtualStartRow + idx;
							const globalRowNum = startRow + rowIdx;

							return (
								<div
									key={globalRowNum}
									style={{
										display: "flex",
										height: `${rowHeight}px`,
										minHeight: `${rowHeight}px`,
										maxHeight: `${rowHeight}px`,
										borderBottom: "1px solid var(--border-light)",
										background:
											rowIdx % 2 === 0
												? "var(--bg-primary)"
												: "var(--bg-secondary)",
									}}
								>
									{/* Row number cell */}
									<div
										onClick={(e) => onRowNumberClick(rowIdx, e)}
										style={{
											width: `${rowNumWidth}px`,
											minWidth: `${rowNumWidth}px`,
											padding: "0 8px",
											display: "flex",
											alignItems: "center",
											justifyContent: "flex-end",
											borderRight: "1px solid var(--border-light)",
											color: "var(--text-muted)",
											fontSize: "11px",
											fontWeight: 500,
											cursor: "pointer",
											userSelect: "none",
										}}
										title={`Click to select row ${globalRowNum + 1}, Shift+Click to select multiple rows`}
										onMouseEnter={(e) =>
											(e.currentTarget.style.background = "var(--bg-hover)")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.background = "transparent")
										}
									>
										{globalRowNum + 1}
									</div>

									{/* Data cells */}
									{columns.map((col, colIdx) => {
										const cellKey = `${rowIdx}-${colIdx}`;
										const isSelected =
											selectedCell?.row === rowIdx &&
											selectedCell?.col === colIdx;
										const inSelection = isCellInSelection(rowIdx, colIdx);
										const isViewing =
											viewingCell?.row === rowIdx &&
											viewingCell?.col === colIdx;
										const alignment = getCellAlignment(col.type, connectorType);

										return (
											<div
												key={colIdx}
												className="table-cell"
												data-testid="table-cell"
												tabIndex={0}
												ref={(el) => {
													if (el) {
														cellRefs.current.set(cellKey, el);
														// Auto-focus when cell mounts if it's the selected cell
														// This handles virtualized cells becoming visible after PageUp/PageDown
														if (isSelected && !isViewing) {
															const activeEl = document.activeElement;
															const shouldFocus =
																scrollContainerRef.current?.contains(activeEl) ||
																activeEl === document.body ||
																activeEl === null;
															if (shouldFocus) {
																// Use requestAnimationFrame to ensure layout is complete
																requestAnimationFrame(() => el.focus());
															}
														}
													} else {
														cellRefs.current.delete(cellKey);
													}
												}}
												onMouseDown={(e) => onCellMouseDown(rowIdx, colIdx, e)}
												onDoubleClick={(e) =>
													onCellDoubleClick(rowIdx, colIdx, e)
												}
												onMouseEnter={() => onCellMouseEnter(rowIdx, colIdx)}
												onMouseMove={(e) =>
													onCellMouseMove(rowIdx, colIdx, e, scrollContainerRef)
												}
												onKeyDown={(e) => onKeyDown(e, rowIdx, colIdx)}
												style={{
													width: `${col.width}px`,
													minWidth: `${col.width}px`,
													padding: "0 8px",
													display: "flex",
													alignItems: "center",
													justifyContent:
														alignment === "left"
															? "flex-start"
															: alignment === "right"
																? "flex-end"
																: "center",
													borderRight: "1px solid var(--border-light)",
													fontSize: `${gridFontSize}px`,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
													color: "var(--text-primary)",
													cursor: "pointer",
													outline: isSelected
														? "2px solid var(--accent)"
														: "none",
													background: inSelection
														? "rgba(59, 130, 246, 0.2)"
														: isSelected
															? "rgba(59, 130, 246, 0.1)"
															: "transparent",
													userSelect: "none",
													position: "relative",
												}}
												title={row[col.name] ? String(row[col.name]) : ""}
											>
												{isViewing ? (
													<input
														ref={editInputRef}
														type="text"
														value={formatCellValue(
															row[col.name] as CellValue,
															col.type,
															connectorType,
														)}
														onBlur={() => setViewingCell(null)}
														onMouseDown={(e) => {
															e.stopPropagation();
														}}
														onKeyDown={(e) => {
															if (e.key === "Tab") {
																e.preventDefault();
																e.stopPropagation();
																const totalCols = columns.length;
																const totalRows = visiblePageData.length;
																let targetRow = rowIdx;
																let targetCol = colIdx;

																if (e.shiftKey) {
																	// Move left, wrapping to previous row if needed
																	if (targetCol > 0) {
																		targetCol -= 1;
																	} else if (targetRow > 0) {
																		targetRow -= 1;
																		targetCol = totalCols - 1;
																	}
																} else {
																	// Move right, wrapping to next row if needed
																	if (targetCol < totalCols - 1) {
																		targetCol += 1;
																	} else if (targetRow < totalRows - 1) {
																		targetRow += 1;
																		targetCol = 0;
																	}
																}

																setViewingCell(null);
																setSelectedCell({ row: targetRow, col: targetCol });
																setSelectionStart({ row: targetRow, col: targetCol });
																setSelectionEnd({ row: targetRow, col: targetCol });
																const nextKey = `${targetRow}-${targetCol}`;
																// Focus the next cell after state updates flush
																requestAnimationFrame(() => {
																	cellRefs.current.get(nextKey)?.focus();
																});
																return;
															}
															if (e.key === "Escape" || e.key === "Enter") {
																e.preventDefault();
																e.stopPropagation();
																const key = `${rowIdx}-${colIdx}`;
																setViewingCell(null);
																setTimeout(() => {
																	cellRefs.current.get(key)?.focus();
																}, 0);
															}
															if (
																[
																	"ArrowLeft",
																	"ArrowRight",
																	"ArrowUp",
																	"ArrowDown",
																].includes(e.key)
															) {
																e.stopPropagation();
															}
														}}
														style={{
															width: "100%",
															border: "1px solid var(--accent)",
															background: "var(--bg-secondary)",
															fontSize: `${gridFontSize}px`,
															color: "var(--text-primary)",
															outline: "none",
															padding: "2px 4px",
															margin: "-2px -4px",
															userSelect: "text",
															cursor: "text",
															textAlign: alignment as React.CSSProperties["textAlign"],
															fontFamily: "inherit",
															borderRadius: "2px",
														}}
														onClick={(e) => e.stopPropagation()}
													/>
												) : (
													<span
														style={{
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															display: "block",
															width: "100%",
															textAlign: alignment as React.CSSProperties["textAlign"],
														}}
													>
														{/* Use pre-formatted data for performance */}
														{formattedPageData[rowIdx]?.[col.name] ?? ""}
													</span>
												)}
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
