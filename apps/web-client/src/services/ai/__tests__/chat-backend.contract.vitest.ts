/**
 * ChatBackend contract test suite (RT-2, AI-Chat Phase A)
 *
 * Locks the canonical streaming-error model for every ChatBackend implementation
 * (BYO + warehouse) so the UI's stream state machine has a single shape to handle.
 *
 * Test subjects (registry-only):
 *   - All 4 BYO backends (ByoChatBackend wrapping each AIProvider)
 *   - A fully-mocked Cortex WarehouseChatBackend whose capability returns
 *     deterministic responses
 *
 * The BQ ML sketch is excluded — it's compile-only validation, not registered
 * at runtime, not contract-tested. See plans/AI_CHAT_PLAN.md Phase A.
 *
 * Contract:
 *   - isAvailable() always returns a boolean; never throws.
 *   - Pre-handshake errors (INVALID_MODEL, MISSING_API_KEY, PROMPT_TOO_LARGE,
 *     BACKEND_NOT_AVAILABLE) throw synchronously with ChatBackendError; zero
 *     chunks yielded.
 *   - In-stream failures yield exactly one {type:"error"} chunk followed by
 *     exactly one {type:"done"} chunk; AsyncIterable resolves cleanly.
 *   - Abort mid-stream yields one error + one done; never throws.
 *   - Banned: throwing after the first chunk has been yielded.
 *   - estimateCost (when present) returns {tokens?, credits?, usd?} | null.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ByoChatBackend } from "../byo-backend";
import {
	type AIMessage,
	type AIProvider,
	type AIProviderType,
	type AIStreamChunk,
	type ChatBackend,
	ChatBackendError,
} from "../types";
import { WarehouseChatBackend } from "../warehouse-backend";
import type { WarehouseAICapabilities } from "../warehouse-capabilities";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCredentialLoad = vi.fn();

vi.mock("../index", () => ({
	aiCredentialStore: {
		load: (...args: unknown[]) => mockCredentialLoad(...args),
		save: vi.fn(),
	},
}));

vi.mock("../provider-registry", async (importOriginal) => {
	// Keep getCredentialKey + getDefaultProvider real; the byo backend uses
	// getCredentialKey to compose the storage key.
	return await importOriginal<typeof import("../provider-registry")>();
});

beforeEach(() => {
	mockCredentialLoad.mockReset();
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test subject factories
// ---------------------------------------------------------------------------

/**
 * Configurable AIProvider double. Each test sets `behavior` to control whether
 * streamChat yields chunks, throws, or aborts.
 */
type ProviderBehavior =
	| { kind: "success"; chunks: AIStreamChunk[] }
	| { kind: "throw-pre-handshake"; error: Error }
	| { kind: "throw-in-stream-after-yield"; firstChunk: AIStreamChunk; error: Error }
	| { kind: "throw-mid-stream-immediate"; error: Error };

function makeProvider(
	type: AIProviderType,
	behavior: () => ProviderBehavior,
): AIProvider {
	return {
		type,
		displayName: type,
		models: [
			{ id: `${type}-test-model`, name: "Test", contextWindow: 8000 },
		],
		async *streamChat(
			_messages,
			_config,
			signal,
		): AsyncGenerator<AIStreamChunk> {
			const b = behavior();
			if (b.kind === "throw-pre-handshake") {
				throw b.error;
			}
			if (b.kind === "throw-mid-stream-immediate") {
				throw b.error;
			}
			if (b.kind === "throw-in-stream-after-yield") {
				yield b.firstChunk;
				throw b.error;
			}
			for (const chunk of b.chunks) {
				if (signal?.aborted) {
					throw new DOMException("Aborted", "AbortError");
				}
				yield chunk;
			}
		},
	};
}

/**
 * Configurable WarehouseAICapabilities double.
 */
type CapabilityBehavior =
	| { kind: "success"; text: string }
	| { kind: "execute-throws"; error: Error }
	| { kind: "execute-returns-empty" }
	| { kind: "parse-throws"; error: Error };

