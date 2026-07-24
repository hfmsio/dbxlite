/**
 * Unit tests for ConnectorRegistry (WS-A / A7a).
 *
 * The event surface is the part WS-B builds on, so the instance-swap and
 * dedupe behavior is pinned here before any emit point exists.
 */

import { type BaseConnector, ConnectorStateEmitter } from "@ide/connectors";
import { describe, expect, it, vi } from "vitest";
import { ConnectorRegistry } from "../connector-registry";

const conn = (tag = "c") => ({ tag }) as unknown as BaseConnector;

/** A connector that announces its own state, like a real one after B3. */
function emittingConn(tag = "c") {
	const emitter = new ConnectorStateEmitter();
	const connector = {
		tag,
		onStateChange: emitter.onStateChange.bind(emitter),
	} as unknown as BaseConnector;
	return { connector, emitter };
}

describe("ConnectorRegistry", () => {
	describe("membership", () => {
		it("returns null for an empty slot", () => {
			expect(new ConnectorRegistry().get("bigquery")).toBeNull();
		});

		it("stores and retrieves a connector", () => {
			const registry = new ConnectorRegistry();
			const c = conn();

			registry.set("bigquery", c);

			expect(registry.get("bigquery")).toBe(c);
			expect(registry.has("bigquery")).toBe(true);
		});

		it("replaces the occupant on reconnect", () => {
			const registry = new ConnectorRegistry();
			const first = conn("first");
			const second = conn("second");

			registry.set("bigquery", first);
			registry.set("bigquery", second);

			expect(registry.get("bigquery")).toBe(second);
		});

		it("empties the slot on delete", () => {
			const registry = new ConnectorRegistry();
			registry.set("bigquery", conn());

			expect(registry.delete("bigquery")).toBe(true);
			expect(registry.get("bigquery")).toBeNull();
			expect(registry.has("bigquery")).toBe(false);
		});
	});

	describe("active selection", () => {
		it("defaults to duckdb", () => {
			expect(new ConnectorRegistry().getActiveType()).toBe("duckdb");
		});

		it("refuses to activate an empty slot", () => {
			expect(() => new ConnectorRegistry().setActive("bigquery")).toThrow(
				"Connector bigquery not initialized",
			);
		});

		it("activates an occupied slot", () => {
			const registry = new ConnectorRegistry();
			const c = conn();
			registry.set("bigquery", c);

			registry.setActive("bigquery");

			expect(registry.getActiveType()).toBe("bigquery");
			expect(registry.getActive()).toBe(c);
		});

		it("throws when the active slot has been emptied", () => {
			const registry = new ConnectorRegistry();
			registry.set("bigquery", conn());
			registry.setActive("bigquery");

			registry.delete("bigquery");

			expect(() => registry.getActive()).toThrow("No active connector available");
		});
	});

	describe("event surface", () => {
		it("delivers a status change to subscribers", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);

			registry.emitStatus("bigquery", "connected");

			expect(handler).toHaveBeenCalledWith({
				type: "statusChange",
				connector: "bigquery",
				status: "connected",
			});
		});

		it("delivers a session-context change", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const chips = [
				{ icon: "R", label: "Role", value: "SYSADMIN", tooltip: "" },
			];

			registry.emitSessionContext("snowflake", chips);

			expect(handler).toHaveBeenCalledWith({
				type: "sessionContextChange",
				connector: "snowflake",
				context: chips,
			});
		});

		it("stops delivering after unsubscribe", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			const off = registry.onConnectorState(handler);

			off();
			registry.emitStatus("bigquery", "connected");

			expect(handler).not.toHaveBeenCalled();
			expect(registry.listenerCount).toBe(0);
		});

		it("delivers to every subscriber", () => {
			const registry = new ConnectorRegistry();
			const a = vi.fn();
			const b = vi.fn();
			registry.onConnectorState(a);
			registry.onConnectorState(b);

			registry.emitStatus("bigquery", "connected");

			expect(a).toHaveBeenCalledTimes(1);
			expect(b).toHaveBeenCalledTimes(1);
		});

		it("keeps notifying the rest when one subscriber throws", () => {
			const registry = new ConnectorRegistry();
			const bad = vi.fn(() => {
				throw new Error("subscriber blew up");
			});
			const good = vi.fn();
			registry.onConnectorState(bad);
			registry.onConnectorState(good);

			expect(() => registry.emitStatus("bigquery", "connected")).not.toThrow();
			expect(good).toHaveBeenCalledTimes(1);
		});

		it("tolerates a subscriber unsubscribing during dispatch", () => {
			const registry = new ConnectorRegistry();
			const second = vi.fn();
			const off = registry.onConnectorState(() => off());
			registry.onConnectorState(second);

			expect(() => registry.emitStatus("bigquery", "connected")).not.toThrow();
			expect(second).toHaveBeenCalledTimes(1);
		});
	});

	describe("status dedupe", () => {
		it("drops a repeated status", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);

			registry.emitStatus("bigquery", "connected");
			registry.emitStatus("bigquery", "connected");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("delivers a genuine transition", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);

			registry.emitStatus("bigquery", "connected");
			registry.emitStatus("bigquery", "disconnected");

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("dedupes per slot, not globally", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);

			registry.emitStatus("bigquery", "connected");
			registry.emitStatus("snowflake", "connected");

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("does not dedupe session-context events", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const chips = [{ icon: "R", label: "Role", value: "X", tooltip: "" }];

			registry.emitSessionContext("snowflake", chips);
			registry.emitSessionContext("snowflake", chips);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("re-arms the dedupe when the slot is emptied", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);

			registry.emitStatus("bigquery", "connected");
			registry.delete("bigquery");
			registry.emitStatus("bigquery", "connected");

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	it("keeps a subscription alive across a connector instance swap", () => {
		// The whole reason events live on the registry: reconnects build a new
		// connector, and an instance-bound subscription would dangle here.
		const registry = new ConnectorRegistry();
		const handler = vi.fn();
		registry.onConnectorState(handler);

		registry.set("bigquery", conn("first"));
		registry.emitStatus("bigquery", "connected");
		registry.delete("bigquery");
		registry.emitStatus("bigquery", "disconnected");
		registry.set("bigquery", conn("second"));
		registry.emitStatus("bigquery", "connected");

		expect(handler).toHaveBeenCalledTimes(3);
		expect(handler).toHaveBeenLastCalledWith({
			type: "statusChange",
			connector: "bigquery",
			status: "connected",
		});
	});

	describe("forwarding from connector instances", () => {
		it("re-emits a connector's own status on its slot key", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const { connector, emitter } = emittingConn();

			registry.set("snowflake", connector);
			emitter.emit("connected", "connected");

			expect(handler).toHaveBeenCalledWith({
				type: "statusChange",
				connector: "snowflake",
				status: "connected",
				reason: "connected",
			});
		});

		it("carries the reason through to consumers", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const { connector, emitter } = emittingConn();
			registry.set("bigquery", connector);

			emitter.emit("disconnected", "auth");

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({ status: "disconnected", reason: "auth" }),
			);
		});

		it("keeps forwarding after the instance is replaced", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const first = emittingConn("first");
			const second = emittingConn("second");

			registry.set("bigquery", first.connector);
			first.emitter.emit("connected");
			registry.set("bigquery", second.connector);
			second.emitter.emit("disconnected");

			expect(handler).toHaveBeenCalledTimes(2);
			expect(handler).toHaveBeenLastCalledWith(
				expect.objectContaining({
					connector: "bigquery",
					status: "disconnected",
				}),
			);
		});

		it("stops listening to a replaced instance", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const first = emittingConn("first");
			const second = emittingConn("second");

			registry.set("bigquery", first.connector);
			registry.set("bigquery", second.connector);
			// The displaced instance must no longer speak for the live slot.
			first.emitter.emit("connected");

			expect(handler).not.toHaveBeenCalled();
			expect(first.emitter.listenerCount).toBe(0);
		});

		it("stops listening once the slot is emptied", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const { connector, emitter } = emittingConn();

			registry.set("bigquery", connector);
			registry.delete("bigquery");
			emitter.emit("connected");

			expect(handler).not.toHaveBeenCalled();
			expect(emitter.listenerCount).toBe(0);
		});

		it("accepts a connector that emits nothing", () => {
			const registry = new ConnectorRegistry();

			expect(() => registry.set("duckdb", conn())).not.toThrow();
		});

		it("still dedupes across an instance swap", () => {
			const registry = new ConnectorRegistry();
			const handler = vi.fn();
			registry.onConnectorState(handler);
			const first = emittingConn("first");
			const second = emittingConn("second");

			registry.set("bigquery", first.connector);
			first.emitter.emit("connected");
			// A reconnect that lands in the same state should not re-announce.
			registry.set("bigquery", second.connector);
			second.emitter.emit("connected");

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	it("exposes the operating mode", () => {
		const registry = new ConnectorRegistry();

		expect(registry.mode.get()).toBe("wasm");
		expect(registry.mode.isHttp()).toBe(false);
	});
});
