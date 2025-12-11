import { useEffect, useState } from "react";
import { createLogger } from "../utils/logger";
import type { TabState } from "./useTabManager";

const logger = createLogger("SQLTemplates");

interface SQLTemplates {
	initialTab: string;
	newTab: string;
}

const DEFAULT_TEMPLATES: SQLTemplates = {
	initialTab:
		"-- Write SQL here\n-- Press Cmd/Ctrl+Enter to run\nSELECT 1 as result;",
	newTab: "",
};

interface UseSQLTemplatesOptions {
	tabs: TabState[];
	setTabs: React.Dispatch<React.SetStateAction<TabState[]>>;
}

interface UseSQLTemplatesReturn {
	sqlTemplates: SQLTemplates;
}

/**
 * Hook to manage SQL templates
 * - Loads templates from /sql-templates/ on mount
 * - Updates first tab with initial template when loaded
 * - Falls back to defaults if loading fails
 */
export function useSQLTemplates({
	tabs,
	setTabs,
}: UseSQLTemplatesOptions): UseSQLTemplatesReturn {
	const [sqlTemplates, setSqlTemplates] =
		useState<SQLTemplates>(DEFAULT_TEMPLATES);

	// Load SQL templates from files on mount
	useEffect(() => {
		const loadTemplates = async () => {
			try {
				const [initialTabResponse, newTabResponse] = await Promise.all([
					fetch("/sql-templates/initial-tab.sql"),
					fetch("/sql-templates/new-tab.sql"),
				]);

				if (initialTabResponse.ok && newTabResponse.ok) {
					const initialTab = await initialTabResponse.text();
					const newTab = await newTabResponse.text();
					setSqlTemplates({ initialTab, newTab });
				} else {
					logger.warn("Failed to load SQL templates, using defaults");
				}
			} catch (err) {
				logger.error("Error loading SQL templates", err);
				// Keep using default templates from state initialization
			}
		};

		loadTemplates();
	}, []);

	// Update first tab with initial template when templates load
	useEffect(() => {
		// Only update if we have exactly one tab with the default query
		if (tabs.length === 1 && tabs[0].id === "1" && !tabs[0].isDirty) {
			const defaultQuery = DEFAULT_TEMPLATES.initialTab;
			if (
				tabs[0].query === defaultQuery &&
				sqlTemplates.initialTab !== defaultQuery
			) {
				setTabs([
					{
						...tabs[0],
						query: sqlTemplates.initialTab,
					},
				]);
			}
		}
	}, [sqlTemplates.initialTab, tabs, setTabs]);

	return {
		sqlTemplates,
	};
}
