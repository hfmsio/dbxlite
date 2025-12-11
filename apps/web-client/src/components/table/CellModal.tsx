import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorType } from "../../services/streaming-query-service";
import type { CellValue } from "../../types/table";
import type { ColumnInfo, RowData } from "./types";
import { calculateCellMetadata, formatCellValueForModal } from "./utils";
import { createLogger } from "../../utils/logger";
import { CopyIcon, XIcon, CodeIcon, KeyIcon, TypeIcon } from "../Icons";
import { formatTypeForBadge, normalizeArrowType } from "../../utils/typeFormatter";

const logger = createLogger("CellModal");

export interface CellModalData {
	value: unknown;
	columnName: string;
	rowNum: number;
	rowIdx: number;
	colIdx: number;
}

interface CellModalProps {
	cellModal: CellModalData;
	columns: ColumnInfo[];
	pageData: RowData[];
	startRow: number;
	connectorType: ConnectorType;
	onClose: () => void;
	onCellChange: (data: CellModalData, rowIdx: number, colIdx: number) => void;
}

// Lightweight JSON syntax highlighting for formatted view mode
function highlightJsonString(json: string): ReactNode {
	const tokenRegex =
		/("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g;

	const parts: ReactNode[] = [];
	let lastIndex = 0;
	let idx = 0;

	const styles: Record<
		string,
		React.CSSProperties
	> = {
		key: { color: "var(--text-primary)", fontWeight: 600 },
		string: { color: "var(--accent)" },
		number: { color: "var(--text-secondary)" },
		boolean: { color: "var(--warning, #f59e0b)" },
		null: { color: "var(--text-muted)" },
		punct: { color: "var(--text-muted)" },
	};

	let match: RegExpExecArray | null;
	while ((match = tokenRegex.exec(json)) !== null) {
		const [full, strToken, colon, boolToken, numberToken, punct] = match;
		if (match.index > lastIndex) {
			parts.push(json.slice(lastIndex, match.index));
		}

		if (strToken) {
			const isKey = Boolean(colon);
			parts.push(
				<span
					key={`json-${idx++}`}
					style={isKey ? styles.key : styles.string}
				>
					{strToken}
				</span>,
			);
			if (colon) {
				parts.push(
					<span key={`json-${idx++}`} style={styles.punct}>
						:
					</span>,
				);
			}
		} else if (boolToken) {
			const type = boolToken === "null" ? "null" : "boolean";
			parts.push(
				<span key={`json-${idx++}`} style={styles[type]}>
					{boolToken}
				</span>,
			);
		} else if (numberToken) {
			parts.push(
				<span key={`json-${idx++}`} style={styles.number}>
					{numberToken}
				</span>,
			);
		} else if (punct) {
			parts.push(
				<span key={`json-${idx++}`} style={styles.punct}>
					{punct}
				</span>,
			);
		}

		lastIndex = tokenRegex.lastIndex;
	}

	if (lastIndex < json.length) {
		parts.push(json.slice(lastIndex));
	}

	return (
		<pre
			style={{
				margin: 0,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
				fontSize: "13px",
				color: "var(--text-primary)",
			}}
		>
			{parts}
		</pre>
	);
}

/**
 * Modal component for viewing cell contents in detail.
 * Supports raw/formatted view modes, cursor mode for text selection,
 * and arrow key navigation between cells.
 */
export function CellModal({
	cellModal,
	columns,
	pageData,
	startRow,
	connectorType,
	onClose,
	onCellChange,
}: CellModalProps) {

	const [modalViewMode, setModalViewMode] = useState<"raw" | "formatted">(
		"formatted",
	);
	const [isCursorMode, setIsCursorMode] = useState(false);
	const [typeExpanded, setTypeExpanded] = useState(false);
	const modalBodyRef = useRef<HTMLDivElement | HTMLTextAreaElement>(null);
	const columnTypeRaw =
		columns.find((c) => c.name === cellModal.columnName)?.type || "";
	const columnType = normalizeArrowType(columnTypeRaw);

	// Define callbacks first (before effects that use them)
	const handleCopy = useCallback(() => {
		const content = formatCellValueForModal(
			cellModal.value as CellValue,
			columnType,
			connectorType,
			modalViewMode,
		);
		navigator.clipboard.writeText(content);
	}, [cellModal, columnType, connectorType, modalViewMode]);

	const handleNavigate = useCallback(
		(direction: "left" | "right" | "up" | "down") => {
			let newRowIdx = cellModal.rowIdx;
			let newColIdx = cellModal.colIdx;

			switch (direction) {
				case "left":
					newColIdx = cellModal.colIdx - 1;
					if (newColIdx < 0) return;
					break;
				case "right":
					newColIdx = cellModal.colIdx + 1;
					if (newColIdx >= columns.length) return;
					break;
				case "up":
					newRowIdx = cellModal.rowIdx - 1;
					if (newRowIdx < 0) return;
					break;
				case "down":
					newRowIdx = cellModal.rowIdx + 1;
					if (newRowIdx >= pageData.length) return;
					break;
			}

			const row = pageData[newRowIdx];
			const col = columns[newColIdx];
			const globalRowNum = startRow + newRowIdx;

			onCellChange(
				{
					value: row[col.name],
					columnName: col.name,
					rowNum: globalRowNum + 1,
					rowIdx: newRowIdx,
					colIdx: newColIdx,
				},
				newRowIdx,
				newColIdx,
			);
		},
		[cellModal, columns, pageData, startRow, onCellChange],
	);

	const handleViewModeKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Handle Enter key to enable cursor mode
			if (e.key === "Enter") {
				e.preventDefault();
				setIsCursorMode(true);
				return;
			}

			// Handle Escape key to close modal
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
				return;
			}

			// Handle Cmd+C / Ctrl+C for copying selected text
			if ((e.metaKey || e.ctrlKey) && e.key === "c") {
				const selection = window.getSelection();
				const selectedText = selection?.toString() || "";

				if (selectedText) {
					e.preventDefault();
					e.stopPropagation();
					navigator.clipboard.writeText(selectedText);
					return;
				}
			}

			// Arrow key navigation between cells
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				e.stopPropagation(); // Prevent double handling from bubbling
				handleNavigate("left");
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				e.stopPropagation();
				handleNavigate("right");
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				handleNavigate("up");
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				handleNavigate("down");
			}
		},
		[handleNavigate, onClose],
	);

	const handleCursorModeKeyDown = useCallback((e: React.KeyboardEvent) => {
		// Stop all keyboard events from bubbling to the grid
		e.stopPropagation();

		// Handle Escape key to exit cursor mode
		if (e.key === "Escape") {
			e.preventDefault();
			setIsCursorMode(false);
			// Refocus the modal body in view mode after a short delay
			setTimeout(() => {
				if (modalBodyRef.current) {
					modalBodyRef.current.focus();
				}
			}, 10);
			return;
		}
		// Allow all native text selection and navigation commands
	}, []);

	// Focus modal body when opened or when navigating to a new cell
	useEffect(() => {
		if (modalBodyRef.current) {
			modalBodyRef.current.focus();
		}
		// Reset cursor mode when navigating to a new cell
		setIsCursorMode(false);
		setTypeExpanded(false);
	}, [cellModal.rowIdx, cellModal.colIdx]);

	// Global keyboard handler - handles ESC and arrow keys regardless of focus state
	// Uses capture phase to handle before other handlers
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			// ESC key handling
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				if (isCursorMode) {
					// Exit cursor mode first, then close on next ESC
					setIsCursorMode(false);
				} else {
					// In view mode, close modal
					logger.debug("ESC key pressed - closing modal");
					onClose();
				}
				return;
			}

			// Arrow key navigation only in view mode (not cursor mode)
			if (!isCursorMode) {
				if (e.key === "ArrowLeft") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigate("left");
				} else if (e.key === "ArrowRight") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigate("right");
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigate("up");
				} else if (e.key === "ArrowDown") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigate("down");
				} else if (e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					setIsCursorMode(true);
				}
			}
		};

		document.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
		return () => {
			document.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
		};
	}, [isCursorMode, onClose, handleNavigate]);

	// Handle cursor mode changes
	useEffect(() => {
		if (isCursorMode && modalBodyRef.current) {
			modalBodyRef.current.focus();
			// Position cursor at start for textarea
			if (modalBodyRef.current instanceof HTMLTextAreaElement) {
				modalBodyRef.current.setSelectionRange(0, 0);
				modalBodyRef.current.scrollTop = 0;
			}
		}
	}, [isCursorMode]);

	const formattedContent = formatCellValueForModal(
		cellModal.value as CellValue,
		columnType,
		connectorType,
		modalViewMode,
	);

	// Calculate metadata based on what we actually display to the user
	const metadata = calculateCellMetadata(formattedContent, columnType);

	const highlightedContent = useMemo(() => {
		if (modalViewMode !== "formatted") return null;
		try {
			JSON.parse(formattedContent);
			return highlightJsonString(formattedContent);
		} catch {
			return null;
		}
	}, [formattedContent, modalViewMode]);

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10000,
				padding: "20px",
				outline: "none",
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
			// Note: Keyboard handling is done via:
			// - Global ESC handler (capture phase) for closing modal
			// - Modal body div's onKeyDown for arrow navigation
		>
			<div
				style={{
					background: "var(--bg-primary)",
					border: "2px solid var(--border)",
					borderRadius: "8px",
					maxWidth: "900px",
					height: "82vh",
					width: "100%",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Modal header */}
				<div
					className="cell-modal-header"
					style={{
						padding: "12px 16px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						flexDirection: "column",
						gap: "8px",
						background: "var(--bg-secondary)",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							flexWrap: "wrap",
							justifyContent: "space-between",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "8px",
								flexWrap: "wrap",
								minWidth: 0,
								flex: 1,
							}}
						>
							<span
								style={{
									fontWeight: 700,
									fontSize: "13px",
									color: "var(--text-primary)",
								}}
							>
								{cellModal.columnName}
							</span>
							<span
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}
							>
								<span>Row {cellModal.rowNum}</span>
								<span>•</span>
								<span>
									{metadata.lineCount.toLocaleString()}{" "}
									{metadata.lineCount === 1 ? "line" : "lines"}
								</span>
								<span>•</span>
								<span>{metadata.byteSize.toLocaleString()} bytes</span>
							</span>
						</div>

						<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
							<button
								onClick={() =>
									setModalViewMode(
										modalViewMode === "raw" ? "formatted" : "raw",
									)
								}
								style={{
									background: "var(--bg-primary)",
									border: "1px solid var(--border)",
									borderRadius: "4px",
									padding: "6px 10px",
									cursor: "pointer",
									fontSize: "11px",
									color: "var(--text-primary)",
									fontWeight: 500,
								}}
							>
								{modalViewMode === "raw" ? "Formatted" : "Raw"}
							</button>
							<button
								onClick={handleCopy}
								style={{
									background: "var(--bg-primary)",
									border: "1px solid var(--border)",
									borderRadius: "4px",
									padding: "6px 10px",
									cursor: "pointer",
									fontSize: "11px",
									color: "var(--text-primary)",
									fontWeight: 500,
								}}
							>
								Copy
							</button>
							<button
								onClick={onClose}
								style={{
									background: "var(--bg-tertiary)",
									border: "1px solid var(--border)",
									borderRadius: "4px",
									padding: "6px 10px",
									cursor: "pointer",
									fontSize: "11px",
									color: "var(--text-primary)",
								}}
							>
								Close (Esc)
							</button>
						</div>
					</div>

					{/* Type and hint row */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							flexWrap: "wrap",
							minWidth: 0,
						}}
					>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								display: "flex",
								alignItems: "center",
								gap: "6px",
							}}
						>
							<span
								className="cell-data-type-badge"
								style={{
									padding: "4px 8px",
									borderRadius: "4px",
									fontSize: "11px",
									fontWeight: 600,
									letterSpacing: "0.2px",
									background: "var(--bg-primary)",
									border: "1px solid var(--border)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
									flex: 1,
									minWidth: 0,
									display: "flex",
									alignItems: "center",
									gap: "6px",
									color: "var(--text-primary)",
								}}
							>
								<TypeIcon size={12} color="var(--text-secondary)" />
								{typeExpanded
									? columnType || "Unknown"
									: columnType.length > 80
										? `${columnType.slice(0, 77)}...`
										: columnType || "Unknown"}
							</span>
							{(columnType || "").length > 80 && (
								<button
									type="button"
									onClick={() => setTypeExpanded((prev) => !prev)}
									style={{
										background: "var(--bg-primary)",
										border: "1px solid var(--border)",
										borderRadius: "4px",
										padding: "4px 8px",
										cursor: "pointer",
										fontSize: "11px",
										color: "var(--text-primary)",
									}}
								>
									{typeExpanded ? "Collapse" : "Expand"}
								</button>
							)}
						</div>
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: "6px",
								fontSize: "11px",
								color: isCursorMode ? "var(--text-primary)" : "var(--text-secondary)",
								whiteSpace: "nowrap",
								background: isCursorMode
									? "rgba(var(--accent-rgb, 59, 130, 246), 0.12)"
									: "var(--bg-primary)",
								border: `1px solid ${isCursorMode ? "var(--accent)" : "var(--border)"}`,
								borderRadius: "12px",
								padding: "4px 8px",
							}}
						>
							<KeyIcon
								size={12}
								color={isCursorMode ? "var(--accent)" : "var(--text-secondary)"}
							/>
							<span>
								{isCursorMode
									? "Cursor mode · Esc to exit"
									: "View mode · ← ↑ ↓ → navigate · ⏎ Enter for cursor"}
							</span>
						</span>
					</div>

					{typeExpanded && (
						<div
							style={{
								marginTop: "4px",
								padding: "8px",
								background: "var(--bg-primary)",
								border: "1px solid var(--border)",
								borderRadius: "4px",
								maxHeight: "120px",
								overflowY: "auto",
								fontSize: "11px",
								color: "var(--text-primary)",
								whiteSpace: "pre-wrap",
							}}
						>
							{columnType || "Unknown"}
						</div>
					)}
				</div>

				{/* Modal body - removed key prop to prevent remounts on navigation */}
				{isCursorMode ? (
					<textarea
						ref={modalBodyRef as React.RefObject<HTMLTextAreaElement>}
						value={formattedContent}
						onChange={() => {
							// Do nothing - controlled component that shows cursor but doesn't accept edits
						}}
						style={{
							padding: "20px",
							overflowY: "auto",
							flex: 1,
							fontSize: "13px",
							fontFamily: "monospace",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							outline: "none",
							border: "none",
							background: "transparent",
							color: "var(--text-primary)",
							resize: "none",
							width: "100%",
							boxSizing: "border-box",
							cursor: "text",
							caretColor: "var(--accent)",
							caretWidth: "2px",
						}}
						onKeyDown={handleCursorModeKeyDown}
					/>
				) : (
					<div
						ref={modalBodyRef as React.RefObject<HTMLDivElement>}
						tabIndex={0}
						style={{
							padding: "20px",
							overflowY: "auto",
							flex: 1,
							fontSize: "13px",
							fontFamily: "monospace",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							outline: "none",
							userSelect: "auto",
							cursor: "default",
							boxSizing: "border-box",
						}}
						onKeyDown={handleViewModeKeyDown}
					>
						{highlightedContent ?? formattedContent}
					</div>
				)}
			</div>
		</div>
	);
}
