import { useCallback, useEffect, useRef, useState } from "react";

export interface CellPosition {
	row: number;
	col: number;
}

interface UseTableSelectionOptions {
	pageDataLength: number;
	columnsLength: number;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	resizing?: boolean;
}

interface UseTableSelectionReturn {
	// State
	selectedCell: CellPosition | null;
	setSelectedCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	selectionStart: CellPosition | null;
	setSelectionStart: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	selectionEnd: CellPosition | null;
	setSelectionEnd: React.Dispatch<React.SetStateAction<CellPosition | null>>;
	isSelecting: boolean;
	viewingCell: CellPosition | null;
	setViewingCell: React.Dispatch<React.SetStateAction<CellPosition | null>>;

	// Refs
	isSelectingRef: React.MutableRefObject<boolean>;
	lastClickRef: React.MutableRefObject<{
		row: number;
		col: number;
		timestamp: number;
	} | null>;
	autoScrollIntervalRef: React.MutableRefObject<number | null>;

	// Handlers
	handleCellMouseDown: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
	) => void;
	handleCellDoubleClick: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
	) => void;
	handleCellMouseEnter: (
		rowIdx: number,
		colIdx: number,
		e?: React.MouseEvent,
	) => void;
	handleCellMouseMove: (
		rowIdx: number,
		colIdx: number,
		e: React.MouseEvent,
		scrollContainerRef: React.RefObject<HTMLDivElement>,
	) => void;
	handleMouseUp: () => void;
	handleColumnHeaderClick: (
		colIdx: number,
		e: React.MouseEvent,
		columnName: string,
		handleColumnSort: (name: string) => void,
	) => void;
	handleRowNumberClick: (rowIdx: number, e: React.MouseEvent) => void;

	// Utilities
	isCellInSelection: (rowIdx: number, colIdx: number) => boolean;
	clearSelection: () => void;
}

/**
 * Hook for managing table cell/row/column selection.
 * Handles mouse-based selection, shift-click range selection,
 * and double-click inline editing.
 */
