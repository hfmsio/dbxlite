/**
 * Table Info Type Definitions
 *
 * UI display types for table metadata shown in the TableInfoModal.
 * These are app-local types (not in @ide/connectors) because they're
 * specific to modal display, not part of the connector contract.
 */

/** Index information from duckdb_indexes() */
export interface IndexInfo {
	index_name: string;
	table_name: string;
	is_unique: boolean;
	is_primary: boolean;
	sql: string | null; // CREATE INDEX statement, null for auto-generated
}

/** Constraint information from duckdb_constraints() */
export interface ConstraintInfo {
	constraint_type:
		| "PRIMARY KEY"
		| "FOREIGN KEY"
		| "UNIQUE"
		| "CHECK"
		| "NOT NULL";
	constraint_column_names: string[];
	constraint_column_indexes?: number[];
	expression: string | null; // For CHECK constraints
}

/** Tab IDs for TableInfoModal navigation */
export type TableInfoTab = "overview" | "indexes" | "constraints";

/** State for lazy-loaded tab data */
export interface TableInfoTabState {
	indexes: IndexInfo[] | null;
	constraints: ConstraintInfo[] | null;
	indexesLoading: boolean;
	constraintsLoading: boolean;
	indexesError: string | null;
	constraintsError: string | null;
}
