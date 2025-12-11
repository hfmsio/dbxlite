import { useCallback, useEffect, useRef } from "react";
import { formatterSettings } from "../../../services/formatter-settings";
import type { ConnectorType } from "../../../types/data-source";
import type { CellValue } from "../../../types/table";
import { createLogger } from "../../../utils/logger";
import type { CellModalData } from "../CellModal";
import type { ColumnInfo, RowData } from "../types";
import { formatCellValue } from "../utils";
import type { CellPosition } from "./useTableSelection";

const logger = createLogger("useTableKeyboard");

// Row height constant for scroll calculations
const ROW_HEIGHT = 32;

interface UseTableKeyboardOptions {
	// Data
	columns: ColumnInfo[];
	pageData: RowData[];
	connectorType: ConnectorType;
	startRow: number;

	// Selection state
	selectedCell: CellPosition | null;
	selectionStart: CellPosition | null;
	selectionEnd: CellPosition | null;
	viewingCell: CellPosition | null;
	cellModal: CellModalData | null;
	showSchemaModal: boolean;

	// Selection setters
	setSelectedCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	setSelectionStart: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	setSelectionEnd: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	setViewingCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	setCellModal: React.Dispatch<React.SetStateAction<CellModalData | null>>;
	setShowSchemaModal: React.Dispatch<React.SetStateAction<boolean>>;

	// Refs
	cellRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
	scrollContainerRef: React.RefObject<HTMLDivElement>;
	editInputRef: React.RefObject<HTMLInputElement>;
	focusTimeoutRef: React.MutableRefObject<number | null>;

