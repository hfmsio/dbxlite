/**
 * useUIVisibility Hook
 * Manages UI visibility state for settings modal, toast history panel, and explorer
 */

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("UIVisibility");

export function useUIVisibility() {
	const [showSettings, setShowSettings] = useState(false);
	const [showToastHistory, setShowToastHistory] = useState(false);
	const [showExamples, setShowExamples] = useState(false);
	const [showExplorer, setShowExplorer] = useState(() => {
		try {
			const saved = localStorage.getItem("dbxlite-show-explorer");
			return saved ? JSON.parse(saved) : true;
		} catch {
			return true;
		}
	});

	// Persist explorer visibility to localStorage
	useEffect(() => {
		try {
			localStorage.setItem(
				"dbxlite-show-explorer",
				JSON.stringify(showExplorer),
			);
		} catch (err) {
			logger.error("Failed to save explorer visibility", err);
		}
	}, [showExplorer]);

	const toggleExplorer = useCallback(() => {
		setShowExplorer((prev: boolean) => !prev);
	}, []);

	return {
		showSettings,
		setShowSettings,
		showToastHistory,
		setShowToastHistory,
		showExamples,
		setShowExamples,
		showExplorer,
		setShowExplorer,
		toggleExplorer,
	};
}
