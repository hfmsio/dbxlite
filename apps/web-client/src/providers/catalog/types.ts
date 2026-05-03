/**
 * CatalogProvider — uniform abstraction for catalog-shaped data sources.
 *
 * Implementations:
 *   - SnowflakeCatalogProvider (this PR)
 *   - BigQueryCatalogProvider  (sketch only; migration is a future ticket)
 *   - DuckDBCatalogProvider    (future; for ATTACHed databases — files use a
 *                               separate model and stay on the existing path)
 *   - DatabricksCatalogProvider, RedshiftCatalogProvider (future)
 *
 * Design principles:
 *   - Methods that ALL catalog systems support are required.
 *   - Provider-specific niceties (cost estimation, pinned catalogs, session
 *     context like role/warehouse) are OPTIONAL hooks.
 *   - SQL generation is the provider's responsibility — naming conventions
 *     and quoting differ ("DB"."SCHEMA"."TBL" vs `proj.ds.tbl`).
 *   - The provider does NOT own its UI. A single `<CatalogExplorer>`
 *     component renders any provider, reading shape + actions from this
 *     interface.
 */

import type {
	CatalogInfo,
	SchemaInfo,
	TableMetadata,
	QueryCostEstimate,
} from "@ide/connectors"

/** Lightweight context chip — role/warehouse/billing-project/etc. */
export interface SessionContextChip {
	/** Stable id used by the UI for chip-level affordances (e.g. dropdown wiring). */
	id?: "role" | "compute" | "catalog" | "schema" | (string & {})
	icon: string
	label: string // "Role", "Warehouse", "Billing Project"
	value: string // current value, or "(none)"
	tooltip: string
	muted?: boolean
}

/** Available compute option (warehouse, cluster, etc.) for context-switching. */
export interface ComputeOption {
	name: string
	size?: string
	state?: ComputeStatusState
}

export type ComputeStatusState =
	| "running"
	| "starting"
	| "suspended"
	| "suspending"
	| "resizing"
	| "unknown"

export interface ComputeStatus {
	state: ComputeStatusState
	size?: string
	lastChecked: Date
}

/** Argument to setComputeContext. Generic across providers. */
export interface ComputeContextChange {
	/** Snowflake / Databricks warehouse name. */
	warehouse?: string
	/** Databricks cluster id (alias to warehouse on platforms that distinguish). */
	cluster?: string
}

/** History row from the provider's QUERY_HISTORY-equivalent. */
export interface QueryHistoryEntry {
	queryId: string
	text: string
	status: "success" | "failed" | "running" | "cancelled"
	startTime: Date
	durationMs: number
	bytesScanned?: number
	rowsProduced?: number
	/** Provider-specific compute label (warehouse name, project, cluster). */
	computeContext?: string
	role?: string
	errorMessage?: string
}

/** Post-execution stats for one query — surfaced in the result-pane footer. */
export interface QueryRunStats {
	bytesScanned?: number
	rowsProduced?: number
	durationMs?: number
	/** Provider-specific compute label (warehouse name, project, cluster). */
	computeContext?: string
	computeSize?: string
}

/**
 * Structured help shown to users when a provider operation fails because of
 * missing privileges. Rendered in modals as a help card with copy-able SQL.
 *
 * Providers should detect their own error wording (e.g. Snowflake's "Invalid
 * identifier" for INFORMATION_SCHEMA functions when the role lacks USAGE) and
 * return one of these. Modals stay provider-agnostic.
 */
export interface PrivilegeHelp {
	/** Short headline. */
	title: string
	/** What's blocked, in 1-2 sentences. */
	body: string
	/**
	 * SQL commands to fix. `runAs` names the role/persona that has authority to
	 * run it (e.g. "ACCOUNTADMIN"). Modal renders each as copy-to-clipboard.
	 */
	commands: { sql: string; runAs?: string; description?: string }[]
	/** Optional canonical docs link. */
	docsUrl?: string
}

/** Operations that may produce a privilege-help hint. */
export type PrivilegedOperation =
	| "queryHistory"
	| "queryStats"
	| "search"
	| "listSchemas"
	| "listTables"

/** Result row from a provider-side full-text catalog search. */
export interface CatalogSearchResult {
	catalog: string
	schema?: string
	table?: string
	matchedField: "catalog" | "schema" | "table"
}

/** A right-click / drag-source action attached to a tree node. */
export interface NodeAction {
	id: string
	label: string
	icon?: string
	shortcut?: string
	separator?: boolean
	onSelect: () => void | Promise<void>
}

export interface TableActionContext {
	catalog: string
	schema: string
	table: TableMetadata
}

export interface SchemaActionContext {
	catalog: string
	schema: SchemaInfo
}

export interface CatalogActionContext {
	catalog: CatalogInfo
}

/** Hooks the explorer uses to dispatch user intent (insert into editor, etc.) */
export interface CatalogProviderHostHandlers {
	insertIntoEditor: (sql: string) => void
	copyToClipboard: (text: string) => Promise<void>
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
	) => void
	openTablePreview?: (catalog: string, schema: string, table: string) => void
	openConnectionEdit?: () => void
}

/**
 * The core abstraction.
 */
