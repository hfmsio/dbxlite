/**
 * Settings Store (Zustand)
 * Manages all application settings with localStorage persistence
 * Migrated from React Context to Zustand for better performance and simpler code
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme } from "../themes";

// Types
export type ExplorerSortOrder = "none" | "name" | "type" | "size";
export type SaveStrategy = "auto" | "manual" | "prompt";
/**
 * Where the results grid sits relative to the editor.
 *   - "bottom": results below the editor (default), vertical splitter.
 *   - "right" : results to the right of the editor, horizontal splitter.
 *   - "hidden": results collapsed, editor takes the full pane.
 * Phase 2 (drag-to-dock) reuses this same setting.
 */
export type ResultsLayout = "bottom" | "right" | "hidden";
/**
 * Autocomplete mode (v0.4 redesign):
 *   - "off"  : disable the custom provider entirely (Monaco word-match only).
 *   - "lite" : keywords + function names + table names, plus qualified/alias
 *              dot-resolution (x. -> that table's columns), which is precise.
 *              No unqualified all-columns dump. Safe default for new users.
 *   - "full" : everything lite has plus the unqualified column suggestions
 *              (every column from every table in SELECT/WHERE context).
 *
 * Legacy values from earlier releases ("default", "experimental", "word") are
 * migrated transparently on first load — see migration in this store below.
 */
export type AutocompleteMode = "off" | "lite" | "full";

/** Legacy values still present in some users' localStorage; migrated on load. */
type LegacyAutocompleteMode = "default" | "experimental" | "word";

export function migrateAutocompleteMode(
	value: string | undefined,
): AutocompleteMode {
	switch (value) {
		case "off":
			return "off";
		case "lite":
			return "lite";
		case "full":
			return "full";
		// Legacy migrations (see SQL_AUTOCOMPLETE_PLAN.md, Axis 5).
		case "experimental":
			return "full"; // user opted in; reward with full capability
		case "default":
		case "word":
			return "lite"; // factory default users get the safe step up
		default:
			return "lite";
	}
}
export type EngineDetectionMode = "off" | "suggest" | "auto";

/**
 * Parquet compression codec for exports, applied to the downloaded file.
 *   - "zstd": smallest files (~20-40% under snappy) for a modest CPU cost;
 *     read by every modern Parquet reader. Default.
 *   - "snappy": DuckDB's own default — fastest write, widest compatibility.
 *   - "gzip": smaller than snappy, slower than zstd, universally readable.
 *   - "none": uncompressed — largest, fastest, for re-compression downstream.
 */
export type ParquetCompression = "zstd" | "snappy" | "gzip" | "none";

interface SettingsState {
	// Editor settings
	editorTheme: string;
	editorFontSize: number;
	editorFontFamily: string;
	autocompleteMode: AutocompleteMode;
	showExamplesButton: boolean;
	// Grid settings
	gridFontSize: number;
	gridRowHeight: number;
	// Data settings
	pageSize: number;
	cacheThreshold: number;
	// Explorer settings
	explorerSortOrder: ExplorerSortOrder;
	saveStrategy: SaveStrategy;
	// Layout settings
	resultsLayout: ResultsLayout;
	// Query settings
	engineDetectionMode: EngineDetectionMode;
	// Export settings
	parquetCompression: ParquetCompression;
	// Sharing settings: optional GitHub PAT (gist scope) for creating gist
	// share links. Stored locally in this browser only; never sent anywhere
	// except api.github.com when the user explicitly creates a gist.
	githubToken: string;
}

