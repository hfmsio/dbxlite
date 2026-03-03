/**
 * AI Chat Store (Zustand)
 * Manages AI chat state with localStorage persistence.
 * API keys stored separately via CredentialStore.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CredentialStore } from "@ide/storage";
import {
	type AIProviderType,
	type ChatMessage,
	type SQLBlock,
	buildSystemPrompt,
	getCredentialKey,
	getDefaultModel,
	getDefaultProvider,
	getProvider,
} from "../services/ai";

const MAX_MESSAGES = 100;

const credentialStore = new CredentialStore();

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
	activeProvider: AIProviderType;
	selectedModels: Record<AIProviderType, string>;
	messages: ChatMessage[];
	isStreaming: boolean;
	error: string | null;
}

interface AIChatActions {
	sendMessage: (content: string, editorContent?: string) => Promise<void>;
	stopStreaming: () => void;
	clearMessages: () => void;
	setActiveProvider: (provider: AIProviderType) => void;
	setSelectedModel: (provider: AIProviderType, model: string) => void;
	setError: (error: string | null) => void;
}

type AIChatStore = AIChatState & AIChatActions;

let abortController: AbortController | null = null;

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

				const providerType = state.activeProvider;
				const model = state.selectedModels[providerType];

				// Load API key from credential store
				const apiKey = (await credentialStore.load(
					getCredentialKey(providerType),
				)) as string | null;
				if (!apiKey) {
					set({ error: "No API key configured. Open Settings > AI to add one." });
					return;
				}

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
					messages: [...s.messages, userMessage, assistantMessage].slice(-MAX_MESSAGES),
					isStreaming: true,
					error: null,
				}));

				// Build messages array for API
				const systemPrompt = buildSystemPrompt(editorContent);
				const apiMessages = [
					{ role: "system" as const, content: systemPrompt },
					...get()
						.messages.filter((m) => !m.isStreaming)
						.map((m) => ({
							role: m.role as "user" | "assistant",
							content: m.content,
						})),
				];

				const provider = getProvider(providerType);
				abortController = new AbortController();

				try {
					let fullContent = "";
					for await (const chunk of provider.streamChat(
						apiMessages,
						{ apiKey, model },
						abortController.signal,
					)) {
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
										? { ...m, isStreaming: false, content: fullContent || "Error occurred." }
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
								m.id === assistantMessage.id
									? { ...m, isStreaming: false }
									: m,
							),
						}));
					} else {
						set((s) => ({
							isStreaming: false,
							error: (err as Error).message || "Unknown error",
							messages: s.messages.map((m) =>
								m.id === assistantMessage.id
									? { ...m, isStreaming: false, content: m.content || "Error occurred." }
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
export const useAIActiveProvider = () => useAIChatStore((s) => s.activeProvider);
