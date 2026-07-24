/**
 * Unit tests for usePermissionRecheck.
 *
 * Covers the trigger set the FS-permission pollers were replaced with
 * (WS-B / B1 in docs/REFACTOR-PLAN.md): immediate run, visibilitychange,
 * focus, slow safety poll, and full teardown.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PERMISSION_SAFETY_POLL_MS,
	usePermissionRecheck,
} from "../usePermissionRecheck";

/** Drive jsdom's document.visibilityState, which is otherwise read-only. */
function setVisibility(state: DocumentVisibilityState) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
}

describe("usePermissionRecheck", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setVisibility("visible");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs the check immediately on mount", () => {
		const recheck = vi.fn();

		renderHook(() => usePermissionRecheck(recheck));

		expect(recheck).toHaveBeenCalledTimes(1);
	});

	it("re-runs when the tab becomes visible", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck));
		recheck.mockClear();

		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(recheck).toHaveBeenCalledTimes(1);
	});

	it("ignores visibilitychange when the tab is being hidden", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck));
		recheck.mockClear();

		setVisibility("hidden");
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(recheck).not.toHaveBeenCalled();
	});

	it("re-runs when the window regains focus", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck));
		recheck.mockClear();

		act(() => {
			window.dispatchEvent(new Event("focus"));
		});

		expect(recheck).toHaveBeenCalledTimes(1);
	});

	it("re-runs on the slow safety poll", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck));
		recheck.mockClear();

		act(() => {
			vi.advanceTimersByTime(PERMISSION_SAFETY_POLL_MS);
		});

		expect(recheck).toHaveBeenCalledTimes(1);

		act(() => {
			vi.advanceTimersByTime(PERMISSION_SAFETY_POLL_MS);
		});

		expect(recheck).toHaveBeenCalledTimes(2);
	});

	it("polls far less often than the 5s interval it replaced", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck));
		recheck.mockClear();

		act(() => {
			vi.advanceTimersByTime(5_000);
		});

		expect(recheck).not.toHaveBeenCalled();
	});

	it("honors a custom safety poll interval", () => {
		const recheck = vi.fn();
		renderHook(() => usePermissionRecheck(recheck, 1_000));
		recheck.mockClear();

		act(() => {
			vi.advanceTimersByTime(1_000);
		});

		expect(recheck).toHaveBeenCalledTimes(1);
	});

	it("re-runs when the check identity changes", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ fn }) => usePermissionRecheck(fn),
			{ initialProps: { fn: first } },
		);

		expect(first).toHaveBeenCalledTimes(1);

		rerender({ fn: second });

		expect(second).toHaveBeenCalledTimes(1);
		expect(first).toHaveBeenCalledTimes(1);
	});

	it("does not re-run when the check identity is stable", () => {
		const recheck = vi.fn();
		const { rerender } = renderHook(() => usePermissionRecheck(recheck));

		rerender();
		rerender();

		expect(recheck).toHaveBeenCalledTimes(1);
	});

	it("removes every listener and timer on unmount", () => {
		const recheck = vi.fn();
		const { unmount } = renderHook(() => usePermissionRecheck(recheck));

		unmount();
		recheck.mockClear();

		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(new Event("focus"));
			vi.advanceTimersByTime(PERMISSION_SAFETY_POLL_MS * 3);
		});

		expect(recheck).not.toHaveBeenCalled();
	});
});
