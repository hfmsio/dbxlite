/**
 * Unit tests for DuckDBFileVfs (WS-A / A3).
 *
 * The three connector shapes that matter: a WASM DuckDB connector with the
 * file ops, an HTTP connector without them, and an empty slot.
 */

import type { BaseConnector } from "@ide/connectors";
import { describe, expect, it, vi } from "vitest";
import { DuckDBFileVfs } from "../file-vfs";

/** Keeps the spies visible to assertions; the port only sees a BaseConnector. */
const fileCapable = () => ({
	registerFile: vi.fn().mockResolvedValue(undefined),
	registerFileHandle: vi.fn().mockResolvedValue(undefined),
	copyFileToBuffer: vi.fn().mockResolvedValue(new Uint8Array([7])),
	dropFile: vi.fn().mockResolvedValue(undefined),
});

/** Stands in for DuckDBHttpConnector, which has no file operations. */
const fileIncapable = () => ({ query: vi.fn() });

const vfsFor = (connector: object | null) =>
	new DuckDBFileVfs(() => connector as BaseConnector | null);

describe("DuckDBFileVfs", () => {
	describe("with a file-capable connector", () => {
		it("forwards registerFile", async () => {
			const connector = fileCapable();
			const buffer = new ArrayBuffer(4);

			await vfsFor(connector).registerFile("a.csv", buffer);

			expect(connector.registerFile).toHaveBeenCalledWith("a.csv", buffer);
		});

		it("forwards registerFileHandle", async () => {
			const connector = fileCapable();
			const file = new File(["x"], "a.csv");

			await vfsFor(connector).registerFileHandle("a.csv", file);

			expect(connector.registerFileHandle).toHaveBeenCalledWith("a.csv", file);
		});

		it("returns the buffer from copyFileToBuffer", async () => {
			const connector = fileCapable();

			await expect(vfsFor(connector).copyFileToBuffer("a.db")).resolves.toEqual(
				new Uint8Array([7]),
			);
		});

		it("forwards dropFile", async () => {
			const connector = fileCapable();

			await vfsFor(connector).dropFile("a.db");

			expect(connector.dropFile).toHaveBeenCalledWith("a.db");
		});

		it("propagates a connector-side failure", async () => {
			const connector = fileCapable();
			connector.dropFile.mockRejectedValue(new Error("boom"));

			await expect(vfsFor(connector).dropFile("a.db")).rejects.toThrow("boom");
		});
	});

	describe("with a connector that has no file operations", () => {
		it("silently no-ops registerFile", async () => {
			await expect(
				vfsFor(fileIncapable()).registerFile("a.csv", new ArrayBuffer(1)),
			).resolves.toBeUndefined();
		});

		it("silently no-ops registerFileHandle", async () => {
			await expect(
				vfsFor(fileIncapable()).registerFileHandle(
					"a.csv",
					new File(["x"], "a.csv"),
				),
			).resolves.toBeUndefined();
		});

		it("throws the copy-specific message", async () => {
			await expect(
				vfsFor(fileIncapable()).copyFileToBuffer("a.db"),
			).rejects.toThrow("File copy not supported");
		});

		it("throws the drop-specific message", async () => {
			await expect(vfsFor(fileIncapable()).dropFile("a.db")).rejects.toThrow(
				"File drop not supported by this connector",
			);
		});
	});

	describe("with no connector in the slot", () => {
		it.each([
			["registerFile", (v: DuckDBFileVfs) => v.registerFile("a", new ArrayBuffer(1))],
			[
				"registerFileHandle",
				(v: DuckDBFileVfs) => v.registerFileHandle("a", new File([""], "a")),
			],
			["copyFileToBuffer", (v: DuckDBFileVfs) => v.copyFileToBuffer("a")],
			["dropFile", (v: DuckDBFileVfs) => v.dropFile("a")],
		])("%s reports the connector is not initialized", async (_name, call) => {
			await expect(call(vfsFor(null))).rejects.toThrow(
				"DuckDB connector not initialized",
			);
		});
	});

	it("re-resolves the connector on every call, surviving a reconnect", async () => {
		let current: ReturnType<typeof fileCapable> | null = null;
		const vfs = new DuckDBFileVfs(
			() => current as unknown as BaseConnector | null,
		);

		await expect(vfs.dropFile("a.db")).rejects.toThrow(
			"DuckDB connector not initialized",
		);

		current = fileCapable();
		await vfs.dropFile("a.db");

		expect(current.dropFile).toHaveBeenCalledWith("a.db");
	});
});
