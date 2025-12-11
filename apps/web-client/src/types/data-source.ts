/**
 * Data Source Type Definitions
 * Supports DuckDB databases, flat files (CSV, Parquet, JSON), and connections
 */

import type { RemoteFileGroup } from "../utils/remoteFileGrouping";

export type DataSourceType =
	| "duckdb" // .db, .duckdb - hierarchical database structure
	| "parquet" // .parquet - flat file with schema
	| "csv" // .csv - flat file with schema
	| "tsv" // .tsv, .tab - tab-separated values
	| "json" // .json - flat file with schema
	| "jsonl" // .jsonl, .ndjson - newline-delimited JSON
	| "xlsx" // .xlsx, .xls - Excel spreadsheets
	| "arrow" // .arrow, .ipc - Apache Arrow IPC format
	| "connection"; // BigQuery, PostgreSQL, etc.

/**
 * Connector Type Definitions
 * Represents the different query execution engines available.
 * Add new connector types here as they are implemented.
 */
export type ConnectorType =
	| "duckdb" // DuckDB (local WASM database)
	| "bigquery"; // Google BigQuery (cloud data warehouse)
// Future connectors to be added:
// | 'postgres'  // PostgreSQL
// | 'mysql'     // MySQL
// | 'snowflake' // Snowflake
// | 'redshift'  // Amazon Redshift

export interface Column {
	name: string;
	type: string;
	nullable?: boolean;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	description?: string;
}

export interface SheetInfo {
	name: string;
	index: number;
	rowCount?: number;
	columnCount?: number;
	columns?: Column[]; // Phase 2: Lazy-loaded columns per sheet
}

export interface Table {
	name: string;
	schema: string;
	columns: Column[];
	rowCount?: number;
	size?: number;
	type?: "table" | "view" | "materialized_view";
	isTemporary?: boolean; // True for TEMP tables
	description?: string;
}

export interface Schema {
	name: string;
	tables: Table[];
	description?: string;
}

export interface DataSourceStats {
	rowCount?: number;
	columnCount?: number;
	size?: number;
	minValue?: Record<string, unknown>;
	maxValue?: Record<string, unknown>;
	distinctCount?: Record<string, number>;
	nullCount?: Record<string, number>;
}

export interface DataSource {
	id: string;
	name: string;
	type: DataSourceType;
	uploadedAt: Date;
	lastAccessedAt?: Date;

	// For DuckDB databases
	schemas?: Schema[];
	isAttached?: boolean;
	attachedAs?: string; // alias for ATTACH DATABASE
	isReadOnly?: boolean; // Whether database is attached in read-only mode

	// For simple files
	columns?: Column[];
	tableName?: string; // Virtual table name in DuckDB
	sheets?: SheetInfo[]; // For XLSX files with multiple sheets
	selectedSheet?: string; // Currently selected/default sheet name (for XLSX)

	// Metadata
	size?: number;
	stats?: DataSourceStats;

	// File info
	filePath?: string; // Path in DuckDB virtual filesystem (or remote URL for remote files)
	originalFileName?: string;
	hasFileHandle?: boolean; // Whether file was loaded via File System Access API
	fileHandleId?: string; // ID for retrieving file handle from IndexedDB
	directoryHandleId?: string; // ID for retrieving parent directory handle from IndexedDB
	permissionStatus?: "granted" | "denied" | "prompt" | "unknown"; // File System Access API permission status
	restoreFailed?: boolean; // Whether file restoration failed on app load
	restoreError?: string; // Error message from failed restoration
	isRemote?: boolean; // Whether file is a remote URL (not uploaded/downloaded)
	remoteURL?: string; // The remote URL (for remote files)
	remoteFileGroup?: RemoteFileGroup; // Hierarchical grouping for remote files (domain/path/filename)
	isVolatile?: boolean; // Whether file is volatile (uploaded to DuckDB WASM, won't persist after refresh)
	isIntrospecting?: boolean; // Whether schema/stats introspection is in progress
	introspectionError?: string; // Error message from failed introspection
}

export interface DataSourceGroup {
	databases: DataSource[];
	files: DataSource[];
	connections: DataSource[];
}

export interface DataPreview {
	dataSourceId: string;
	tableName?: string;
	rows: Record<string, unknown>[];
	columns: string[];
	totalRows: number;
	sampleSize: number;
}

export interface QueryTemplate {
	name: string;
	description: string;
	sql: string;
	variables?: Record<string, string>;
}
