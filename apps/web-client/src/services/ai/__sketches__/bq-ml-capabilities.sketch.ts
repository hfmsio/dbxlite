/**
 * BigQuery ML capabilities — TYPE-ONLY SKETCH (backlog AI-Phase-C)
 *
 * Purpose: validate at compile time that `WarehouseAICapabilities` is not
 * Cortex-specific. If the sketch fails to compile, the interface needs
 * adjustment before we write Cortex SQL against it (Phase A acceptance gate).
 *
 * NOT registered with the runtime registry. NOT included in the
 * ChatBackend contract test suite. `execute()` and `isAvailable()` throw
 * because they would require the BigQuery connector to actually run a
 * `CREATE MODEL` setup and `ML.GENERATE_TEXT` query — out of scope for AI-2.
 *
 * When BigQuery ML is promoted from Idea to Active in BACKLOG, this sketch
 * graduates into a real implementation under `providers/catalog/bq-ml-capabilities.ts`.
 */

import type { WarehouseAICapabilities } from "../warehouse-capabilities";

export const bqMlCapabilitiesSketch: WarehouseAICapabilities = {
	id: "bq-ml",
	label: "BigQuery ML",
	models: [
		{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1_000_000 },
		{ id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2_000_000 },
	],
	supportsTextGen: true,
	supportsEmbeddings: true,

	async isAvailable() {
		throw new Error("sketch — not registered at runtime");
	},

	composeCompletionSQL(messages, model) {
		// Real-shape SQL emission. The backtick model reference would resolve
		// against a project + dataset created by a one-time `CREATE MODEL`
		// wizard (deferred to AI-Phase-C). For BQ ML, we flatten the message
		// history into a single prompt scalar — BQ's ML.GENERATE_TEXT takes
		// a single column, not a chat array.
		const prompt = messages
			.map((m) => `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content}`)
			.join("\n\n");
		return {
			sql:
				`SELECT ml_generate_text_result['predictions'][0]['content'] AS response\n` +
				`FROM ML.GENERATE_TEXT(\n` +
				`  MODEL \`<project>.<dataset>.${model}\`,\n` +
				`  (SELECT @prompt AS prompt),\n` +
				`  STRUCT(0.2 AS temperature, 1024 AS max_output_tokens))`,
			bindings: [{ name: "prompt", value: prompt }],
		};
	},

	composeEmbeddingSQL(text, model) {
		return {
			sql:
				`SELECT ml_generate_embedding_result['predictions'][0]['embeddings']['values'] AS embedding\n` +
				`FROM ML.GENERATE_EMBEDDING(\n` +
				`  MODEL \`<project>.<dataset>.${model}\`,\n` +
				`  (SELECT @content AS content))`,
			bindings: [{ name: "content", value: text }],
		};
	},

	async execute() {
		throw new Error("sketch — not registered at runtime");
	},

	parseCompletionRow(row) {
		const r = row as { response?: unknown };
		if (typeof r?.response !== "string") {
			throw new Error("BigQuery ML: unexpected response shape");
		}
		return r.response;
	},

	estimateCost(promptTokens) {
		// Vertex AI Gemini pricing approximation (deferred to real impl).
		return { usd: (promptTokens / 1_000_000) * 0.15 };
	},
};
