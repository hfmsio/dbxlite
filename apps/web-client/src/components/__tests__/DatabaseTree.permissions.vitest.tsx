/**
 * Characterization tests for DatabaseTree's File System Access permission check.
 *
 * These pin the *current* behavior of the permission re-check loop (WS-B / B0 in
 * docs/REFACTOR-PLAN.md) so the poller can be swapped for an event-driven
 * re-check without user-visible drift. Everything except the *trigger* is
 * behavior we must preserve: the per-database iteration, the read-the-file
 * probe, the changed-only update rule, and the three failure branches.
 */

import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSION_SAFETY_POLL_MS } from "../../hooks/usePermissionRecheck";
import type { DataSource } from "../../types/data-source";

const mocks = vi.hoisted(() => ({
	getHandle: vi.fn(),
	requestPermission: vi.fn(),
	updateDataSource: vi.fn(),
	removeDataSource: vi.fn(),
}));

vi.mock("../../services/file-handle-store", () => ({
	fileHandleStore: {
		getHandle: mocks.getHandle,
		requestPermission: mocks.requestPermission,
	},
}));

vi.mock("../../stores/dataSourceStore", () => ({
	useUpdateDataSource: () => mocks.updateDataSource,
	useRemoveDataSource: () => mocks.removeDataSource,
}));

import { DatabaseTree } from "../DatabaseTree";

/** A handle whose getFile() resolves — i.e. permission is really granted. */
const readableHandle = () => ({
	handle: { getFile: vi.fn().mockResolvedValue(new Blob()) },
});

/** A handle whose getFile() rejects — cached "granted" but actually revoked. */
const unreadableHandle = () => ({
	handle: { getFile: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
});

const db = (overrides: Partial<DataSource>): DataSource =>
	({
		id: "db-1",
		name: "test.duckdb",
		type: "database",
		hasFileHandle: true,
		permissionStatus: "prompt",
		...overrides,
	}) as DataSource;

/** Render and let the initial (async) permission check settle. */
async function renderTree(databases: DataSource[]) {
	let result!: ReturnType<typeof render>;
	await act(async () => {
		result = render(
			<DatabaseTree databases={databases} onInsertQuery={() => {}} />,
		);
	});
	return result;
}

describe("DatabaseTree permission check", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.getHandle.mockReset();
		mocks.updateDataSource.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks permissions immediately on mount", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderTree([db({ id: "db-1" })]);

		expect(mocks.getHandle).toHaveBeenCalledWith("db-1");
	});

	it("iterates every database with a handle and updates each one", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderTree([
			db({ id: "db-1", permissionStatus: "prompt" }),
			db({ id: "db-2", permissionStatus: "prompt" }),
		]);

		expect(mocks.getHandle).toHaveBeenCalledWith("db-1");
		expect(mocks.getHandle).toHaveBeenCalledWith("db-2");
		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-1", {
			permissionStatus: "granted",
		});
		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-2", {
			permissionStatus: "granted",
		});
	});

	it("skips databases without a file handle", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderTree([db({ id: "db-1", hasFileHandle: false })]);

		expect(mocks.getHandle).not.toHaveBeenCalled();
		expect(mocks.updateDataSource).not.toHaveBeenCalled();
	});

	it("promotes to granted when the file can actually be read", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderTree([db({ id: "db-1", permissionStatus: "prompt" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-1", {
			permissionStatus: "granted",
		});
	});

	it("demotes to prompt when the file can no longer be read", async () => {
		mocks.getHandle.mockResolvedValue(unreadableHandle());

		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-1", {
			permissionStatus: "prompt",
		});
	});

	it("does not update when the status is unchanged", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).not.toHaveBeenCalled();
	});

	it("clears hasFileHandle/isAttached when the stored handle is gone", async () => {
		mocks.getHandle.mockResolvedValue(null);

		await renderTree([
			db({ id: "db-1", permissionStatus: "granted", isAttached: true }),
		]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-1", {
			permissionStatus: "unknown",
			hasFileHandle: false,
			isAttached: false,
		});
	});

	it("marks the source unknown when the handle lookup throws", async () => {
		mocks.getHandle.mockRejectedValue(new Error("IndexedDB unavailable"));

		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("db-1", {
			permissionStatus: "unknown",
		});
	});

	// --- re-check trigger -------------------------------------------------
	// The only part of this behavior B1 changed: the 5s interval became a
	// return-to-tab re-check plus a slow safety poll. Everything above is
	// unchanged from the polling implementation.

	it("re-checks when the tab becomes visible again", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("db-1");
	});

	it("re-checks when the window regains focus", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("db-1");
	});

	it("still re-checks on the slow safety poll", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderTree([db({ id: "db-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(PERMISSION_SAFETY_POLL_MS);
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("db-1");
	});

	it("stops re-checking after unmount", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		const { unmount } = await renderTree([
			db({ id: "db-1", permissionStatus: "granted" }),
		]);

		unmount();
		mocks.getHandle.mockClear();

		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(new Event("focus"));
			await vi.advanceTimersByTimeAsync(PERMISSION_SAFETY_POLL_MS * 2);
		});

		expect(mocks.getHandle).not.toHaveBeenCalled();
	});
});
