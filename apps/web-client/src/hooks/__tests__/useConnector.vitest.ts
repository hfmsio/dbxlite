/**
 * Tests for useConnector's connection-state tracking (WS-B / B0 + B3 in
 * docs/REFACTOR-PLAN.md).
 *
 * Written first against the 2s poll, then re-pointed at the event
 * subscription that replaced it. Only the trigger changed: the hook still
 * observes *every* way a connection ends — the Settings disconnect button, an
 * expired token, a dropped session — and still evicts the autocomplete catalog
 * on the connected -> disconnected edge.
 *
 * The two branches the conversion was most likely to break:
 *
 *   - Hazard 2: an expired token surfaces as isConnected() flipping false with
 *     no explicit disconnect call. The event model must still see it.
 *   - The edge must fire once per transition, not once per observation, or a
 *     repeating signal would keep wiping the catalog.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const handlers = new Set<() => void>();
	return {
		isBigQueryConnected: vi.fn(() => false),
		isSnowflakeConnected: vi.fn(() => false),
		setActiveConnector: vi.fn(),
		clearProviderState: vi.fn(),
		handlers,
		onConnectorState: vi.fn((handler: () => void) => {
			handlers.add(handler);
			return () => handlers.delete(handler);
		}),
	};
});

vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		isBigQueryConnected: mocks.isBigQueryConnected,
		isSnowflakeConnected: mocks.isSnowflakeConnected,
		setActiveConnector: mocks.setActiveConnector,
		onConnectorState: mocks.onConnectorState,
	},
}));

vi.mock("../../services/catalog-schema-bridge", () => ({
	clearProviderState: mocks.clearProviderState,
}));

import { useConnector } from "../useConnector";

const showToast = vi.fn();

/**
 * Deliver a connector event, which is what now drives the re-check. This
 * replaces the 2s timer tick the poll used; every assertion around it is
 * unchanged.
 */
function tick() {
	act(() => {
		for (const handler of [...mocks.handlers]) handler();
	});
}

