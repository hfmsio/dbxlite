/**
 * Snowflake AI capabilities — Cortex composer + executor (backlog AI-3 / AI-4)
 *
 * Sibling export to SnowflakeCatalogProvider — NOT a method on it. Catalog
 * concerns and AI-protocol concerns are separate axes of vendor variation
 * (F2 critic finding from AI_CHAT_PLAN v1).
 *
 * The factory closes over `streamingQueryService`, so the warehouse-backend
 * bridge in `services/ai/` never needs to import it. This is the F1 boundary.
 */

import type { AIMessage } from "../../services/ai/types";
import type { WarehouseAICapabilities } from "../../services/ai/warehouse-capabilities";

/**
 * Subset of streaming-query-service's surface that the capability needs.
 * Passed in by the caller (App-level wiring) so this module doesn't import
 * the heavy streaming-query-service module at load time. Avoids module-load
 * cascades during test collection.
 */
interface QueryServiceLike {
	isSnowflakeConnected(): boolean;
	executeQueryOnConnector(
		connectorType: "snowflake",
		sql: string,
		signal?: AbortSignal,
	): Promise<{ rows: unknown[] }>;
}

// Curated list of currently-supported Cortex models. Keep this small and
// trustworthy — verified against Snowflake's Cortex docs as of 2026-05.
//
// Dropped (deprecated by Snowflake): snowflake-arctic (April 2026),
// claude-3-5-sonnet (superseded by claude-sonnet-4-6), llama3-8b/70b
// (superseded by 3.1+).
//
// Listed in approximate "best to cheapest" order so the default (first
// entry) gives users a strong out-of-the-box experience.
const CORTEX_MODELS = [
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 1_000_000 },
	{ id: "claude-opus-4-7", name: "Claude Opus 4.7", contextWindow: 1_000_000 },
	{ id: "llama3.3-70b", name: "Llama 3.3 70B", contextWindow: 128_000 },
	{ id: "llama3.1-405b", name: "Llama 3.1 405B", contextWindow: 128_000 },
	{ id: "mistral-large2", name: "Mistral Large 2", contextWindow: 128_000 },
	{ id: "deepseek-r1", name: "DeepSeek R1", contextWindow: 32_000 },
	{ id: "mixtral-8x7b", name: "Mixtral 8x7B", contextWindow: 32_000 },
	{ id: "llama3.1-8b", name: "Llama 3.1 8B", contextWindow: 128_000 },
];

/**
 * Approximate credits per 1M input tokens — Snowflake Cortex pricing.
 * Not authoritative; UI surfaces these with an "estimated" note. Update
 * when Snowflake's pricing page changes (no automated sync).
 */
const CREDITS_PER_MTOK: Record<string, number> = {
	"claude-sonnet-4-6": 3.0,
	"claude-opus-4-7": 5.0,
	"llama3.3-70b": 1.21,
	"llama3.1-405b": 3.0,
	"mistral-large2": 1.95,
	"deepseek-r1": 0.55,
	"mixtral-8x7b": 0.22,
	"llama3.1-8b": 0.19,
};

export function createSnowflakeAICapabilities(
	qs: QueryServiceLike,
): WarehouseAICapabilities {
	return {
		id: "snowflake-cortex",
		label: "Snowflake Cortex",
		models: CORTEX_MODELS,
		supportsTextGen: true,
		supportsEmbeddings: true,

		async isAvailable() {
			// Connector active + connected. Cortex enablement check is deferred
			// to first use (account-level setting); permission errors surface
			// via PERMISSION_DENIED in the in-stream error model.
			return qs.isSnowflakeConnected();
		},

		composeCompletionSQL(messages, model) {
			// Use Cortex's native chat-array form. The model receives properly
			// structured turns (no role-prefixed flat string echoing back).
			//
			// Cortex array form:
			//   SELECT SNOWFLAKE.CORTEX.COMPLETE(
			//     '<model>',
			//     PARSE_JSON('[{"role":"user","content":"…"},…]'),
			//     PARSE_JSON('{}')
			//   ) AS response
			//
			// The response in this form is a JSON object with shape
			//   { choices: [{ messages: "…" }], model, created, usage }
			// — parseCompletionRow handles both that and the plain-string
			//   form for forward compatibility.
			//
			// Bindings can't be routed to /api/v2/statements via
			// executeQueryOnConnector yet, so we inline + escape.
			const cortexMessages = mapToCortexMessages(messages);
			const json = JSON.stringify(cortexMessages);
			return {
				sql:
					`SELECT SNOWFLAKE.CORTEX.COMPLETE(` +
					`'${escapeSnowflakeString(model)}', ` +
					`PARSE_JSON('${escapeSnowflakeString(json)}'), ` +
					`PARSE_JSON('{}')` +
					`) AS response`,
				bindings: [],
			};
		},

		composeEmbeddingSQL(text, model) {
			return {
				sql: `SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('${escapeSnowflakeString(model)}', '${escapeSnowflakeString(text)}') AS embedding`,
				bindings: [],
			};
		},

		async execute(sql, _bindings, signal) {
			// IMPORTANT: this is the only place in the AI pipeline that touches
			// queryService. The warehouse-backend bridge consumes only the
			// WarehouseAICapabilities interface (F1 boundary).
			const result = await qs.executeQueryOnConnector(
				"snowflake",
				sql,
				signal,
			);
			return result.rows;
		},

		parseCompletionRow(row) {
			const r = row as { RESPONSE?: unknown; response?: unknown };
			const raw = (r.RESPONSE ?? r.response) as unknown;

			// String form: plain Cortex string completion.
			if (typeof raw === "string") {
				// Some Cortex models echo a leading "ASSISTANT: " when given a
				// role-prefixed prompt. Defensive strip.
				return raw
					.replace(/^\s*(ASSISTANT|USER|SYSTEM)\s*:\s*/i, "")
					.trim();
			}

			// Array form: Cortex returns a JSON object
			//   { choices: [{ messages: "..." }], model, created, usage }
			// VARIANT auto-parsed by SnowflakeConnector.parseSnowflakeValue.
			if (typeof raw === "object" && raw !== null) {
				const obj = raw as { choices?: Array<{ messages?: unknown }> };
				const text = obj.choices?.[0]?.messages;
				if (typeof text === "string") return text.trim();
			}

			throw new Error("Cortex response: unexpected shape");
		},

		estimateCost(promptTokens, model) {
			const creditsPerMtok = CREDITS_PER_MTOK[model] ?? 1.0;
			const credits = (promptTokens / 1_000_000) * creditsPerMtok;
			return { credits };
		},
	};
}

/**
 * Escape a JavaScript string for safe inclusion inside a Snowflake string
 * literal delimited by single quotes. Doubles any embedded single quotes
 * and backslash-escapes backslashes (Snowflake honors C-style escapes
 * inside literals when the connection setting permits).
 */
function escapeSnowflakeString(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/**
 * Map dbxlite's AIMessage[] into Cortex's chat-array shape. Cortex accepts
 * `system` / `user` / `assistant` roles. Unknown roles default to `user`.
 */
function mapToCortexMessages(
	messages: AIMessage[],
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
	return messages.map((m) => ({
		role:
			m.role === "system" || m.role === "assistant" ? m.role : "user",
		content: m.content,
	}));
}
