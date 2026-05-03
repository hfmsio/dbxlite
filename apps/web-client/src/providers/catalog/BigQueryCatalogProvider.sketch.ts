/**
 * BigQueryCatalogProvider — DESIGN SKETCH ONLY (not wired into the app yet).
 *
 * Purpose: validate that `CatalogProvider` accommodates BigQuery's quirks
 * without needing to actually port BigQuery in this PR. If the interface
 * doesn't fit BigQuery cleanly here, it doesn't fit BigQuery — we'd revise
 * the interface before shipping the Snowflake implementation.
 *
 * NOT IMPORTED. NOT REGISTERED. Lives next to the production Snowflake
 * provider as living documentation. Future ticket: migrate BigQuery to use
 * this and delete BigQueryExplorer.tsx.
 *
 * Quirks BigQuery exposes that the interface MUST handle:
 *   - Three-part naming with backticks: `proj.dataset.table`
 *   - Pinned projects (e.g. `bigquery-public-data`)
 *   - Default billing project (separate from queried project)
 *   - Cost estimation via dry-run
 *
 * This sketch confirms each fits.
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
	NodeAction,
	QueryRunStats,
	SchemaActionContext,
	SessionContextChip,
	TableActionContext,
} from "./types"

const PINNED_KEY = "bigquery-pinned-projects"

/** BigQuery uses backtick-quoted three-part names: `proj.dataset.table`. */
function bqQualifyName(catalog: string, schema: string, table: string): string {
	return `\`${catalog}.${schema}.${table}\``
}

function bqQualifyColumn(column: string): string {
	// BigQuery accepts unquoted identifiers in most contexts; backtick-quote
	// only when the column name needs escaping. Keep it simple here.
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(column) ? column : `\`${column}\``
}

export class BigQueryCatalogProvider implements CatalogProvider {
	readonly id = "bigquery"
	readonly displayName = "BigQuery"
	readonly icon = "🔵"
	readonly accentColor = "#4285f4"
	readonly catalogTerm = { singular: "project", plural: "projects" }

	isConnected(): boolean {
		return queryService.isBigQueryConnected()
	}

	listCatalogs(): Promise<CatalogInfo[]> {
		// BigQuery: catalogs ≡ projects.
		return queryService.getBigQueryProjects()
	}

	listSchemas(catalogId: string): Promise<SchemaInfo[]> {
		// BigQuery: schemas ≡ datasets.
		return queryService.getBigQueryDatasets(catalogId)
	}

	listTables(catalogId: string, schemaId: string): Promise<TableMetadata[]> {
		return queryService.getBigQueryTables(catalogId, schemaId)
	}

	getTableMetadata(
		catalogId: string,
		schemaId: string,
		tableId: string,
	): Promise<TableMetadata> {
		return queryService.getBigQueryTableMetadata(catalogId, schemaId, tableId)
	}

	qualifyName = bqQualifyName
	qualifyColumn = bqQualifyColumn

	generateSelect(
		catalog: string,
		schema: string,
		table: string,
		opts?: { columns?: string[]; limit?: number },
	): string {
		const fqn = bqQualifyName(catalog, schema, table)
		const cols =
			opts?.columns && opts.columns.length
				? opts.columns.map(bqQualifyColumn).join(", ")
				: "*"
		const limit = opts?.limit ?? 100
		return `SELECT ${cols} FROM ${fqn} LIMIT ${limit};`
	}

	getTableActions(
		ctx: TableActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[] {
		const fqn = bqQualifyName(ctx.catalog, ctx.schema, ctx.table.name)
		return [
			{
				id: "insert-select",
				label: "Insert SELECT * FROM …",
				icon: "▦",
				onSelect: () =>
					host.insertIntoEditor(
						this.generateSelect(ctx.catalog, ctx.schema, ctx.table.name),
					),
			},
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
				id: "estimate-cost",
				label: "Estimate query cost (dry run)",
				icon: "💲",
				onSelect: async () => {
					const sql = this.generateSelect(
						ctx.catalog,
						ctx.schema,
						ctx.table.name,
					)
					const est = await this.estimateQueryCost(sql)
					host.showToast?.(
						`Dry run: ${(est.estimatedBytes / 1024 ** 3).toFixed(2)} GB scanned · $${est.estimatedCostUSD?.toFixed(4)}`,
						"info",
					)
				},
			},
		]
	}

	getSchemaActions(
		ctx: SchemaActionContext,
		host: CatalogProviderHostHandlers,
	): NodeAction[] {
		return [
			{
				id: "copy-fqn",
				label: "Copy `project.dataset`",
				icon: "📎",
				onSelect: () =>
					host.copyToClipboard(`\`${ctx.catalog}.${ctx.schema.name}\``),
			},
		]
	}

	// Optional capabilities — BigQuery uses these where Snowflake declines.

	getSessionContext(): SessionContextChip[] {
		// BigQuery doesn't have role/warehouse — but it does have the default
		// billing project. We surface that as the one chip in this slot.
		// Note: the queryService has getBigQueryDefaultProject but it's async;
		// in real impl we'd cache it locally. For sketch, returning empty.
		return []
	}

	async estimateQueryCost(sql: string): Promise<QueryCostEstimate> {
		// Real impl would call queryService's cost-estimate path. Sketch only.
		return { estimatedBytes: 0, estimatedCostUSD: 0, cachingPossible: true }
		// noop reference to keep the param "used" in TS
		void sql
	}

	getPinnedCatalogs(): string[] {
		try {
			const raw = localStorage.getItem(PINNED_KEY)
			return raw ? (JSON.parse(raw) as string[]) : []
		} catch {
			return []
		}
	}

	pinCatalog(catalogId: string): void {
		const cur = new Set(this.getPinnedCatalogs())
		cur.add(catalogId)
		localStorage.setItem(PINNED_KEY, JSON.stringify([...cur]))
	}

	unpinCatalog(catalogId: string): void {
		const cur = new Set(this.getPinnedCatalogs())
		cur.delete(catalogId)
		localStorage.setItem(PINNED_KEY, JSON.stringify([...cur]))
	}

	// Compute lifecycle: BigQuery has no warehouse/cluster concept (slots are
	// invisible to users). All compute methods are intentionally undefined —
	// the abstraction handles that via capability detection.
	//   getComputeStatus, resumeCompute, suspendCompute, listAvailableComputeOptions,
	//   setComputeContext, listAvailableRoles → all undefined.

	// Role switching: BigQuery uses IAM, not session roles. setRole/useRole is
	// undefined; we don't expose requiresReconnectForRoleSwitch either (the
	// concept doesn't apply).

	// Query history: BigQuery exposes job history via INFORMATION_SCHEMA.JOBS_BY_USER.
	// Sketch shows shape; full impl lands with BQ migration.
	async listRecentQueries(_limit = 100): Promise<import("./types").QueryHistoryEntry[]> {
		// Real impl would call:
		//   SELECT job_id, query, state, creation_time, total_slot_ms,
		//          total_bytes_processed, error_result, user_email
		//   FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_USER
		//   ORDER BY creation_time DESC LIMIT N
		return []
	}

	// Post-execution stats: BigQuery returns bytes-processed in the job
	// response itself (no separate lookup needed). Sketch fills it from
	// what's already in the connector's response cache.
	async getQueryStats(_queryId: string): Promise<QueryRunStats | null> {
		// Real impl would fetch from connector's last-job-info cache (added
		// during BQ migration).
		return null
	}

	refresh(): void {
		queryService.clearBigQueryCache()
	}
}

// Not exported as a singleton on purpose — this is a sketch, not active.
// Removing this comment + exporting is part of the future migration ticket.
