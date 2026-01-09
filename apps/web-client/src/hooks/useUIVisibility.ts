/**
 * useUIVisibility Hook
 * Manages UI visibility state for settings modal, toast history panel, and explorer
 */

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "../utils/logger";
import type { SettingsTab } from "../components/SettingsModal";

const logger = createLogger("UIVisibility");

export function useUIVisibility() {
	const [showSettings, setShowSettings] = useState(false);
	const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
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

	// Open settings modal, optionally to a specific tab
	const openSettings = useCallback((tab?: SettingsTab) => {
		setSettingsInitialTab(tab);
		setShowSettings(true);
	}, []);

	// Close settings and reset initial tab
	const closeSettings = useCallback(() => {
		setShowSettings(false);
		setSettingsInitialTab(undefined);
	}, []);

	return {
		showSettings,
		setShowSettings,
		settingsInitialTab,
		openSettings,
		closeSettings,
		showToastHistory,
		setShowToastHistory,
		showExamples,
		setShowExamples,
		showExplorer,
		setShowExplorer,
		toggleExplorer,
	};
}
