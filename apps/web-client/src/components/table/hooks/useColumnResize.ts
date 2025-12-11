/**
 * Hook for handling column resize interactions
 * Extracts resize logic from PaginatedTable for better separation of concerns
 */
import { useCallback, useEffect, useState } from "react";
import type { ColumnInfo } from "../types";

interface ResizingState {
	columnName: string;
	startX: number;
	startWidth: number;
}

interface UseColumnResizeOptions {
	onColumnsChange: (updater: (prev: ColumnInfo[]) => ColumnInfo[]) => void;
}

interface UseColumnResizeReturn {
	resizing: ResizingState | null;
	handleResizeStart: (
		columnName: string,
		currentWidth: number,
		e: React.MouseEvent,
	) => void;
}

/**
 * Manages column resize state and mouse event handling
 * @param options - Callback for updating column widths
 * @returns Resize state and handlers
 */
export function useColumnResize({
	onColumnsChange,
}: UseColumnResizeOptions): UseColumnResizeReturn {
	const [resizing, setResizing] = useState<ResizingState | null>(null);

	// Handle mouse move during resize
	useEffect(() => {
		if (!resizing) return;

		// Lock cursor to col-resize on body to prevent flickering during fast drags
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const handleMouseMove = (e: MouseEvent) => {
			if (!resizing) return;
			const diff = e.clientX - resizing.startX;
			const newWidth = Math.max(40, resizing.startWidth + diff);

			// Update column width
			onColumnsChange((prev) =>
				prev.map((col) =>
					col.name === resizing.columnName ? { ...col, width: newWidth } : col,
				),
			);
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
	}, [resizing, onColumnsChange]);

	const handleResizeStart = useCallback(
		(columnName: string, currentWidth: number, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setResizing({
				columnName,
				startX: e.clientX,
				startWidth: currentWidth,
			});
		},
		[],
	);

	return {
		resizing,
		handleResizeStart,
	};
}
