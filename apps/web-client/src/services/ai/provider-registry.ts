/**
 * Provider Registry
 * Factory for creating AI providers and managing model definitions.
 */

import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import type { AIProvider, AIProviderType } from "./types";

const providers: Record<AIProviderType, () => AIProvider> = {
	openai: () =>
		new OpenAICompatibleProvider({
			type: "openai",
			displayName: "OpenAI",
			baseUrl: "https://api.openai.com/v1",
			models: [
				{ id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000 },
				{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128000 },
				{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: 1047576 },
			],
		}),

	anthropic: () => new AnthropicProvider(),

	gemini: () => new GeminiProvider(),

	groq: () =>
		new OpenAICompatibleProvider({
			type: "groq",
			displayName: "Groq",
			baseUrl: "https://api.groq.com/openai/v1",
			models: [
				{
					id: "llama-3.3-70b-versatile",
					name: "Llama 3.3 70B",
					contextWindow: 128000,
					isFree: true,
				},
			],
		}),
};

// Cache provider instances
const instanceCache = new Map<AIProviderType, AIProvider>();

export function getProvider(type: AIProviderType): AIProvider {
	let provider = instanceCache.get(type);
	if (!provider) {
		provider = providers[type]();
		instanceCache.set(type, provider);
	}
	return provider;
}

export function getDefaultProvider(): AIProviderType {
	return "gemini";
}

export function getAllProviderTypes(): AIProviderType[] {
	return ["gemini", "groq", "openai", "anthropic"];
}

export function getDefaultModel(type: AIProviderType): string {
	const provider = getProvider(type);
	return provider.models[0].id;
}

/** Credential key used with CredentialStore for each provider */
export function getCredentialKey(type: AIProviderType): string {
	return `ai-${type}`;
}
