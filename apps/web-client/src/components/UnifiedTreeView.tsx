/**
 * Unified Tree View Component
 *
 * A modern, collapsible tree view that displays data from multiple sources
 * (BigQuery, DuckDB databases, local files) in a consistent hierarchy.
 *
 * Keyboard Navigation:
 * - Up/Down: Navigate between nodes
 * - Right: Expand node (if has children)
 * - Left: Collapse node (if expanded)
 * - Enter: Show context menu
 * - Delete/Backspace: Remove file from workspace (shows confirmation dialog, files only)
 * - Escape: Close context menu / clear focus
 * - Up/Down in menu: Navigate menu items
 * - Enter in menu: Select menu item
 */

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import DOMPurify from "dompurify";
import type { TreeSection, UnifiedTreeNode } from "../types/tree";
import { formatBytes } from "../utils/treeConverters";
import {
	formatTypeForBadge,
	formatTypeForTooltip,
	isComplexType,
} from "../utils/typeFormatter";
import { formatCompactNumber } from "../utils/formatters";
import { useExplorerContext } from "./ResizableExplorer";

interface UnifiedTreeViewProps {
	sections: TreeSection[];
	onSectionToggle: (sectionId: string) => void;
	onNodeClick?: (node: UnifiedTreeNode) => void;
	onNodeExpand?: (node: UnifiedTreeNode) => void;
	onNodeDoubleClick?: (node: UnifiedTreeNode) => void;
	selectedNodeId?: string;
	onAddProject?: () => void;
}

// formatDataType is now imported from typeFormatter.ts as formatTypeForBadge

/**
 * Get color scheme for data type badge
 */
function getTypeColor(type: string): { bg: string; fg: string } {
	const normalized = type.toUpperCase();

	// Color coding by type category
	if (
		normalized.includes("INT") ||
		normalized.includes("BIGINT") ||
		normalized.includes("SMALLINT")
	) {
		return { bg: "#dbeafe", fg: "#1e40af" }; // Blue for integers
	}
	if (
		normalized.includes("FLOAT") ||
		normalized.includes("DOUBLE") ||
		normalized.includes("DECIMAL") ||
		normalized.includes("NUMERIC")
	) {
		return { bg: "#ddd6fe", fg: "#5b21b6" }; // Purple for decimals
	}
	if (
		normalized.includes("VARCHAR") ||
		normalized.includes("TEXT") ||
		normalized.includes("STRING") ||
		normalized.includes("CHAR") ||
		/\[\]\s*$/.test(normalized) // Array of string-like types still uses string palette
	) {
		return { bg: "#d1fae5", fg: "#065f46" }; // Green for strings
	}
	if (normalized.includes("BOOL")) {
		return { bg: "#fef3c7", fg: "#92400e" }; // Amber for booleans
	}
	if (
		normalized.includes("DATE") ||
		normalized.includes("TIME") ||
		normalized.includes("TIMESTAMP")
	) {
		return { bg: "#fce7f3", fg: "#9f1239" }; // Pink for dates/times
	}
	if (normalized.includes("JSON")) {
		return { bg: "#ffedd5", fg: "#9a3412" }; // Orange for JSON
	}
	if (normalized.includes("ARRAY") || normalized.includes("STRUCT")) {
		return { bg: "#e0e7ff", fg: "#3730a3" }; // Indigo for complex types
	}

	// Default gray for unknown types
	return { bg: "#f3f4f6", fg: "#374151" };
}

/**
 * Get tooltip text for status badges
 */
function getBadgeTooltip(badge: string, sourceData?: unknown): string {
	if (badge.includes("ZERO-COPY")) {
		return "File is loaded from disk with direct access handle. No upload needed, changes persist across sessions.";
	}
	if (badge.includes("REMOTE")) {
		return "File is accessed remotely from a URL. Data is fetched on-demand from the remote source.";
	}
	if (badge.includes("ATTACHED")) {
		return "Database is attached and ready to query. All tables and schemas are accessible.";
	}
	if (badge.includes("FAILED")) {
		// Show specific error message if available
		const data = sourceData as Record<string, unknown> | undefined;
		const errorMsg = data?.introspectionError || data?.restoreError;
		if (typeof errorMsg === "string") {
			return `Failed: ${errorMsg}`;
		}
		return "File restoration failed. The file handle could not be restored from the previous session. You may need to re-upload the file.";
	}
	return badge;
}

