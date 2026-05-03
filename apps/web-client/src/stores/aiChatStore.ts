/**
 * AI Chat Store (Zustand)
 * Manages AI chat state with localStorage persistence.
 * API keys stored separately via CredentialStore.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	backendRegistry,
	buildSystemPrompt,
	type ChatMessage,
	getDefaultModel,
	getDefaultProvider,
	type SQLBlock,
} from "../services/ai";
import { queryService } from "../services/streaming-query-service";

const MAX_MESSAGES = 100;

/** Extract SQL code blocks from markdown text */
function extractSQLBlocks(content: string): SQLBlock[] {
	const blocks: SQLBlock[] = [];
	const regex = /```sql\s*\n([\s\S]*?)```/gi;
	let match: RegExpExecArray | null;
	let index = 0;
	while ((match = regex.exec(content)) !== null) {
		blocks.push({ sql: match[1].trim(), index: index++ });
	}
	return blocks;
}

interface AIChatState {
	/**
	 * Backend ID (was AIProviderType in v1). String now because warehouse
	 * backends use ids like "snowflake-cortex" that don't match AIProviderType.
	 * BYO backend ids still match AIProviderType values.
	 */
	activeProvider: string;
	selectedModels: Record<string, string>;
	messages: ChatMessage[];
	isStreaming: boolean;
	error: string | null;
}

interface AIChatActions {
	sendMessage: (content: string, editorContent?: string) => Promise<void>;
	stopStreaming: () => void;
	clearMessages: () => void;
	setActiveProvider: (provider: string) => void;
	setSelectedModel: (provider: string, model: string) => void;
	setError: (error: string | null) => void;
}

type AIChatStore = AIChatState & AIChatActions;

let abortController: AbortController | null = null;
let streamGeneration = 0;

