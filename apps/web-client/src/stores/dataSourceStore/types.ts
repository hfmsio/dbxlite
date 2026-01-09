/**
 * DataSourceStore Types
 * TypeScript interfaces for the Zustand data source store
 */

import type { Column, DataSource, Schema } from "../../types/data-source";

// ===== State Slices =====

export interface DataSlice {
	dataSources: DataSource[];
}

export interface AsyncSlice {
	isLoadingFromStorage: boolean;
	pendingOperations: Map<string, Promise<DataSource>>;
	introspectingIds: Set<string>;
}

export interface ErrorSlice {
	operationErrors: Record<string, string>;
}

// ===== Combined State =====

export interface DataSourceState extends DataSlice, AsyncSlice, ErrorSlice {}

// ===== Actions =====

export interface DataSourceActions {
	// CRUD
	addDataSource: (
		dataSource: Omit<DataSource, "id" | "uploadedAt">,
	) => Promise<DataSource>;
	addRemoteURL: (
		url: string,
		type: "parquet" | "csv" | "json",
		name?: string,
	) => Promise<DataSource | null>;
	updateDataSource: (id: string, updates: Partial<DataSource>) => void;
	removeDataSource: (id: string, options?: { skipDetach?: boolean }) => Promise<void>;
	clearAllDataSources: () => void;
	getDataSource: (id: string) => DataSource | undefined;

	// Introspection
	introspectSchema: (id: string) => Promise<void>;
	refreshAllSchemas: () => Promise<void>;
	introspectSheetColumns: (
		fileId: string,
		sheetName: string,
	) => Promise<Column[]>;

	// Internal (prefixed with _)
	_setDataSources: (dataSources: DataSource[]) => void;
	_setIsLoadingFromStorage: (loading: boolean) => void;
	_handleStorageSync: (dataSources: DataSource[]) => void;
}

// ===== Combined Store Type =====

export type DataSourceStore = DataSourceState & DataSourceActions;

// ===== Introspection Result Types =====

export interface DuckDBIntrospectionResult {
	schemas: Schema[];
	isAttached: boolean;
	attachedAs?: string;
}

export interface FileIntrospectionResult {
	columns: Column[];
	stats: { columnCount: number; rowCount?: number };
}
