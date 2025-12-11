/**
 * Hook for handling column resize interactions in ResultPane
 * Manages column widths with auto-sizing and manual resize capabilities
 */
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueryResult } from "../../../services/streaming-query-service";
import type { CellValue } from "../../../types/table";

interface ResizingState {
	column: string;
	startX: number;
	startWidth: number;
}

interface UseResultColumnResizeOptions {
	result: QueryResult | null;
	formatCellValue: (value: CellValue, columnType?: string) => string;
	paginatedRows?: Record<string, unknown>[];
}

interface UseResultColumnResizeReturn {
	columnWidths: Record<string, number>;
	resizing: ResizingState | null;
	handleResizeStart: (column: string, e: React.MouseEvent) => void;
	handleColumnHeaderDoubleClick: (column: string) => void;
	rowNumberWidth: number;
}

/**
 * Manages column resize state, auto-sizing, and manual resize handling
 * @param options - Configuration for column resize behavior
 * @returns Resize state and handlers
 */
export function useResultColumnResize({
	result,
	formatCellValue,
	paginatedRows = [],
}: UseResultColumnResizeOptions): UseResultColumnResizeReturn {
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
	const [resizing, setResizing] = useState<ResizingState | null>(null);

	// Calculate dynamic row number width based on max row number
	const rowNumberWidth = useMemo(() => {
		if (!result || result.rows.length === 0) return 30;
		const maxRowNumber = result.rows.length;
		const digitCount = maxRowNumber.toString().length;
		// ~8px per digit + 16px padding
		return Math.max(30, digitCount * 8 + 16);
	}, [result]);

	// Calculate optimal column widths based on content
	const calculateOptimalColumnWidths = useMemo(() => {
		if (!result || result.rows.length === 0) return {};

		const widths: Record<string, number> = {};
		const CHAR_WIDTH = 8; // approximate px per character
		const MIN_WIDTH = 80;
		const MAX_WIDTH = 400;
		const PADDING = 24; // cell padding

		result.columns.forEach((col) => {
			const columnType = result.columnTypes?.find((c) => c.name === col)?.type;
			// Measure header width
			let maxWidth = col.length * CHAR_WIDTH + PADDING;

			// Measure content width (sample first 100 rows for performance)
			const sampleSize = Math.min(100, result.rows.length);
			for (let i = 0; i < sampleSize; i++) {
				const value = result.rows[i][col];
				const strValue = formatCellValue(value, columnType);
				const contentWidth = strValue.length * CHAR_WIDTH + PADDING;
				maxWidth = Math.max(maxWidth, contentWidth);
			}

			// Apply min/max constraints
			widths[col] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxWidth));
		});

		return widths;
	}, [result, formatCellValue]);

	// Initialize column widths when result changes
	useEffect(() => {
		if (result) {
			// Use optimal widths on first load, preserve user-resized widths
			const optimalWidths = calculateOptimalColumnWidths;
			const newWidths: Record<string, number> = {};
			result.columns.forEach((col) => {
				// If user hasn't resized this column, use optimal width
				if (!columnWidths[col]) {
					newWidths[col] = optimalWidths[col] || 150;
				} else {
					// Preserve user-resized width
					newWidths[col] = columnWidths[col];
				}
			});
			setColumnWidths(newWidths);
		}
	}, [result, calculateOptimalColumnWidths]);

	// Handle mouse move during resize
	useEffect(() => {
		if (!resizing) return;

		// Lock cursor to col-resize on body to prevent flickering during fast drags
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const handleMouseMove = (e: MouseEvent) => {
			if (!resizing) return;
			const diff = e.clientX - resizing.startX;
			const newWidth = Math.max(20, resizing.startWidth + diff); // Allow minimum 20px
			setColumnWidths((prev) => ({ ...prev, [resizing.column]: newWidth }));
		};

		const handleMouseUp = () => {
			setResizing(null);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			// Reset cursor and selection when resize ends
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [resizing]);

	const handleResizeStart = useCallback(
		(column: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setResizing({
				column,
				startX: e.clientX,
				startWidth: columnWidths[column] || 150,
			});
		},
		[columnWidths],
	);

	const handleColumnHeaderDoubleClick = useCallback(
		(column: string) => {
			// Auto-resize column to fit content (Excel-like behavior)
			if (!result) return;

			const CHAR_WIDTH = 8;
			const MIN_WIDTH = 80;
			const MAX_WIDTH = 600;
			const PADDING = 24;

			// Measure header width
			let maxWidth = column.length * CHAR_WIDTH + PADDING;

			// Measure content width for visible rows (paginatedRows)
			for (const row of paginatedRows) {
				const value = row[column];
				const strValue = formatCellValue(value);
				const contentWidth = strValue.length * CHAR_WIDTH + PADDING;
				maxWidth = Math.max(maxWidth, contentWidth);
			}

			// Apply constraints
			const optimalWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxWidth));
			setColumnWidths((prev) => ({ ...prev, [column]: optimalWidth }));
		},
		[result, paginatedRows, formatCellValue],
	);

	return {
		columnWidths,
		resizing,
		handleResizeStart,
		handleColumnHeaderDoubleClick,
		rowNumberWidth,
	};
}
