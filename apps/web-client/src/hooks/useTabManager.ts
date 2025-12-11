import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryResult } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("useTabManager");
const TABS_STORAGE_KEY = "dbxlite-editor-tabs";
const MAX_TABS = 3;

export interface TabState {
	id: string;
	name: string;
	query: string;
	result: QueryResult | null;
	loading: boolean;
	error: string | null;
	isDirty: boolean;
	filePath?: string;
	fileHandleId?: string;
	hasWritePermission?: boolean;
	lastModified?: number;
	/** Timestamp of when file was last read from or written to disk (for conflict detection) */
	fileLastModified?: number;
	useVirtualTable?: boolean;
	executedSql?: string;
	estimatedRowCount?: number;
	rowCountIsEstimated?: boolean;
	abortSignal?: AbortSignal;
}

interface UseTabManagerOptions {
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	defaultTabTemplate?: string;
	newTabTemplate?: string;
}

export interface TabDefinition {
	name: string;
	query: string;
}

export interface UseTabManagerReturn {
	tabs: TabState[];
	activeTabId: string;
	activeTab: TabState | undefined;
	setActiveTabId: (id: string) => void;
	addTab: () => void;
	closeTab: (tabId: string) => void;
	renameTab: (tabId: string, newName: string) => void;
	updateTab: (tabId: string, updates: Partial<TabState>) => void;
	setTabs: React.Dispatch<React.SetStateAction<TabState[]>>;
	canAddTab: boolean;
	nextTabId: React.MutableRefObject<number>;
	/** Create multiple tabs with predefined queries (replaces existing tabs) */
	createTabsWithQueries: (definitions: TabDefinition[]) => string[];
}

const DEFAULT_TAB_QUERY =
	"-- Write SQL here\n-- Press Cmd/Ctrl+Enter to run\nSELECT 1 as result;";
const NEW_TAB_QUERY = "";

