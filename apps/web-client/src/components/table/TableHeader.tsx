import type React from "react";
import type { ConnectorType } from "../../types/data-source";
import type { CellPosition } from "./hooks/useTableSelection";
import type { SortDirection } from "./sortUtils";
import type { ColumnInfo, RowData } from "./types";
import { getCellAlignment } from "./utils";
import {
	calculateColumnContentWidth,
	getSelectedColumnIndices,
} from "./utils/columnWidthUtils";

export interface TableHeaderProps {
	headerScrollRef: React.RefObject<HTMLDivElement>;
	columns: ColumnInfo[];
	rowNumWidth: number;
	sortColumn: string | null;
	sortDirection: SortDirection;
	connectorType: ConnectorType;
	pageData: RowData[];
	selectionStart: CellPosition | null;
	selectionEnd: CellPosition | null;
	onColumnSort: (columnName: string) => void;
	onColumnHeaderClick: (
		colIdx: number,
		e: React.MouseEvent,
		columnName: string,
		sortHandler: (name: string) => void,
	) => void;
	onColumnHeaderContextMenu: (colIdx: number, e: React.MouseEvent) => void;
	onColumnHeaderDoubleClick: (columnName: string) => void;
	onResizeStart: (
		columnName: string,
		currentWidth: number,
		e: React.MouseEvent,
	) => void;
	setColumns: React.Dispatch<React.SetStateAction<ColumnInfo[]>>;
	showToast?: (
		message: string,
		type?: "success" | "error" | "warning" | "info",
		duration?: number,
	) => void;
}

/**
 * Table header row with column names, sort indicators, and resize handles
 */
export function TableHeader({
	headerScrollRef,
	columns,
	rowNumWidth,
	sortColumn,
	sortDirection,
	connectorType,
	pageData,
	selectionStart,
	selectionEnd,
	onColumnSort,
	onColumnHeaderClick,
	onColumnHeaderContextMenu,
	onColumnHeaderDoubleClick,
	onResizeStart,
	setColumns,
	showToast,
}: TableHeaderProps) {
	return (
		<div
			ref={headerScrollRef}
			style={{
				flexShrink: 0,
				minHeight: "40px",
				height: "40px",
				zIndex: 10,
				background: "var(--bg-tertiary)",
				borderBottom: "2px solid var(--border)",
				display: "flex",
				overflowX: "hidden",
				overflowY: "hidden",
			}}
		>
			{/* Row number column header */}
			<div
				style={{
					width: `${rowNumWidth}px`,
					minWidth: `${rowNumWidth}px`,
					padding: "0 8px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					borderRight: "1px solid var(--border)",
					fontWeight: "bold",
					fontSize: "12px",
					color: "var(--text-muted)",
				}}
			>
				#
			</div>

			{/* Column headers */}
			{columns.map((col, idx) => {
				const alignment = getCellAlignment(col.type, connectorType);
				const justifyContent =
					alignment === "right"
						? "flex-end"
						: alignment === "center"
							? "center"
							: "flex-start";

				return (
					<div
						key={idx}
						data-testid="column-header"
						data-column={col.name}
						onClick={(e) => onColumnHeaderClick(idx, e, col.name, onColumnSort)}
						onContextMenu={(e) => onColumnHeaderContextMenu(idx, e)}
						onDoubleClick={() => onColumnHeaderDoubleClick(col.name)}
						style={{
							width: `${col.width}px`,
							minWidth: `${col.width}px`,
							padding: "0 8px",
							display: "flex",
							alignItems: "center",
							justifyContent,
							borderRight: "1px solid var(--border)",
							fontWeight: "bold",
							fontSize: "12px",
							color: "var(--text-primary)",
							cursor: "pointer",
							userSelect: "none",
							position: "relative",
						}}
						onMouseEnter={(e) =>
							(e.currentTarget.style.background = "var(--bg-hover)")
						}
						onMouseLeave={(e) =>
							(e.currentTarget.style.background = "var(--bg-tertiary)")
						}
					>
						<span
							style={{
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								flexShrink: 1,
							}}
							title={`${col.name} - Right-click for options, Alt+Click to sort, Double-click to auto-resize`}
						>
							{col.name}
						</span>

						{/* Sort indicator */}
						{sortColumn === col.name && (
							<span
								data-testid="sort-indicator"
								data-direction={sortDirection}
								style={{
									marginLeft: "4px",
									fontSize: "12px",
									flexShrink: 0,
									color: "var(--accent)",
									fontWeight: "bold",
								}}
							>
								{sortDirection === "asc" ? "↑" : "↓"}
							</span>
						)}

						{/* Column resize handle */}
						<div
							className="column-resizer"
							style={{
								position: "absolute",
								right: 0,
								top: 0,
								bottom: 0,
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								onResizeStart(col.name, col.width, e);
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();

								// Excel-style multi-column auto-resize
								const selectedColIndices = getSelectedColumnIndices(
									selectionStart,
									selectionEnd,
									pageData.length,
								);

								if (selectedColIndices && selectedColIndices.length > 1) {
									// Auto-resize ALL selected columns
									const newColumns = columns.map((column, index) => {
										if (selectedColIndices.includes(index)) {
											const optimalWidth = calculateColumnContentWidth(
												column.name,
												column.type,
												pageData,
												Math.min(100, pageData.length),
												connectorType,
												true, // useMax=true: Show everything
											);
											return { ...column, width: optimalWidth };
										}
										return column;
									});
									setColumns(newColumns);
									showToast?.(
										`Auto-resized ${selectedColIndices.length} columns`,
										"success",
										2000,
									);
								} else {
									// Resize just this column
									onColumnHeaderDoubleClick(col.name);
								}
							}}
						/>
					</div>
				);
			})}
		</div>
	);
}