function makeCapabilities(
	behavior: () => CapabilityBehavior,
	overrides: Partial<WarehouseAICapabilities> = {},
): WarehouseAICapabilities {
	return {
		id: "test-warehouse",
		label: "Test Warehouse",
		models: [
			{ id: "test-warehouse-model", name: "Test Model", contextWindow: 8000 },
		],
		supportsTextGen: true,
		supportsEmbeddings: false,
		isAvailable: async () => true,
		composeCompletionSQL: () => ({
			sql: "SELECT 'ok' AS response",
			bindings: [],
		}),
		execute: async (_sql, _bindings, signal) => {
			const b = behavior();
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}
			if (b.kind === "execute-throws") throw b.error;
			if (b.kind === "execute-returns-empty") return [];
			if (b.kind === "parse-throws") return [{ response: "ignored" }];
			return [{ response: b.text }];
		},
		parseCompletionRow: (row) => {
			const b = behavior();
			if (b.kind === "parse-throws") throw b.error;
			return (row as { response: string }).response;
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Subject definitions
// ---------------------------------------------------------------------------

interface TestSubject {
	name: string;
	kind: "byo" | "warehouse";
	makeBackend: (opts: {
		providerBehavior?: () => ProviderBehavior;
		capabilityBehavior?: () => CapabilityBehavior;
	}) => ChatBackend;
	validModelId: string;
	/** What does pre-handshake "missing key/access" look like for this kind? */
	setupMissingAccess: () => void;
	setupAvailableAccess: () => void;
}

const BYO_TYPES: AIProviderType[] = ["openai", "anthropic", "gemini", "groq"];

const byoSubjects: TestSubject[] = BYO_TYPES.map((type) => ({
	name: `BYO:${type}`,
	kind: "byo",
	makeBackend: ({ providerBehavior }) => {
		const provider = makeProvider(
			type,
			providerBehavior ??
				(() => ({ kind: "success", chunks: [{ type: "text", text: "hi" }, { type: "done" }] })),
		);
		return new ByoChatBackend(provider);
	},
	validModelId: `${type}-test-model`,
	setupMissingAccess: () => {
		mockCredentialLoad.mockResolvedValue(null);
	},
	setupAvailableAccess: () => {
		mockCredentialLoad.mockResolvedValue("sk-fake-key");
	},
}));

const warehouseSubject: TestSubject = {
	name: "warehouse:cortex-mock",
	kind: "warehouse",
	makeBackend: ({ capabilityBehavior }) => {
		const caps = makeCapabilities(
			capabilityBehavior ?? (() => ({ kind: "success", text: "hi" })),
		);
		return new WarehouseChatBackend(caps);
	},
	validModelId: "test-warehouse-model",
	setupMissingAccess: () => {
		// Warehouse backends use the capability's own isAvailable() — handled per test.
	},
	setupAvailableAccess: () => {
		// Default capability returns isAvailable: true.
	},
};

const allSubjects: TestSubject[] = [...byoSubjects, warehouseSubject];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectChunks(
	gen: AsyncGenerator<AIStreamChunk>,
): Promise<AIStreamChunk[]> {
	const out: AIStreamChunk[] = [];
	for await (const chunk of gen) {
		out.push(chunk);
	}
	return out;
}

const HELLO_MESSAGES: AIMessage[] = [
	{ role: "user", content: "hello" },
];

// ---------------------------------------------------------------------------
// Contract tests, parameterized over every subject
// ---------------------------------------------------------------------------

describe.each(allSubjects)("ChatBackend contract: $name", (subject) => {
	beforeEach(() => {
		subject.setupAvailableAccess();
	});

	// ---------------------------------------------------------------- identity
	describe("identity", () => {
		it("has a non-empty id", () => {
			const b = subject.makeBackend({});
			expect(typeof b.id).toBe("string");
			expect(b.id.length).toBeGreaterThan(0);
		});

		it("has a non-empty label", () => {
			const b = subject.makeBackend({});
			expect(typeof b.label).toBe("string");
			expect(b.label.length).toBeGreaterThan(0);
		});

		it("has at least one model with id and name", () => {
			const b = subject.makeBackend({});
			expect(b.models.length).toBeGreaterThan(0);
			for (const m of b.models) {
				expect(typeof m.id).toBe("string");
				expect(m.id.length).toBeGreaterThan(0);
				expect(typeof m.name).toBe("string");
			}
		});

		it("has a kind of 'byo' or 'warehouse'", () => {
			const b = subject.makeBackend({});
			expect(["byo", "warehouse"]).toContain(b.kind);
		});
	});

	// ----------------------------------------------------------- isAvailable()
	describe("isAvailable", () => {
		it("returns a boolean (true) when access is available", async () => {
			const b = subject.makeBackend({});
			subject.setupAvailableAccess();
			const result = await b.isAvailable();
			expect(typeof result).toBe("boolean");
			expect(result).toBe(true);
		});

		it("returns a boolean (false) when access is missing", async () => {
			subject.setupMissingAccess();
			const b =
				subject.kind === "warehouse"
					? new WarehouseChatBackend(
							makeCapabilities(() => ({ kind: "success", text: "x" }), {
								isAvailable: async () => false,
							}),
						)
					: subject.makeBackend({});
			const result = await b.isAvailable();
			expect(typeof result).toBe("boolean");
			expect(result).toBe(false);
		});

		it("never throws", async () => {
			subject.setupMissingAccess();
			const b = subject.makeBackend({});
			await expect(b.isAvailable()).resolves.not.toThrow();
		});
	});

	// ---------------------------------------------- pre-handshake error throws
	describe("pre-handshake errors throw synchronously with zero chunks", () => {
		it("INVALID_MODEL: throws ChatBackendError; zero chunks yielded", async () => {
			const b = subject.makeBackend({});
			const gen = b.streamChat(HELLO_MESSAGES, { model: "definitely-not-a-real-model" });
			let thrown: unknown;
			try {
				// .next() drives the generator to its first yield or throw.
				await gen.next();
			} catch (err) {
				thrown = err;
			}
			expect(thrown).toBeInstanceOf(ChatBackendError);
			expect((thrown as ChatBackendError).code).toBe("INVALID_MODEL");
		});

		if (true) {
			// MISSING_API_KEY only fires for BYO; warehouse has no key concept.
			// PROMPT_TOO_LARGE only fires for warehouse (BYO has no token cap).
		}
	});

	// ----------------------------------------------------------- success path
	describe("success path", () => {
		it("yields zero or more text chunks then exactly one done chunk", async () => {
			const b = subject.makeBackend({
				providerBehavior: () => ({
					kind: "success",
					chunks: [
						{ type: "text", text: "hello " },
						{ type: "text", text: "world" },
						{ type: "done" },
					],
				}),
				capabilityBehavior: () => ({ kind: "success", text: "hello world" }),
			});
			const chunks = await collectChunks(
				b.streamChat(HELLO_MESSAGES, { model: subject.validModelId }),
			);
			const doneChunks = chunks.filter((c) => c.type === "done");
			const errorChunks = chunks.filter((c) => c.type === "error");
			const textChunks = chunks.filter((c) => c.type === "text");
			expect(doneChunks.length).toBe(1);
			expect(errorChunks.length).toBe(0);
			expect(textChunks.length).toBeGreaterThanOrEqual(1);
			// done is the last chunk
			expect(chunks[chunks.length - 1]?.type).toBe("done");
		});
	});

	// -------------------------------------------------------- in-stream errors
	describe("in-stream errors yield error+done; never throw post-handshake", () => {
		it("execution failure: yields exactly one error chunk + one done; does not throw", async () => {
			const b = subject.makeBackend({
				providerBehavior: () => ({
					kind: "throw-mid-stream-immediate",
					error: new Error("network blew up"),
				}),
				capabilityBehavior: () => ({
					kind: "execute-throws",
					error: new Error("network blew up"),
				}),
			});

			let chunks: AIStreamChunk[] = [];
			let didThrow = false;
			try {
				chunks = await collectChunks(
					b.streamChat(HELLO_MESSAGES, { model: subject.validModelId }),
				);
			} catch {
				didThrow = true;
			}
			expect(didThrow).toBe(false);
			const errors = chunks.filter((c) => c.type === "error");
			const dones = chunks.filter((c) => c.type === "done");
			expect(errors.length).toBe(1);
			expect(dones.length).toBe(1);
			expect(errors[0]?.error).toBeTruthy();
			// done must come after error
			const errorIdx = chunks.findIndex((c) => c.type === "error");
			const doneIdx = chunks.findIndex((c) => c.type === "done");
			expect(doneIdx).toBeGreaterThan(errorIdx);
		});

		it("error after a successful first chunk: still yields error+done; does not throw", async () => {
			const b = subject.makeBackend({
				providerBehavior: () => ({
					kind: "throw-in-stream-after-yield",
					firstChunk: { type: "text", text: "partial..." },
					error: new Error("connection dropped mid-stream"),
				}),
				// Warehouse capability has no analog: execute() is single-shot.
				// We use the success path for warehouse; the BYO test covers
				// the post-yield-throw banned case.
				capabilityBehavior: () => ({ kind: "success", text: "partial..." }),
			});

			let chunks: AIStreamChunk[] = [];
			let didThrow = false;
			try {
				chunks = await collectChunks(
					b.streamChat(HELLO_MESSAGES, { model: subject.validModelId }),
				);
			} catch {
				didThrow = true;
			}
			expect(didThrow).toBe(false);
			expect(chunks[chunks.length - 1]?.type).toBe("done");
			// For BYO: must include an error chunk before done.
			// For warehouse: the equivalent (parse failure) is tested below.
			if (subject.kind === "byo") {
				expect(chunks.some((c) => c.type === "error")).toBe(true);
			}
		});

		it("warehouse parse failure: yields error+done (warehouse only)", async () => {
			if (subject.kind !== "warehouse") return;
			const b = subject.makeBackend({
				capabilityBehavior: () => ({
					kind: "parse-throws",
					error: new Error("unexpected response shape"),
				}),
			});
			const chunks = await collectChunks(
				b.streamChat(HELLO_MESSAGES, { model: subject.validModelId }),
			);
			expect(chunks.filter((c) => c.type === "error").length).toBe(1);
			expect(chunks.filter((c) => c.type === "done").length).toBe(1);
		});
	});

	// ----------------------------------------------------------- abort path
	describe("abort path", () => {
		it("aborted signal yields error+done; does not throw", async () => {
			const controller = new AbortController();
			const b = subject.makeBackend({
				providerBehavior: () => ({
					kind: "success",
					chunks: [
						{ type: "text", text: "first " },
						{ type: "text", text: "second " },
						{ type: "done" },
					],
				}),
				capabilityBehavior: () => ({ kind: "success", text: "anything" }),
			});

			// Abort before consuming.
			controller.abort();

			let chunks: AIStreamChunk[] = [];
			let didThrow = false;
			try {
				chunks = await collectChunks(
					b.streamChat(HELLO_MESSAGES, {
						model: subject.validModelId,
						signal: controller.signal,
					}),
				);
			} catch {
				didThrow = true;
			}
			expect(didThrow).toBe(false);
			expect(chunks[chunks.length - 1]?.type).toBe("done");
			expect(chunks.some((c) => c.type === "error")).toBe(true);
		});
	});

	// ------------------------------------------------------------ estimateCost
	describe("estimateCost (optional)", () => {
		it("returns object-with-shape or null", async () => {
			const b = subject.makeBackend({});
			if (!b.estimateCost) return;
			const result = await b.estimateCost(HELLO_MESSAGES, {
				model: subject.validModelId,
			});
			if (result === null) return;
			expect(typeof result).toBe("object");
			// Allowed keys only.
			const allowedKeys = new Set(["tokens", "credits", "usd"]);
			for (const key of Object.keys(result)) {
				expect(allowedKeys.has(key)).toBe(true);
			}
		});
	});
});

// ---------------------------------------------------------------------------
// Subject-specific extras (codes that don't apply to every subject)
// ---------------------------------------------------------------------------

describe("ChatBackend contract — BYO-specific: MISSING_API_KEY", () => {
	it.each(byoSubjects)("$name throws MISSING_API_KEY when no key saved", async (subject) => {
		mockCredentialLoad.mockResolvedValue(null);
		const b = subject.makeBackend({});
		const gen = b.streamChat(HELLO_MESSAGES, { model: subject.validModelId });
		let thrown: unknown;
		try {
			await gen.next();
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(ChatBackendError);
		expect((thrown as ChatBackendError).code).toBe("MISSING_API_KEY");
	});
});

describe("ChatBackend contract — warehouse-specific: PROMPT_TOO_LARGE", () => {
	it("throws PROMPT_TOO_LARGE when total tokens > 8000", async () => {
		const caps = makeCapabilities(() => ({ kind: "success", text: "x" }));
		const b = new WarehouseChatBackend(caps);
		// 8000 tokens × 4 chars/token = 32000 chars, plus role prefix overhead.
		// Send something obviously over the cap.
		const huge: AIMessage[] = [
			{ role: "user", content: "x".repeat(50_000) },
		];
		const gen = b.streamChat(huge, { model: "test-warehouse-model" });
		let thrown: unknown;
		try {
			await gen.next();
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(ChatBackendError);
		expect((thrown as ChatBackendError).code).toBe("PROMPT_TOO_LARGE");
	});
});

describe("ChatBackend contract — warehouse-specific: WAREHOUSE_TIMEOUT", () => {
	it("yields error+done with WAREHOUSE_TIMEOUT code when execute exceeds 30s", async () => {
		vi.useFakeTimers();
		try {
			// Capability whose execute() never resolves — forces the timeout race
			// to fire.
			const caps: WarehouseAICapabilities = {
				id: "slow-warehouse",
				label: "Slow Warehouse",
				models: [
					{ id: "slow-model", name: "Slow", contextWindow: 8000 },
				],
				supportsTextGen: true,
				supportsEmbeddings: false,
				isAvailable: async () => true,
				composeCompletionSQL: () => ({ sql: "SELECT 1", bindings: [] }),
				execute: () => new Promise(() => {
					/* never resolves */
				}),
				parseCompletionRow: () => "unreachable",
			};
			const b = new WarehouseChatBackend(caps);
			const collectPromise = collectChunks(
				b.streamChat(HELLO_MESSAGES, { model: "slow-model" }),
			);
			// Advance past the 30s timeout in warehouse-backend.ts.
			await vi.advanceTimersByTimeAsync(31_000);
			const chunks = await collectPromise;
			const errors = chunks.filter((c) => c.type === "error");
			const dones = chunks.filter((c) => c.type === "done");
			expect(errors.length).toBe(1);
			expect(dones.length).toBe(1);
			// Classifier wraps the message with [WAREHOUSE_TIMEOUT] prefix.
			expect(errors[0]?.error).toMatch(/WAREHOUSE_TIMEOUT/);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("ChatBackend contract — warehouse-specific: empty result", () => {
	it("yields error+done when execute returns []", async () => {
		const caps = makeCapabilities(() => ({ kind: "execute-returns-empty" }));
		const b = new WarehouseChatBackend(caps);
		const chunks = await collectChunks(
			b.streamChat(HELLO_MESSAGES, { model: "test-warehouse-model" }),
		);
		const errors = chunks.filter((c) => c.type === "error");
		const dones = chunks.filter((c) => c.type === "done");
		expect(errors.length).toBe(1);
		expect(dones.length).toBe(1);
		expect(errors[0]?.error).toMatch(/no rows/i);
	});
});

describe("ChatBackend contract — BYO-specific: mid-iteration abort", () => {
	it.each(byoSubjects)(
		"$name yields error+done when signal aborts between chunks",
		async (subject) => {
			subject.setupAvailableAccess();
			const controller = new AbortController();
			const b = subject.makeBackend({
				providerBehavior: () => ({
					kind: "success",
					chunks: [
						{ type: "text", text: "first " },
						{ type: "text", text: "second " },
						{ type: "done" },
					],
				}),
			});
			const gen = b.streamChat(HELLO_MESSAGES, {
				model: subject.validModelId,
				signal: controller.signal,
			});
			// Pull the first chunk normally.
			const first = await gen.next();
			expect(first.done).toBe(false);
			expect((first.value as AIStreamChunk).type).toBe("text");

			// Abort, then drain. Underlying provider's signal check throws on the
			// next iteration; the backend catches and converts to error+done.
			controller.abort();

			const rest: AIStreamChunk[] = [];
			let didThrow = false;
			try {
				for await (const c of gen) rest.push(c);
			} catch {
				didThrow = true;
			}
			expect(didThrow).toBe(false);
			expect(rest.some((c) => c.type === "error")).toBe(true);
			expect(rest[rest.length - 1]?.type).toBe("done");
		},
	);
});
