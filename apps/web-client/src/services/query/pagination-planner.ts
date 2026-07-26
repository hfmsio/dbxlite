/**
 * PaginationPlanner — decides the SQL a page fetch actually runs.
 *
 * Extracted from StreamingQueryService (WS-A / A5 in docs/REFACTOR-PLAN.md).
 * This owns the audit's Phase-2 correctness fix, so the behavior is spelled
 * out rather than inferred:
 *
 * Raw `sql LIMIT n OFFSET m` per page is unsound. Each page is a separate
 * execution and, with preserve_insertion_order=false, DuckDB gives no
 * cross-execution ordering guarantee — pages could repeat or skip rows.
 * Materialising once into a temp table and paging `ORDER BY rowid` over that
 * fixed table is deterministic by construction, and yields an exact row count
 * for free (which RowCountEstimator reads through `exactRowCountFor`).
 *
 * WASM-mode DuckDB only: temp tables are connection-scoped and only the WASM
 * worker holds one long-lived connection. HTTP mode falls back to the legacy
 * end-anchored trailing-LIMIT injection.
 */

import type { TableRow } from "../../types/table";
import {
	getStatementKeyword as getSqlKeyword,
	getTrailingLimit,
	isPaginatableStatement,
} from "../../utils/sqlPagination";
import { createLogger } from "../../utils/logger";
import type { ConnectorType } from "../../types/data-source";
import type { ExecuteOnConnector } from "./ports";

const logger = createLogger("PaginationPlanner");

/** Statements that invalidate trust in a snapshot of the data. */
const MUTATING_KEYWORD =
	/^(insert|update|delete|merge|create|drop|alter|truncate|copy|import|attach|detach|call)$/;

interface StreamMaterialization {
	sql: string;
	table: string;
	rowCount: number;
}

/** What the planner produced for one page fetch. */
export interface PagePlan {
	/** The SQL to actually send to the connector. */
	sql: string;
	/**
	 * Exact total row count, when the plan materialized and counted. Undefined
	 * when the count is unknown — the caller then falls back to whatever the
	 * connector reports.
	 */
	totalRows?: number;
}

export interface PlanRequest {
	limit?: number;
	offset: number;
	enablePagination: boolean;
	/** Materialization is DuckDB-only; other connectors are passed through. */
	activeConnector: ConnectorType;
	signal?: AbortSignal;
}

/** The minimum the planner needs to know about the operating mode. */
interface ModeLike {
	isHttp(): boolean;
}

export class PaginationPlanner {
	/** The latest query materialised into a temp table for stable paging. */
	private materialization: StreamMaterialization | null = null;
	/**
	 * Name of the last materialisation's table, kept separately so the next
	 * materialisation can DROP it even after an invalidation nulled the
	 * pointer — a mutation invalidates trust in the snapshot, not the need to
	 * clean up the table.
	 */
	private lastTable: string | null = null;
	private tableSeq = 0;

	constructor(
		private readonly execute: ExecuteOnConnector<{ rows: TableRow[] }>,
		private readonly mode: ModeLike,
	) {}

	/**
	 * Drop trust in the current materialisation when a statement can mutate
	 * what it snapshot. Cheap keyword test; the temp table itself is dropped
	 * lazily by the next materialisation.
	 */
	invalidateIfMutating(sql: string): void {
		if (!this.materialization) return;
		const kw = getSqlKeyword(sql);
		const mutating =
			MUTATING_KEYWORD.test(kw) ||
			(kw === "with" && !isPaginatableStatement(sql));
		if (mutating) {
			this.materialization = null;
		}
	}

	/**
	 * Read-seam for RowCountEstimator (A6): the exact count of a live
	 * materialisation of this exact SQL, or null when there isn't one.
	 */
	exactRowCountFor(sql: string): number | null {
		if (this.materialization?.sql !== sql) return null;
		return this.materialization.rowCount >= 0
			? this.materialization.rowCount
			: null;
	}

	/** Decide the SQL for one page fetch. */
	async plan(sql: string, request: PlanRequest): Promise<PagePlan> {
		const { limit, offset, enablePagination, activeConnector, signal } =
			request;

		if (
			!enablePagination ||
			activeConnector !== "duckdb" ||
			limit === undefined ||
			!isPaginatableStatement(sql)
		) {
			return { sql };
		}

		const mat = await this.ensureMaterialization(sql, signal);
		if (mat) {
			return {
				sql: `SELECT * FROM ${mat.table} ORDER BY rowid LIMIT ${limit} OFFSET ${offset}`,
				totalRows: mat.rowCount >= 0 ? mat.rowCount : undefined,
			};
		}

		// Fallback for HTTP mode or shapes CREATE TABLE AS can't wrap: the
		// legacy trailing-LIMIT injection, gated on the SAME end-anchored
		// user-LIMIT test the UI uses. (The old anywhere-match disagreed with
		// the UI and made every "page" return the full set.)
		if (getTrailingLimit(sql) !== undefined) {
			return { sql };
		}
		let paginated = `${sql} LIMIT ${limit}`;
		if (offset > 0) {
			paginated += ` OFFSET ${offset}`;
		}
		return { sql: paginated };
	}

	/**
	 * Materialise `sql` into a temp table, reusing the existing one when the
	 * same SQL is paged again. Returns null when materialisation isn't
	 * applicable (HTTP mode) or fails (non-SELECT shapes).
	 */
	private async ensureMaterialization(
		sql: string,
		signal?: AbortSignal,
	): Promise<StreamMaterialization | null> {
		if (this.materialization?.sql === sql) {
			return this.materialization;
		}
		if (this.mode.isHttp()) return null;

		const cleanSql = sql.replace(/[\s;]+$/, "");
		const table = `__dbxlite_stream_${++this.tableSeq}`;
		try {
			await this.execute(
				"duckdb",
				`CREATE TEMP TABLE ${table} AS ${cleanSql}`,
				signal,
				true,
			);
		} catch (err) {
			logger.debug(
				"Stream materialisation failed; falling back to direct paging",
				err,
			);
			return null;
		}

		// Best-effort cleanup of the previous stream table.
		const previous = this.lastTable;
		this.lastTable = table;
		if (previous && previous !== table) {
			this.execute(
				"duckdb",
				`DROP TABLE IF EXISTS ${previous}`,
				undefined,
				true,
			).catch(() => {
				/* non-critical */
			});
		}

		let rowCount = -1;
		try {
			const countResult = await this.execute(
				"duckdb",
				`SELECT COUNT(*) AS cnt FROM ${table}`,
				signal,
				true,
			);
			rowCount = Number(countResult.rows[0]?.cnt ?? -1);
		} catch {
			// Count is an enhancement; paging still works without it.
		}

		this.materialization = { sql, table, rowCount };
		return this.materialization;
	}
}
