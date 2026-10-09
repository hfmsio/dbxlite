import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/filePickerSupport", () => ({
	canUseFilePicker: () => false, // the embedded / unsupported case
	canUseSavePicker: () => false,
	canUseDirectoryPicker: () => false,
}));

import { openDataFiles } from "../file-service";

/**
 * The fallback runs wherever the File System Access picker cannot: Firefox,
 * Safari, and any page embedded cross-origin. It must hand DuckDB the File
 * object rather than the file's bytes, or a file larger than memory stops
 * being queryable on exactly the browsers that need the fallback.
 */
function stubFileInput(files: File[]) {
	const input = {
		type: "",
		accept: "",
		multiple: false,
		onchange: null as ((e: unknown) => void) | null,
		click() {
			this.onchange?.({ target: { files } });
		},
	};
	vi.spyOn(document, "createElement").mockReturnValue(
		input as unknown as HTMLElement,
	);
	return input;
}

beforeEach(() => vi.restoreAllMocks());

describe("openDataFiles without a picker", () => {
	it("passes the File through and does not read its bytes", async () => {
		const file = new File(["a,b\n1,2\n"], "big.csv", { type: "text/csv" });
		const readBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
		Object.defineProperty(file, "arrayBuffer", { value: readBytes });
		stubFileInput([file]);

		const [info] = await openDataFiles();

		expect(info.name).toBe("big.csv");
		expect(info.file).toBe(file);
		// Empty placeholder, exactly as the picker path leaves it.
		expect(info.buffer.byteLength).toBe(0);
		expect(readBytes).not.toHaveBeenCalled();
	});

	it("still buffers xlsx, whose reader seeks across the archive", async () => {
		const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "s.xlsx");
		const readBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(4)));
		Object.defineProperty(file, "arrayBuffer", { value: readBytes });
		stubFileInput([file]);

		await openDataFiles();

		expect(readBytes).toHaveBeenCalled();
	});

	it("returns nothing when the person cancels", async () => {
		stubFileInput([]);

		await expect(openDataFiles()).resolves.toEqual([]);
	});
});
