/**
 * Anthropic Provider
 * Handles Anthropic Messages API with SSE streaming.
 * Requires `anthropic-dangerous-direct-browser-access` header for direct browser usage.
 */

import type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIStreamChunk,
} from "./types";

export class AnthropicProvider implements AIProvider {
	readonly type = "anthropic" as const;
	readonly displayName = "Anthropic";
	readonly models: AIModelInfo[] = [
		{
			id: "claude-opus-4-7",
			name: "Claude Opus 4.7",
			contextWindow: 1000000,
		},
		{
			id: "claude-sonnet-4-6",
			name: "Claude Sonnet 4.6",
			contextWindow: 1000000,
		},
		{
			id: "claude-haiku-4-5",
			name: "Claude Haiku 4.5",
			contextWindow: 200000,
		},
	];

	async *streamChat(
		messages: AIMessage[],
		config: AIProviderConfig,
		signal?: AbortSignal,
	): AsyncGenerator<AIStreamChunk> {
		// Separate system message from conversation messages
		const systemMessage = messages.find((m) => m.role === "system");
		const conversationMessages = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({ role: m.role, content: m.content }));

		const body: Record<string, unknown> = {
			model: config.model,
			messages: conversationMessages,
			max_tokens: config.maxTokens ?? 4096,
			stream: true,
		};
		if (systemMessage) {
			body.system = systemMessage.content;
		}

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": config.apiKey,
				"anthropic-version": "2023-06-01",
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify(body),
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
			yield {
				type: "error",
				error: `Anthropic API error (${response.status}): ${message}`,
			};
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
					try {
						const parsed = JSON.parse(data);

						if (parsed.type === "content_block_delta") {
							const text = parsed.delta?.text;
							if (text) {
								yield { type: "text", text };
							}
						} else if (parsed.type === "message_stop") {
							yield { type: "done" };
							return;
						} else if (parsed.type === "error") {
							yield {
								type: "error",
								error: parsed.error?.message || "Stream error",
							};
							return;
						}
					} catch {
						// Skip malformed JSON
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		yield { type: "done" };
	}
}
