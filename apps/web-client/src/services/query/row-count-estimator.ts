/**
 * RowCountEstimator — how many rows a query would return, cheaply.
 *
 * Extracted from StreamingQueryService (WS-A / A6 in docs/REFACTOR-PLAN.md).
 * Ordering matters: this runs *after* the planner extraction because the fast
 * path reads a live materialization's exact count through the planner's
 * read-seam.
 *
 * Three tiers, in order:
 *   1. A live temp-table materialization of this exact SQL — exact, free.
 *   2. The TTL cache, so re-asking within two minutes costs nothing.
 *   3. A per-connector count strategy (below).
 *
 * The per-connector branches still narrow with `instanceof` here. A9/A10 move
 * them onto the connectors behind a RowCountStrategy interface; keeping them
 * in place for this step keeps the extraction reviewable on its own.
 */

import {
	type BaseConnector,
	BigQueryConnector,
	DuckDBConnector,
	SnowflakeConnector,
} from "@ide/connectors";
import { createLogger } from "../../utils/logger";

const logger = createLogger("RowCountEstimator");

/** Snowflake's COUNT(*) wrapper gives up after this long. */
const SNOWFLAKE_COUNT_TIMEOUT_MS = 5_000;

export interface RowCount {
	count: number;
	isEstimated: boolean;
}

interface CacheEntry extends RowCount {
	timestamp: number;
}

/** Reads the exact count of a live materialization, or null when there is none. */
export type ExactRowCountPort = (sql: string) => number | null;

export class RowCountEstimator {
	private readonly cache = new Map<string, CacheEntry>();

	constructor(
		private readonly exactRowCountFor: ExactRowCountPort,
		private readonly getActiveConnector: () => BaseConnector,
		/** 2 minutes, kept short to bound memory. */
		private readonly ttlMs = 2 * 60 * 1000,
	) {}

	/** Drop every cached count. */
	clear(): void {
		this.cache.clear();
	}

	async getRowCount(sql: string, signal?: AbortSignal): Promise<RowCount> {
		// A live stream materialisation knows the exact count — no estimate,
		// no fabricated footer numbers.
		const exact = this.exactRowCountFor(sql);
		if (exact !== null) {
			return { count: exact, isEstimated: false };
		}

		const cacheKey = hashQuery(sql);
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.ttlMs) {
			logger.debug("Using cached count", {
				count: cached.count,
				isEstimated: cached.isEstimated,
			});
			return { count: cached.count, isEstimated: cached.isEstimated };
		}

		const connector = this.getActiveConnector();

