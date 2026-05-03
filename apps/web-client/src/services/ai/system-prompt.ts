/**
 * System Prompt Builder
 *
 * Constructs a dialect-aware system prompt with optional editor context.
 * Picks DuckDB, BigQuery, or Snowflake guidelines based on the active
 * connector — so the assistant says "I can help with Snowflake" when the
 * user is connected to Snowflake, not generic DuckDB copy.
 */

const MAX_EDITOR_LINES = 200;

export type SystemPromptConnectorType = "duckdb" | "bigquery" | "snowflake";

interface DialectProfile {
	displayName: string;
	capabilities: string[];
	guidelines: string[];
}

const PROFILES: Record<SystemPromptConnectorType, DialectProfile> = {
	duckdb: {
		displayName: "DuckDB",
		capabilities: [
			"Write, explain, debug, and optimize SQL queries for DuckDB",
			"DuckDB supports modern SQL features: CTEs, window functions, QUALIFY, PIVOT/UNPIVOT, LIST/STRUCT/MAP types, lambda functions, and more",
			"DuckDB can query Parquet, CSV, and JSON files directly (e.g., SELECT * FROM 'data.parquet')",
			"DuckDB has extensions for httpfs (remote files), spatial, ICU (dates), and more",
		],
		guidelines: [
			"Use DuckDB-specific syntax when relevant (not PostgreSQL or MySQL)",
		],
	},
	bigquery: {
		displayName: "BigQuery",
		capabilities: [
			"Write, explain, debug, and optimize SQL queries for Google BigQuery",
			"BigQuery uses Standard SQL with three-part identifiers `project.dataset.table` and backtick quoting",
			"BigQuery supports STRUCT/ARRAY types, UNNEST, ML.GENERATE_TEXT, and external tables",
			"Cost matters — recommend partitioned/clustered scans and AVOID SELECT * on large tables",
		],
		guidelines: [
			"Use BigQuery Standard SQL syntax (not Legacy SQL)",
			"Quote three-part identifiers with backticks",
			"Mention bytes-scanned implications when relevant",
		],
	},
	snowflake: {
		displayName: "Snowflake",
		capabilities: [
			"Write, explain, debug, and optimize SQL queries for Snowflake",
			"Snowflake supports modern SQL features: CTEs, window functions, QUALIFY, MATCH_RECOGNIZE, semi-structured types (VARIANT/OBJECT/ARRAY), and Time Travel (AT/BEFORE)",
			"Three-part identifiers: DATABASE.SCHEMA.TABLE; warehouse must be selected to run queries",
			"Cortex AI functions are SQL-callable: SNOWFLAKE.CORTEX.COMPLETE / SUMMARIZE / TRANSLATE / EMBED_TEXT_768",
		],
		guidelines: [
			"Use Snowflake-specific syntax when relevant (not PostgreSQL or BigQuery)",
			"Prefer QUALIFY for window-filter clauses; use COPY INTO for stage-based ingest",
			"For semi-structured access use colon notation (`col:field::type`) and FLATTEN for arrays",
		],
	},
};

export interface SystemPromptOptions {
	connectorType?: SystemPromptConnectorType;
	/** Backend display name (e.g. "Snowflake Cortex", "OpenAI"). Anchors model-identity questions. */
	backendLabel?: string;
	/** Active model id (e.g. "llama3.1-70b"). */
	modelId?: string;
}

export function buildSystemPrompt(
	editorContent?: string,
	connectorTypeOrOptions: SystemPromptConnectorType | SystemPromptOptions = "duckdb",
): string {
	// Backward-compatible: accept either a bare connector-type string OR a
	// full options object. Existing callers passing just a string still work.
	const opts: SystemPromptOptions =
		typeof connectorTypeOrOptions === "string"
			? { connectorType: connectorTypeOrOptions }
			: connectorTypeOrOptions;
	const connectorType = opts.connectorType ?? "duckdb";
	const profile = PROFILES[connectorType] ?? PROFILES.duckdb;

	const capabilitiesBlock = profile.capabilities
		.map((c) => `- ${c}`)
		.join("\n");
	const guidelinesBlock = [
		"- Provide concise, accurate answers",
		...profile.guidelines.map((g) => `- ${g}`),
		"- When writing SQL, always use code blocks with ```sql",
		"- Explain your reasoning briefly",
		"- If asked to fix an error, identify the root cause and provide the corrected query",
		"- When optimizing, explain what changed and why",
	].join("\n");

	let prompt = `You are a SQL assistant for ${profile.displayName}, embedded in a privacy-first SQL workbench called dbxlite.

Your capabilities:
${capabilitiesBlock}

Guidelines:
${guidelinesBlock}`;

	// Model-identity anchor: if asked "what model are you", the assistant
	// has the canonical answer instead of guessing.
	if (opts.backendLabel || opts.modelId) {
		const parts: string[] = [];
		if (opts.modelId) parts.push(`the **${opts.modelId}** model`);
		if (opts.backendLabel) parts.push(`served via **${opts.backendLabel}**`);
		prompt += `\n\nIdentity: You are ${parts.join(", ")}. If asked which model you are, answer with this identity.`;
	}

	if (editorContent) {
		const lines = editorContent.split("\n");
		const truncated = lines.length > MAX_EDITOR_LINES;
		const content = truncated
			? lines.slice(0, MAX_EDITOR_LINES).join("\n") + "\n-- ... (truncated)"
			: editorContent;

		prompt += `\n\nThe user's current SQL editor contains:\n\`\`\`sql\n${content}\n\`\`\``;
	}

	return prompt;
}