export const useAIChatStore = create<AIChatStore>()(
	persist(
		(set, get) => ({
			activeProvider: getDefaultProvider(),
			selectedModels: {
				openai: getDefaultModel("openai"),
				anthropic: getDefaultModel("anthropic"),
				gemini: getDefaultModel("gemini"),
				groq: getDefaultModel("groq"),
			},
			messages: [],
			isStreaming: false,
			error: null,

			sendMessage: async (content: string, editorContent?: string) => {
				const state = get();
				if (state.isStreaming) return;

				// Abort any lingering previous stream
				if (abortController) {
					abortController.abort();
					abortController = null;
				}

				// Capture generation to detect if another stream starts during our async gaps
				const currentGeneration = ++streamGeneration;

				const backendId = state.activeProvider;

				// Resolve backend from registry. BYO ids match AIProviderType.
				// Warehouse ids are vendor-shaped (e.g. "snowflake-cortex").
				const backend = backendRegistry.get(backendId);
				if (!backend) {
					if (currentGeneration !== streamGeneration) return;
					set({ error: `Backend "${backendId}" is not registered.` });
					return;
				}
				// Pick a model: stored value if valid for this backend, otherwise the
				// backend's first model (sane default for warehouse backends a user
				// hasn't picked a model for yet).
				const stored = state.selectedModels[backendId];
				const model =
					stored && backend.models.some((m) => m.id === stored)
						? stored
						: backend.models[0]?.id;
				if (!model) {
					if (currentGeneration !== streamGeneration) return;
					set({ error: `${backend.label} has no models configured.` });
					return;
				}
				const isAvailable = await backend.isAvailable();
				if (!isAvailable) {
					if (currentGeneration !== streamGeneration) return;
					set({
						error:
							backend.kind === "byo"
								? "No API key configured. Paste a key here or open Settings > AI."
								: `${backend.label} is not available — check connector status.`,
					});
					return;
				}

				// Re-check after async gap
				if (currentGeneration !== streamGeneration) return;

				// Add user message
				const userMessage: ChatMessage = {
					id: crypto.randomUUID(),
					role: "user",
					content,
					timestamp: Date.now(),
				};

				// Add placeholder assistant message for streaming
				const assistantMessage: ChatMessage = {
					id: crypto.randomUUID(),
					role: "assistant",
					content: "",
					timestamp: Date.now(),
					isStreaming: true,
				};

				set((s) => ({
					messages: [...s.messages, userMessage, assistantMessage].slice(
						-MAX_MESSAGES,
					),
					isStreaming: true,
					error: null,
				}));

				// Build messages array for API. The system prompt is dialect-aware:
				// for warehouse backends, anchor to that warehouse; for BYO backends,
				// anchor to whatever connector the user is querying with.
				const dialectFromBackend =
					backendId === "snowflake-cortex"
						? "snowflake"
						: backendId === "bq-ml"
							? "bigquery"
							: queryService.getActiveConnectorType?.();
				const dialect: "duckdb" | "bigquery" | "snowflake" =
					dialectFromBackend === "snowflake" ||
					dialectFromBackend === "bigquery"
						? dialectFromBackend
						: "duckdb";
				const systemPrompt = buildSystemPrompt(editorContent, {
					connectorType: dialect,
					backendLabel: backend.label,
					modelId: model,
				});
				const apiMessages = [
					{ role: "system" as const, content: systemPrompt },
					...get()
						.messages.filter((m) => !m.isStreaming)
						.map((m) => ({
							role: m.role as "user" | "assistant",
							content: m.content,
						})),
				];

				abortController = new AbortController();

				try {
					let fullContent = "";
					for await (const chunk of backend.streamChat(apiMessages, {
						model,
						signal: abortController.signal,
					})) {
						if (chunk.type === "text" && chunk.text) {
							fullContent += chunk.text;
							// Update the streaming message in place
							set((s) => ({
								messages: s.messages.map((m) =>
									m.id === assistantMessage.id
										? {
												...m,
												content: fullContent,
												sqlBlocks: extractSQLBlocks(fullContent),
											}
										: m,
								),
							}));
						} else if (chunk.type === "error") {
							set((s) => ({
								isStreaming: false,
								error: chunk.error || "Stream error",
								messages: s.messages.map((m) =>
									m.id === assistantMessage.id
										? {
												...m,
												isStreaming: false,
												content: fullContent || "Error occurred.",
											}
										: m,
								),
							}));
							return;
						}
					}

					// Finalize the message
					set((s) => ({
						isStreaming: false,
						messages: s.messages.map((m) =>
							m.id === assistantMessage.id
								? {
										...m,
										isStreaming: false,
										sqlBlocks: extractSQLBlocks(fullContent),
									}
								: m,
						),
					}));
				} catch (err) {
					if ((err as Error).name === "AbortError") {
						// User stopped streaming
						set((s) => ({
							isStreaming: false,
							messages: s.messages.map((m) =>
								m.id === assistantMessage.id ? { ...m, isStreaming: false } : m,
							),
						}));
					} else {
						set((s) => ({
							isStreaming: false,
							error: (err as Error).message || "Unknown error",
							messages: s.messages.map((m) =>
								m.id === assistantMessage.id
									? {
											...m,
											isStreaming: false,
											content: m.content || "Error occurred.",
										}
									: m,
							),
						}));
					}
				} finally {
					abortController = null;
				}
			},

			stopStreaming: () => {
				abortController?.abort();
				abortController = null;
			},

			clearMessages: () => set({ messages: [], error: null }),

			setActiveProvider: (provider) => set({ activeProvider: provider }),

			setSelectedModel: (provider, model) =>
				set((s) => ({
					selectedModels: { ...s.selectedModels, [provider]: model },
				})),

			setError: (error) => set({ error }),
		}),
		{
			name: "dbxlite-ai-chat",
			version: 2,
			/**
			 * v1 → v2 migration (backlog AI-5):
			 *   activeProvider was typed AIProviderType ("gemini" | "groq" |
			 *   "openai" | "anthropic"); now it's a backend id (string) so
			 *   warehouse backends like "snowflake-cortex" can be selected.
			 *   The shape change is structurally compatible (string is a
			 *   superset), but the version bump locks the migration so
			 *   future schema changes are explicit.
			 */
			migrate: (persistedState: unknown, fromVersion: number) => {
				const state = persistedState as Partial<AIChatState> | undefined;
				if (!state) return persistedState as AIChatState;
				if (fromVersion < 2) {
					return {
						...state,
						activeProvider: state.activeProvider ?? getDefaultProvider(),
						selectedModels: state.selectedModels ?? {},
					} as AIChatState;
				}
				return persistedState as AIChatState;
			},
			partialize: (state) => ({
				activeProvider: state.activeProvider,
				selectedModels: state.selectedModels,
				messages: state.messages.filter((m) => !m.isStreaming),
			}),
		},
	),
);

// Selector hooks
export const useAIMessages = () => useAIChatStore((s) => s.messages);
export const useAIStreaming = () => useAIChatStore((s) => s.isStreaming);
export const useAIError = () => useAIChatStore((s) => s.error);
export const useAIActiveProvider = () =>
	useAIChatStore((s) => s.activeProvider);
