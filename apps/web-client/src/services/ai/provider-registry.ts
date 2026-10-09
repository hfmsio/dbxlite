/**
 * Provider Registry
 * Factory for creating AI providers and managing model definitions.
 */

import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { ZibbyProvider } from "./zibby-provider";
import type { AIProvider, AIProviderType } from "./types";

const providers: Record<AIProviderType, () => AIProvider> = {
	openai: () =>
		new OpenAICompatibleProvider({
			type: "openai",
			displayName: "OpenAI",
			baseUrl: "https://api.openai.com/v1",
			models: [
				{ id: "gpt-5.5", name: "GPT-5.5", contextWindow: 1050000 },
				{ id: "gpt-5.4-mini", name: "GPT-5.4 Mini", contextWindow: 400000 },
				{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: 1047576 },
			],
		}),

	anthropic: () => new AnthropicProvider(),

	zibby: () => new ZibbyProvider(),

	gemini: () => new GeminiProvider(),

	groq: () =>
		new OpenAICompatibleProvider({
			type: "groq",
			displayName: "Groq",
			baseUrl: "https://api.groq.com/openai/v1",
			models: [
				{
					id: "openai/gpt-oss-120b",
					name: "GPT-OSS 120B",
					contextWindow: 131072,
					isFree: true,
				},
				{
					id: "openai/gpt-oss-20b",
					name: "GPT-OSS 20B",
					contextWindow: 131072,
					isFree: true,
				},
			],
		}),
};

/**
 * Zibby holds the model keys and bills the signed-in visitor, so there is no
 * key to ask for. Every other provider is bring-your-own.
 */
export function providerNeedsApiKey(type: AIProviderType): boolean {
	return type !== "zibby";
}

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
	return "zibby";
}

/**
 * Zibby leads because it needs nothing from the visitor. The bring-your-own
 * providers stay available for anyone who would rather spend their own key
 * than the host's credits.
 */
export function getAllProviderTypes(): AIProviderType[] {
	return ["zibby", "gemini", "groq", "openai", "anthropic"];
}

export function getDefaultModel(type: AIProviderType): string {
	const provider = getProvider(type);
	return provider.models[0].id;
}

/** Credential key used with CredentialStore for each provider */
export function getCredentialKey(type: AIProviderType): string {
	return `ai-${type}`;
}
