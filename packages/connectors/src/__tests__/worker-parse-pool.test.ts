import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerParsePool } from "../connector-utils";

// A controllable stand-in for a real Worker. Tests drive replies and crashes
// by calling reply()/crash() directly; postMessage/terminate are spies.
class FakeWorker {
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	postMessage = vi.fn();
	terminate = vi.fn();

	/** Simulate the worker posting a reply for a given request id. */
	reply(id: string, payload: Record<string, unknown>): void {
		this.onmessage?.({ data: { id, ...payload } });
	}

	/** The id the pool tagged the most recent postMessage with. */
	get lastId(): string {
		return (this.postMessage.mock.calls.at(-1)?.[0] as { id: string }).id;
	}

	crash(err: unknown = new Error("worker boom")): void {
		this.onerror?.(err);
	}
}

type Req = { type: "parse"; n: number };
type Res = { id: string; doubled: number };

describe("WorkerParsePool", () => {
	let fake: FakeWorker;
	let factory: () => Worker;
	let fallback: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fake = new FakeWorker();
		// typeof Worker must be defined for the pool to attempt the worker path.
		vi.stubGlobal("Worker", FakeWorker);
		factory = vi.fn(() => fake as unknown as Worker);
		fallback = vi.fn((req: Req) => ({ id: "fb", doubled: req.n * 2 }));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const makePool = (timeoutMs?: number) =>
		new WorkerParsePool<Req, Res>(
			factory,
			fallback as unknown as (req: Req) => Res,
			undefined,
			timeoutMs,
		);

	it("resolves with the worker's reply on the happy path", async () => {
		const pool = makePool();
		const p = pool.send({ type: "parse", n: 21 });

		expect(fake.postMessage).toHaveBeenCalledTimes(1);
		fake.reply(fake.lastId, { doubled: 42 });

		await expect(p).resolves.toMatchObject({ doubled: 42 });
		expect(fallback).not.toHaveBeenCalled();
	});

	it("reparses an in-flight request on the main thread when the worker errors (no hang)", async () => {
		const pool = makePool();
		const p = pool.send({ type: "parse", n: 5 });

		// Worker dies before replying — the old code left this pending forever.
		fake.crash();

		await expect(p).resolves.toEqual({ id: "fb", doubled: 10 });
		expect(fallback).toHaveBeenCalledWith({ type: "parse", n: 5 });
		expect(fake.terminate).toHaveBeenCalled();
	});

	it("stays on the main thread after a runtime error instead of rebuilding the worker", async () => {
		const pool = makePool();
		const first = pool.send({ type: "parse", n: 1 });
		fake.crash();
		await first;

		vi.mocked(factory).mockClear();

		// Next request must not construct a new worker; it goes straight to fallback.
		await expect(pool.send({ type: "parse", n: 4 })).resolves.toEqual({
			id: "fb",
			doubled: 8,
		});
		expect(factory).not.toHaveBeenCalled();
	});

	it("settles in-flight requests via fallback on terminate(), and can rebuild afterwards", async () => {
		const pool = makePool();
		const p = pool.send({ type: "parse", n: 7 });

		pool.terminate();
		await expect(p).resolves.toEqual({ id: "fb", doubled: 14 });
		expect(fake.terminate).toHaveBeenCalled();

		// terminate() is a disconnect, not a failure, so the pool is not
		// disabled: a fresh send builds a new worker.
		vi.mocked(factory).mockClear();
		const p2 = pool.send({ type: "parse", n: 9 });
		expect(factory).toHaveBeenCalledTimes(1);
		fake.reply(fake.lastId, { doubled: 18 });
		await expect(p2).resolves.toMatchObject({ doubled: 18 });
	});

	it("falls back to the main thread when a request times out", async () => {
		vi.useFakeTimers();
		const pool = makePool(1000);
		const p = pool.send({ type: "parse", n: 3 });

		// Worker never replies. Before the timeout: still pending.
		await vi.advanceTimersByTimeAsync(999);
		expect(fallback).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2);
		await expect(p).resolves.toEqual({ id: "fb", doubled: 6 });
		// A late reply after fallback must not double-settle or throw.
		expect(() => fake.reply(fake.lastId, { doubled: 6 })).not.toThrow();
	});

	it("clears the timeout when the worker replies in time", async () => {
		vi.useFakeTimers();
		const pool = makePool(1000);
		const p = pool.send({ type: "parse", n: 2 });
		fake.reply(fake.lastId, { doubled: 4 });
		await expect(p).resolves.toMatchObject({ doubled: 4 });

		// Timer was cleared, so advancing past it triggers no fallback.
		await vi.advanceTimersByTimeAsync(2000);
		expect(fallback).not.toHaveBeenCalled();
	});

	it("uses the main thread when there is no Worker global, permanently", async () => {
		vi.stubGlobal("Worker", undefined);
		const pool = makePool();

		await expect(pool.send({ type: "parse", n: 6 })).resolves.toEqual({
			id: "fb",
			doubled: 12,
		});
		// Sticky: the factory is never even consulted again.
		expect(factory).not.toHaveBeenCalled();
	});

	it("falls back when worker construction throws", async () => {
		factory = vi.fn(() => {
			throw new Error("construction failed");
		});
		const pool = makePool();

		await expect(pool.send({ type: "parse", n: 8 })).resolves.toEqual({
			id: "fb",
			doubled: 16,
		});
		vi.mocked(factory).mockClear();
		await pool.send({ type: "parse", n: 8 });
		expect(factory).not.toHaveBeenCalled(); // sticky
	});

	it("rejects (does not hang) when the main-thread fallback itself throws", async () => {
		// Genuinely unparseable data: the worker crashes AND the main-thread
		// reparse throws. The request must reject with that error, surfacing the
		// failure the pre-worker code would have thrown synchronously.
		fallback.mockImplementation(() => {
			throw new Error("bad STRUCT");
		});
		const pool = makePool();
		const p = pool.send({ type: "parse", n: 5 });
		fake.crash();

		await expect(p).rejects.toThrow("bad STRUCT");
	});
});
