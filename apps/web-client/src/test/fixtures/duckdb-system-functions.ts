/**
 * DuckDB System Function Mock Data
 *
 * Realistic mock data for DuckDB system functions used in tests.
 * These match the actual column names and types returned by DuckDB.
 */

// duckdb_databases() mock response
export const mockDatabasesResponse = {
	rows: [
		{
			database_name: "memory",
			database_oid: 0,
			path: ":memory:",
			internal: true,
			type: "duckdb",
			readonly: false,
		},
		{
			database_name: "sales",
			database_oid: 1,
			path: "/data/sales.duckdb",
			internal: false,
			type: "duckdb",
			readonly: false,
		},
		{
			database_name: "analytics",
			database_oid: 2,
			path: "/data/analytics.duckdb",
			internal: false,
			type: "duckdb",
			readonly: true,
		},
	],
	columns: ["database_name", "database_oid", "path", "internal", "type", "readonly"],
	totalRows: 3,
	executionTime: 5,
};

// duckdb_tables() mock response
export const mockTablesResponse = {
	rows: [
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_count: 5,
			estimated_size: 1000,
			temporary: false,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "temp_results",
			column_count: 3,
			estimated_size: 500,
			temporary: true,
		},
		{
			database_name: "sales",
			schema_name: "main",
			table_name: "orders",
			column_count: 8,
			estimated_size: 50000,
			temporary: false,
		},
		{
			database_name: "sales",
			schema_name: "main",
			table_name: "products",
			column_count: 6,
			estimated_size: 2000,
			temporary: false,
		},
	],
	columns: ["database_name", "schema_name", "table_name", "column_count", "estimated_size", "temporary"],
	totalRows: 4,
	executionTime: 8,
};

// duckdb_views() mock response
export const mockViewsResponse = {
	rows: [
		{
			database_name: "memory",
			schema_name: "main",
			view_name: "user_summary",
			internal: false,
			temporary: false,
			column_count: 3,
		},
		{
			database_name: "sales",
			schema_name: "main",
			view_name: "monthly_revenue",
			internal: false,
			temporary: false,
			column_count: 4,
		},
	],
	columns: ["database_name", "schema_name", "view_name", "internal", "temporary", "column_count"],
	totalRows: 2,
	executionTime: 4,
};

// duckdb_columns() mock response
export const mockColumnsResponse = {
	rows: [
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_name: "id",
			column_index: 0,
			data_type: "INTEGER",
			is_nullable: false,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_name: "name",
			column_index: 1,
			data_type: "VARCHAR",
			is_nullable: true,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_name: "email",
			column_index: 2,
			data_type: "VARCHAR",
			is_nullable: false,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_name: "created_at",
			column_index: 3,
			data_type: "TIMESTAMP",
			is_nullable: false,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			column_name: "is_active",
			column_index: 4,
			data_type: "BOOLEAN",
			is_nullable: false,
		},
	],
	columns: ["database_name", "schema_name", "table_name", "column_name", "column_index", "data_type", "is_nullable"],
	totalRows: 5,
	executionTime: 6,
};

// duckdb_extensions() mock response
export const mockExtensionsResponse = {
	rows: [
		{
			extension_name: "httpfs",
			loaded: true,
			installed: true,
			install_path: "/usr/local/lib/duckdb/extensions/httpfs.duckdb_extension",
			description: "HTTP and S3 file system support",
		},
		{
			extension_name: "parquet",
			loaded: true,
			installed: true,
			install_path: "(BUILT-IN)",
			description: "Parquet file format support",
		},
		{
			extension_name: "json",
			loaded: true,
			installed: true,
			install_path: "(BUILT-IN)",
			description: "JSON file format support",
		},
		{
			extension_name: "excel",
			loaded: false,
			installed: true,
			install_path: "/usr/local/lib/duckdb/extensions/excel.duckdb_extension",
			description: "Excel file format support",
		},
		{
			extension_name: "postgres_scanner",
			loaded: false,
			installed: false,
			install_path: null,
			description: "PostgreSQL database scanner",
		},
		{
			extension_name: "spatial",
			loaded: false,
			installed: false,
			install_path: null,
			description: "Geospatial extension",
		},
	],
	columns: ["extension_name", "loaded", "installed", "install_path", "description"],
	totalRows: 6,
	executionTime: 3,
};

