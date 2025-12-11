/**
 * DataSource Store
 * Zustand-based store for managing data sources
 */

// Store
export { useDataSourceStore } from "./store";

// Types
export type {
	DataSourceStore,
	DataSourceState,
	DataSourceActions,
	DuckDBIntrospectionResult,
	FileIntrospectionResult,
} from "./types";

// Selectors - granular (prefer these for new code)
export {
	useDataSources,
	useIsLoadingFromStorage,
	useIntrospectingIds,
	useDatabases,
	useFiles,
	useRemoteFiles,
	useLocalFiles,
	useDataSourceById,
	useAddDataSource,
	useAddRemoteURL,
	useUpdateDataSource,
	useRemoveDataSource,
	useClearAllDataSources,
	useIntrospectSchema,
	useIntrospectSheetColumns,
	// Legacy hook for migration
	useDataSourcesLegacy,
} from "./selectors";

// Introspection functions (for direct use if needed)
export {
	introspectDuckDBSchema,
	introspectFileSchema,
	introspectSheetColumns,
} from "./introspection";

// Persistence utilities
export { STORAGE_KEY, loadFromStorage, saveToStorage } from "./persistence";
