/**
 * WarehouseAICapabilities (backlog AI-2)
 *
 * Standalone interface that warehouse-side adapters implement to participate
 * as a ChatBackend. NOT slotted onto CatalogProvider — AI protocol concerns
 * (prompt composition, response parsing) are categorically distinct from
 * catalog/metadata/session concerns.
 *
 * The capability owns its execution boundary (`execute()`). The bridge in
 * `services/ai/warehouse-backend.ts` consumes the interface; it never imports
 * `services/streaming-query-service`. This is the architectural boundary that
 * the F1 critic finding required.
 *
 * Implementations:
 *   - apps/web-client/src/providers/catalog/snowflake-ai-capabilities.ts (AI-3)
 *   - apps/web-client/src/services/ai/__sketches__/bq-ml-capabilities.sketch.ts
 *     (compile-time validation; not registered, not contract-tested)
 */

import type { AIMessage, AIModelInfo } from "./types";

export interface WarehouseAICapabilities {
	/** Stable id used by the backend registry (e.g. "snowflake-cortex"). */
	readonly id: string;
	readonly label: string;
	readonly models: AIModelInfo[];
	readonly supportsTextGen: boolean;
	readonly supportsEmbeddings: boolean;

	/**
	 * Connector active + connected + warehouse-side AI feature enabled.
	 * The bridge surfaces this via ChatBackend.isAvailable().
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Compose SQL + bindings for a single completion call. Receives the full
	 * structured message history; each capability decides how to encode it
	 * (Cortex prefers the chat-array form `PARSE_JSON('[{role,content}]')`,
	 * BQ ML uses a single-prompt scalar, Databricks uses ai_query JSON).
	 */
	composeCompletionSQL(
		messages: AIMessage[],
		model: string,
	): { sql: string; bindings: unknown[] };

	composeEmbeddingSQL?(
		text: string,
		model: string,
	): { sql: string; bindings: unknown[] };

	/**
	 * Execute SQL through the connector this capability owns.
	 * THE BRIDGE DOES NOT CALL queryService DIRECTLY — execution lives here so
	 * `services/ai/**` never reaches past the interface boundary.
	 */
	execute(
		sql: string,
		bindings: unknown[],
		signal?: AbortSignal,
	): Promise<unknown[]>;

	/** Extract the response text from a result row. */
	parseCompletionRow(row: unknown): string;

	/** Optional per-call cost estimator (credits / USD). */
	estimateCost?(
		promptTokens: number,
		model: string,
	): { credits?: number; usd?: number };
}
