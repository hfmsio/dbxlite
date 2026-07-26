/**
 * Tests for the main-thread OPFS helpers.
 *
 * The worker-side OPFS I/O can't run headlessly, but the browser→disk copy
 * glue here can: it just needs a navigator.storage stub and web streams
 * (present in the Node test runtime).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	opfsExportName,
	removeOpfsFile,
	streamOpfsFileToWritable,
} from "../opfsExport";

/** A File-like object whose stream() yields the given chunks. */
function fakeFile(chunks: Uint8Array[]) {
	const size = chunks.reduce((n, c) => n + c.byteLength, 0);
	return {
		size,
		stream() {
			return new ReadableStream<Uint8Array>({
				start(controller) {
					for (const c of chunks) controller.enqueue(c);
					controller.close();
				},
			});
		},
	};
}

/** A writable that records everything written to it. */
function fakeWritable() {
	const written: Uint8Array[] = [];
	const stream = new WritableStream<Uint8Array>({
		write(chunk) {
			written.push(chunk);
		},
	}) as unknown as FileSystemWritableFileStream;
	return { stream, written };
}

/** Install a navigator.storage OPFS stub backed by an in-memory map. */
function installOpfs(files: Map<string, ReturnType<typeof fakeFile>>) {
	const removed: string[] = [];
	const root = {
		getFileHandle: async (name: string) => {
			const file = files.get(name);
			if (!file) throw new DOMException("NotFound", "NotFoundError");
			return { getFile: async () => file };
		},
		removeEntry: async (name: string) => {
			if (!files.has(name)) throw new DOMException("NotFound", "NotFoundError");
			files.delete(name);
			removed.push(name);
		},
	};
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { storage: { getDirectory: async () => root } },
	});
	return { removed };
}

describe("opfsExportName", () => {
	it("is unique across calls", () => {
		const a = opfsExportName("bigquery");
		const b = opfsExportName("bigquery");
		expect(a).not.toBe(b);
	});

	it("carries the seed and a .parquet extension", () => {
		expect(opfsExportName("snowflake")).toMatch(/snowflake.*\.parquet$/);
	});
});

describe("streamOpfsFileToWritable", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("copies the whole file to the writable", async () => {
		const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
		installOpfs(new Map([["f.parquet", fakeFile(chunks)]]));
		const { stream, written } = fakeWritable();

		const total = await streamOpfsFileToWritable("f.parquet", stream);

		expect(total).toBe(5);
		expect(Array.from(written.flatMap((c) => Array.from(c)))).toEqual([
			1, 2, 3, 4, 5,
		]);
	});

	it("reports byte progress as it streams", async () => {
		installOpfs(
			new Map([
				["f.parquet", fakeFile([new Uint8Array([1, 2]), new Uint8Array([3])])],
			]),
		);
		const { stream } = fakeWritable();
		const progress: Array<[number, number]> = [];

		await streamOpfsFileToWritable("f.parquet", stream, (w, t) =>
			progress.push([w, t]),
		);

		expect(progress).toEqual([
			[2, 3],
			[3, 3],
		]);
	});
});

describe("removeOpfsFile", () => {
	it("removes the scratch file", async () => {
		const files = new Map([["f.parquet", fakeFile([new Uint8Array([1])])]]);
		const { removed } = installOpfs(files);

		await removeOpfsFile("f.parquet");

		expect(removed).toEqual(["f.parquet"]);
		expect(files.has("f.parquet")).toBe(false);
	});

	it("never throws when the file is already gone", async () => {
		installOpfs(new Map());

		await expect(removeOpfsFile("missing.parquet")).resolves.toBeUndefined();
	});

	it("never throws when OPFS is unavailable", async () => {
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: {},
		});

		await expect(removeOpfsFile("x.parquet")).resolves.toBeUndefined();
	});
});