	// Callbacks
	scrollToColumn: (colIdx: number) => void;
	closeModalAndRestoreFocus: () => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

interface UseTableKeyboardReturn {
	handleKeyDown: (
		e: React.KeyboardEvent,
		rowIdx: number,
		colIdx: number,
	) => void;
}

/**
 * Hook for handling all table keyboard interactions.
 *
 * Includes:
 * - Global shortcuts (Cmd+A select all, Cmd+C copy)
 * - Arrow key column selection when columns are selected
 * - Cell navigation (arrows, Tab, Page Up/Down, Home/End)
 * - Enter key (open modal or inline edit)
 * - Escape key (close modals)
 */
export function useTableKeyboard({
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
}: UseTableKeyboardOptions): UseTableKeyboardReturn {
	// Ref to track current selectedCell for rapid keystrokes (avoids stale closure)
	const selectedCellRef = useRef(selectedCell);
	useEffect(() => {
		selectedCellRef.current = selectedCell;
	}, [selectedCell]);

	// ESC key handler for schema modal
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && showSchemaModal) {
				e.preventDefault();
				e.stopPropagation();
				setShowSchemaModal(false);
			}
		};

		if (showSchemaModal) {
			document.addEventListener("keydown", handleEscape, { capture: true });
			return () =>
				document.removeEventListener("keydown", handleEscape, {
					capture: true,
				});
		}
	}, [showSchemaModal, setShowSchemaModal]);

	// ESC to exit inline view/edit mode
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && viewingCell) {
				e.preventDefault();
				e.stopPropagation();
				setViewingCell(null);
			}
		};

		if (viewingCell) {
			document.addEventListener("keydown", handleEscape, { capture: true });
			return () =>
				document.removeEventListener("keydown", handleEscape, {
					capture: true,
				});
		}
	}, [viewingCell, setViewingCell]);

	// Auto-focus selectedCell when it becomes available (handles virtualized cell mounting)
	// This is critical for PageUp/PageDown where cells may not exist immediately after scroll
	useEffect(() => {
		if (!selectedCell || viewingCell || cellModal) {
			return; // Don't focus if no selection, in edit mode, or modal is open
		}

		const cellKey = `${selectedCell.row}-${selectedCell.col}`;
		const cell = cellRefs.current.get(cellKey);

		// Only focus if cell exists and doesn't already have focus
		// Also check if focus is within the scroll container or lost to body (not elsewhere in app)
		const activeElement = document.activeElement;
		const isWithinTable =
			scrollContainerRef.current?.contains(activeElement) ||
			activeElement === document.body ||
			activeElement === null;

		if (cell && isWithinTable && activeElement !== cell) {
			// Use requestAnimationFrame to ensure DOM is ready
			requestAnimationFrame(() => {
				const currentCell = cellRefs.current.get(cellKey);
				if (currentCell) {
					currentCell.focus();
				}
			});
		}
	}, [selectedCell, viewingCell, cellModal, cellRefs, scrollContainerRef]);

	// Document-level PageUp/PageDown handler for when focus is lost during rapid keystrokes
	useEffect(() => {
		const handlePageNavigation = (e: KeyboardEvent) => {
			if (e.key !== "PageUp" && e.key !== "PageDown") return;
			if (cellModal || viewingCell) return;

			// Only handle if focus is lost (on body) and we have a selection
			const activeEl = document.activeElement;
			const isFocusLost = activeEl === document.body || activeEl === null;
			const currentCell = selectedCellRef.current;

			if (!isFocusLost || !currentCell) return;

			e.preventDefault();

			const pageRows = scrollContainerRef.current
				? Math.ceil(scrollContainerRef.current.clientHeight / ROW_HEIGHT)
				: 10;

			const currentRow = currentCell.row;
			const currentCol = currentCell.col;

			let newRow: number;
			if (e.key === "PageUp") {
				newRow = Math.max(0, currentRow - pageRows);
			} else {
				// Need totalVisibleRows - get from pageData length as approximation
				const maxRow = pageData.length > 0 ? pageData.length - 1 : 0;
				newRow = Math.min(maxRow, currentRow + pageRows);
			}

			// Update ref and state
			selectedCellRef.current = { row: newRow, col: currentCol };
			setSelectedCell({ row: newRow, col: currentCol });
			setSelectionStart(null);
			setSelectionEnd(null);

			// Scroll
			if (scrollContainerRef.current) {
				if (e.key === "PageUp") {
					scrollContainerRef.current.scrollTop = Math.max(
						0,
						scrollContainerRef.current.scrollTop - pageRows * ROW_HEIGHT,
					);
				} else {
					scrollContainerRef.current.scrollTop = Math.min(
						scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight,
						scrollContainerRef.current.scrollTop + pageRows * ROW_HEIGHT,
					);
				}
			}

			// Focus the target cell with retry
			const cellKey = `${newRow}-${currentCol}`;
			if (focusTimeoutRef.current !== null) {
				clearTimeout(focusTimeoutRef.current);
			}
			focusTimeoutRef.current = window.setTimeout(() => {
				const cell = cellRefs.current.get(cellKey);
				if (cell) {
					cell.focus();
				} else {
					// Retry with longer delay
					setTimeout(() => {
						cellRefs.current.get(cellKey)?.focus();
					}, 50);
				}
				focusTimeoutRef.current = null;
			}, 30);
		};

		document.addEventListener("keydown", handlePageNavigation);
		return () => document.removeEventListener("keydown", handlePageNavigation);
	}, [cellModal, viewingCell, pageData.length, setSelectedCell, setSelectionStart, setSelectionEnd, scrollContainerRef, cellRefs, focusTimeoutRef]);

	// Cmd+C copy handler and Cmd+A select all handler
	useEffect(() => {
		const handleKeyboard = async (e: KeyboardEvent) => {
			// Don't intercept keyboard events when CellModal is open - let modal handle its own keyboard navigation
			if (cellModal) {
				return;
			}

			// Only handle keyboard shortcuts if we have a selected cell (table has been interacted with)
			// This prevents capturing Cmd+A/Cmd+C globally when user is working elsewhere
			if (!selectedCell && !selectionStart) {
				return;
			}

			// Check for Cmd+A (Mac) or Ctrl+A (Windows/Linux) - Select All
			if (
				(e.metaKey || e.ctrlKey) &&
				e.key === "a" &&
				pageData.length > 0 &&
				columns.length > 0
			) {
				e.preventDefault();
				e.stopPropagation();

				// Select all cells in the current page
				setSelectionStart({ row: 0, col: 0 });
				setSelectionEnd({ row: pageData.length - 1, col: columns.length - 1 });

				// Set selected cell to first cell if none selected
				if (!selectedCell) {
					setSelectedCell({ row: 0, col: 0 });
				}

				showToast?.(
					`Selected ${pageData.length} rows × ${columns.length} columns`,
					"info",
					2000,
				);
			}

			// Check for Arrow keys when entire column(s) are selected
			if (
				(e.key === "ArrowLeft" || e.key === "ArrowRight") &&
				selectionStart &&
				selectionEnd
			) {
				// Check if entire column(s) are selected (all rows from 0 to pageData.length-1)
				const minRow = Math.min(selectionStart.row, selectionEnd.row);
				const maxRow = Math.max(selectionStart.row, selectionEnd.row);
				const isFullColumnSelection =
					minRow === 0 && maxRow === pageData.length - 1;

				if (isFullColumnSelection) {
					e.preventDefault();
					e.stopPropagation();

					const currentMinCol = Math.min(selectionStart.col, selectionEnd.col);
					const currentMaxCol = Math.max(selectionStart.col, selectionEnd.col);

					if (e.shiftKey) {
						// Shift+Arrow: Extend or shrink column selection
						// The anchor is selectionStart, and we modify selectionEnd

						if (e.key === "ArrowRight") {
							// Moving right: extend or shrink based on current position
							const newEndCol = selectionEnd.col + 1;

							if (newEndCol <= columns.length - 1) {
								setSelectionEnd({ row: pageData.length - 1, col: newEndCol });
								const newCount = Math.abs(newEndCol - selectionStart.col) + 1;
								showToast?.(
									`Selected ${newCount} column${newCount > 1 ? "s" : ""} (${pageData.length} rows)`,
									"info",
									2000,
								);

								// Scroll to make the new column visible
								scrollToColumn(newEndCol);
							}
						} else if (e.key === "ArrowLeft") {
							// Moving left: shrink or extend based on current position
							const newEndCol = selectionEnd.col - 1;

							if (newEndCol >= 0) {
								setSelectionEnd({ row: pageData.length - 1, col: newEndCol });
								const newCount = Math.abs(newEndCol - selectionStart.col) + 1;
								showToast?.(
									`Selected ${newCount} column${newCount > 1 ? "s" : ""} (${pageData.length} rows)`,
									"info",
									2000,
								);

								// Scroll to make the new column visible
								scrollToColumn(newEndCol);
							}
						}
					} else {
						// Arrow without Shift: Exit column selection mode, move to cell navigation
						const targetCol =
							e.key === "ArrowRight"
								? Math.min(currentMaxCol + 1, columns.length - 1)
								: Math.max(currentMinCol - 1, 0);

						// Clear column selection and select single cell
						setSelectionStart(null);
						setSelectionEnd(null);
						setSelectedCell({ row: 0, col: targetCol });

						// Focus the cell
						const cellKey = `0-${targetCol}`;
						setTimeout(() => {
							cellRefs.current.get(cellKey)?.focus();
						}, 0);
					}
				}
			}

			// Check for Cmd+C (Mac) or Ctrl+C (Windows/Linux) - Copy
			if ((e.metaKey || e.ctrlKey) && e.key === "c") {
				// Don't intercept copy if user is focused on Monaco editor
				const target = e.target as HTMLElement;
				if (target.closest(".monaco-editor")) {
					return; // Let Monaco handle its own copy
				}

				// Priority 1: If in edit mode (viewingCell active), handle input text selection
				if (viewingCell && editInputRef.current) {
					const input = editInputRef.current;
					const start = input.selectionStart || 0;
					const end = input.selectionEnd || 0;

					// If there's text selected in the input, copy only that
					if (start !== end) {
						const selectedText = input.value.substring(start, end);
						e.preventDefault();
						e.stopPropagation();
						try {
							await navigator.clipboard.writeText(selectedText);
							showToast?.("Copied selected text to clipboard", "success", 2000);
						} catch (err) {
							logger.error("Failed to copy to clipboard:", err);
							showToast?.("Failed to copy to clipboard", "error", 3000);
						}
						return;
					}
					// If no text selected in input, copy entire cell value
					e.preventDefault();
					e.stopPropagation();
					try {
						await navigator.clipboard.writeText(input.value);
						showToast?.("Copied cell to clipboard", "success", 2000);
					} catch (err) {
						logger.error("Failed to copy to clipboard:", err);
						showToast?.("Failed to copy to clipboard", "error", 3000);
					}
					return;
				}

				// Priority 2: Multi-cell selection
				if (selectionStart && selectionEnd && pageData.length > 0) {
					e.preventDefault();
					e.stopPropagation();

					// Get delimiter from settings
					const settings = formatterSettings.getSettings();
					const delimiterMap = {
						tab: "\t",
						comma: ",",
						pipe: "|",
						space: " ",
					};
					const delimiter = delimiterMap[settings.copyDelimiter];

					// Calculate the selection bounds
					const minRow = Math.min(selectionStart.row, selectionEnd.row);
					const maxRow = Math.max(selectionStart.row, selectionEnd.row);
					const minCol = Math.min(selectionStart.col, selectionEnd.col);
					const maxCol = Math.max(selectionStart.col, selectionEnd.col);

					// Build the text content
					const lines: string[] = [];

					// Add column headers if Shift key is pressed
					// Cmd+C = values only, Shift+Cmd+C = with headers
					if (e.shiftKey) {
						const headers: string[] = [];
						for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
							if (colIdx < columns.length) {
								headers.push(columns[colIdx].name);
							}
						}
						lines.push(headers.join(delimiter));
					}

					// Add data rows
					for (let rowIdx = minRow; rowIdx <= maxRow; rowIdx++) {
						if (rowIdx < pageData.length) {
							const row = pageData[rowIdx];
							const cells: string[] = [];
							for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
								if (colIdx < columns.length) {
									const col = columns[colIdx];
									const value = row[col.name] as CellValue;
									// Format the cell value as string
									const formatted = formatCellValue(
										value,
										col.type,
										connectorType,
									);
									cells.push(formatted);
								}
							}
							lines.push(cells.join(delimiter));
						}
					}

					// Copy to clipboard
					const textContent = lines.join("\n");
					try {
						await navigator.clipboard.writeText(textContent);
						// Show brief feedback
						const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
						showToast?.(
							`Copied ${cellCount} cell${cellCount > 1 ? "s" : ""} to clipboard`,
							"success",
							2000,
						);
					} catch (err) {
						logger.error("Failed to copy to clipboard:", err);
						showToast?.("Failed to copy to clipboard", "error", 3000);
					}
				} else if (selectedCell && pageData.length > 0) {
					// Single cell selection - copy just that cell
					e.preventDefault();
					e.stopPropagation();

					const row = pageData[selectedCell.row];
					const col = columns[selectedCell.col];
					if (row && col) {
						const value = row[col.name] as CellValue;
						const formatted = formatCellValue(value, col.type, connectorType);

						// Add column header if Shift key is pressed
						// Cmd+C = value only, Shift+Cmd+C = with header
						let textToCopy = formatted;
						if (e.shiftKey) {
							textToCopy = `${col.name}\n${formatted}`;
						}

						try {
							await navigator.clipboard.writeText(textToCopy);
							showToast?.("Copied cell to clipboard", "success", 2000);
						} catch (err) {
							logger.error("Failed to copy to clipboard:", err);
							showToast?.("Failed to copy to clipboard", "error", 3000);
						}
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyboard);
		return () => document.removeEventListener("keydown", handleKeyboard);
	}, [
		cellModal,
		selectionStart,
		selectionEnd,
		selectedCell,
		pageData,
		columns,
		connectorType,
		showToast,
		viewingCell,
		setSelectedCell,
		setSelectionStart,
		setSelectionEnd,
		scrollToColumn,
		cellRefs,
		editInputRef,
	]);

	/**
	 * Handle keyboard navigation within cells
	 */
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
			// Don't handle cell keyboard events when CellModal is open - let modal handle navigation
			// But still prevent default to avoid browser scroll
			if (cellModal) {
				e.preventDefault();
				return;
			}

			const totalCols = columns.length;
			const totalVisibleRows = pageData.length;

			// If we were in inline view/edit mode, exit it on any navigation key
			if (
				viewingCell &&
				[
					"ArrowUp",
					"ArrowDown",
					"ArrowLeft",
					"ArrowRight",
					"Tab",
					"Enter",
				].includes(e.key)
			) {
				setViewingCell(null);
			}

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Arrow: Jump to edge of data (first row)
						const newRow = 0;
						if (e.shiftKey) {
							// Ctrl+Shift+Arrow: Extend selection to edge
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: newRow, col: colIdx });
						} else {
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: newRow, col: colIdx });
						const cellKey = `${newRow}-${colIdx}`;
						// Scroll to top
						if (scrollContainerRef.current) {
							scrollContainerRef.current.scrollTop = 0;
						}
						// Cancel any pending focus timeout
						if (focusTimeoutRef.current !== null) {
							clearTimeout(focusTimeoutRef.current);
						}
						// Use setTimeout to ensure DOM has updated after scroll
						focusTimeoutRef.current = window.setTimeout(() => {
							cellRefs.current.get(cellKey)?.focus();
							focusTimeoutRef.current = null;
						}, 10);
					} else if (rowIdx > 0) {
						const newRow = rowIdx - 1;
						if (e.shiftKey) {
							// Extend selection
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: newRow, col: colIdx });
						} else {
							// Clear selection and move
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: newRow, col: colIdx });
						const cellKey = `${newRow}-${colIdx}`;
						cellRefs.current.get(cellKey)?.focus();
					}
					break;

				case "ArrowDown":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Arrow: Jump to edge of data (last row)
						const newRow = totalVisibleRows - 1;
						if (e.shiftKey) {
							// Ctrl+Shift+Arrow: Extend selection to edge
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: newRow, col: colIdx });
						} else {
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: newRow, col: colIdx });
						const cellKey = `${newRow}-${colIdx}`;
						// Scroll to bottom
						if (scrollContainerRef.current) {
							scrollContainerRef.current.scrollTop =
								scrollContainerRef.current.scrollHeight -
								scrollContainerRef.current.clientHeight;
						}
						// Cancel any pending focus timeout
						if (focusTimeoutRef.current !== null) {
							clearTimeout(focusTimeoutRef.current);
						}
						// Use setTimeout to ensure DOM has updated after scroll
						focusTimeoutRef.current = window.setTimeout(() => {
							cellRefs.current.get(cellKey)?.focus();
							focusTimeoutRef.current = null;
						}, 10);
					} else if (rowIdx < totalVisibleRows - 1) {
						const newRow = rowIdx + 1;
						if (e.shiftKey) {
							// Extend selection
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: newRow, col: colIdx });
						} else {
							// Clear selection and move
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: newRow, col: colIdx });
						const cellKey = `${newRow}-${colIdx}`;
						cellRefs.current.get(cellKey)?.focus();
					}
					break;

				case "ArrowLeft":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Arrow: Jump to edge of data (first column)
						const newCol = 0;
						if (e.shiftKey) {
							// Ctrl+Shift+Arrow: Extend selection to edge
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: rowIdx, col: newCol });
						} else {
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: rowIdx, col: newCol });
						scrollToColumn(newCol);
						const cellKey = `${rowIdx}-${newCol}`;
						cellRefs.current.get(cellKey)?.focus();
					} else if (colIdx > 0) {
						const newCol = colIdx - 1;
						if (e.shiftKey) {
							// Extend selection
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: rowIdx, col: newCol });
						} else {
							// Clear selection and move
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: rowIdx, col: newCol });
						scrollToColumn(newCol);
						const cellKey = `${rowIdx}-${newCol}`;
						cellRefs.current.get(cellKey)?.focus();
					}
					break;

				case "ArrowRight":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Arrow: Jump to edge of data (last column)
						const newCol = totalCols - 1;
						if (e.shiftKey) {
							// Ctrl+Shift+Arrow: Extend selection to edge
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: rowIdx, col: newCol });
						} else {
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: rowIdx, col: newCol });
						scrollToColumn(newCol);
						const cellKey = `${rowIdx}-${newCol}`;
						cellRefs.current.get(cellKey)?.focus();
					} else if (colIdx < totalCols - 1) {
						const newCol = colIdx + 1;
						if (e.shiftKey) {
							// Extend selection
							if (!selectionStart) {
								setSelectionStart({ row: rowIdx, col: colIdx });
							}
							setSelectionEnd({ row: rowIdx, col: newCol });
						} else {
							// Clear selection and move
							setSelectionStart(null);
							setSelectionEnd(null);
						}
						setSelectedCell({ row: rowIdx, col: newCol });
						scrollToColumn(newCol);
						const cellKey = `${rowIdx}-${newCol}`;
						cellRefs.current.get(cellKey)?.focus();
					}
					break;

				case "Tab":
					e.preventDefault();
					if (e.shiftKey) {
						// Shift+Tab: Move to previous cell (left, or wrap to end of previous row)
						if (colIdx > 0) {
							setSelectedCell({ row: rowIdx, col: colIdx - 1 });
							setSelectionStart(null);
							setSelectionEnd(null);
							const cellKey = `${rowIdx}-${colIdx - 1}`;
							cellRefs.current.get(cellKey)?.focus();
						} else if (rowIdx > 0) {
							// Wrap to end of previous row
							setSelectedCell({ row: rowIdx - 1, col: totalCols - 1 });
							setSelectionStart(null);
							setSelectionEnd(null);
							const cellKey = `${rowIdx - 1}-${totalCols - 1}`;
							cellRefs.current.get(cellKey)?.focus();
						}
					} else {
						// Tab: Move to next cell (right, or wrap to start of next row)
						if (colIdx < totalCols - 1) {
							setSelectedCell({ row: rowIdx, col: colIdx + 1 });
							setSelectionStart(null);
							setSelectionEnd(null);
							const cellKey = `${rowIdx}-${colIdx + 1}`;
							cellRefs.current.get(cellKey)?.focus();
						} else if (rowIdx < totalVisibleRows - 1) {
							// Wrap to start of next row
							setSelectedCell({ row: rowIdx + 1, col: 0 });
							setSelectionStart(null);
							setSelectionEnd(null);
							const cellKey = `${rowIdx + 1}-0`;
							cellRefs.current.get(cellKey)?.focus();
						}
					}
					break;

				case "Enter":
					// Don't handle Enter if we're in edit mode (viewingCell is active)
					if (viewingCell?.row === rowIdx && viewingCell?.col === colIdx) {
						return;
					}
					e.preventDefault();
					e.stopPropagation();
					if (e.shiftKey) {
						// Shift+Enter: Enter inline edit mode (same as double-click)
						setViewingCell({ row: rowIdx, col: colIdx });
					} else {
						// Enter: Open cell modal (existing behavior)
						const row = pageData[rowIdx];
						const col = columns[colIdx];
						const globalRowNum = startRow + rowIdx;
						setCellModal({
							value: row[col.name],
							columnName: col.name,
							rowNum: globalRowNum + 1,
							rowIdx,
							colIdx,
						});
					}
					break;

				case "Escape":
					e.preventDefault();
					if (cellModal) {
						closeModalAndRestoreFocus();
					}
					break;

				case "PageUp": {
					e.preventDefault();
					// Use ref for rapid keystrokes - closure's selectedCell can be stale
					const currentRowUp = selectedCellRef.current?.row ?? rowIdx;
					const currentColUp = selectedCellRef.current?.col ?? colIdx;
					// Move up by visible row count (calculate on demand to avoid dependency)
					const pageUpRows = scrollContainerRef.current
						? Math.ceil(scrollContainerRef.current.clientHeight / ROW_HEIGHT)
						: 10;
					const newRowUp = Math.max(0, currentRowUp - pageUpRows);
					// Update ref immediately (before React renders) for rapid keystrokes
					selectedCellRef.current = { row: newRowUp, col: currentColUp };
					setSelectedCell({ row: newRowUp, col: currentColUp });
					setSelectionStart(null);
					setSelectionEnd(null);
					// Scroll to make the new row visible
					if (scrollContainerRef.current) {
						scrollContainerRef.current.scrollTop = Math.max(
							0,
							scrollContainerRef.current.scrollTop - pageUpRows * ROW_HEIGHT,
						);
					}
					const cellKeyUp = `${newRowUp}-${currentColUp}`;
					// Cancel any pending focus timeout to prevent race conditions
					if (focusTimeoutRef.current !== null) {
						clearTimeout(focusTimeoutRef.current);
					}
					// Use setTimeout with retry logic to ensure cell exists before focusing
					focusTimeoutRef.current = window.setTimeout(() => {
						const cell = cellRefs.current.get(cellKeyUp);
						if (cell) {
							cell.focus();
						} else {
							// Retry once more after another tick if cell wasn't found
							setTimeout(() => {
								cellRefs.current.get(cellKeyUp)?.focus();
							}, 20);
						}
						focusTimeoutRef.current = null;
					}, 20);
					break;
				}

				case "PageDown": {
					e.preventDefault();
					// Use ref for rapid keystrokes - closure's selectedCell can be stale
					const currentRowDown = selectedCellRef.current?.row ?? rowIdx;
					const currentColDown = selectedCellRef.current?.col ?? colIdx;
					// Move down by visible row count (calculate on demand to avoid dependency)
					const pageDownRows = scrollContainerRef.current
						? Math.ceil(scrollContainerRef.current.clientHeight / ROW_HEIGHT)
						: 10;
					const newRowDown = Math.min(
						totalVisibleRows - 1,
						currentRowDown + pageDownRows,
					);
					// Update ref immediately (before React renders) for rapid keystrokes
					selectedCellRef.current = { row: newRowDown, col: currentColDown };
					setSelectedCell({ row: newRowDown, col: currentColDown });
					setSelectionStart(null);
					setSelectionEnd(null);
					// Scroll to make the new row visible
					if (scrollContainerRef.current) {
						scrollContainerRef.current.scrollTop = Math.min(
							scrollContainerRef.current.scrollHeight -
								scrollContainerRef.current.clientHeight,
							scrollContainerRef.current.scrollTop + pageDownRows * ROW_HEIGHT,
						);
					}
					const cellKeyDown = `${newRowDown}-${currentColDown}`;
					// Cancel any pending focus timeout to prevent race conditions
					if (focusTimeoutRef.current !== null) {
						clearTimeout(focusTimeoutRef.current);
					}
					// Use setTimeout with retry logic to ensure cell exists before focusing
					focusTimeoutRef.current = window.setTimeout(() => {
						const cell = cellRefs.current.get(cellKeyDown);
						if (cell) {
							cell.focus();
						} else {
							// Retry once more after another tick if cell wasn't found
							setTimeout(() => {
								cellRefs.current.get(cellKeyDown)?.focus();
							}, 20);
						}
						focusTimeoutRef.current = null;
					}, 20);
					break;
				}

				case "Home": {
					e.preventDefault();
					// Home: Move to first column in current row
					const firstCol = 0;
					setSelectedCell({ row: rowIdx, col: firstCol });
					setSelectionStart(null);
					setSelectionEnd(null);
					const cellKeyHome = `${rowIdx}-${firstCol}`;
					scrollToColumn(firstCol);
					// Cancel any pending focus timeout to prevent race conditions
					if (focusTimeoutRef.current !== null) {
						clearTimeout(focusTimeoutRef.current);
					}
					// Use setTimeout to ensure DOM has updated
					focusTimeoutRef.current = window.setTimeout(() => {
						cellRefs.current.get(cellKeyHome)?.focus();
						focusTimeoutRef.current = null;
					}, 10);
					break;
				}

				case "End": {
					e.preventDefault();
					// End: Move to last column in current row
					const lastCol = totalCols - 1;
					setSelectedCell({ row: rowIdx, col: lastCol });
					setSelectionStart(null);
					setSelectionEnd(null);
					const cellKeyEnd = `${rowIdx}-${lastCol}`;
					scrollToColumn(lastCol);
					// Cancel any pending focus timeout to prevent race conditions
					if (focusTimeoutRef.current !== null) {
						clearTimeout(focusTimeoutRef.current);
					}
					// Use setTimeout to ensure DOM has updated
					focusTimeoutRef.current = window.setTimeout(() => {
						cellRefs.current.get(cellKeyEnd)?.focus();
						focusTimeoutRef.current = null;
					}, 10);
					break;
				}
			}
		},
		[
			columns,
			pageData,
			startRow,
			selectedCell, // Must be in deps for PageUp/PageDown to read current state during rapid keystrokes
			selectionStart,
			closeModalAndRestoreFocus,
			cellModal,
			scrollToColumn,
			setSelectedCell,
			setSelectionStart,
			setSelectionEnd,
			setViewingCell,
			setCellModal,
			viewingCell,
			cellRefs,
			scrollContainerRef,
			focusTimeoutRef,
		],
	);

	return { handleKeyDown };
}