		try {
			if (connector instanceof BigQueryConnector) {
				return await this.countBigQuery(connector, sql, cacheKey);
			}
			if (connector instanceof DuckDBConnector) {
				return await this.countDuckDB(connector, sql, cacheKey);
			}
			if (connector instanceof SnowflakeConnector) {
				return await this.countSnowflake(connector, sql, cacheKey, signal);
			}

			// Fallback for other connectors: return -1 (unknown, treated as estimated)
			logger.warn("Unknown connector type, returning -1");
			return { count: -1, isEstimated: true };
		} catch (error) {
			// Re-throw abort errors
			if (error instanceof Error && error.name === "AbortError") {
				throw error;
			}

			logger.warn("Could not get row count", error);
			return { count: -1, isEstimated: true }; // Unknown count - treated as estimated
		}
	}

	/** BigQuery: LIMIT 0 surfaces the true total in response metadata, for free. */
	private async countBigQuery(
		connector: BigQueryConnector,
		sql: string,
		cacheKey: string,
	): Promise<RowCount> {
		logger.debug(
			"BigQuery: Running query with LIMIT 0 to get metadata totalRows",
		);
		let count = -1;
		const metadataSql = `${sql} LIMIT 0`;

		for await (const chunk of connector.query(metadataSql, { maxRows: 0 })) {
			if (chunk.totalRows !== undefined) {
				count = chunk.totalRows;
				logger.debug("BigQuery totalRows from metadata (exact)", { count });
				break;
			}
		}

		// Cache the result (BigQuery metadata is exact, not estimated)
		if (count > 0) {
			this.store(cacheKey, count, false);
		}
		return { count, isEstimated: false };
	}

	/** DuckDB: EXPLAIN is subsecond where COUNT(*) can take 30s+. */
	private async countDuckDB(
		connector: DuckDBConnector,
		sql: string,
		cacheKey: string,
	): Promise<RowCount> {
		logger.debug("DuckDB: Using EXPLAIN for row estimation");
		const count = await connector.getEstimatedRowCount(sql);
		logger.debug("DuckDB EXPLAIN estimate (estimated)", { count });

		// Cache the result (DuckDB EXPLAIN is estimated, not exact)
		if (count > 0) {
			this.store(cacheKey, count, true);
		}
		return { count, isEstimated: true };
	}

	/**
	 * Snowflake: wrap in SELECT COUNT(*) FROM (sql) with a 5-second timeout.
	 * Without this, every Snowflake query falls through to the `count = -1`
	 * path and useQueryExecution reads that as "huge dataset, force streaming
	 * mode" — even for a 3-row SELECT. On timeout we still return -1, but at
	 * that point streaming-mode for a slow-counting query is the correct UX.
	 */
	private async countSnowflake(
		connector: SnowflakeConnector,
		sql: string,
		cacheKey: string,
		signal?: AbortSignal,
	): Promise<RowCount> {
		logger.debug("Snowflake: counting via SELECT COUNT(*) FROM (sql)");
		let count = -1;
		// Strip trailing semicolons + whitespace before wrapping — otherwise
		// `SELECT COUNT(*) AS c FROM (SELECT * FROM t;)` is a Snowflake parse
		// error, count fails, and useQueryExecution falls into the misleading
		// "Very large dataset" toast for a query that's actually small.
		const innerSql = sql.replace(/[\s;]+$/, "");
		const countSql = `SELECT COUNT(*) AS c FROM (${innerSql})`;
		const countCtl = new AbortController();
		const timeout = setTimeout(
			() => countCtl.abort(),
			SNOWFLAKE_COUNT_TIMEOUT_MS,
		);
		const combinedSignal = combineSignals(countCtl.signal, signal);

		try {
			for await (const chunk of connector.query(countSql, {
				signal: combinedSignal,
			})) {
				const row = chunk.rows?.[0];
				if (row !== undefined) {
					const v =
						typeof row === "object" && row !== null
							? (Object.values(row)[0] as unknown)
							: row;
					const n =
						typeof v === "number"
							? v
							: typeof v === "string"
								? Number(v)
								: -1;
					if (Number.isFinite(n) && n >= 0) {
						count = n;
						break;
					}
				}
			}
		} catch (err) {
			if (countCtl.signal.aborted) {
				logger.debug("Snowflake count timed out — returning -1");
			} else {
				logger.debug("Snowflake count failed; returning -1", err);
			}
		} finally {
			clearTimeout(timeout);
		}

		if (count >= 0) {
			this.store(cacheKey, count, false);
			return { count, isEstimated: false };
		}
		return { count: -1, isEstimated: true };
	}

	private store(cacheKey: string, count: number, isEstimated: boolean): void {
		this.cache.set(cacheKey, { count, isEstimated, timestamp: Date.now() });
	}
}

/**
 * Combine the internal timeout signal with the caller's signal so a Stop Query
 * during the COUNT terminates the connector-side query (a real billing leak
 * otherwise). Falls back to abort-on-listener for older browsers without
 * AbortSignal.any.
 */
function combineSignals(
	internal: AbortSignal,
	external?: AbortSignal,
): AbortSignal {
	if (!external) return internal;
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any([internal, external]);
	}
	const ctl = new AbortController();
	const onAbort = () => ctl.abort();
	internal.addEventListener("abort", onAbort);
	external.addEventListener("abort", onAbort);
	return ctl.signal;
}

/** Stable cache key for a query string. */
function hashQuery(sql: string): string {
	let hash = 0;
	for (let i = 0; i < sql.length; i++) {
		const char = sql.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash.toString(36);
}