export interface CatalogProvider {
	// --- Identity / branding ---
	readonly id: string
	readonly displayName: string
	readonly icon: string
	readonly accentColor: string

	/**
	 * Human-readable term for the top-level entity this provider lists.
	 * Snowflake: "database" / "databases". BigQuery: "project" / "projects".
	 * Databricks Unity Catalog: "catalog" / "catalogs" (the only place this
	 * abstraction's name reflects the user-facing term).
	 *
	 * Defaults to "catalog" / "catalogs" if omitted. UI strings should
	 * always go through these terms, not hardcoded "catalog".
	 */
	readonly catalogTerm?: { singular: string; plural: string }

	// --- Connection state ---
	isConnected(): boolean

	// --- Catalog discovery ---
	listCatalogs(): Promise<CatalogInfo[]>
	listSchemas(catalogId: string): Promise<SchemaInfo[]>
	listTables(catalogId: string, schemaId: string): Promise<TableMetadata[]>
	getTableMetadata(
		catalogId: string,
		schemaId: string,
		tableId: string,
	): Promise<TableMetadata>

	// --- Naming + SQL conventions ---

	/** Returns the dialect-correct fully-qualified name. */
	qualifyName(catalog: string, schema: string, table: string): string

	/** Returns just the column name correctly quoted for this dialect. */
	qualifyColumn(column: string): string

	/** Default `SELECT * FROM <fqn> LIMIT N` in this dialect. */
	generateSelect(
		catalog: string,
		schema: string,
		table: string,
		opts?: { columns?: string[]; limit?: number },
	): string

	/** Optional: dialect-specific DDL fetch ("SHOW CREATE TABLE", etc.) */
	generateShowDDL?(catalog: string, schema: string, table: string): string

	// --- Actions (provider-specific entries appended to the generic action list) ---

	getCatalogActions?(
		ctx: CatalogActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[]

	getSchemaActions?(
		ctx: SchemaActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[]

	getTableActions?(
		ctx: TableActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[]

	// --- Optional capabilities ---

	/** Session context chips shown in the explorer header strip. */
	getSessionContext?(): SessionContextChip[]

	/** Triggered by the pencil in the context strip. */
	onEditConnection?(host: CatalogProviderHostHandlers): void

	/** Cost estimation hook (BigQuery's dry-run; Snowflake doesn't expose one). */
	estimateQueryCost?(sql: string): Promise<QueryCostEstimate>

	/** Pinned catalogs (BigQuery's public-data, etc.). Keys persisted by host. */
	getPinnedCatalogs?(): string[]
	pinCatalog?(catalogId: string): void
	unpinCatalog?(catalogId: string): void

	// --- Compute lifecycle (Snowflake warehouses, Databricks clusters) ---

	/** Status of the active (or named) compute resource. */
	getComputeStatus?(name?: string): Promise<ComputeStatus>

	/** Resume the active (or named) compute resource. */
	resumeCompute?(name?: string): Promise<void>

	/** Suspend the active (or named) compute resource. */
	suspendCompute?(name?: string): Promise<void>

	// --- Session context switching (free-form per provider) ---

	listAvailableRoles?(): Promise<string[]>
	listAvailableComputeOptions?(): Promise<ComputeOption[]>

	/** Issue session SQL to switch compute (e.g. USE WAREHOUSE). */
	setComputeContext?(ctx: ComputeContextChange): Promise<void>

	/** Issue session SQL to switch data context (USE DATABASE / SCHEMA). */
	setDataContext?(catalog?: string, schema?: string): Promise<void>

	/**
	 * Capability flag. When true, role changes require a full reconnect (e.g.
	 * Snowflake — OAuth scope is locked). The UI then shows a "reconnect with
	 * new role" affordance instead of expecting an in-place SQL switch. When
	 * true, the provider does NOT expose `setRole` / equivalent.
	 *
	 * When false/undefined, providers may add their own role-switch SQL via
	 * setDataContext or a future setRole hook.
	 */
	readonly requiresReconnectForRoleSwitch?: boolean

	// --- Query history + stats ---

	/** Recent queries for this connection (most recent first). */
	listRecentQueries?(limit?: number): Promise<QueryHistoryEntry[]>

	/**
	 * Stats for one query, looked up after completion. May return null if
	 * stats aren't yet available (eventual-consistency on some providers).
	 */
	getQueryStats?(queryId: string): Promise<QueryRunStats | null>

	/**
	 * Provider-specific privilege help for a failed operation. Modals call
	 * this on caught errors to render actionable guidance (required grants,
	 * who can run them, etc.). Return null if the error is not a privilege
	 * issue or no help is available.
	 */
	getPrivilegeHelp?(
		operation: PrivilegedOperation,
		error: Error,
	): PrivilegeHelp | null

	// --- Search (provider-side full-text fallback for client-side filter) ---

	searchCatalog?(query: string): Promise<CatalogSearchResult[]>

	// --- Cache control ---

	/** Bust local metadata cache; explorer will re-issue list calls. */
	refresh(): void

	/** Optional: refresh just one subtree. */
	refreshCatalog?(catalogId: string): void
	refreshSchema?(catalogId: string, schemaId: string): void
}

/**
 * Convenient alias for the explorer to consume.
 */
export type AnyCatalogProvider = CatalogProvider
