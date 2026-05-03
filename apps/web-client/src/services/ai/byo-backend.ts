/**
 * ByoChatBackend (backlog AI-2)
 *
 * Adapter that wraps an existing AIProvider as a ChatBackend. The wrapping is
 * mechanical — apiKey is loaded from aiCredentialStore at request time;
 * everything else delegates to the underlying provider. Zero behavior change
 * for users who stick with the current 4 BYO providers.
 */

import { aiCredentialStore } from "./index";
import { getCredentialKey } from "./provider-registry";
import {
	type AIMessage,
	type AIProvider,
	type AIProviderType,
	type AIStreamChunk,
	type ChatBackend,
	ChatBackendError,
} from "./types";

export class ByoChatBackend implements ChatBackend {
	readonly kind = "byo" as const;
	readonly id: string;
	readonly label: string;
	readonly models;
	private readonly providerType: AIProviderType;
	private readonly provider: AIProvider;

	constructor(provider: AIProvider) {
		this.providerType = provider.type;
		this.provider = provider;
		this.id = provider.type;
		this.label = provider.displayName;
		this.models = provider.models;
	}

	async isAvailable(): Promise<boolean> {
		const key = await aiCredentialStore.load(
			getCredentialKey(this.providerType),
		);
		return !!key;
	}

	async *streamChat(
		messages: AIMessage[],
		opts: { model: string; signal?: AbortSignal },
	): AsyncGenerator<AIStreamChunk> {
		// Pre-handshake: validate model.
		if (!this.models.some((m) => m.id === opts.model)) {
			throw new ChatBackendError(
				"INVALID_MODEL",
				`Unknown model: ${opts.model}`,
			);
		}

		// Pre-handshake: load API key.
		const apiKey = (await aiCredentialStore.load(
			getCredentialKey(this.providerType),
		)) as string | null;
		if (!apiKey) {
			throw new ChatBackendError(
				"MISSING_API_KEY",
				`No API key configured for ${this.label}`,
			);
		}

		// Handshake: from here forward, all failures are in-stream.
		try {
			for await (const chunk of this.provider.streamChat(
				messages,
				{ apiKey, model: opts.model },
				opts.signal,
			)) {
				yield chunk;
			}
		} catch (err) {
			yield {
				type: "error",
				error:
					err instanceof Error ? err.message : "BYO provider stream failed",
			};
			yield { type: "done" };
		}
	}
}