function UnifiedTreeView({
	sections,
	onSectionToggle,
	onNodeClick,
	onNodeExpand,
	onNodeDoubleClick,
	selectedNodeId,
	onAddProject,
}: UnifiedTreeViewProps) {
	// Get compact mode state from explorer context
	const { isCompact } = useExplorerContext();

	const [contextMenu, setContextMenu] = useState<{
		node: UnifiedTreeNode;
		x: number;
		y: number;
	} | null>(null);
	const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(-1);
	const [menuFocusIndex, setMenuFocusIndex] = useState<number>(0);
	const [isTreeFocused, setIsTreeFocused] = useState<boolean>(false);
	const [userClearedFocus, setUserClearedFocus] = useState<boolean>(false);
	const [_hoveredIconId, setHoveredIconId] = useState<string | null>(null);
	const [isKeyboardNavigating, setIsKeyboardNavigating] =
		useState<boolean>(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const pendingDeleteIndexRef = useRef<number | null>(null);
	const prevVisibleNodesLengthRef = useRef<number>(0);
	const focusFromMouseRef = useRef<boolean>(false); // Track if focus came from mouse click

	// Build flat list of all visible nodes for keyboard navigation
	const visibleNodes = useMemo(() => {
		const nodes: UnifiedTreeNode[] = [];

		const traverse = (node: UnifiedTreeNode) => {
			nodes.push(node);
			if (node.children && node.isExpanded) {
				node.children.forEach(traverse);
			}
		};

		sections.forEach((section) => {
			if (!section.isCollapsed) {
				section.nodes.forEach(traverse);
			}
		});

		return nodes;
	}, [sections]);

	// Get currently focused node
	const focusedNode =
		focusedNodeIndex >= 0 && focusedNodeIndex < visibleNodes.length
			? visibleNodes[focusedNodeIndex]
			: null;

	// Close context menu on click outside
	useEffect(() => {
		const handleClick = () => setContextMenu(null);
		if (contextMenu) {
			document.addEventListener("click", handleClick);
			return () => document.removeEventListener("click", handleClick);
		}
	}, [contextMenu]);

	// Scroll focused node into view
	useEffect(() => {
		if (focusedNode && nodeRefs.current.has(focusedNode.id)) {
			const element = nodeRefs.current.get(focusedNode.id);
			element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [focusedNode]);

	// Restore focus after file deletion
	useEffect(() => {
		const prevLength = prevVisibleNodesLengthRef.current;
		const currLength = visibleNodes.length;
		prevVisibleNodesLengthRef.current = currLength;

		// Only trigger if we have a pending delete and list shrunk
		if (
			pendingDeleteIndexRef.current !== null &&
			currLength > 0 &&
			currLength < prevLength
		) {
			const targetIndex = Math.min(
				pendingDeleteIndexRef.current,
				currLength - 1,
			);
			const node = visibleNodes[targetIndex];
			// Clear ref immediately to prevent duplicate runs
			pendingDeleteIndexRef.current = null;

			if (node) {
				// Delay to ensure dialog has fully closed and DOM is ready
				setTimeout(() => {
					setFocusedNodeIndex(targetIndex);
					setIsTreeFocused(true);
					// Focus the tree container (not individual nodes - they don't have tabIndex)
					containerRef.current?.focus();
					// Scroll the node into view
					const element = nodeRefs.current.get(node.id);
					element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
				}, 100);
			}
		}
	}, [visibleNodes]);

	// Smart context menu positioning
	const showContextMenuWithPositioning = useCallback(
		(node: UnifiedTreeNode, x: number, y: number) => {
			const menuWidth = 200;
			const menuHeight = (node.actions?.length || 0) * 35 + 8; // Approximate height

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			// Adjust X if menu would go off right edge
			let adjustedX = x;
			if (x + menuWidth > viewportWidth) {
				adjustedX = viewportWidth - menuWidth - 10;
			}

			// Adjust Y if menu would go off bottom edge
			let adjustedY = y;
			if (y + menuHeight > viewportHeight) {
				adjustedY = viewportHeight - menuHeight - 10;
			}

			// Ensure minimum distance from edges
			adjustedX = Math.max(10, adjustedX);
			adjustedY = Math.max(10, adjustedY);

			setContextMenu({
				node,
				x: adjustedX,
				y: adjustedY,
			});
		},
		[],
	);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Check if tree container has focus or if context menu is open
			const isTreeFocused = containerRef.current?.contains(
				document.activeElement,
			);

			// Close menu with Escape
			if (e.key === "Escape") {
				if (contextMenu) {
					setContextMenu(null);
					e.preventDefault();
					return;
				}
				// If no menu is open but tree is focused, clear the focused node
				if (isTreeFocused && focusedNodeIndex !== -1) {
					setFocusedNodeIndex(-1);
					setUserClearedFocus(true);
					e.preventDefault();
					return;
				}
			}

			// Only handle keyboard events if context menu is open OR tree is focused
			if (!contextMenu && !isTreeFocused) {
				return;
			}

			// Context menu navigation
			if (contextMenu?.node.actions) {
				const actions = contextMenu.node.actions;

				if (e.key === "ArrowDown") {
					e.preventDefault();
					setMenuFocusIndex((prev) => (prev + 1) % actions.length);
					return;
				}

				if (e.key === "ArrowUp") {
					e.preventDefault();
					setMenuFocusIndex(
						(prev) => (prev - 1 + actions.length) % actions.length,
					);
					return;
				}

				if (e.key === "Enter") {
					e.preventDefault();
					const action = actions[menuFocusIndex];
					if (action) {
						action.onClick();
						setContextMenu(null);
					}
					return;
				}
			}

			// Tree navigation (only when menu is closed)
			if (!contextMenu && visibleNodes.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setUserClearedFocus(false); // User is manually navigating again
					setIsKeyboardNavigating(true);
					setHoveredIconId(null);
					setFocusedNodeIndex((prev) => {
						const next =
							prev === -1 ? 0 : Math.min(prev + 1, visibleNodes.length - 1);
						const node = visibleNodes[next];
						if (node) {
							onNodeClick?.(node);
						}
						return next;
					});
					return;
				}

				if (e.key === "ArrowUp") {
					e.preventDefault();
					setUserClearedFocus(false); // User is manually navigating again
					setIsKeyboardNavigating(true);
					setHoveredIconId(null);
					setFocusedNodeIndex((prev) => {
						const next =
							prev === -1 ? visibleNodes.length - 1 : Math.max(prev - 1, 0);
						const node = visibleNodes[next];
						if (node) {
							onNodeClick?.(node);
						}
						return next;
					});
					return;
				}

				if (e.key === "ArrowRight" && focusedNode) {
					e.preventDefault();
					setIsKeyboardNavigating(true);
					setHoveredIconId(null);
					const isXlsxSheet =
						focusedNode.type === "table" &&
						focusedNode.source === "file" &&
						focusedNode.metadata?.sheetIndex !== undefined;
					const hasChildren =
						(focusedNode.children && focusedNode.children.length > 0) ||
						isXlsxSheet;
					if (hasChildren && !focusedNode.isExpanded) {
						onNodeExpand?.(focusedNode);
					}
					return;
				}

				if (e.key === "ArrowLeft" && focusedNode) {
					e.preventDefault();
					setIsKeyboardNavigating(true);
					setHoveredIconId(null);
					const isXlsxSheet =
						focusedNode.type === "table" &&
						focusedNode.source === "file" &&
						focusedNode.metadata?.sheetIndex !== undefined;
					const hasChildren =
						(focusedNode.children && focusedNode.children.length > 0) ||
						isXlsxSheet;
					if (hasChildren && focusedNode.isExpanded) {
						onNodeExpand?.(focusedNode);
					}
					return;
				}

				if (e.key === "Enter" && focusedNode) {
					e.preventDefault();
					if (focusedNode.actions && focusedNode.actions.length > 0) {
						// Show context menu at node position
						const element = nodeRefs.current.get(focusedNode.id);
						if (element) {
							const rect = element.getBoundingClientRect();
							showContextMenuWithPositioning(
								focusedNode,
								rect.left + 20,
								rect.bottom,
							);
						}
					} else {
						// No actions - trigger double-click behavior
						onNodeDoubleClick?.(focusedNode);
					}
					return;
				}

				// Handle both Delete and Backspace (Mac keyboards use Backspace)
				if ((e.key === "Delete" || e.key === "Backspace") && focusedNode) {
					e.preventDefault();
					// Only allow delete for file nodes (not databases or other types)
					if (focusedNode.type === "file") {
						// Find and execute the delete action (it will show its own confirmation dialog)
						const deleteAction = focusedNode.actions?.find(
							(a) => a.id === "delete",
						);
						if (deleteAction) {
							// Store index for focus restoration after delete
							pendingDeleteIndexRef.current = focusedNodeIndex;
							deleteAction.onClick();
						}
					}
					return;
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [
		contextMenu,
		focusedNode,
		focusedNodeIndex,
		visibleNodes,
		menuFocusIndex,
		onNodeClick,
		onNodeExpand,
		showContextMenuWithPositioning,
	]);

	// Reset menu focus index when menu opens
	useEffect(() => {
		if (contextMenu) {
			setMenuFocusIndex(0);
		}
	}, [contextMenu]);

	const handleNodeClick = (node: UnifiedTreeNode, e: React.MouseEvent) => {
		e.stopPropagation();

		// Clear the user cleared focus flag when clicking with mouse
		setUserClearedFocus(false);

		// Update focused index
		const index = visibleNodes.findIndex((n) => n.id === node.id);
		if (index !== -1) {
			setFocusedNodeIndex(index);
		}

		// Toggle expansion if node has children or is an XLSX sheet (lazy-loaded columns)
		const isXlsxSheet =
			node.type === "table" &&
			node.source === "file" &&
			node.metadata?.sheetIndex !== undefined;
		if ((node.children && node.children.length > 0) || isXlsxSheet) {
			onNodeExpand?.(node);
		}

		onNodeClick?.(node);
	};

	const handleNodeDoubleClick = (
		node: UnifiedTreeNode,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		onNodeDoubleClick?.(node);
	};

	const handleContextMenu = (node: UnifiedTreeNode, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (node.actions && node.actions.length > 0) {
			showContextMenuWithPositioning(node, e.clientX, e.clientY);
		}
	};

	const handleDragStart = (node: UnifiedTreeNode, e: React.DragEvent) => {
		if (!node.actions || node.actions.length === 0) {
			e.preventDefault();
			return;
		}

		// Store node metadata for drag & drop to trash icon
		const sourceData = node.sourceData as Record<string, unknown> | undefined;
		const nodeData = {
			id: node.id,
			type: node.type,
			name: node.name,
			sourceData: {
				id: sourceData?.id,
				name: sourceData?.name,
				attachedAs: sourceData?.attachedAs,
				domain: sourceData?.domain,
				path: sourceData?.path,
			},
		};
		e.dataTransfer.setData("application/tree-node", JSON.stringify(nodeData));

		// Generate default SQL based on node type for dragging to editor
		// Use generateDefaultSQL for tables, files, and sheets
		const defaultSQL =
			node.type === "table" || node.type === "file"
				? generateDefaultSQL(node)
				: node.name; // For columns, just use the name

		e.dataTransfer.setData("text/plain", defaultSQL);
		e.dataTransfer.effectAllowed = "copyMove"; // Allow both copy and move

		// Create a custom drag image that's smaller and cleaner (neutral color)
		const dragPreview = document.createElement("div");
		dragPreview.style.cssText = `
      position: absolute;
      top: -1000px;
      left: -1000px;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      white-space: nowrap;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
		dragPreview.textContent = `${node.name}`;
		document.body.appendChild(dragPreview);

		// Set the custom drag image
		e.dataTransfer.setDragImage(dragPreview, 75, 15);

		// Clean up the preview element after drag starts
		setTimeout(() => {
			document.body.removeChild(dragPreview);
		}, 0);

		// Add visual feedback
		if (e.currentTarget instanceof HTMLElement) {
			e.currentTarget.style.opacity = "0.5";
		}
	};

	const handleDragEnd = (e: React.DragEvent) => {
		if (e.currentTarget instanceof HTMLElement) {
			e.currentTarget.style.opacity = "1";
		}
	};

	const generateDefaultSQL = (node: UnifiedTreeNode): string => {
		// Generate default SELECT * query based on node type
		if (node.type === "table" && node.sourceData) {
			const sourceData = node.sourceData as Record<string, unknown>;
			// Check if this is an XLSX sheet (has sheetIndex in metadata)
			if (node.source === "file" && node.metadata?.sheetIndex !== undefined) {
				// This is an XLSX sheet - need to find parent file name
				// The node ID format is: ${fileId}.sheet.${sheetName}
				const sheetName =
					typeof sourceData?.name === "string" ? sourceData.name : node.name;
				const fileNodeId = node.id.split(".sheet.")[0];

				// Find the parent file node to get the actual filename or remote URL
				let fileReference = "file.xlsx"; // fallback
				for (const section of sections) {
					const fileNode = section.nodes.find((n) => n.id === fileNodeId);
					if (fileNode?.sourceData) {
						const fileSourceData =
							fileNode.sourceData as Record<string, unknown>;
						// For remote files, use full URL; for local files, use name
						fileReference =
							fileSourceData?.isRemote && typeof fileSourceData?.remoteURL === "string"
								? fileSourceData.remoteURL
								: fileNode.name;
						break;
					}
				}

				return `SELECT * FROM read_xlsx('${fileReference}', sheet='${sheetName}');`;
			}
			// Regular database table
			const tableName =
				typeof sourceData?.fullName === "string"
					? sourceData.fullName
					: node.name;
			return `SELECT * FROM ${tableName};`;
		} else if (node.type === "file") {
			const sourceData = node.sourceData as Record<string, unknown>;
			// For files, use full URL for remote files, filename for local files
			if (sourceData?.isRemote && typeof sourceData?.remoteURL === "string") {
				return `SELECT * FROM '${sourceData.remoteURL}';`;
			}
			return `SELECT * FROM '${node.name}';`;
		} else if (node.type === "column") {
			return node.name; // Just the column name, no semicolon
		}
		return node.name;
	};

	const renderNode = (
		node: UnifiedTreeNode,
		level: number = 0,
		isLastChild: boolean = true,
		ancestorLines: boolean[] = [],
	): React.ReactNode => {
		// Only show selected styling when tree is focused AND user hasn't cleared focus
		// This prevents the faint background from persisting after Escape is pressed
		const isSelected =
			node.id === selectedNodeId && isTreeFocused && !userClearedFocus;
		const isFocused = focusedNode?.id === node.id && isTreeFocused;
		const isXlsxSheet =
			node.type === "table" &&
			node.source === "file" &&
			node.metadata?.sheetIndex !== undefined;
		const hasChildren =
			(node.children && node.children.length > 0) || isXlsxSheet;
		const isExpanded = node.isExpanded ?? false;
		// Allow dragging for nodes with actions, even if they have children (e.g., tables with columns)
		const isDraggable = node.actions && node.actions.length > 0;

		// Build class name for node
		const nodeClassName = [
			"tree-node",
			isSelected && "selected",
			isFocused && "focused",
		]
			.filter(Boolean)
			.join(" ");

		return (
			<div key={node.id}>
				{/* Node Item */}
				<div
					ref={(el) => {
						if (el) {
							nodeRefs.current.set(node.id, el);
						} else {
							nodeRefs.current.delete(node.id);
						}
					}}
					draggable={isDraggable}
					onDragStart={(e) => handleDragStart(node, e)}
					onDragEnd={handleDragEnd}
					onClick={(e) => handleNodeClick(node, e)}
					onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
					onContextMenu={(e) => handleContextMenu(node, e)}
					className={nodeClassName}
					style={{
						paddingLeft: `${8 + level * 24}px`,
						cursor: isKeyboardNavigating ? "none" : "pointer",
					}}
				>
					{/* Tree Lines */}
					{level > 0 && (
						<>
							{/* Ancestor continuation lines */}
							{ancestorLines.slice(0, -1).map(
								(shouldContinue, ancestorLevel) =>
									shouldContinue &&
									ancestorLines
										.slice(ancestorLevel + 1)
										.every((v) => v !== false) && (
										<div
											key={`ancestor-${ancestorLevel}`}
											className="tree-line-vertical"
											style={{
												left: `${8 + ancestorLevel * 24 + 6}px`,
												top: 0,
												bottom: 0,
											}}
										/>
									),
							)}

							{/* Own vertical line at parent's level position */}
							<div
								className="tree-line-vertical"
								style={{
									left: `${8 + (level - 1) * 24 + 6}px`,
									top: 0,
									bottom: isLastChild ? "50%" : 0,
								}}
							/>

							{/* Horizontal line from vertical line to node content */}
							<div
								className="tree-line-horizontal"
								style={{
									left: `${8 + (level - 1) * 24 + 6}px`,
									top: "calc(50% - 1px)",
									width: 17,
								}}
							/>
						</>
					)}

					{/* Expand/collapse indicator for nodes with children */}
					{hasChildren && (
						<span className="tree-node-expand">
							{isExpanded ? "▼" : "▶"}
						</span>
					)}

					{/* Vertical line from expand icon down to children (only when expanded) */}
					{hasChildren && isExpanded && (
						<div
							className="tree-line-vertical"
							style={{
								left: `${8 + level * 24 + 6}px`, /* Align with children's horizontal line connection point */
								top: 20, /* Start below ▼ icon */
								bottom: 0,
								pointerEvents: "none",
							}}
						/>
					)}

					{/* Content wrapper for two-line layout */}
					<div className="tree-node-content">
						{/* Main row: icon, name, badges - uses CSS Grid for smart space distribution */}
						<div className="tree-node-main">
							{/* Left side: icon + name (fills available space) */}
							<div className="tree-node-name-wrapper">
								{/* File type icon */}
								{node.icon && (
									<span
										className="tree-node-icon"
										style={{ color: node.iconColor || "var(--text-secondary)" }}
									>
										{typeof node.icon === "string" ? node.icon : node.icon}
									</span>
								)}

								{/* Name */}
								<span className="tree-node-name">{node.name}</span>

								{/* Inline metadata for tables only: row count */}
								{node.type === "table" &&
								 node.metadata?.rowCount !== undefined &&
								 !node.metadata.isIntrospecting && (
									<span className="tree-node-inline-meta">
										{formatCompactNumber(node.metadata.rowCount)}
									</span>
								)}

								{/* Data Type Badge (for columns) */}
								{node.type === "column" && node.metadata?.dataType && (
									<span
										className="tree-node-type-badge"
										style={{
											background: getTypeColor(node.metadata.dataType).bg,
											color: getTypeColor(node.metadata.dataType).fg,
											cursor: isKeyboardNavigating
												? "none"
												: isComplexType(node.metadata.dataType)
													? "help"
													: "default",
										}}
										title={
											isComplexType(node.metadata.dataType)
												? formatTypeForTooltip(node.metadata.dataType)
												: node.metadata.dataType
										}
									>
										{formatTypeForBadge(node.metadata.dataType)}
									</span>
								)}
							</div>

							{/* Badge - right-aligned to explorer edge */}
							{(node.badge || node.badgeSuffixes?.length) && (() => {
								// Badge format is "emoji TEXT" (e.g., "🔗 ATTACHED", "⚡ ZERO-COPY")
								// Split into icon (first grapheme) and text (rest)
								const parts = node.badge ? [...node.badge] : []; // Spread to handle multi-byte emojis
								const badgeIcon = parts[0] || "";
								const badgeText = parts.slice(1).join("").trim();
								return (
									<span
										className={`tree-node-badge${isCompact ? " compact" : ""}`}
										title={node.badge ? getBadgeTooltip(node.badge, node.sourceData) : undefined}
										style={{
											background: node.badgeColor || "var(--bg-tertiary)",
											cursor: isKeyboardNavigating ? "none" : "help",
										}}
									>
										{node.badge && (
											<>
												<span className="badge-icon">{badgeIcon}</span>
												<span className="badge-text">{badgeText}</span>
											</>
										)}
										{node.badgeSuffixes
										?.slice() // Don't mutate original
										.sort((a, b) => b.priority - a.priority) // Higher priority first (leftmost)
										.map((suffix, i) => (
											<span
												key={i}
												className={`badge-suffix priority-${suffix.priority}`}
												title={suffix.tooltip}
												data-priority={suffix.priority}
											>
												<span className="suffix-icon">{suffix.icon}</span>
												<span className="suffix-label">{suffix.label}</span>
											</span>
										))}
									</span>
								);
							})()}
						</div>

						{/* Secondary row: metadata for files/databases, or "Analyzing..." state */}
						{node.metadata && (
							(node.metadata.isIntrospecting ||
							 ((node.type === "file" || node.type === "database") &&
							  (node.metadata.rowCount !== undefined || node.metadata.sizeFormatted)))
						) && (
							<div className="tree-node-secondary">
								{node.metadata.isIntrospecting ? (
									<span style={{ fontStyle: "italic" }}>Analyzing...</span>
								) : (
									<>
										{node.metadata.rowCount !== undefined &&
											`${formatCompactNumber(node.metadata.rowCount)} rows`}
										{node.metadata.sizeFormatted && (
											<>
												{node.metadata.rowCount !== undefined && " · "}
												{node.metadata.sizeFormatted}
											</>
										)}
									</>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Children */}
				{hasChildren && isExpanded && (
					<div style={{ position: "relative" }}>
						{/* When I'm expanded and NOT last child, draw a line at MY level */}
						{!isLastChild && (
							<div
								className="tree-line-vertical"
								style={{
									left: `${8 + (level - 1) * 24 + 6 + 2}px`,
									top: 0,
									bottom: 0,
									pointerEvents: "none",
								}}
							/>
						)}
						{node.children?.map((child, idx) => {
							const isLast = idx === (node.children?.length ?? 0) - 1;
							// Append this node's continuation status: true if NOT last child
							const newAncestorLines = [...ancestorLines, !isLastChild];
							return renderNode(child, level + 1, isLast, newAncestorLines);
						})}
					</div>
				)}
			</div>
		);
	};

	return (
		<div
			ref={containerRef}
			data-tree-view="explorer"
			tabIndex={0}
			className={`tree-container${isKeyboardNavigating ? ' keyboard-navigating' : ''}`}
			style={{ cursor: isKeyboardNavigating ? "none" : "default" }}
			onMouseMove={() => {
				if (isKeyboardNavigating) {
					setIsKeyboardNavigating(false);
					setFocusedNodeIndex(-1); // Clear keyboard focus when switching to mouse
					setUserClearedFocus(true); // Also clear selection highlight
				}
			}}
			onMouseDown={(e) => {
				// Track that focus came from mouse click
				focusFromMouseRef.current = true;
				// Clear focus/selection visual when clicking on non-node areas (like section headers)
				// The node click handler will restore these when clicking on actual nodes
				const target = e.target as HTMLElement;
				const isNodeClick = target.closest('.tree-node');
				if (!isNodeClick) {
					setUserClearedFocus(true);
					setFocusedNodeIndex(-1);
				}
			}}
			onFocus={() => {
				setIsTreeFocused(true);
				// Only auto-focus first node when tabbing in, not on mouse click
				if (
					focusedNodeIndex === -1 &&
					visibleNodes.length > 0 &&
					!userClearedFocus &&
					!focusFromMouseRef.current
				) {
					setFocusedNodeIndex(0);
				}
				// Reset mouse flag after focus handling
				focusFromMouseRef.current = false;
			}}
			onBlur={() => {
				setIsTreeFocused(false);
			}}
		>
			{sections.map((section) => (
				<div key={section.id} className={`tree-section ${section.className || ""}`}>
					{/* Section Header */}
					<div
						onClick={() => onSectionToggle(section.id)}
						className="tree-section-header"
						style={{ cursor: isKeyboardNavigating ? "none" : "pointer" }}
					>
						{/* Collapse Icon */}
						<span
							className={`tree-section-icon ${section.isCollapsed ? "" : "expanded"}`}
						>
							▶
						</span>

						{/* Section Icon */}
						<span
							className="tree-section-title-icon"
							style={section.iconColor ? { color: section.iconColor } : undefined}
						>
							{typeof section.icon === "string" ? section.icon : section.icon}
						</span>

						{/* Section Title */}
						<span className="tree-section-title">{section.title}</span>

						{/* Section Badge */}
						{section.badge && (
							<span
								className="tree-section-badge"
								style={{
									backgroundColor: section.badgeColor ? `${section.badgeColor}20` : "var(--bg-tertiary)",
									color: section.badgeColor || "var(--text-secondary)",
								}}
							>
								{section.badge}
							</span>
						)}

						{/* Section Hint (subtle legend) */}
						{section.hint && (
							<span
								className="tree-section-hint"
								style={{
									fontSize: "10px",
									color: "var(--text-muted)",
									marginLeft: "8px",
									opacity: 0.8,
								}}
								// biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify sanitizes the content
								dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.hint) }}
							/>
						)}

						{/* Node Count and Size */}
						<span className="tree-section-count">
							{section.nodes.length}{" "}
							{section.nodes.length === 1 ? "item" : "items"}
							{section.totalSize !== undefined && section.totalSize > 0 && (
								<> · {formatBytes(section.totalSize)}</>
							)}
						</span>

						{/* Add Project Button (for cloud/BigQuery section only) */}
						{section.id === "cloud" && onAddProject && (
							<button
								className="tree-section-action"
								onClick={(e) => {
									e.stopPropagation();
									onAddProject();
								}}
								title="Pin a project (e.g., bigquery-public-data)"
							>
								+
							</button>
						)}
					</div>

					{/* Section Content */}
					{!section.isCollapsed && (
						<div className="tree-section-content">
							{section.nodes.length === 0 ? (
								<div className="tree-empty">No items</div>
							) : (
								section.nodes.map((node, idx) => {
									const isLast = idx === section.nodes.length - 1;
									return renderNode(node, 0, isLast, []);
								})
							)}
						</div>
					)}
				</div>
			))}

			{/* Context Menu */}
			{contextMenu && (
				<div
					className="tree-context-menu"
					style={{ left: contextMenu.x, top: contextMenu.y }}
					onClick={(e) => e.stopPropagation()}
				>
					{contextMenu.node.actions?.map((action, idx) => (
						<React.Fragment key={action.id}>
							{action.separator && idx > 0 && (
								<div className="tree-context-separator" />
							)}
							<div
								onClick={() => {
									action.onClick();
									setContextMenu(null);
								}}
								title={action.tooltip}
								className={`tree-context-item ${idx === menuFocusIndex ? "focused" : ""}`}
								style={{ cursor: isKeyboardNavigating ? "none" : "pointer" }}
								onMouseEnter={() => {
									if (!isKeyboardNavigating) {
										setMenuFocusIndex(idx);
									}
								}}
							>
								{action.icon && (
									<span className="tree-context-icon">
										{typeof action.icon === "string" ? action.icon : action.icon}
									</span>
								)}
								<span>{action.label}</span>
							</div>
						</React.Fragment>
					))}
				</div>
			)}
		</div>
	);
}

export default React.memo(UnifiedTreeView);
