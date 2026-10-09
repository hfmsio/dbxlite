import { beforeEach, describe, expect, it, vi } from "vitest";

const streamZibbyAi = vi.fn();
vi.mock("@zibby-run/app-kit", () => ({
	streamZibbyAi: (...args: unknown[]) => streamZibbyAi(...args),
}));

import type { AIMessage, AIStreamChunk } from "../types";
import { ZibbyProvider } from "../zibby-provider";

async function drain(gen: AsyncGenerator<AIStreamChunk>) {
	const out: AIStreamChunk[] = [];
	for await (const c of gen) out.push(c);
	return out;
}

const messages: AIMessage[] = [
	{ role: "system", content: "you are a sql helper" },
	{ role: "user", content: "count the rows" },
];

beforeEach(() => {
	streamZibbyAi.mockReset();
});

describe("ZibbyProvider", () => {
	it("sends claude ids in the anthropic format with the system prompt beside the turns", async () => {
		streamZibbyAi.mockResolvedValue({ text: "" });

		await drain(
			new ZibbyProvider().streamChat(messages, {
				apiKey: "",
				model: "claude-sonnet-5",
			}),
		);

		const [req] = streamZibbyAi.mock.calls[0];
		expect(req.provider).toBe("anthropic");
		expect(req.payload.system).toBe("you are a sql helper");
		// Anthropic rejects a system role among the turns.
		expect(req.payload.messages).toEqual([
			{ role: "user", content: "count the rows" },
		]);
	});

	it("sends every other id in the openai format with the system turn inline", async () => {
		streamZibbyAi.mockResolvedValue({ text: "" });

		await drain(
			new ZibbyProvider().streamChat(messages, {
				apiKey: "",
				model: "moonshotai/kimi-k2",
			}),
		);

		const [req] = streamZibbyAi.mock.calls[0];
		expect(req.provider).toBe("openai");
		expect(req.payload.system).toBeUndefined();
		expect(req.payload.messages).toHaveLength(2);
	});

	it("yields deltas in arrival order and then done", async () => {
		streamZibbyAi.mockImplementation(async (_req, opts) => {
			opts.onDelta("SELECT ");
			opts.onDelta("count(*)");
			await Promise.resolve();
			opts.onDelta(" FROM t");
			return { text: "SELECT count(*) FROM t" };
		});

		const chunks = await drain(
			new ZibbyProvider().streamChat(messages, {
				apiKey: "",
				model: "claude-sonnet-5",
			}),
		);

		expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual([
			"SELECT ",
			"count(*)",
			" FROM t",
		]);
		expect(chunks.at(-1)).toEqual({ type: "done" });
	});

	it("reports a refusal as an error chunk and still finishes the stream", async () => {
		streamZibbyAi.mockRejectedValue(new Error("insufficient_credits"));

		const chunks = await drain(
			new ZibbyProvider().streamChat(messages, {
				apiKey: "",
				model: "gpt-5",
			}),
		);

		// A post-handshake failure must not throw out of the generator: the panel
		// needs the error chunk to draw it, and the done chunk to stop spinning.
		expect(chunks).toEqual([
			{ type: "error", error: "insufficient_credits" },
			{ type: "done" },
		]);
	});

	it("carries no api key", async () => {
		streamZibbyAi.mockResolvedValue({ text: "" });

		await drain(
			new ZibbyProvider().streamChat(messages, {
				apiKey: "sk-should-be-ignored",
				model: "gpt-5",
			}),
		);

		expect(JSON.stringify(streamZibbyAi.mock.calls[0])).not.toContain("sk-");
	});
});
