/**
 * AI Provider Types
 * Core interfaces for the multi-provider AI chat system.
 */

export type AIProviderType = "openai" | "anthropic" | "gemini" | "groq";

export interface AIModelInfo {
	id: string;
	name: string;
	contextWindow: number;
	/** Whether this model is available on the provider's free tier */
	isFree?: boolean;
}

export interface AIProviderConfig {
	apiKey: string;
	model: string;
	/** Max tokens for the response */
	maxTokens?: number;
}

export interface AIMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

export interface AIStreamChunk {
	type: "text" | "error" | "done";
	text?: string;
	error?: string;
}

export interface SQLBlock {
	sql: string;
	index: number;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	/** Extracted SQL code blocks from assistant messages */
	sqlBlocks?: SQLBlock[];
	/** Whether this message is still being streamed */
	isStreaming?: boolean;
}

export interface AIProvider {
	readonly type: AIProviderType;
	readonly displayName: string;
	readonly models: AIModelInfo[];
	streamChat(
		messages: AIMessage[],
		config: AIProviderConfig,
		signal?: AbortSignal,
	): AsyncGenerator<AIStreamChunk>;
}

// =============================================================================
// ChatBackend abstraction (backlog AI-2)
// =============================================================================
//
// `ChatBackend` is the seam consumed by the chat panel + store. It unifies
// BYO HTTP providers (OpenAI / Anthropic / Gemini / Groq) and warehouse-native
// AI backends (Snowflake Cortex first; BigQuery ML / Databricks AI later)
// behind a single contract.
//
// Two implementations:
//   - ByoChatBackend         — wraps an existing AIProvider with apiKey from
//                              aiCredentialStore.
//   - WarehouseChatBackend   — bridges any WarehouseAICapabilities instance.
//                              Vendor-neutral; same class works across Cortex,
//                              BQ ML, Databricks AI.
//
// Canonical streaming error model (enforced by the contract test suite):
//   - Pre-handshake errors    throw synchronously; zero chunks yielded.
//                             Codes: PROMPT_TOO_LARGE, INVALID_MODEL,
//                             MISSING_API_KEY, BACKEND_NOT_AVAILABLE.
//   - In-stream failures      yield {type:"error", code, message} then
//                             {type:"done"}; never throw post-handshake.
//                             Codes: WAREHOUSE_TIMEOUT, WAREHOUSE_SUSPENDED,
//                             EXECUTE_FAILED, PARSE_FAILED, PERMISSION_DENIED,
//                             RATE_LIMITED, ABORTED.
//   - Boundary                "after capabilities.execute() (warehouse)" or
//                             "after fetch fires (BYO)". Anything earlier is
//                             pre-handshake.

export type ChatBackendErrorCode =
	// Pre-handshake (throws)
	| "PROMPT_TOO_LARGE"
	| "INVALID_MODEL"
	| "MISSING_API_KEY"
	| "BACKEND_NOT_AVAILABLE"
	// In-stream (yielded)
	| "WAREHOUSE_TIMEOUT"
	| "WAREHOUSE_SUSPENDED"
	| "EXECUTE_FAILED"
	| "PARSE_FAILED"
	| "PERMISSION_DENIED"
	| "RATE_LIMITED"
	| "ABORTED";

export class ChatBackendError extends Error {
	readonly code: ChatBackendErrorCode;
	constructor(code: ChatBackendErrorCode, message: string) {
		super(message);
		this.code = code;
		this.name = "ChatBackendError";
	}
}

export interface ChatBackend {
	/** Stable id (e.g. "openai", "anthropic", "snowflake-cortex"). */
	readonly id: string;
	readonly kind: "byo" | "warehouse";
	readonly label: string;
	readonly models: AIModelInfo[];

	/**
	 * Async availability gate. BYO: a saved key exists. Warehouse: connector
	 * active + connected + (where applicable) capability enabled on the
	 * account.
	 */
	isAvailable(): Promise<boolean>;

	streamChat(
		messages: AIMessage[],
		opts: { model: string; signal?: AbortSignal },
	): AsyncGenerator<AIStreamChunk>;

	/** Optional cost preview before send. */
	estimateCost?(
		messages: AIMessage[],
		opts: { model: string },
	): Promise<{ tokens?: number; credits?: number; usd?: number } | null>;
}

export interface BackendRegistry {
	/** All registered backends, regardless of availability. */
	list(): ChatBackend[];
	/** Filter by isAvailable(). */
	listAvailable(): Promise<ChatBackend[]>;
	get(id: string): ChatBackend | undefined;
	register(backend: ChatBackend): void;
	unregister(id: string): void;
}
