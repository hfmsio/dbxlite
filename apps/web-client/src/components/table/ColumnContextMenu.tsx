import type { SortDirection } from "./sortUtils";

export interface ContextMenuState {
	x: number;
	y: number;
	columnName: string;
	columnIndex: number;
}

interface ColumnContextMenuProps {
	contextMenu: ContextMenuState;
	sortColumn: string | null;
	sortDirection: SortDirection;
	pageDataLength: number;
	onSortAscending: () => void;
	onSortDescending: () => void;
	onClearSort: () => void;
	onSelectColumn: () => void;
	onAutoResizeColumn: () => void;
	onClose: () => void;
}

/**
 * Context menu component for column header right-click actions.
 * Provides sorting, selection, and auto-resize options.
 */
export function ColumnContextMenu({
	contextMenu,
	sortColumn,
	sortDirection,
	onSortAscending,
	onSortDescending,
	onClearSort,
	onSelectColumn,
	onAutoResizeColumn,
	onClose,
}: ColumnContextMenuProps) {
	return (
		<div
			onClick={(e) => e.stopPropagation()}
			style={{
				position: "fixed",
				left: `${contextMenu.x}px`,
				top: `${contextMenu.y}px`,
				background: "var(--bg-primary)",
				border: "1px solid var(--border)",
				borderRadius: "6px",
				boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
				zIndex: 10000,
				minWidth: "180px",
				padding: "4px 0",
				fontSize: "13px",
			}}
		>
			<div
				onClick={() => {
					onSortAscending();
					onClose();
				}}
				style={{
					padding: "6px 12px",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background:
						sortColumn === contextMenu.columnName && sortDirection === "asc"
							? "var(--bg-hover)"
							: "transparent",
				}}
				onMouseEnter={(e) =>
					(e.currentTarget.style.background = "var(--bg-hover)")
				}
				onMouseLeave={(e) =>
					(e.currentTarget.style.background =
						sortColumn === contextMenu.columnName && sortDirection === "asc"
							? "var(--bg-hover)"
							: "transparent")
				}
			>
				<span>Sort Ascending</span>
				<span style={{ marginLeft: "8px", fontSize: "11px" }}>A-Z</span>
			</div>
			<div
				onClick={() => {
					onSortDescending();
					onClose();
				}}
				style={{
					padding: "6px 12px",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background:
						sortColumn === contextMenu.columnName && sortDirection === "desc"
							? "var(--bg-hover)"
							: "transparent",
				}}
				onMouseEnter={(e) =>
					(e.currentTarget.style.background = "var(--bg-hover)")
				}
				onMouseLeave={(e) =>
					(e.currentTarget.style.background =
						sortColumn === contextMenu.columnName && sortDirection === "desc"
							? "var(--bg-hover)"
							: "transparent")
				}
			>
				<span>Sort Descending</span>
				<span style={{ marginLeft: "8px", fontSize: "11px" }}>Z-A</span>
			</div>
			<div
				onClick={() => {
					onClearSort();
					onClose();
				}}
				style={{
					padding: "6px 12px",
					cursor: "pointer",
				}}
				onMouseEnter={(e) =>
					(e.currentTarget.style.background = "var(--bg-hover)")
				}
				onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
			>
				Clear Sort
			</div>
			<div
				style={{ height: "1px", background: "var(--border)", margin: "4px 0" }}
			/>
			<div
				onClick={() => {
					onSelectColumn();
					onClose();
				}}
				style={{
					padding: "6px 12px",
					cursor: "pointer",
				}}
				onMouseEnter={(e) =>
					(e.currentTarget.style.background = "var(--bg-hover)")
				}
				onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
			>
				Select Column
			</div>
			<div
				onClick={() => {
					onAutoResizeColumn();
					onClose();
				}}
				style={{
					padding: "6px 12px",
					cursor: "pointer",
				}}
				onMouseEnter={(e) =>
					(e.currentTarget.style.background = "var(--bg-hover)")
				}
				onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
			>
				Auto-resize Column
			</div>
		</div>
	);
}
