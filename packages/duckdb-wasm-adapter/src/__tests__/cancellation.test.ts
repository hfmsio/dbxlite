import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuckDBWorkerAdapter } from "../index";

/**
 * A controllable stand-in for the DuckDB Web Worker. The adapter constructs
 * `new Worker(...)` internally, so we stub the global and capture the instance,
 * auto-answering `init` so `adapter.init()` resolves.
 */
let created: FakeWorker | null = null;

class FakeWorker {
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	sent: Array<Record<string, unknown>> = [];

	constructor() {
		created = this;
	}
	postMessage(msg: Record<string, unknown>) {
		this.sent.push(msg);
		if (msg.type === "init") {
			queueMicrotask(() => this.emit({ type: "inited" }));
		}
	}
	terminate() {}
	emit(msg: unknown) {
		this.onmessage?.({ data: msg });
	}
	sentTypes() {
		return this.sent.map((m) => m.type);
	}
}

function jsonChunk(id: string, rows: unknown[]) {
	return {
		type: "json",
		id,
		buffer: new TextEncoder().encode(JSON.stringify(rows)).buffer,
	};
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("DuckDBWorkerAdapter cancellation + handler lifecycle", () => {
	let adapter: DuckDBWorkerAdapter;

	// Inject the fake worker directly rather than running init(): init builds a
	// real `new Worker(new URL('./worker.ts', import.meta.url))` which jsdom
	// can't resolve. We replicate init's message router (the single line that
	// dispatches an id-tagged message to its handler) so runQuery's real
	// handler map + cleanup logic is exercised.
	beforeEach(() => {
		created = new FakeWorker();
		adapter = new DuckDBWorkerAdapter();
		const anyAdapter = adapter as unknown as {
			worker: FakeWorker;
			handlers: Map<string, (msg: unknown) => void>;
		};
		anyAdapter.worker = created;
		created.onmessage = (e) => {
			const msg = e.data as { id?: string };
			if (msg?.id && anyAdapter.handlers.has(msg.id)) {
				anyAdapter.handlers.get(msg.id)?.(msg);
			}
		};
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const handlers = () =>
		(adapter as unknown as { handlers: Map<string, unknown> }).handlers;

	it("deletes the handler on 'done' (no per-query leak)", async () => {
		const onRow = vi.fn();
		const onDone = vi.fn();
		adapter.runQuery("q1", "SELECT 1", onRow, onDone);
		await flush();

		created!.emit(jsonChunk("q1", [{ a: 1 }, { a: 2 }]));
		created!.emit({ type: "done", id: "q1" });

		expect(onRow).toHaveBeenCalledTimes(2);
		expect(onDone).toHaveBeenCalledTimes(1);
		expect(handlers().size).toBe(0); // handler cleaned up, not leaked
	});

	it("deletes the handler on 'error'", async () => {
		const onError = vi.fn();
		adapter.runQuery("q2", "SELECT 1", vi.fn(), undefined, onError);
		await flush();

		created!.emit({ type: "error", id: "q2", error: "boom" });

		expect(onError).toHaveBeenCalledWith("boom");
		expect(handlers().size).toBe(0);
	});

	it("cancel posts 'cancel', settles on 'cancelled', deletes handler, and ignores a late 'done'", async () => {
		const onDone = vi.fn();
		const onError = vi.fn();
		adapter.runQuery("q3", "SELECT 1", vi.fn(), onDone, onError);
		await flush();

		adapter.cancel("q3");
		expect(created!.sentTypes()).toContain("cancel");

		// Worker acknowledges the cancel.
		created!.emit({ type: "cancelled", id: "q3" });
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "cancelled" }));
		expect(handlers().size).toBe(0);

		// A 'done' arriving afterwards (the run loop's finally) must be a no-op —
		// the handler is gone, so it can't double-settle the generator.
		created!.emit({ type: "done", id: "q3" });
		expect(onDone).not.toHaveBeenCalled();
	});

	it("ACKs delivered chunks so the worker's backpressure can advance", async () => {
		adapter.runQuery("q4", "SELECT 1", vi.fn(), vi.fn());
		await flush();
		created!.sent.length = 0; // ignore the 'run' message

		created!.emit(jsonChunk("q4", [{ a: 1 }]));
		expect(created!.sentTypes()).toContain("ack");
	});
});
