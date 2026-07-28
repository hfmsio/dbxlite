/**
 * useEditorLayout Hook
 * Manages the editor/results split for both orientations (results below the
 * editor, or to its right) with localStorage persistence. Each orientation
 * keeps its own split size so toggling between them is non-destructive.
 */

import { type RefObject, useCallback, useEffect, useState } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("EditorLayout");

/** Axis the splitter drags along. "bottom" resizes height, "right" width. */
export type ResizeOrientation = "bottom" | "right";

const HEIGHT_KEY = "dbxlite-editor-height";
const WIDTH_KEY = "dbxlite-editor-width";

// Minimums keep both panes usable; the max leaves room for the opposite pane.
const MIN_EDITOR_HEIGHT = 200;
const MIN_EDITOR_WIDTH = 320;
const MIN_RESULTS_HEIGHT = 350; // reserved below the editor in bottom mode
const MIN_RESULTS_WIDTH = 360; // reserved right of the editor in right mode

function loadSize(key: string, min: number, fallback: number): number {
	try {
		const saved = localStorage.getItem(key);
		if (saved) {
			const parsed = parseInt(saved, 10);
			if (!Number.isNaN(parsed) && parsed >= min) return parsed;
		}
	} catch (_err) {
		// Ignore localStorage errors
	}
	return fallback;
}

export function useEditorLayout(
	containerRef: RefObject<HTMLDivElement>,
	orientation: ResizeOrientation = "bottom",
) {
	const [editorHeight, setEditorHeight] = useState(() => {
		const windowHeight = window.innerHeight;
		const available = windowHeight - 60 /* header */ - 30 /* footer */;
		// Fallback: 40% of the available height (40/60 editor/results split).
		return loadSize(HEIGHT_KEY, MIN_EDITOR_HEIGHT, Math.floor(available * 0.4));
	});

	const [editorWidth, setEditorWidth] = useState(() =>
		// Fallback: half the viewport width (50/50 editor/results split).
		loadSize(WIDTH_KEY, MIN_EDITOR_WIDTH, Math.floor(window.innerWidth * 0.5)),
	);

	const [isDragging, setIsDragging] = useState(false);

	// Persist each split size independently.
	useEffect(() => {
		try {
			localStorage.setItem(HEIGHT_KEY, editorHeight.toString());
		} catch (err) {
			logger.error("Failed to save editor height", err);
		}
	}, [editorHeight]);

	useEffect(() => {
		try {
			localStorage.setItem(WIDTH_KEY, editorWidth.toString());
		} catch (err) {
			logger.error("Failed to save editor width", err);
		}
	}, [editorWidth]);

	const handleMouseDown = useCallback(() => {
		setIsDragging(true);
	}, []);

	// Handle mouse move / up during a resize drag, along the active axis.
	useEffect(() => {
		if (!isDragging) return;

		const isRight = orientation === "right";
		// Lock the cursor on body to avoid flicker during fast drags.
		document.body.style.cursor = isRight ? "col-resize" : "row-resize";
		document.body.style.userSelect = "none";

		const handleMouseMove = (e: MouseEvent) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();

			if (isRight) {
				const newWidth = e.clientX - rect.left;
				const maxWidth = rect.width - MIN_RESULTS_WIDTH;
				if (newWidth >= MIN_EDITOR_WIDTH && newWidth <= maxWidth) {
					setEditorWidth(newWidth);
				}
			} else {
				const newHeight = e.clientY - rect.top;
				const maxHeight = window.innerHeight - MIN_RESULTS_HEIGHT;
				if (newHeight >= MIN_EDITOR_HEIGHT && newHeight <= maxHeight) {
					setEditorHeight(newHeight);
				}
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
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [isDragging, containerRef, orientation]);

	return {
		editorHeight,
		editorWidth,
		setEditorHeight,
		setEditorWidth,
		isDragging,
		handleMouseDown,
	};
}
