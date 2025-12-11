/**
 * DataSource Store Selectors
 * Granular selector hooks for optimal React re-rendering
 */

import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useDataSourceStore } from "./store";

// ===== State Selectors =====

export const useDataSources = () =>
	useDataSourceStore((s) => s.dataSources);

export const useIsLoadingFromStorage = () =>
	useDataSourceStore((s) => s.isLoadingFromStorage);

export const useIntrospectingIds = () =>
	useDataSourceStore((s) => s.introspectingIds);

// ===== Computed Selectors =====
// Use useMemo to prevent infinite loops from filter creating new arrays

export const useDatabases = () => {
	const dataSources = useDataSourceStore((s) => s.dataSources);
	return useMemo(
		() => dataSources.filter((ds) => ds.type === "duckdb"),
		[dataSources],
	);
};

const FILE_TYPES = [
	"parquet",
	"csv",
	"tsv",
	"json",
	"jsonl",
	"xlsx",
	"arrow",
] as const;

export const useFiles = () => {
	const dataSources = useDataSourceStore((s) => s.dataSources);
	return useMemo(
		() => dataSources.filter((ds) => FILE_TYPES.includes(ds.type as never)),
		[dataSources],
	);
};

export const useRemoteFiles = () => {
	const dataSources = useDataSourceStore((s) => s.dataSources);
	return useMemo(
		() => dataSources.filter((ds) => ds.isRemote),
		[dataSources],
	);
};

export const useLocalFiles = () => {
	const dataSources = useDataSourceStore((s) => s.dataSources);
	return useMemo(
		() => dataSources.filter((ds) => !ds.isRemote && ds.type !== "duckdb"),
		[dataSources],
	);
};

export const useDataSourceById = (id: string) =>
	useDataSourceStore((s) => s.dataSources.find((ds) => ds.id === id));

// ===== Action Selectors (stable references) =====

export const useAddDataSource = () =>
	useDataSourceStore((s) => s.addDataSource);

export const useAddRemoteURL = () =>
	useDataSourceStore((s) => s.addRemoteURL);

export const useUpdateDataSource = () =>
	useDataSourceStore((s) => s.updateDataSource);

export const useRemoveDataSource = () =>
	useDataSourceStore((s) => s.removeDataSource);

export const useClearAllDataSources = () =>
	useDataSourceStore((s) => s.clearAllDataSources);

export const useIntrospectSchema = () =>
	useDataSourceStore((s) => s.introspectSchema);

export const useIntrospectSheetColumns = () =>
	useDataSourceStore((s) => s.introspectSheetColumns);

// ===== Legacy Compatibility Hook =====

/**
 * Drop-in replacement for the old useDataSources() hook from Context
 * Use granular selectors above for new code to get better performance
 */
export const useDataSourcesLegacy = () => {
	// Select state separately to avoid creating new object on each render
	const dataSources = useDataSourceStore((s) => s.dataSources);
	const isLoadingFromStorage = useDataSourceStore((s) => s.isLoadingFromStorage);

	// Actions are stable references from the store
	const addDataSource = useDataSourceStore((s) => s.addDataSource);
	const addRemoteURL = useDataSourceStore((s) => s.addRemoteURL);
	const updateDataSource = useDataSourceStore((s) => s.updateDataSource);
	const removeDataSource = useDataSourceStore((s) => s.removeDataSource);
	const clearAllDataSources = useDataSourceStore((s) => s.clearAllDataSources);
	const getDataSource = useDataSourceStore((s) => s.getDataSource);
	const introspectSchema = useDataSourceStore((s) => s.introspectSchema);
	const refreshAllSchemas = useDataSourceStore((s) => s.refreshAllSchemas);
	const introspectSheetColumns = useDataSourceStore(
		(s) => s.introspectSheetColumns,
	);

	// Memoize the returned object to prevent unnecessary re-renders in consumers
	return useMemo(
		() => ({
			dataSources,
			addDataSource,
			addRemoteURL,
			updateDataSource,
			removeDataSource,
			clearAllDataSources,
			getDataSource,
			introspectSchema,
			refreshAllSchemas,
			introspectSheetColumns,
			isLoadingFromStorage,
		}),
		[
			dataSources,
			isLoadingFromStorage,
			addDataSource,
			addRemoteURL,
			updateDataSource,
			removeDataSource,
			clearAllDataSources,
			getDataSource,
			introspectSchema,
			refreshAllSchemas,
			introspectSheetColumns,
		],
	);
};