// duckdb_secrets() mock response
export const mockSecretsResponse = {
	rows: [
		{
			name: "s3_default",
			type: "s3",
			provider: "config",
			scope: "s3://my-bucket",
			persistent: true,
		},
		{
			name: "gcs_analytics",
			type: "gcs",
			provider: "config",
			scope: "gs://analytics-bucket",
			persistent: false,
		},
	],
	columns: ["name", "type", "provider", "scope", "persistent"],
	totalRows: 2,
	executionTime: 2,
};

// duckdb_settings() mock response
export const mockSettingsResponse = {
	rows: [
		{
			name: "threads",
			value: "8",
			description: "Number of threads to use for query execution",
		},
		{
			name: "memory_limit",
			value: "8GB",
			description: "Maximum memory limit",
		},
		{
			name: "temp_directory",
			value: "/tmp/duckdb",
			description: "Temporary directory for spilling data",
		},
		{
			name: "max_memory",
			value: "8GB",
			description: "Maximum memory to use",
		},
		{
			name: "worker_threads",
			value: "4",
			description: "Number of worker threads",
		},
		{
			name: "external_threads",
			value: "1",
			description: "Number of external threads",
		},
		{
			name: "default_order",
			value: "ASC",
			description: "Default ORDER BY direction",
		},
		{
			name: "enable_progress_bar",
			value: "true",
			description: "Enable progress bar during query execution",
		},
		{
			name: "enable_object_cache",
			value: "true",
			description: "Enable object cache",
		},
	],
	columns: ["name", "value", "description"],
	totalRows: 9,
	executionTime: 2,
};

// duckdb_variables() mock response
export const mockVariablesResponse = {
	rows: [
		{
			name: "current_schema",
			value: "main",
			type: "VARCHAR",
		},
		{
			name: "my_filter",
			value: "active",
			type: "VARCHAR",
		},
		{
			name: "batch_size",
			value: 1000,
			type: "INTEGER",
		},
	],
	columns: ["name", "value", "type"],
	totalRows: 3,
	executionTime: 1,
};

// duckdb_indexes() mock response
export const mockIndexesResponse = {
	rows: [
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			index_name: "users_pkey",
			is_unique: true,
			is_primary: true,
			sql: null,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			index_name: "idx_users_email",
			is_unique: true,
			is_primary: false,
			sql: 'CREATE UNIQUE INDEX idx_users_email ON users(email)',
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			index_name: "idx_users_created",
			is_unique: false,
			is_primary: false,
			sql: 'CREATE INDEX idx_users_created ON users(created_at)',
		},
	],
	columns: ["database_name", "schema_name", "table_name", "index_name", "is_unique", "is_primary", "sql"],
	totalRows: 3,
	executionTime: 4,
};

// duckdb_constraints() mock response
export const mockConstraintsResponse = {
	rows: [
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			constraint_type: "PRIMARY KEY",
			constraint_column_names: ["id"],
			constraint_column_indexes: [0],
			expression: null,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			constraint_type: "UNIQUE",
			constraint_column_names: ["email"],
			constraint_column_indexes: [2],
			expression: null,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			constraint_type: "NOT NULL",
			constraint_column_names: ["name"],
			constraint_column_indexes: [1],
			expression: null,
		},
		{
			database_name: "memory",
			schema_name: "main",
			table_name: "users",
			constraint_type: "CHECK",
			constraint_column_names: ["email"],
			constraint_column_indexes: [2],
			expression: "email LIKE '%@%'",
		},
	],
	columns: ["database_name", "schema_name", "table_name", "constraint_type", "constraint_column_names", "constraint_column_indexes", "expression"],
	totalRows: 4,
	executionTime: 3,
};

// Empty responses for testing no-data scenarios
export const emptyDatabasesResponse = {
	rows: [],
	columns: mockDatabasesResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptyTablesResponse = {
	rows: [],
	columns: mockTablesResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptyExtensionsResponse = {
	rows: [],
	columns: mockExtensionsResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptySecretsResponse = {
	rows: [],
	columns: mockSecretsResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptySettingsResponse = {
	rows: [],
	columns: mockSettingsResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptyVariablesResponse = {
	rows: [],
	columns: mockVariablesResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptyIndexesResponse = {
	rows: [],
	columns: mockIndexesResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

export const emptyConstraintsResponse = {
	rows: [],
	columns: mockConstraintsResponse.columns,
	totalRows: 0,
	executionTime: 1,
};

// Helper to create a custom query result
export function createQueryResult(
	rows: Record<string, unknown>[],
	columns: string[] = [],
	executionTime = 5,
) {
	return {
		rows,
		columns,
		totalRows: rows.length,
		executionTime,
	};
}

// Helper to simulate query errors
export class QueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "QueryError";
	}
}
