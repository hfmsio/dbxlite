/**
 * Zibby provider.
 *
 * On Zibby the app holds no keys. Requests go to one same-origin endpoint and
 * the platform bills the signed-in visitor's credits, so there is no key field
 * and no per-visitor setup.
 *
 * The kit streams through an `onDelta` callback; the chat panel consumes an
 * async generator. The queue below is that adapter and nothing more.
 */

import { streamZibbyAi } from "@zibby-run/app-kit";
import type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIStreamChunk,
} from "./types";

/** The label the platform prices this app's runs under. */
const ZIBBY_ACTION = "sql:chat";

/**
 * Context windows are conservative floors, not vendor-exact figures: they only
 * gate how much schema we attach. The platform's catalogue is the authority on
 * which ids exist, and a wrong id answers 400 unknown_model.
 */
const ZIBBY_MODELS: AIModelInfo[] = [
	{ id: "claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 200000 },
	{ id: "claude-opus-5", name: "Claude Opus 5", contextWindow: 200000 },
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5",
		contextWindow: 200000,
	},
	{ id: "gpt-5", name: "GPT-5", contextWindow: 128000 },
	{ id: "x-ai/grok-4", name: "Grok 4", contextWindow: 128000 },
	{ id: "z-ai/glm-4.6", name: "GLM 4.6", contextWindow: 128000 },
	{ id: "moonshotai/kimi-k2", name: "Kimi K2", contextWindow: 128000 },
];

/** Anthropic takes the system prompt beside the turns, not as a turn. */
function anthropicPayload(
	messages: AIMessage[],
	model: string,
	maxTokens: number,
) {
	const system = messages
		.filter((m) => m.role === "system")
		.map((m) => m.content)
		.join("\n\n");
	const turns = messages
		.filter((m) => m.role !== "system")
		.map((m) => ({ role: m.role, content: m.content }));
	return {
		model,
		max_tokens: maxTokens,
		...(system ? { system } : {}),
		messages: turns,
	};
}

function openAIPayload(
	messages: AIMessage[],
	model: string,
	maxTokens: number,
) {
	return {
		model,
		max_tokens: maxTokens,
		messages: messages.map((m) => ({ role: m.role, content: m.content })),
	};
}

/** Every `claude-*` id rides the anthropic request format; everything else openai. */
function wireFormat(model: string): "anthropic" | "openai" {
	return model.startsWith("claude-") ? "anthropic" : "openai";
}

export class ZibbyProvider implements AIProvider {
	readonly type = "zibby" as const;
	readonly displayName = "Zibby";
	readonly models = ZIBBY_MODELS;

	async *streamChat(
		messages: AIMessage[],
		config: AIProviderConfig,
		signal?: AbortSignal,
	): AsyncGenerator<AIStreamChunk> {
		const model = config.model || ZIBBY_MODELS[0].id;
		const provider = wireFormat(model);
		const maxTokens = config.maxTokens ?? 4096;
		const payload =
			provider === "anthropic"
				? anthropicPayload(messages, model, maxTokens)
				: openAIPayload(messages, model, maxTokens);

		// Deltas arrive on a callback while the promise is still running, so they
		// are buffered and handed out in order; `wake` releases a waiting consumer.
		const queue: string[] = [];
		let wake: (() => void) | null = null;
		const nudge = () => {
			wake?.();
			wake = null;
		};

		let failure: unknown = null;
		let finished = false;

		const run = streamZibbyAi(
			{ action: ZIBBY_ACTION, provider, model, payload },
			{
				signal,
				onDelta: (chunk) => {
					queue.push(chunk);
					nudge();
				},
			},
		)
			.catch((err) => {
				failure = err;
			})
			.finally(() => {
				finished = true;
				nudge();
			});

		while (true) {
			while (queue.length > 0) {
				const text = queue.shift();
				if (text) yield { type: "text", text };
			}
			if (finished) break;
			await new Promise<void>((resolve) => {
				wake = resolve;
			});
		}

		await run;

		if (failure) {
			yield {
				type: "error",
				error:
					failure instanceof Error ? failure.message : "Zibby request failed",
			};
		}
		yield { type: "done" };
	}
}