export function useTableSelection({
	pageDataLength,
	columnsLength,
	showToast,
	resizing = false,
}: UseTableSelectionOptions): UseTableSelectionReturn {
	// Selection state
	const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
	const [selectionStart, setSelectionStart] = useState<CellPosition | null>(
		null,
	);
	const [selectionEnd, setSelectionEnd] = useState<CellPosition | null>(null);
	const [isSelecting, setIsSelecting] = useState(false);

	// Inline cell viewing state (double-click to view cell content)
	const [viewingCell, setViewingCell] = useState<CellPosition | null>(null);

	// Refs
	const isSelectingRef = useRef(false);
	const lastClickRef = useRef<{
		row: number;
		col: number;
		timestamp: number;
	} | null>(null);
	const autoScrollIntervalRef = useRef<number | null>(null);

	/**
	 * Check if a cell is within the selection range
	 */
	const isCellInSelection = useCallback(
		(rowIdx: number, colIdx: number): boolean => {
			if (!selectionStart || !selectionEnd) return false;
			const minRow = Math.min(selectionStart.row, selectionEnd.row);
			const maxRow = Math.max(selectionStart.row, selectionEnd.row);
			const minCol = Math.min(selectionStart.col, selectionEnd.col);
			const maxCol = Math.max(selectionStart.col, selectionEnd.col);
			return (
				rowIdx >= minRow &&
				rowIdx <= maxRow &&
				colIdx >= minCol &&
				colIdx <= maxCol
			);
		},
		[selectionStart, selectionEnd],
	);

	/**
	 * Clear all selection state
	 */
	const clearSelection = useCallback(() => {
		setSelectedCell(null);
		setSelectionStart(null);
		setSelectionEnd(null);
	}, []);

	/**
	 * Handle mouse down on cell to start selection
	 */
	const handleCellMouseDown = useCallback(
		(rowIdx: number, colIdx: number, e: React.MouseEvent) => {
			// Don't start selection if clicking on a resize handle
			if (resizing) return;

			// Clear any prior inline view/edit selection when starting a new click
			setViewingCell(null);

			e.preventDefault(); // Prevent default text selection
			e.stopPropagation(); // Stop event from bubbling to editor

			// Focus the cell element to take focus away from editor
			const target = e.currentTarget as HTMLElement;
			if (target) {
				target.focus();
			}

			// Check for double-click on same cell (within 300ms) to enter edit mode
			const now = Date.now();
			const lastClick = lastClickRef.current;
			if (
				lastClick &&
				lastClick.row === rowIdx &&
				lastClick.col === colIdx &&
				now - lastClick.timestamp < 300
			) {
				// Second click on same cell within 300ms - enter edit mode
				setViewingCell({ row: rowIdx, col: colIdx });
				// Normalize selection to this cell
				setSelectedCell({ row: rowIdx, col: colIdx });
				setSelectionStart({ row: rowIdx, col: colIdx });
				setSelectionEnd({ row: rowIdx, col: colIdx });
				lastClickRef.current = null; // Reset to prevent triple-click issues
				return;
			}

			// Update last click info
			lastClickRef.current = { row: rowIdx, col: colIdx, timestamp: now };

			// Shift+Click: Extend selection from current cell to clicked cell
			if (e.shiftKey && selectedCell) {
				// Set selection start to the originally selected cell if not already set
				if (!selectionStart) {
					setSelectionStart(selectedCell);
				}
				setSelectionEnd({ row: rowIdx, col: colIdx });
				// Don't start dragging on shift+click
				setIsSelecting(false);
				isSelectingRef.current = false;
			} else {
				// Normal click: Start new selection
				setSelectionStart({ row: rowIdx, col: colIdx });
				setSelectionEnd({ row: rowIdx, col: colIdx });
				setIsSelecting(true);
				isSelectingRef.current = true;
				setSelectedCell({ row: rowIdx, col: colIdx });
			}
		},
		[resizing, selectedCell, selectionStart],
	);

	/**
	 * Handle double-click on cell to enter inline viewing mode
	 */
	const handleCellDoubleClick = useCallback(
		(rowIdx: number, colIdx: number, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// Normalize selection and enter inline viewing
			setViewingCell({ row: rowIdx, col: colIdx });
			setSelectedCell({ row: rowIdx, col: colIdx });
			setSelectionStart({ row: rowIdx, col: colIdx });
			setSelectionEnd({ row: rowIdx, col: colIdx });
		},
		[],
	);

	/**
	 * Handle mouse enter on cell during selection
	 */
	const handleCellMouseEnter = useCallback(
		(rowIdx: number, colIdx: number, _e?: React.MouseEvent) => {
			if (isSelectingRef.current) {
				setSelectionEnd({ row: rowIdx, col: colIdx });
			}
		},
		[],
	);

	/**
	 * Handle mouse move on cell during selection (more reliable than mouseenter)
	 */
	const handleCellMouseMove = useCallback(
		(
			rowIdx: number,
			colIdx: number,
			e: React.MouseEvent,
			scrollContainerRef: React.RefObject<HTMLDivElement>,
		) => {
			if (isSelectingRef.current && e.buttons === 1) {
				// Left mouse button is pressed
				setSelectionEnd({ row: rowIdx, col: colIdx });

				// Auto-scroll when near edges
				if (scrollContainerRef.current) {
					const container = scrollContainerRef.current;
					const rect = container.getBoundingClientRect();
					const mouseY = e.clientY;
					const mouseX = e.clientX;

					const SCROLL_ZONE = 50; // pixels from edge to trigger scroll
					const SCROLL_SPEED = 10; // pixels per scroll step

					// Clear any existing auto-scroll
					if (autoScrollIntervalRef.current) {
						clearInterval(autoScrollIntervalRef.current);
						autoScrollIntervalRef.current = null;
					}

					// Vertical auto-scroll
					if (mouseY < rect.top + SCROLL_ZONE) {
						// Scroll up
						autoScrollIntervalRef.current = window.setInterval(() => {
							if (scrollContainerRef.current) {
								scrollContainerRef.current.scrollTop = Math.max(
									0,
									scrollContainerRef.current.scrollTop - SCROLL_SPEED,
								);
							}
						}, 50);
					} else if (mouseY > rect.bottom - SCROLL_ZONE) {
						// Scroll down
						autoScrollIntervalRef.current = window.setInterval(() => {
							if (scrollContainerRef.current) {
								scrollContainerRef.current.scrollTop += SCROLL_SPEED;
							}
						}, 50);
					}

					// Horizontal auto-scroll
					if (mouseX < rect.left + SCROLL_ZONE) {
						// Scroll left
						if (autoScrollIntervalRef.current)
							clearInterval(autoScrollIntervalRef.current);
						autoScrollIntervalRef.current = window.setInterval(() => {
							if (scrollContainerRef.current) {
								scrollContainerRef.current.scrollLeft = Math.max(
									0,
									scrollContainerRef.current.scrollLeft - SCROLL_SPEED,
								);
							}
						}, 50);
					} else if (mouseX > rect.right - SCROLL_ZONE) {
						// Scroll right
						if (autoScrollIntervalRef.current)
							clearInterval(autoScrollIntervalRef.current);
						autoScrollIntervalRef.current = window.setInterval(() => {
							if (scrollContainerRef.current) {
								scrollContainerRef.current.scrollLeft += SCROLL_SPEED;
							}
						}, 50);
					}
				}
			}
		},
		[],
	);

	/**
	 * Handle mouse up to end selection
	 */
	const handleMouseUp = useCallback(() => {
		if (isSelectingRef.current) {
			setIsSelecting(false);
			isSelectingRef.current = false;

			// Clear auto-scroll interval
			if (autoScrollIntervalRef.current) {
				clearInterval(autoScrollIntervalRef.current);
				autoScrollIntervalRef.current = null;
			}
		}
	}, []);

	/**
	 * Handle column header click to select entire column(s)
	 */
	const handleColumnHeaderClick = useCallback(
		(
			colIdx: number,
			e: React.MouseEvent,
			columnName: string,
			handleColumnSort: (name: string) => void,
		) => {
			// Alt/Option+Click: Toggle sort (quick sort shortcut)
			if (e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				handleColumnSort(columnName);
				return;
			}

			// Cmd/Ctrl+Click: Select single column
			if (e.metaKey || e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();
				setSelectionStart({ row: 0, col: colIdx });
				setSelectionEnd({ row: pageDataLength - 1, col: colIdx });
				setSelectedCell({ row: 0, col: colIdx });
				showToast?.(
					`Selected column ${columnName} (${pageDataLength} rows)`,
					"info",
					2000,
				);
				return;
			}

			// Shift+Click: Extend selection to include columns between last selected and clicked
			if (e.shiftKey && selectedCell) {
				e.preventDefault();
				e.stopPropagation();
				const startCol = selectedCell.col;
				const minCol = Math.min(startCol, colIdx);
				const maxCol = Math.max(startCol, colIdx);
				setSelectionStart({ row: 0, col: minCol });
				setSelectionEnd({ row: pageDataLength - 1, col: maxCol });
				const columnCount = maxCol - minCol + 1;
				showToast?.(
					`Selected ${columnCount} column${columnCount > 1 ? "s" : ""} (${pageDataLength} rows)`,
					"info",
					2000,
				);
				return;
			}

			// Normal click: Do nothing (removed automatic sort)
		},
		[pageDataLength, selectedCell, showToast],
	);

	/**
	 * Handle row number click to select entire row(s)
	 */
	const handleRowNumberClick = useCallback(
		(rowIdx: number, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Shift+Click: Extend selection to include rows between last selected and clicked
			if (e.shiftKey && selectedCell) {
				const startRow = selectedCell.row;
				const minRow = Math.min(startRow, rowIdx);
				const maxRow = Math.max(startRow, rowIdx);
				setSelectionStart({ row: minRow, col: 0 });
				setSelectionEnd({ row: maxRow, col: columnsLength - 1 });
				const rowCount = maxRow - minRow + 1;
				showToast?.(
					`Selected ${rowCount} row${rowCount > 1 ? "s" : ""} (${columnsLength} columns)`,
					"info",
					2000,
				);
			} else {
				// Normal click: Select single row
				setSelectionStart({ row: rowIdx, col: 0 });
				setSelectionEnd({ row: rowIdx, col: columnsLength - 1 });
				setSelectedCell({ row: rowIdx, col: 0 });
				showToast?.(
					`Selected row ${rowIdx + 1} (${columnsLength} columns)`,
					"info",
					2000,
				);
			}
		},
		[columnsLength, selectedCell, showToast],
	);

	// Add global mouse up listener
	useEffect(() => {
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mouseup", handleMouseUp);
			// Cleanup auto-scroll on unmount
			if (autoScrollIntervalRef.current) {
				clearInterval(autoScrollIntervalRef.current);
			}
		};
	}, [handleMouseUp]);

	return {
		// State
		selectedCell,
		setSelectedCell,
		selectionStart,
		setSelectionStart,
		selectionEnd,
		setSelectionEnd,
		isSelecting,
		viewingCell,
		setViewingCell,

		// Refs
		isSelectingRef,
		lastClickRef,
		autoScrollIntervalRef,

		// Handlers
		handleCellMouseDown,
		handleCellDoubleClick,
		handleCellMouseEnter,
		handleCellMouseMove,
		handleMouseUp,
		handleColumnHeaderClick,
		handleRowNumberClick,

		// Utilities
		isCellInSelection,
		clearSelection,
	};
}
