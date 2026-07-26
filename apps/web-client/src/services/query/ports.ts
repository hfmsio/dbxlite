/**
 * Ports shared by the query collaborators (WS-A / A4 in docs/REFACTOR-PLAN.md).
 *
 * These types are the seam that lets PaginationPlanner (A5) and
 * RowCountEstimator (A6) run SQL without holding a reference to the service
 * itself. The service supplies bound implementations at construction; the
 * collaborators only ever see the narrow function type.
 */

import type { ConnectorType } from "../../types/data-source";

/**
 * Run SQL against a named connector and collect the whole result.
 *
 * Mirrors `StreamingQueryService.executeQueryOnConnector` exactly, including
 * `silent` — the planner relies on it to keep expected failures (a
 * CREATE TEMP TABLE that cannot wrap the statement, a DROP of a table that is
 * already gone) out of the error log.
 */
export type ExecuteOnConnector<TResult> = (
	connectorType: ConnectorType,
	sql: string,
	signal?: AbortSignal,
	silent?: boolean,
) => Promise<TResult>;