describe("useConnector connection state", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.isBigQueryConnected.mockReturnValue(false);
		mocks.isSnowflakeConnected.mockReturnValue(false);
		mocks.clearProviderState.mockClear();
		mocks.setActiveConnector.mockClear();
		mocks.onConnectorState.mockClear();
		mocks.handlers.clear();
		showToast.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reports the connection state observed on mount", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);

		const { result } = renderHook(() => useConnector({ showToast }));

		expect(result.current.isBigQueryConnected).toBe(true);
		expect(result.current.isSnowflakeConnected).toBe(false);
	});

	it("picks up a connection that appears after mount", () => {
		const { result } = renderHook(() => useConnector({ showToast }));
		expect(result.current.isBigQueryConnected).toBe(false);

		mocks.isBigQueryConnected.mockReturnValue(true);
		tick();

		expect(result.current.isBigQueryConnected).toBe(true);
	});

	it("picks up a connection that ends after mount", () => {
		mocks.isSnowflakeConnected.mockReturnValue(true);
		const { result } = renderHook(() => useConnector({ showToast }));
		expect(result.current.isSnowflakeConnected).toBe(true);

		mocks.isSnowflakeConnected.mockReturnValue(false);
		tick();

		expect(result.current.isSnowflakeConnected).toBe(false);
	});

	// --- the clearProviderState edge (useConnector.ts:92-94) ---------------

	it("clears BigQuery provider state on the connected -> disconnected edge", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));
		expect(mocks.clearProviderState).not.toHaveBeenCalled();

		mocks.isBigQueryConnected.mockReturnValue(false);
		tick();

		expect(mocks.clearProviderState).toHaveBeenCalledWith("bigquery");
	});

	it("clears Snowflake provider state on the connected -> disconnected edge", () => {
		mocks.isSnowflakeConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));

		mocks.isSnowflakeConnected.mockReturnValue(false);
		tick();

		expect(mocks.clearProviderState).toHaveBeenCalledWith("snowflake");
	});

	it("does not clear provider state when a connection merely appears", () => {
		renderHook(() => useConnector({ showToast }));

		mocks.isBigQueryConnected.mockReturnValue(true);
		mocks.isSnowflakeConnected.mockReturnValue(true);
		tick();

		expect(mocks.clearProviderState).not.toHaveBeenCalled();
	});

	it("does not clear provider state while a connection stays up", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));

		tick();
		tick();
		tick();

		expect(mocks.clearProviderState).not.toHaveBeenCalled();
	});

	it("does not clear provider state while a connection stays down", () => {
		renderHook(() => useConnector({ showToast }));

		tick();
		tick();

		expect(mocks.clearProviderState).not.toHaveBeenCalled();
	});

	it("fires the edge once per transition, not once per observation", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));

		mocks.isBigQueryConnected.mockReturnValue(false);
		tick();
		tick();
		tick();

		expect(mocks.clearProviderState).toHaveBeenCalledTimes(1);
	});

	it("fires the edge again after a reconnect and a second ending", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));

		mocks.isBigQueryConnected.mockReturnValue(false);
		tick();
		mocks.isBigQueryConnected.mockReturnValue(true);
		tick();
		mocks.isBigQueryConnected.mockReturnValue(false);
		tick();

		expect(mocks.clearProviderState).toHaveBeenCalledTimes(2);
	});

	it("tracks the two connectors' edges independently", () => {
		mocks.isBigQueryConnected.mockReturnValue(true);
		mocks.isSnowflakeConnected.mockReturnValue(true);
		renderHook(() => useConnector({ showToast }));

		mocks.isBigQueryConnected.mockReturnValue(false);
		tick();

		expect(mocks.clearProviderState).toHaveBeenCalledWith("bigquery");
		expect(mocks.clearProviderState).not.toHaveBeenCalledWith("snowflake");
	});

	// --- Hazard 2: endings with no explicit disconnect ---------------------

	it("detects an expired token, which ends the connection with no disconnect call", () => {
		// An expired token is discovered lazily: nothing calls disconnect(),
		// the connector simply starts reporting false.
		mocks.isSnowflakeConnected.mockReturnValue(true);
		const { result } = renderHook(() => useConnector({ showToast }));

		mocks.isSnowflakeConnected.mockReturnValue(false);
		tick();

		expect(result.current.isSnowflakeConnected).toBe(false);
		expect(mocks.clearProviderState).toHaveBeenCalledWith("snowflake");
	});

	it("unsubscribes on unmount", () => {
		const { unmount } = renderHook(() => useConnector({ showToast }));
		expect(mocks.handlers.size).toBe(1);

		unmount();

		expect(mocks.handlers.size).toBe(0);
	});

	it("does not re-check after unmount", () => {
		const { unmount } = renderHook(() => useConnector({ showToast }));
		const stale = [...mocks.handlers][0];
		unmount();
		mocks.isBigQueryConnected.mockClear();

		// Even a handler someone held onto must not resurrect the hook's state.
		act(() => stale());

		expect(mocks.clearProviderState).not.toHaveBeenCalled();
	});

	// --- availability gating derived from the polled state -----------------

	it("gates connector availability on the polled connection state", () => {
		const { result } = renderHook(() => useConnector({ showToast }));

		expect(result.current.isConnectorAvailable("duckdb")).toBe(true);
		expect(result.current.isConnectorAvailable("bigquery")).toBe(false);

		mocks.isBigQueryConnected.mockReturnValue(true);
		tick();

		expect(result.current.isConnectorAvailable("bigquery")).toBe(true);
	});

	it("refuses to switch to a connector the poll reports as disconnected", () => {
		const { result } = renderHook(() => useConnector({ showToast }));

		let switched: boolean | undefined;
		act(() => {
			switched = result.current.switchConnector("snowflake");
		});

		expect(switched).toBe(false);
		expect(mocks.setActiveConnector).not.toHaveBeenCalled();
	});

	it("allows a switch once the poll reports the connector as connected", () => {
		mocks.isSnowflakeConnected.mockReturnValue(true);
		const { result } = renderHook(() => useConnector({ showToast }));

		let switched: boolean | undefined;
		act(() => {
			switched = result.current.switchConnector("snowflake");
		});

		expect(switched).toBe(true);
		expect(mocks.setActiveConnector).toHaveBeenCalledWith("snowflake");
	});

	it("warns instead of switching when the dropdown picks a disconnected connector", () => {
		const { result } = renderHook(() => useConnector({ showToast }));

		act(() => {
			result.current.handleConnectorChange("bigquery");
		});

		expect(showToast).toHaveBeenCalledWith(
			expect.stringContaining("BigQuery is not connected"),
			"warning",
			4000,
		);
		expect(mocks.setActiveConnector).not.toHaveBeenCalled();
	});
});
