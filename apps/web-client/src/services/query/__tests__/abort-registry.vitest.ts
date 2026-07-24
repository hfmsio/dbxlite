/**
 * Unit tests for InMemoryAbortRegistry (WS-A / A2).
 */

import { describe, expect, it } from "vitest";
import { InMemoryAbortRegistry } from "../abort-registry";

describe("InMemoryAbortRegistry", () => {
	it("starts empty", () => {
		expect(new InMemoryAbortRegistry().size).toBe(0);
	});

	it("tracks a registered query", () => {
		const registry = new InMemoryAbortRegistry();

		const controller = registry.register("q1");

		expect(registry.size).toBe(1);
		expect(controller.signal.aborted).toBe(false);
	});

	it("hands each query its own controller", () => {
		const registry = new InMemoryAbortRegistry();

		const a = registry.register("q1");
		const b = registry.register("q2");

		expect(a).not.toBe(b);
		expect(registry.size).toBe(2);
	});

	it("stops tracking a released query without aborting it", () => {
		const registry = new InMemoryAbortRegistry();
		const controller = registry.register("q1");

		registry.release("q1");

		expect(registry.size).toBe(0);
		expect(controller.signal.aborted).toBe(false);
	});

	it("aborts and forgets a cancelled query", () => {
		const registry = new InMemoryAbortRegistry();
		const controller = registry.register("q1");

		registry.cancel("q1");

		expect(controller.signal.aborted).toBe(true);
		expect(registry.size).toBe(0);
	});

	it("ignores cancellation of an unknown query", () => {
		const registry = new InMemoryAbortRegistry();

		expect(() => registry.cancel("nope")).not.toThrow();
		expect(registry.size).toBe(0);
	});

	it("leaves other queries running when one is cancelled", () => {
		const registry = new InMemoryAbortRegistry();
		const a = registry.register("q1");
		const b = registry.register("q2");

		registry.cancel("q1");

		expect(a.signal.aborted).toBe(true);
		expect(b.signal.aborted).toBe(false);
		expect(registry.size).toBe(1);
	});

	it("aborts every tracked query on cancelAll", () => {
		const registry = new InMemoryAbortRegistry();
		const controllers = ["q1", "q2", "q3"].map((id) => registry.register(id));

		registry.cancelAll();

		expect(controllers.every((c) => c.signal.aborted)).toBe(true);
		expect(registry.size).toBe(0);
	});

	it("tolerates cancelAll on an empty registry", () => {
		const registry = new InMemoryAbortRegistry();

		expect(() => registry.cancelAll()).not.toThrow();
	});

	it("replaces the controller when the same id is registered twice", () => {
		const registry = new InMemoryAbortRegistry();
		const first = registry.register("q1");
		const second = registry.register("q1");

		registry.cancelAll();

		expect(registry.size).toBe(0);
		expect(second.signal.aborted).toBe(true);
		// The displaced controller is no longer tracked, so cancelAll cannot
		// reach it — callers must release before re-registering an id.
		expect(first.signal.aborted).toBe(false);
	});
});
