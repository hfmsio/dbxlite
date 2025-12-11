/**
 * Resizable Explorer Panel - DataGrip-like resizable left sidebar
 */

import type React from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

interface ResizableExplorerProps {
	isVisible: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;
const COMPACT_THRESHOLD = 250;

// Context for compact mode
interface ExplorerContextValue {
	isCompact: boolean;
	width: number;
}

const ExplorerContext = createContext<ExplorerContextValue>({
	isCompact: false,
	width: DEFAULT_WIDTH,
});

export function useExplorerContext() {
	return useContext(ExplorerContext);
}

export function ResizableExplorer({
	isVisible,
	onToggle: _onToggle,
	children,
}: ResizableExplorerProps) {
	const [width, setWidth] = useState(() => {
		const saved = localStorage.getItem("data-ide-explorer-width");
		return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
	});
	const [isResizing, setIsResizing] = useState(false);
	const explorerRef = useRef<HTMLDivElement>(null);

	// Save width to localStorage and update CSS variable
	useEffect(() => {
		localStorage.setItem("data-ide-explorer-width", width.toString());
		document.documentElement.style.setProperty(
			"--explorer-width",
			`${width}px`,
		);
	}, [width]);

	// Handle resize
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;

			const newWidth = e.clientX;
			if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
				setWidth(newWidth);
			}
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		if (isResizing) {
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing]);

	const handleResizeStart = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	};

	// Compute compact mode
	const contextValue = useMemo<ExplorerContextValue>(
		() => ({
			isCompact: width < COMPACT_THRESHOLD,
			width,
		}),
		[width],
	);

	if (!isVisible) {
		return null;
	}

	return (
		<ExplorerContext.Provider value={contextValue}>
			<div
				ref={explorerRef}
				className="resizable-explorer"
				style={{ width: `${width}px` }}
			>
				{children}
			</div>
			<div
				className={`explorer-resize-handle ${isResizing ? "resizing" : ""}`}
				onMouseDown={handleResizeStart}
				style={{ left: `${width}px` }}
			>
				<div className="resize-handle-indicator" />
			</div>
		</ExplorerContext.Provider>
	);
}
