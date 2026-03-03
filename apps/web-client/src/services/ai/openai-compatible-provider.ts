/**
 * OpenAI-Compatible Provider
 * Handles OpenAI and Groq APIs (same SSE streaming format, different base URLs).
 */

import type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIProviderType,
	AIStreamChunk,
} from "./types";

interface OpenAICompatibleConfig {
	type: AIProviderType;
	displayName: string;
	baseUrl: string;
	models: AIModelInfo[];
}

export class OpenAICompatibleProvider implements AIProvider {
	readonly type: AIProviderType;
	readonly displayName: string;
	readonly models: AIModelInfo[];
	private readonly baseUrl: string;

	constructor(config: OpenAICompatibleConfig) {
		this.type = config.type;
		this.displayName = config.displayName;
		this.baseUrl = config.baseUrl;
		this.models = config.models;
	}

	async *streamChat(
		messages: AIMessage[],
		config: AIProviderConfig,
		signal?: AbortSignal,
	): AsyncGenerator<AIStreamChunk> {
		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				stream: true,
				max_tokens: config.maxTokens ?? 4096,
			}),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");
			let message: string;
			try {
				const errorJson = JSON.parse(errorText);
				message = errorJson.error?.message || errorText;
			} catch {
				message = errorText;
			}
			yield { type: "error", error: `${this.displayName} API error (${response.status}): ${message}` };
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: "error", error: "No response body" };
			return;
		}

		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || !trimmed.startsWith("data: ")) continue;

					const data = trimmed.slice(6);
					if (data === "[DONE]") {
						yield { type: "done" };
						return;
					}

					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices?.[0]?.delta?.content;
						if (content) {
							yield { type: "text", text: content };
						}
					} catch {
						// Skip malformed JSON chunks
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		yield { type: "done" };
	}
}
