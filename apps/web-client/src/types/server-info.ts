/**
 * Server Info Type Definitions
 *
 * Types for DuckDB server introspection data displayed in the Server Info Modal.
 * Only active in HTTP mode - these represent data from DuckDB system functions.
 */

/** Extension information from duckdb_extensions() */
export interface DuckDBExtension {
	extension_name: string;
	loaded: boolean;
	installed: boolean;
	install_path: string | null;
	description: string | null;
}

/** Secret/credential information from duckdb_secrets() */
export interface DuckDBSecret {
	name: string;
	type: string; // s3, gcs, azure, bigquery, etc.
	provider: string;
	scope: string;
	persistent: boolean;
}

/** Configuration setting from duckdb_settings() */
export interface DuckDBSetting {
	name: string;
	value: string;
	description: string | null;
	inputType: string | null; // VARCHAR, BIGINT, BOOLEAN, etc.
}

/** Setting metadata for UI controls */
export interface SettingMeta {
	tip: string;
	editable: boolean;
	type: "boolean" | "number" | "select" | "text";
	options?: string[]; // For select type
	min?: number;
	max?: number;
	unit?: string;
}

/** Session variable from duckdb_variables() */
export interface DuckDBVariable {
	name: string;
	value: string | number | boolean | null;
	type: string;
}

/** Aggregated server information */
export interface ServerInfo {
	extensions: DuckDBExtension[];
	secrets: DuckDBSecret[];
	settings: DuckDBSetting[];
	variables: DuckDBVariable[];
}

/** State for the useServerInfo hook */
export interface ServerInfoState {
	data: ServerInfo | null;
	isLoading: boolean;
	error: string | null;
	lastRefreshed: Date | null;
}

/** Action types for extension management */
export type ExtensionAction = "load" | "install";
