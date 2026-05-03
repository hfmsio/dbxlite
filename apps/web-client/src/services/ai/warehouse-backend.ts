/**
 * WarehouseChatBackend (backlog AI-2)
 *
 * Generic ChatBackend that adapts any WarehouseAICapabilities. Vendor-agnostic
 * — the same class serves Snowflake Cortex, BigQuery ML (when planned), and
 * Databricks AI (when planned). The vendor-specific bits live behind the
 * capability interface.
 *
 * IMPORTANT (F1 architectural rule): this file does NOT import from
 * `services/streaming-query-service`. The capability owns its execution
 * boundary; the bridge consumes only the interface. CI grep guard enforces.
 */

import {
	type AIMessage,
	type AIStreamChunk,
	type ChatBackend,
	ChatBackendError,
	type ChatBackendErrorCode,
} from "./types";
import type { WarehouseAICapabilities } from "./warehouse-capabilities";

/** Hard prompt cap. Prevents runaway warehouse credits. */
export const MAX_PROMPT_TOKENS_WAREHOUSE = 8_000;
/** Hard timeout on warehouse AI calls. */
export const WAREHOUSE_TIMEOUT_MS = 30_000;

export class WarehouseChatBackend implements ChatBackend {
	readonly kind = "warehouse" as const;
	readonly id: string;
	readonly label: string;
	readonly models;

	constructor(private readonly capabilities: WarehouseAICapabilities) {
		this.id = capabilities.id;
		this.label = capabilities.label;
		this.models = capabilities.models;
	}

	isAvailable(): Promise<boolean> {
		return this.capabilities.isAvailable();
	}

	async *streamChat(
		messages: AIMessage[],
		opts: { model: string; signal?: AbortSignal },
	): AsyncGenerator<AIStreamChunk> {
		// Pre-handshake validations — synchronous throws; zero chunks yielded.
		const totalTokens = approximateTokens(
			messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
		);
		if (totalTokens > MAX_PROMPT_TOKENS_WAREHOUSE) {
			throw new ChatBackendError(
				"PROMPT_TOO_LARGE",
				`Prompt exceeds ${MAX_PROMPT_TOKENS_WAREHOUSE} tokens. Try a shorter prompt or split into multiple turns.`,
			);
		}
		if (!this.models.some((m) => m.id === opts.model)) {
			throw new ChatBackendError(
				"INVALID_MODEL",
				`Unknown model: ${opts.model}`,
			);
		}

		const { sql, bindings } = this.capabilities.composeCompletionSQL(
			messages,
			opts.model,
		);

		// Handshake: from here forward, all failures are in-stream.
		try {
			const rows = await Promise.race([
				this.capabilities.execute(sql, bindings, opts.signal),
				timeoutAfter<unknown[]>(WAREHOUSE_TIMEOUT_MS),
			]);

			if (opts.signal?.aborted) {
				yield {
					type: "error",
					error: "Cancelled by user",
				};
				yield { type: "done" };
				return;
			}

			if (!Array.isArray(rows) || rows.length === 0) {
				yield {
					type: "error",
					error: `${this.label} returned no rows`,
				};
				yield { type: "done" };
				return;
			}

			const text = this.capabilities.parseCompletionRow(rows[0]);
			yield { type: "text", text };
			yield { type: "done" };
		} catch (err) {
			const classified = classifyWarehouseError(err);
			yield {
				type: "error",
				error: `[${classified.code}] ${classified.message}`,
			};
			yield { type: "done" };
		}
	}

	async estimateCost(
		messages: AIMessage[],
		opts: { model: string },
	): Promise<{ tokens?: number; credits?: number; usd?: number } | null> {
		if (!this.capabilities.estimateCost) return null;
		const promptTokens = approximateTokens(
			messages.map((m) => m.content).join("\n"),
		);
		const cost = this.capabilities.estimateCost(promptTokens, opts.model);
		return { tokens: promptTokens, ...cost };
	}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Crude token approximation — 4 chars per token. Real tokenizer-per-model is
 * out of scope; this is a guard against pathological pastes, not a precise
 * cost estimate.
 */
function approximateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

class TimeoutError extends Error {
	constructor() {
		super(`Timeout after ${WAREHOUSE_TIMEOUT_MS}ms`);
		this.name = "TimeoutError";
	}
}

function timeoutAfter<T>(ms: number): Promise<T> {
	return new Promise<T>((_, reject) => {
		setTimeout(() => reject(new TimeoutError()), ms);
	});
}

interface ClassifiedError {
	code: ChatBackendErrorCode;
	message: string;
}

/**
 * Translate any thrown error into a typed ChatBackendErrorCode + message.
 * Vendor-specific patterns (Snowflake permission text, "warehouse suspended"
 * SQL state, Cortex 4xx quota) live here so the bridge stays vendor-neutral.
 */
function classifyWarehouseError(err: unknown): ClassifiedError {
	if (err instanceof TimeoutError) {
		return {
			code: "WAREHOUSE_TIMEOUT",
			message: `Cortex didn't respond in ${
				WAREHOUSE_TIMEOUT_MS / 1000
			} seconds. Try a shorter prompt, check warehouse status, or switch to a faster model.`,
		};
	}
	if (err instanceof ChatBackendError) {
		// Already classified — pass through.
		return { code: err.code, message: err.message };
	}
	const msg = err instanceof Error ? err.message : String(err);
	const lower = msg.toLowerCase();

	if (/permission|privilege|access|insufficient|grant/i.test(lower)) {
		return {
			code: "PERMISSION_DENIED",
			message: msg.includes("CORTEX")
				? `${msg}\nGrant the role with: GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE <your-role>;`
				: msg,
		};
	}
	if (/warehouse.*suspend|suspended.*warehouse/i.test(lower)) {
		return {
			code: "WAREHOUSE_SUSPENDED",
			message: "Warehouse was suspended during the call; resume and retry.",
		};
	}
	if (/rate limit|quota|too many requests|429/i.test(lower)) {
		return { code: "RATE_LIMITED", message: msg };
	}
	if (lower.includes("aborted")) {
		return { code: "ABORTED", message: msg };
	}
	if (
		lower.includes("parse") ||
		lower.includes("unexpected response") ||
		lower.includes("invalid response")
	) {
		return { code: "PARSE_FAILED", message: msg };
	}
	return { code: "EXECUTE_FAILED", message: msg };
}