export function useTabManager(
	options: UseTabManagerOptions = {},
): UseTabManagerReturn {
	const {
		showToast,
		defaultTabTemplate = DEFAULT_TAB_QUERY,
		newTabTemplate = NEW_TAB_QUERY,
	} = options;

	const nextTabId = useRef(2);

	// Initialize tabs from localStorage
	const [tabs, setTabs] = useState<TabState[]>(() => {
		try {
			const saved = localStorage.getItem(TABS_STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				return parsed.map((tab: TabState) => ({
					...tab,
					loading: false,
					error: null,
					result: null,
					abortSignal: undefined,
				}));
			}
		} catch (error) {
			logger.error("Failed to load tabs from localStorage:", error);
		}
		return [
			{
				id: "1",
				name: "Query 1",
				query: defaultTabTemplate,
				result: null,
				loading: false,
				error: null,
				isDirty: false,
			},
		];
	});

	const [activeTabId, setActiveTabId] = useState(() => {
		const saved = localStorage.getItem("dbxlite-active-tab");
		return saved || "1";
	});

	// Initialize nextTabId based on loaded tabs
	useEffect(() => {
		if (tabs.length > 0) {
			nextTabId.current = Math.max(...tabs.map((t) => parseInt(t.id, 10))) + 1;
		}
	}, [tabs.length, tabs.map]); // Only on mount

	// Save active tab to localStorage
	useEffect(() => {
		localStorage.setItem("dbxlite-active-tab", activeTabId);
	}, [activeTabId]);

	// Save tabs to localStorage
	useEffect(() => {
		try {
			const tabsToSave = tabs.map((tab) => ({
				id: tab.id,
				name: tab.name,
				query: tab.query,
				isDirty: tab.isDirty,
				filePath: tab.filePath,
				fileHandleId: tab.fileHandleId,
				lastModified: tab.lastModified,
				fileLastModified: tab.fileLastModified,
			}));
			localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsToSave));
		} catch (err) {
			logger.error("Failed to save tabs to localStorage:", err);
		}
	}, [tabs]);

	// Cross-window sync with last-write-wins
	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (
				e.key === TABS_STORAGE_KEY &&
				e.newValue &&
				e.storageArea === localStorage
			) {
				try {
					const incomingTabs = JSON.parse(e.newValue) as TabState[];

					setTabs((currentTabs) => {
						const mergedTabs: TabState[] = [];
						const allTabIds = new Set([
							...currentTabs.map((t) => t.id),
							...incomingTabs.map((t) => t.id),
						]);

						for (const tabId of allTabIds) {
							const currentTab = currentTabs.find((t) => t.id === tabId);
							const incomingTab = incomingTabs.find((t) => t.id === tabId);

							if (currentTab && incomingTab) {
								const useIncoming =
									!currentTab.lastModified ||
									!incomingTab.lastModified ||
									incomingTab.lastModified > currentTab.lastModified;
								mergedTabs.push(
									useIncoming ? { ...currentTab, ...incomingTab } : currentTab,
								);
							} else if (incomingTab) {
								mergedTabs.push({
									...incomingTab,
									result: null,
									loading: false,
									error: null,
								});
							} else if (currentTab) {
								mergedTabs.push(currentTab);
							}
						}

						// Cap at MAX_TABS to prevent exceeding limit during cross-window sync
						// Sort by lastModified (descending) to keep most recent tabs
						const cappedTabs = mergedTabs
							.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
							.slice(0, MAX_TABS);

						return cappedTabs.length > 0 ? cappedTabs : currentTabs;
					});
				} catch (err) {
					logger.error("Failed to sync tabs:", err);
				}
			}
		};

		window.addEventListener("storage", handleStorageChange);
		return () => window.removeEventListener("storage", handleStorageChange);
	}, []);

	const updateTab = useCallback((tabId: string, updates: Partial<TabState>) => {
		setTabs((prev) =>
			prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)),
		);
	}, []);

	const addTab = useCallback(() => {
		if (tabs.length >= MAX_TABS) {
			showToast?.(
				`Maximum ${MAX_TABS} tabs allowed. Close unused tabs to create new ones.`,
				"warning",
				4000,
			);
			return;
		}

		const newTab: TabState = {
			id: String(nextTabId.current++),
			name: `Query ${nextTabId.current - 1}`,
			query: newTabTemplate,
			result: null,
			loading: false,
			error: null,
			isDirty: false,
		};
		setTabs((prev) => [...prev, newTab]);
		setActiveTabId(newTab.id);
	}, [tabs.length, showToast, newTabTemplate]);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prev) => {
				const newTabs = prev.filter((t) => t.id !== tabId);
				if (activeTabId === tabId && newTabs.length > 0) {
					setActiveTabId(newTabs[0].id);
				}
				return newTabs;
			});
		},
		[activeTabId],
	);

	const renameTab = useCallback(
		(tabId: string, newName: string) => {
			updateTab(tabId, { name: newName });
		},
		[updateTab],
	);

	// Create multiple tabs with predefined queries (for onboarding)
	const createTabsWithQueries = useCallback(
		(definitions: TabDefinition[]): string[] => {
			const baseId = Date.now();
			const newTabs: TabState[] = definitions.map((def, idx) => ({
				id: String(baseId + idx),
				name: def.name,
				query: def.query,
				result: null,
				loading: false,
				error: null,
				isDirty: false,
			}));

			// Update nextTabId to be higher than any new tab
			nextTabId.current = baseId + definitions.length + 1;

			// Replace existing tabs with new ones
			setTabs(newTabs);
			if (newTabs.length > 0) {
				setActiveTabId(newTabs[0].id);
			}

			// Return the IDs of created tabs for query execution
			return newTabs.map((t) => t.id);
		},
		[],
	);

	const activeTab = tabs.find((t) => t.id === activeTabId);
	const canAddTab = tabs.length < MAX_TABS;

	return {
		tabs,
		activeTabId,
		activeTab,
		setActiveTabId,
		addTab,
		closeTab,
		renameTab,
		updateTab,
		setTabs,
		canAddTab,
		nextTabId,
		createTabsWithQueries,
	};
}
