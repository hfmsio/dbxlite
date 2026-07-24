/**
 * Characterization tests for FileList's File System Access permission check.
 *
 * Sibling of DatabaseTree.permissions.vitest.tsx (WS-B / B0 in
 * docs/REFACTOR-PLAN.md). FileList differs from DatabaseTree in two ways that
 * must survive the swap: it also skips remote files, and its missing-handle
 * branch only sets permissionStatus (it does not clear hasFileHandle).
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

import { FileList } from "../FileList";

const readableHandle = () => ({
	handle: { getFile: vi.fn().mockResolvedValue(new Blob()) },
});

const unreadableHandle = () => ({
	handle: { getFile: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
});

const file = (overrides: Partial<DataSource>): DataSource =>
	({
		id: "file-1",
		name: "data.csv",
		type: "file",
		hasFileHandle: true,
		permissionStatus: "prompt",
		...overrides,
	}) as DataSource;

async function renderList(files: DataSource[]) {
	let result!: ReturnType<typeof render>;
	await act(async () => {
		result = render(<FileList files={files} onInsertQuery={() => {}} />);
	});
	return result;
}

describe("FileList permission check", () => {
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

		await renderList([file({ id: "file-1" })]);

		expect(mocks.getHandle).toHaveBeenCalledWith("file-1");
	});

	it("iterates every file with a handle and updates each one", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderList([
			file({ id: "file-1", permissionStatus: "prompt" }),
			file({ id: "file-2", permissionStatus: "prompt" }),
		]);

		expect(mocks.getHandle).toHaveBeenCalledWith("file-1");
		expect(mocks.getHandle).toHaveBeenCalledWith("file-2");
		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-1", {
			permissionStatus: "granted",
		});
		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-2", {
			permissionStatus: "granted",
		});
	});

	it("skips files without a handle and remote files", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderList([
			file({ id: "file-1", hasFileHandle: false }),
			file({ id: "file-2", isRemote: true }),
		]);

		expect(mocks.getHandle).not.toHaveBeenCalled();
		expect(mocks.updateDataSource).not.toHaveBeenCalled();
	});

	it("promotes to granted when the file can actually be read", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderList([file({ id: "file-1", permissionStatus: "prompt" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-1", {
			permissionStatus: "granted",
		});
	});

	it("demotes to prompt when the file can no longer be read", async () => {
		mocks.getHandle.mockResolvedValue(unreadableHandle());

		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-1", {
			permissionStatus: "prompt",
		});
	});

	it("does not update when the status is unchanged", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());

		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).not.toHaveBeenCalled();
	});

	it("marks the file unknown when the stored handle is gone, leaving hasFileHandle alone", async () => {
		mocks.getHandle.mockResolvedValue(null);

		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-1", {
			permissionStatus: "unknown",
		});
	});

	it("marks the file unknown when the handle lookup throws", async () => {
		mocks.getHandle.mockRejectedValue(new Error("IndexedDB unavailable"));

		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);

		expect(mocks.updateDataSource).toHaveBeenCalledWith("file-1", {
			permissionStatus: "unknown",
		});
	});

	// --- re-check trigger -------------------------------------------------
	// The only part of this behavior B1 changed: the 5s interval became a
	// return-to-tab re-check plus a slow safety poll.

	it("re-checks when the tab becomes visible again", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("file-1");
	});

	it("re-checks when the window regains focus", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("file-1");
	});

	it("still re-checks on the slow safety poll", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		await renderList([file({ id: "file-1", permissionStatus: "granted" })]);
		mocks.getHandle.mockClear();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(PERMISSION_SAFETY_POLL_MS);
		});

		expect(mocks.getHandle).toHaveBeenCalledWith("file-1");
	});

	it("stops re-checking after unmount", async () => {
		mocks.getHandle.mockResolvedValue(readableHandle());
		const { unmount } = await renderList([
			file({ id: "file-1", permissionStatus: "granted" }),
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
