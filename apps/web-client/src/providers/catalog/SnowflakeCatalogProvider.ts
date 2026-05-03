/**
 * SnowflakeCatalogProvider
 *
 * CatalogProvider implementation for Snowflake. Wraps the existing
 * SnowflakeConnector + queryService. The provider has no UI — the generic
 * <CatalogExplorer> component renders it.
 */

import type {
	CatalogInfo,
	QueryCostEstimate,
	SchemaInfo,
	TableMetadata,
} from "@ide/connectors"
import { queryService } from "../../services/streaming-query-service"
import type {
	CatalogProvider,
	CatalogProviderHostHandlers,
	ComputeContextChange,
	ComputeOption,
	ComputeStatus,
	ComputeStatusState,
	NodeAction,
	PrivilegeHelp,
	PrivilegedOperation,
	QueryHistoryEntry,
	QueryRunStats,
	SchemaActionContext,
	SessionContextChip,
	TableActionContext,
} from "./types"

/**
 * Snowflake quoting: identifiers wrapped in double quotes preserve case.
 * Unquoted identifiers are uppercased server-side. We always quote to be safe.
 */
function quoteSnowflakeIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`
}

export class SnowflakeCatalogProvider implements CatalogProvider {
	readonly id = "snowflake"
	readonly displayName = "Snowflake"
	readonly icon = "❄️"
	readonly accentColor = "#29b5e8"
	readonly catalogTerm = { singular: "database", plural: "databases" }

	isConnected(): boolean {
		return queryService.isSnowflakeConnected()
	}

	listCatalogs(): Promise<CatalogInfo[]> {
		return queryService.getSnowflakeDatabases()
	}

	listSchemas(catalogId: string): Promise<SchemaInfo[]> {
		return queryService.getSnowflakeSchemas(catalogId)
	}

	listTables(catalogId: string, schemaId: string): Promise<TableMetadata[]> {
		return queryService.getSnowflakeTables(catalogId, schemaId)
	}

	getTableMetadata(
		catalogId: string,
		schemaId: string,
		tableId: string,
	): Promise<TableMetadata> {
		return queryService.getSnowflakeTableMetadata(catalogId, schemaId, tableId)
	}

	qualifyName(catalog: string, schema: string, table: string): string {
		return [catalog, schema, table].map(quoteSnowflakeIdent).join(".")
	}

	qualifyColumn(column: string): string {
		return quoteSnowflakeIdent(column)
	}

	generateSelect(
		catalog: string,
		schema: string,
		table: string,
		opts?: { columns?: string[]; limit?: number },
	): string {
		const fqn = this.qualifyName(catalog, schema, table)
		const cols =
			opts?.columns && opts.columns.length
				? opts.columns.map((c) => this.qualifyColumn(c)).join(", ")
				: "*"
		const limit = opts?.limit ?? 100
		return `SELECT ${cols} FROM ${fqn} LIMIT ${limit};`
	}

	generateShowDDL(catalog: string, schema: string, table: string): string {
		// Snowflake exposes DDL via GET_DDL(). The fully-qualified name is
		// passed as a *string literal*, so we double-quote each identifier
		// (case preservation) and then escape the joined FQN for the literal
		// so embedded `'` in any name can't break out.
		const fqn = `${quoteSnowflakeIdent(catalog)}.${quoteSnowflakeIdent(schema)}.${quoteSnowflakeIdent(table)}`
		return `SELECT GET_DDL('TABLE', '${escapeSqlLiteral(fqn)}') AS ddl;`
	}

	// -----------------------------------------------------------------------
	// Per-node action menus (right-click)
	// -----------------------------------------------------------------------

	getTableActions(
		ctx: TableActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[] {
		const fqn = this.qualifyName(ctx.catalog, ctx.schema, ctx.table.name)
		const isView = ctx.table.type === "view"

		const selectStar = this.generateSelect(
			ctx.catalog,
			ctx.schema,
			ctx.table.name,
		)
		const selectAllCols =
			ctx.table.columns && ctx.table.columns.length
				? this.generateSelect(ctx.catalog, ctx.schema, ctx.table.name, {
						columns: ctx.table.columns.map((c: { name: string }) => c.name),
					})
				: selectStar

		return [
			{
				id: "insert-select",
				label: "Insert SELECT * FROM …",
				icon: "▦",
				onSelect: () => host.insertIntoEditor(selectStar),
			},
			{
				id: "insert-select-cols",
				label: "Insert SELECT (all columns) FROM …",
				icon: "📋",
				onSelect: async () => {
					// May need to fetch columns lazily if not already loaded
					if (!ctx.table.columns?.length) {
						const full = await this.getTableMetadata(
							ctx.catalog,
							ctx.schema,
							ctx.table.name,
						)
						const sql = this.generateSelect(
							ctx.catalog,
							ctx.schema,
							ctx.table.name,
							{
								columns: (full.columns ?? []).map(
								(c: { name: string }) => c.name,
							),
							},
						)
						host.insertIntoEditor(sql)
					} else {
						host.insertIntoEditor(selectAllCols)
					}
				},
			},
			{ id: "sep1", label: "", separator: true, onSelect: () => {} },
			{
				id: "copy-fqn",
				label: "Copy fully-qualified name",
				icon: "📎",
				onSelect: async () => {
					await host.copyToClipboard(fqn)
					host.showToast?.("Copied", "success")
				},
			},
			{
				id: "copy-name",
				label: "Copy name only",
				icon: "📋",
				onSelect: async () => {
					await host.copyToClipboard(ctx.table.name)
					host.showToast?.("Copied", "success")
				},
			},
			{ id: "sep2", label: "", separator: true, onSelect: () => {} },
			{
				id: "show-ddl",
				label: isView ? "Show view DDL" : "Show table DDL",
				icon: "📜",
				onSelect: () =>
					host.insertIntoEditor(
						this.generateShowDDL(ctx.catalog, ctx.schema, ctx.table.name),
					),
			},
			{
				id: "describe",
				label: "DESCRIBE TABLE",
				icon: "🔍",
				onSelect: () =>
					host.insertIntoEditor(
						`DESCRIBE TABLE ${this.qualifyName(ctx.catalog, ctx.schema, ctx.table.name)};`,
					),
			},
		]
	}

	getSchemaActions(
		ctx: SchemaActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[] {
		return [
			{
				id: "use-schema",
				label: `USE SCHEMA ${ctx.schema.name}`,
				icon: "📁",
				onSelect: () =>
					host.insertIntoEditor(
						`USE SCHEMA ${quoteSnowflakeIdent(ctx.catalog)}.${quoteSnowflakeIdent(ctx.schema.name)};`,
					),
			},
			{
				id: "show-tables",
				label: "Insert SHOW TABLES",
				icon: "▦",
				onSelect: () =>
					host.insertIntoEditor(
						`SHOW TABLES IN ${quoteSnowflakeIdent(ctx.catalog)}.${quoteSnowflakeIdent(ctx.schema.name)};`,
					),
			},
			{
				id: "copy-fqn",
				label: "Copy schema name",
				icon: "📎",
				onSelect: async () => {
					await host.copyToClipboard(
						`${quoteSnowflakeIdent(ctx.catalog)}.${quoteSnowflakeIdent(ctx.schema.name)}`,
					)
					host.showToast?.("Copied", "success")
				},
			},
		]
	}

	getCatalogActions(
		_ctx: { catalog: CatalogInfo },
		host: CatalogProviderHostHandlers,
	): NodeAction[] {
		return [
			{
				id: "use-database",
				label: `USE DATABASE ${_ctx.catalog.name}`,
				icon: "🗄",
				onSelect: () =>
					host.insertIntoEditor(
						`USE DATABASE ${quoteSnowflakeIdent(_ctx.catalog.name)};`,
					),
			},
			{
				id: "show-schemas",
				label: "Insert SHOW SCHEMAS",
				icon: "📁",
				onSelect: () =>
					host.insertIntoEditor(
						`SHOW SCHEMAS IN DATABASE ${quoteSnowflakeIdent(_ctx.catalog.name)};`,
					),
			},
		]
	}

	// -----------------------------------------------------------------------
	// Session context (role / warehouse / database / schema)
	// -----------------------------------------------------------------------

	getSessionContext(): SessionContextChip[] {
		const sf = queryService.getSnowflakeConnector()
		if (!sf) return []
		const role = sf.getRole()
		const warehouse = sf.getWarehouse()
		const database = sf.getDatabase()
		const schema = sf.getDefaultSchema()
		const chips: SessionContextChip[] = [
			{
				id: "role",
				icon: "👤",
				label: "Role",
				value: role || "—",
				tooltip:
					"Snowflake role: governs which objects you can see. Required for OAuth scope.",
			},
			{
				id: "compute",
				icon: "🏭",
				label: "Warehouse",
				value: warehouse || "—",
				tooltip: "Warehouse: the compute that runs your queries. Required.",
			},
		]
		// Optional defaults: only surface chips when actually set. An empty
		// "DB (none)" / "SCHEMA (none)" chip is visual noise — the absence
		// of a default is communicated by the chip not being there.
		if (database) {
			chips.push({
				id: "catalog",
				icon: "🗄",
				label: "DB",
				value: database,
				tooltip: "Default database used when objects aren't fully qualified.",
			})
		}
		if (schema) {
			chips.push({
				id: "schema",
				icon: "📁",
				label: "Schema",
				value: schema,
				tooltip: "Default schema used when objects aren't fully qualified.",
			})
		}
		return chips
	}

	onEditConnection(host: CatalogProviderHostHandlers): void {
		host.openConnectionEdit?.()
	}

	// -----------------------------------------------------------------------
	// Cost estimation — Snowflake doesn't expose a free dry-run.
	// -----------------------------------------------------------------------

	estimateQueryCost(_sql: string): Promise<QueryCostEstimate> {
		return Promise.resolve({
			estimatedBytes: 0,
			estimatedCostUSD: undefined,
			cachingPossible: true,
		})
	}

	// -----------------------------------------------------------------------
	// Cache control — delegate to the underlying connector
	// -----------------------------------------------------------------------

	refresh(): void {
		queryService.clearSnowflakeCache()
	}

	// -----------------------------------------------------------------------
	// Pinned catalogs — localStorage-backed list of database names that the
	// user wants surfaced at the top of the tree.
	// -----------------------------------------------------------------------

	private readonly pinnedKey = "snowflake-pinned-catalogs"

	getPinnedCatalogs(): string[] {
		try {
			const raw = localStorage.getItem(this.pinnedKey)
			if (!raw) return []
			const parsed = JSON.parse(raw)
			return Array.isArray(parsed)
				? parsed.filter((x): x is string => typeof x === "string")
				: []
		} catch {
			return []
		}
	}

	pinCatalog(catalogId: string): void {
		const cur = new Set(this.getPinnedCatalogs())
		cur.add(catalogId)
		try {
			localStorage.setItem(this.pinnedKey, JSON.stringify([...cur]))
		} catch {
			// localStorage may be unavailable; fail silently
		}
	}

	unpinCatalog(catalogId: string): void {
		const cur = new Set(this.getPinnedCatalogs())
		cur.delete(catalogId)
		try {
			localStorage.setItem(this.pinnedKey, JSON.stringify([...cur]))
		} catch {}
	}

	// -----------------------------------------------------------------------
	// Compute lifecycle (warehouse status / resume / suspend)
	// -----------------------------------------------------------------------

	async getComputeStatus(name?: string): Promise<ComputeStatus> {
		const target = name ?? this.activeWarehouseName()
		if (!target) {
			return { state: "unknown", lastChecked: new Date() }
		}
		const rows = await runStatement(
			`SHOW WAREHOUSES LIKE '${escapeSqlLiteral(target)}'`,
		)
		if (rows.length === 0) {
			return { state: "unknown", lastChecked: new Date() }
		}
		// SHOW WAREHOUSES columns (Snowflake docs): name(0), state(1), type(2), size(3), …
		const row = rows[0]
		return {
			state: parseComputeState(row[1] as string | undefined),
			size: row[3] as string | undefined,
			lastChecked: new Date(),
		}
	}

	async resumeCompute(name?: string): Promise<void> {
		const target = name ?? this.activeWarehouseName()
		if (!target) throw new Error("No active warehouse to resume")
		await runStatement(
			`ALTER WAREHOUSE ${quoteSnowflakeIdent(target)} RESUME IF SUSPENDED`,
		)
	}

	async suspendCompute(name?: string): Promise<void> {
		const target = name ?? this.activeWarehouseName()
		if (!target) throw new Error("No active warehouse to suspend")
		await runStatement(
			`ALTER WAREHOUSE ${quoteSnowflakeIdent(target)} SUSPEND`,
		)
	}

	// -----------------------------------------------------------------------
	// Session-context switching
	// -----------------------------------------------------------------------

	async listAvailableRoles(): Promise<string[]> {
		// PAT mode: the token is scoped to a single role at creation time.
		// Switching roles requires generating a new PAT, so we return just
		// the current role — the dropdown effectively disables itself
		// (one option, no switch).
		const sf = queryService.getSnowflakeConnector()
		if (sf?.getAuthMode?.() === "pat") {
			return [sf.getRole()].filter(Boolean) as string[]
		}
		// SHOW GRANTS TO USER expects a *literal* user identifier — passing
		// CURRENT_USER() doesn't work (Snowflake reports "User 'CURRENT_USER'
		// does not exist or not authorized" because the parser treats it as
		// a name, not a function call). Resolve the username via SELECT first,
		// then interpolate as a quoted identifier.
		//
		// Access columns by NAME ("role") rather than positional index — index
		// access broke in production when Snowflake returned different column
		// orderings, surfacing privilege names in the role dropdown.
		//
		// Some accounts restrict SHOW GRANTS; callers catch and fall back to a
		// free-text input.
		const userRows = await runStatementAsObjects(`SELECT CURRENT_USER()`)
		const username = (userRows[0]?.["CURRENT_USER()"] ??
			Object.values(userRows[0] ?? {})[0]) as string | undefined
		if (!username) {
			throw new Error("Could not resolve current user")
		}
		const rows = await runStatementAsObjects(
			`SHOW GRANTS TO USER ${quoteSnowflakeIdent(username)}`,
		)
		const seen = new Set<string>()
		for (const row of rows) {
			// SHOW GRANTS TO USER columns: created_on, role, granted_to,
			// grantee_name, granted_by. We want the `role` column.
			const role = (row.role ??
				row.ROLE ??
				row.name ??
				row.NAME) as string | undefined
			if (typeof role === "string" && role.length > 0) {
				seen.add(role)
			}
		}
		return Array.from(seen).sort()
	}

	async listAvailableComputeOptions(): Promise<ComputeOption[]> {
		const rows = await runStatement(`SHOW WAREHOUSES`)
		return rows.map((row) => ({
			name: (row[0] as string) ?? "",
			state: parseComputeState(row[1] as string | undefined),
			size: row[3] as string | undefined,
		}))
	}

	async setComputeContext(ctx: ComputeContextChange): Promise<void> {
		const sf = queryService.getSnowflakeConnector()
		if (!sf) throw new Error("Snowflake not connected")
		const wh = ctx.warehouse ?? ctx.cluster
		if (!wh) return
		// Snowflake's SQL API (v2/statements) rejects `USE WAREHOUSE`. Instead,
		// pass `warehouse` as a per-request session parameter — executeStatement
		// already includes it in the request body. updateConfig persists the
		// new value so subsequent queries inherit it.
		// https://docs.snowflake.com/en/developer-guide/sql-api/handling-responses#error-handling
		await sf.updateConfig({ warehouse: wh })
	}

	async setDataContext(catalog?: string, schema?: string): Promise<void> {
		const sf = queryService.getSnowflakeConnector()
		if (!sf) throw new Error("Snowflake not connected")
		// Same reason as setComputeContext: SQL API rejects `USE DATABASE`/
		// `USE SCHEMA`. Set them via session parameters on the next request.
		await sf.updateConfig({
			...(catalog ? { database: catalog } : {}),
			...(schema ? { schema } : {}),
		})
	}

	/** Snowflake's OAuth scope is locked to a single role; switching requires reconnect. */
	readonly requiresReconnectForRoleSwitch = true

	// -----------------------------------------------------------------------
	// Query history + post-execution stats
	// -----------------------------------------------------------------------

	async listRecentQueries(limit = 100): Promise<QueryHistoryEntry[]> {
		// Snowflake INFORMATION_SCHEMA table functions must be fully qualified
		// (DATABASE.INFORMATION_SCHEMA.<function>) unless the session is using
		// INFORMATION_SCHEMA. Without a database qualifier the parser fails with
		// "Invalid identifier" even when the role has MONITOR USAGE.
		// https://docs.snowflake.com/en/sql-reference/functions/query_history#usage-notes
		// Any visible database works — these functions return account-wide data
		// regardless of which DB's INFORMATION_SCHEMA we tunnel through.
		const db = await this.resolveQualifierDatabase()
		const fn = `${quoteSnowflakeIdent(db)}.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER`
		const sql = `
SELECT
  query_id,
  query_text,
  execution_status,
  start_time,
  total_elapsed_time,
  bytes_scanned,
  rows_produced,
  warehouse_name,
  role_name,
  error_message
FROM TABLE(${fn}(result_limit => ${Math.max(1, Math.min(limit, 10000))}))
ORDER BY start_time DESC
`
		const rows = await runStatement(sql)
		return rows.map((row) => ({
			queryId: (row[0] as string) ?? "",
			text: (row[1] as string) ?? "",
			status: mapHistoryStatus(row[2] as string | undefined),
			startTime: row[3] ? new Date(row[3] as string | number) : new Date(0),
			durationMs:
				typeof row[4] === "number"
					? row[4]
					: typeof row[4] === "string"
						? Number(row[4]) || 0
						: 0,
			bytesScanned:
				typeof row[5] === "number"
					? row[5]
					: row[5] != null
						? Number(row[5])
						: undefined,
			rowsProduced:
				typeof row[6] === "number"
					? row[6]
					: row[6] != null
						? Number(row[6])
						: undefined,
			computeContext: (row[7] as string | undefined) || undefined,
			role: (row[8] as string | undefined) || undefined,
			errorMessage: (row[9] as string | undefined) || undefined,
		}))
	}

	async getQueryStats(queryId: string): Promise<QueryRunStats | null> {
		// Eventually consistent; retry a few times. Skip on permission errors.
		// Function must be fully qualified (see listRecentQueries).
		let db: string
		try {
			db = await this.resolveQualifierDatabase()
		} catch {
			return null
		}
		const fn = `${quoteSnowflakeIdent(db)}.INFORMATION_SCHEMA.QUERY_HISTORY_BY_QUERY_ID`
		const sql = `
SELECT
  bytes_scanned,
  rows_produced,
  total_elapsed_time,
  warehouse_name,
  warehouse_size
FROM TABLE(${fn}(query_id => '${escapeSqlLiteral(queryId)}'))
LIMIT 1
`
		for (let attempt = 0; attempt < 3; attempt++) {
			let rows: unknown[][]
			try {
				rows = await runStatement(sql)
			} catch (err) {
				const msg = err instanceof Error ? err.message : ""
				// Permission denied → no point retrying.
				if (/permission|privilege|access|insufficient/i.test(msg)) {
					return null
				}
				throw err
			}
			if (rows.length > 0) {
				const row = rows[0]
				return {
					bytesScanned: numericOrUndefined(row[0]),
					rowsProduced: numericOrUndefined(row[1]),
					durationMs: numericOrUndefined(row[2]),
					computeContext: (row[3] as string | undefined) || undefined,
					computeSize: (row[4] as string | undefined) || undefined,
				}
			}
			await new Promise((r) => setTimeout(r, 1000))
		}
		return null
	}

	/**
	 * Snowflake INFORMATION_SCHEMA functions must be qualified by a database
	 * the role can see. Use the active database if set, otherwise fall back to
	 * the first listed catalog. Throws only when the role can see zero
	 * databases (truly degenerate — needs a privilege fix, not a UX prompt).
	 */
	private async resolveQualifierDatabase(): Promise<string> {
		const active = queryService.getSnowflakeConnector()?.getDatabase()
		if (active) return active
		const catalogs = await this.listCatalogs()
		const fallback = catalogs[0]?.name
		if (fallback) return fallback
		throw new Error(
			"No databases visible to your role — query history requires USAGE on at least one database.",
		)
	}

	// -----------------------------------------------------------------------
	// Privilege help
	// -----------------------------------------------------------------------

	getPrivilegeHelp(
		operation: PrivilegedOperation,
		error: Error,
	): PrivilegeHelp | null {
		const msg = error.message || ""
		const sf = queryService.getSnowflakeConnector()
		const role = sf?.getRole() ?? "<your_role>"
		const quotedRole = /^[A-Z_][A-Z0-9_]*$/i.test(role) ? role : `"${role}"`
		const db = sf?.getDatabase()

		// Case 1: role can't see any database — needs USAGE on at least one.
		if (/no databases visible/i.test(msg)) {
			return {
				title: "No databases visible to your role",
				body:
					`Query history is qualified through any database's INFORMATION_SCHEMA, ` +
					`but the role ${role} can't see any database. Grant USAGE on at least ` +
					`one database to enable it.`,
				commands: [
					{
						sql: `GRANT USAGE ON DATABASE <YOUR_DB> TO ROLE ${quotedRole};`,
						runAs: "ACCOUNTADMIN",
						description: "Replace <YOUR_DB> with any database name.",
					},
				],
				docsUrl: "https://docs.snowflake.com/en/sql-reference/sql/grant-privilege",
			}
		}

		// Case 2: privilege issue. Snowflake reports an "Invalid identifier"
		// parse error *before* the privilege check fires when the role can't
		// resolve the function — so both wordings indicate the same cause.
		const isPrivIssue =
			/permission|privilege|access denied|insufficient/i.test(msg) ||
			/invalid identifier.*query_history/i.test(msg)

		if (!isPrivIssue) return null

		if (operation === "queryHistory" || operation === "queryStats") {
			return {
				title: "Query history requires the MONITOR USAGE privilege",
				body:
					`The role ${role} can't resolve ${db ?? "<db>"}.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER. ` +
					`Snowflake reports this as "Invalid identifier" rather than a permission error ` +
					`because the parser fails the function lookup before the privilege check fires. ` +
					`Grant MONITOR USAGE on the account, then reconnect (Snowflake's OAuth scope is ` +
					`role-locked, so the new privilege takes effect on next OAuth).`,
				commands: [
					{
						sql: "USE ROLE ACCOUNTADMIN;",
						description:
							"Switch to ACCOUNTADMIN to run the grant (or use SECURITYADMIN if your account permits).",
					},
					{
						sql: `GRANT MONITOR USAGE ON ACCOUNT TO ROLE ${quotedRole};`,
						runAs: "ACCOUNTADMIN",
						description:
							"Grants account-wide query-history visibility to your role.",
					},
				],
				docsUrl:
					"https://docs.snowflake.com/en/sql-reference/functions/query_history",
			}
		}

		if (operation === "listSchemas" || operation === "listTables") {
			// Best-effort extract: the database name often shows up in the error
			// (e.g. "Insufficient privileges to operate on database 'NRO_CURATED'").
			const dbMatch = msg.match(/on (?:database|schema) ['"]?([A-Z0-9_]+)['"]?/i)
			const targetDb = dbMatch?.[1] ?? "<DATABASE>"
			const isTables = operation === "listTables"
			return {
				title: `No ${isTables ? "tables" : "schemas"} access — role ${role} lacks USAGE`,
				body:
					`Snowflake denied ${isTables ? "table" : "schema"} listing on ${targetDb}. ` +
					`Your active role (${role}) needs USAGE on the database${isTables ? " and schema" : ""} ` +
					`before it can list ${isTables ? "tables" : "schemas"}.`,
				commands: [
					{
						sql: `GRANT USAGE ON DATABASE ${targetDb} TO ROLE ${quotedRole};`,
						runAs: "ACCOUNTADMIN",
						description:
							"Grants the role visibility into the database's schemas.",
					},
				],
				docsUrl:
					"https://docs.snowflake.com/en/sql-reference/sql/grant-privilege",
			}
		}
		return null
	}

	// -----------------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------------

	private activeWarehouseName(): string | undefined {
		return queryService.getSnowflakeConnector()?.getWarehouse() || undefined
	}
}

export const snowflakeCatalogProvider = new SnowflakeCatalogProvider()

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/**
 * Run a single Snowflake SQL statement and return its rows. Drains the async
 * generator into one in-memory array — fine for SHOW/DESCRIBE/INFORMATION_SCHEMA
 * queries which are bounded.
 */
async function runStatement(sql: string): Promise<unknown[][]> {
	const sf = queryService.getSnowflakeConnector()
	if (!sf) throw new Error("Snowflake not connected")
	const rows: unknown[][] = []
	for await (const chunk of sf.query(sql)) {
		// Connector yields parsed objects (Record<string, unknown>); we want
		// raw rowwise data. Convert object rows back to positional arrays
		// preserving schema order from the chunk.
		if (chunk.schema?.tables[0]?.columns?.length) {
			const cols = chunk.schema.tables[0].columns
			for (const obj of chunk.rows) {
				rows.push(
					cols.map(
						(c: { name: string }) =>
							(obj as Record<string, unknown>)[c.name],
					),
				)
			}
		} else {
			// No schema (DDL response or empty); skip.
		}
	}
	return rows
}

/**
 * Like `runStatement` but returns rows as Record<string, unknown> keyed by
 * the result columns' names. Use this when result-column ordering can't be
 * trusted (e.g., SHOW GRANTS variants which differ in column shape) — access
 * fields by name instead of index.
 */
async function runStatementAsObjects(
	sql: string,
): Promise<Record<string, unknown>[]> {
	const sf = queryService.getSnowflakeConnector()
	if (!sf) throw new Error("Snowflake not connected")
	const rows: Record<string, unknown>[] = []
	for await (const chunk of sf.query(sql)) {
		if (chunk.schema?.tables[0]?.columns?.length) {
			for (const obj of chunk.rows) {
				rows.push(obj as Record<string, unknown>)
			}
		}
	}
	return rows
}

function escapeSqlLiteral(s: string): string {
	return s.replace(/'/g, "''")
}

function parseComputeState(s: string | undefined): ComputeStatusState {
	switch ((s ?? "").toUpperCase()) {
		case "STARTED":
		case "RUNNING":
			return "running"
		case "STARTING":
			return "starting"
		case "SUSPENDED":
			return "suspended"
		case "SUSPENDING":
			return "suspending"
		case "RESIZING":
			return "resizing"
		default:
			return "unknown"
	}
}

function mapHistoryStatus(
	s: string | undefined,
): QueryHistoryEntry["status"] {
	switch ((s ?? "").toUpperCase()) {
		case "SUCCESS":
		case "SUCCEEDED":
			return "success"
		case "FAIL":
		case "FAILED":
		case "FAILED_WITH_ERROR":
			return "failed"
		case "RUNNING":
		case "QUEUED":
		case "BLOCKED":
			return "running"
		case "CANCELED":
		case "CANCELLED":
			return "cancelled"
		default:
			return "success"
	}
}

function numericOrUndefined(v: unknown): number | undefined {
	if (v == null) return undefined
	if (typeof v === "number") return v
	const n = Number(v as string)
	return Number.isFinite(n) ? n : undefined
}
