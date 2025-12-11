/**
 * useEditorLayout Hook
 * Manages editor height and resize dragging state with localStorage persistence
 */

import { type RefObject, useCallback, useEffect, useState } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("EditorLayout");

export function useEditorLayout(containerRef: RefObject<HTMLDivElement>) {
	const [editorHeight, setEditorHeight] = useState(() => {
		// Try to load from localStorage first
		try {
			const saved = localStorage.getItem("dbxlite-editor-height");
			if (saved) {
				const parsed = parseInt(saved, 10);
				if (!Number.isNaN(parsed) && parsed >= 150) {
					return parsed;
				}
			}
		} catch (_err) {
			// Ignore localStorage errors
		}

		// Fallback: Calculate 40% of viewport height for editor (40-60 split)
		const windowHeight = window.innerHeight;
		const headerHeight = 60; // approximate header height
		const footerHeight = 30; // approximate footer height
		const availableHeight = windowHeight - headerHeight - footerHeight;
		return Math.floor(availableHeight * 0.4); // 40% for editor
	});

	const [isDragging, setIsDragging] = useState(false);

	// Persist editor height to localStorage
	useEffect(() => {
		try {
			localStorage.setItem("dbxlite-editor-height", editorHeight.toString());
		} catch (err) {
			logger.error("Failed to save editor height", err);
		}
	}, [editorHeight]);

	// Mouse handlers for resize
	const handleMouseDown = useCallback(() => {
		setIsDragging(true);
	}, []);

	// Handle mouse move and mouse up during resize
	useEffect(() => {
		if (!isDragging) return;

		// Lock cursor to row-resize on body to prevent flickering during fast drags
		document.body.style.cursor = "row-resize";
		document.body.style.userSelect = "none";

		const handleMouseMove = (e: MouseEvent) => {
			if (!containerRef.current) return;

			const containerTop = containerRef.current.getBoundingClientRect().top;
			const newHeight = e.clientY - containerTop;

			// Clamp between min and max heights (matching original App.tsx constraints)
			const minHeight = 200;
			const maxHeight = window.innerHeight - 350;

			if (newHeight >= minHeight && newHeight <= maxHeight) {
				setEditorHeight(newHeight);
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
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
	}, [isDragging, containerRef]);

	return {
		editorHeight,
		setEditorHeight,
		isDragging,
		handleMouseDown,
	};
}
