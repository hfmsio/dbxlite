/**
 * Google Gemini Provider
 * Uses streamGenerateContent API with API key as URL parameter (no CORS issues).
 * Free tier: 15 RPM with gemini-2.0-flash.
 */

import type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIStreamChunk,
} from "./types";

export class GeminiProvider implements AIProvider {
	readonly type = "gemini" as const;
	readonly displayName = "Google Gemini";
	readonly models: AIModelInfo[] = [
		{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1048576, isFree: true },
	];

	async *streamChat(
		messages: AIMessage[],
		config: AIProviderConfig,
		signal?: AbortSignal,
	): AsyncGenerator<AIStreamChunk> {
		// Convert to Gemini format: system instruction + contents
		const systemMessage = messages.find((m) => m.role === "system");
		const conversationMessages = messages.filter((m) => m.role !== "system");

		const contents = conversationMessages.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.content }],
		}));

		const body: Record<string, unknown> = {
			contents,
			generationConfig: {
				maxOutputTokens: config.maxTokens ?? 4096,
			},
		};

		if (systemMessage) {
			body.systemInstruction = {
				parts: [{ text: systemMessage.content }],
			};
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
			yield { type: "error", error: `Gemini API error (${response.status}): ${message}` };
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
						const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
						if (text) {
							yield { type: "text", text };
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