interface SettingsActions {
	setEditorTheme: (theme: string) => void;
	setEditorFontSize: (size: number) => void;
	setEditorFontFamily: (family: string) => void;
	setAutocompleteMode: (mode: AutocompleteMode) => void;
	setShowExamplesButton: (show: boolean) => void;
	setGridFontSize: (size: number) => void;
	setGridRowHeight: (height: number) => void;
	setPageSize: (size: number) => void;
	setCacheThreshold: (threshold: number) => void;
	setExplorerSortOrder: (order: ExplorerSortOrder) => void;
	setSaveStrategy: (strategy: SaveStrategy) => void;
	setEngineDetectionMode: (mode: EngineDetectionMode) => void;
	setParquetCompression: (codec: ParquetCompression) => void;
	setResultsLayout: (layout: ResultsLayout) => void;
	setGithubToken: (token: string) => void;
	// Bulk update for hydration
	hydrate: (state: Partial<SettingsState>) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const DEFAULT_SETTINGS: SettingsState = {
	editorTheme: "vs-dark",
	editorFontSize: 14,
	editorFontFamily: 'Menlo, Monaco, "Courier New", monospace',
	autocompleteMode: "lite",
	showExamplesButton: true,
	gridFontSize: 12,
	gridRowHeight: 32,
	pageSize: 100,
	cacheThreshold: 10000,
	explorerSortOrder: "none",
	saveStrategy: "auto",
	engineDetectionMode: "suggest",
	parquetCompression: "zstd",
	resultsLayout: "bottom",
	githubToken: "",
};

export const useSettingsStore = create<SettingsStore>()(
	persist(
		(set) => ({
			...DEFAULT_SETTINGS,

			setEditorTheme: (theme) => {
				set({ editorTheme: theme });
				// Apply theme (injects CSS variables and sets data-theme attribute)
				applyTheme(theme);
			},

			setEditorFontSize: (size) => set({ editorFontSize: size }),

			setEditorFontFamily: (family) => set({ editorFontFamily: family }),

			setAutocompleteMode: (mode) => set({ autocompleteMode: mode }),

			setShowExamplesButton: (show) => set({ showExamplesButton: show }),

			setGridFontSize: (size) => set({ gridFontSize: size }),

			setGridRowHeight: (height) => set({ gridRowHeight: height }),

			setPageSize: (size) => set({ pageSize: size }),

			setCacheThreshold: (threshold) => set({ cacheThreshold: threshold }),

			setExplorerSortOrder: (order) => set({ explorerSortOrder: order }),

			setSaveStrategy: (strategy) => set({ saveStrategy: strategy }),

			setEngineDetectionMode: (mode) => set({ engineDetectionMode: mode }),

			setParquetCompression: (codec) => set({ parquetCompression: codec }),

			setResultsLayout: (layout) => set({ resultsLayout: layout }),

			setGithubToken: (token) => set({ githubToken: token.trim() }),

			hydrate: (state) => set(state),
		}),
		{
			name: "dbxlite-settings",
			// Migrate from old localStorage keys to new unified storage
			onRehydrateStorage: () => (state) => {
				if (state) {
					// Apply theme on initial load (injects CSS variables)
					applyTheme(state.editorTheme);

					// Migrate legacy autocomplete-mode values to the v0.4 taxonomy.
					// Cast through `string` because TS doesn't know about the legacy
					// literal values once the type narrowed to the new union.
					const legacyMode = state.autocompleteMode as
						| AutocompleteMode
						| LegacyAutocompleteMode;
					const migratedMode = migrateAutocompleteMode(legacyMode);
					if (migratedMode !== legacyMode) {
						state.hydrate({ autocompleteMode: migratedMode });
					}

					// Migrate from legacy individual localStorage keys if this is first run
					const hasLegacyKeys = localStorage.getItem("data-ide-theme") !== null;
					if (hasLegacyKeys && !localStorage.getItem("data-ide-settings")) {
						const legacyState: Partial<SettingsState> = {};

						const theme = localStorage.getItem("data-ide-theme");
						if (theme) legacyState.editorTheme = theme;

						const fontSize = localStorage.getItem("data-ide-font-size");
						if (fontSize) legacyState.editorFontSize = parseInt(fontSize, 10);

						const fontFamily = localStorage.getItem("data-ide-font-family");
						if (fontFamily) legacyState.editorFontFamily = fontFamily;

						const gridFontSize = localStorage.getItem(
							"data-ide-grid-font-size",
						);
						if (gridFontSize)
							legacyState.gridFontSize = parseInt(gridFontSize, 10);

						const gridRowHeight = localStorage.getItem(
							"data-ide-grid-row-height",
						);
						if (gridRowHeight)
							legacyState.gridRowHeight = parseInt(gridRowHeight, 10);

						const pageSize = localStorage.getItem("data-ide-page-size");
						if (pageSize) legacyState.pageSize = parseInt(pageSize, 10);

						const cacheThreshold = localStorage.getItem(
							"data-ide-cache-threshold",
						);
						if (cacheThreshold)
							legacyState.cacheThreshold = parseInt(cacheThreshold, 10);

						const explorerSortOrder = localStorage.getItem(
							"data-ide-explorer-sort-order",
						);
						if (explorerSortOrder)
							legacyState.explorerSortOrder =
								explorerSortOrder as ExplorerSortOrder;

						const saveStrategy = localStorage.getItem("data-ide-save-strategy");
						if (saveStrategy)
							legacyState.saveStrategy = saveStrategy as SaveStrategy;

						// Hydrate with legacy values
						if (Object.keys(legacyState).length > 0) {
							state.hydrate(legacyState);
						}
					}
				}
			},
		},
	),
);

// Selector hooks for optimized re-renders
export const useEditorTheme = () => useSettingsStore((s) => s.editorTheme);
export const useEditorFontSize = () =>
	useSettingsStore((s) => s.editorFontSize);
export const useEditorFontFamily = () =>
	useSettingsStore((s) => s.editorFontFamily);
export const useAutocompleteMode = () =>
	useSettingsStore((s) => s.autocompleteMode);
export const useGridFontSize = () => useSettingsStore((s) => s.gridFontSize);
export const useGridRowHeight = () => useSettingsStore((s) => s.gridRowHeight);
export const usePageSize = () => useSettingsStore((s) => s.pageSize);
export const useCacheThreshold = () =>
	useSettingsStore((s) => s.cacheThreshold);
export const useExplorerSortOrder = () =>
	useSettingsStore((s) => s.explorerSortOrder);
export const useSaveStrategy = () => useSettingsStore((s) => s.saveStrategy);
export const useEngineDetectionMode = () =>
	useSettingsStore((s) => s.engineDetectionMode);
export const useParquetCompression = () =>
	useSettingsStore((s) => s.parquetCompression);
