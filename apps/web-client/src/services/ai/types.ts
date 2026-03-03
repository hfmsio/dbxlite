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
