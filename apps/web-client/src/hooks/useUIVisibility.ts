/**
 * useUIVisibility Hook
 * Manages UI visibility state for settings modal, toast history panel, and explorer
 */

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "../utils/logger";
import type { SettingsTab } from "../components/SettingsModal";
import type { HelpSubTab } from "../components/settings/HelpSettings";

const logger = createLogger("UIVisibility");

export function useUIVisibility() {
	const [showSettings, setShowSettings] = useState(false);
	const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
	const [settingsInitialHelpSubTab, setSettingsInitialHelpSubTab] = useState<HelpSubTab | undefined>(undefined);
	const [showToastHistory, setShowToastHistory] = useState(false);
	const [showExamples, setShowExamples] = useState(false);
	const [showAIChat, setShowAIChat] = useState(false);
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

	// Open settings modal, optionally to a specific tab. When opening Help,
	// callers can also deep-link to a specific sub-tab (e.g. an error toast
	// pointing users at the Snowflake setup walkthrough).
	const openSettings = useCallback(
		(tab?: SettingsTab, helpSubTab?: HelpSubTab) => {
			setSettingsInitialTab(tab);
			setSettingsInitialHelpSubTab(helpSubTab);
			setShowSettings(true);
		},
		[],
	);

	// Close settings and reset initial tab
	const closeSettings = useCallback(() => {
		setShowSettings(false);
		setSettingsInitialTab(undefined);
		setSettingsInitialHelpSubTab(undefined);
	}, []);

	return {
		showSettings,
		setShowSettings,
		settingsInitialTab,
		settingsInitialHelpSubTab,
		openSettings,
		closeSettings,
		showToastHistory,
		setShowToastHistory,
		showExamples,
		setShowExamples,
		showAIChat,
		setShowAIChat,
		showExplorer,
		setShowExplorer,
		toggleExplorer,
	};
}
