/**
 * Hook for handling context menu state and interactions
 * Extracts context menu logic from PaginatedTable for better separation of concerns
 */
import { useCallback, useEffect, useState } from "react";

interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	columnIndex: number;
	columnName: string;
}

interface UseContextMenuReturn {
	contextMenu: ContextMenuState | null;
	showContextMenu: (
		x: number,
		y: number,
		columnIndex: number,
		columnName: string,
	) => void;
	hideContextMenu: () => void;
}

/**
 * Manages context menu visibility and positioning
 * Handles click-outside and escape key to close
 * @returns Context menu state and handlers
 */
export function useContextMenu(): UseContextMenuReturn {
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	// Context menu close handlers
	useEffect(() => {
		const handleClickOutside = () => {
			if (contextMenu) {
				setContextMenu(null);
			}
		};

		const handleEscapeKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && contextMenu) {
				setContextMenu(null);
			}
		};

		if (contextMenu) {
			document.addEventListener("click", handleClickOutside);
			document.addEventListener("keydown", handleEscapeKey);
			return () => {
				document.removeEventListener("click", handleClickOutside);
				document.removeEventListener("keydown", handleEscapeKey);
			};
		}
	}, [contextMenu]);

	const showContextMenu = useCallback(
		(x: number, y: number, columnIndex: number, columnName: string) => {
			setContextMenu({
				visible: true,
				x,
				y,
				columnIndex,
				columnName,
			});
		},
		[],
	);

	const hideContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	return {
		contextMenu,
		showContextMenu,
		hideContextMenu,
	};
}
