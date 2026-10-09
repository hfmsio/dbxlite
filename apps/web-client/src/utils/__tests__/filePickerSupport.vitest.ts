import { afterEach, describe, expect, it, vi } from "vitest";
import {
	canUseDirectoryPicker,
	canUseFilePicker,
	canUseSavePicker,
	pickersBlockedByEmbedding,
} from "../filePickerSupport";

/**
 * The three framing cases, each verified in real Chromium before these tests
 * were written: top level and a same-origin frame may call the pickers; a
 * cross-origin frame has the function but throws on the call.
 */
function framing(kind: "top" | "same-origin" | "cross-origin") {
	const self = window as unknown as Record<string, unknown>;
	if (kind === "top") {
		self.top = window;
		return;
	}
	const parent = {
		get location(): Location {
			if (kind === "cross-origin") {
				throw new DOMException("Blocked a frame", "SecurityError");
			}
			return { href: "http://localhost/" } as Location;
		},
	};
	self.top = parent;
}

function withPickers(present: boolean) {
	const self = window as unknown as Record<string, unknown>;
	for (const name of [
		"showOpenFilePicker",
		"showSaveFilePicker",
		"showDirectoryPicker",
	]) {
		if (present) self[name] = () => Promise.resolve([]);
		else delete self[name];
	}
}

afterEach(() => {
	withPickers(false);
	(window as unknown as Record<string, unknown>).top = window;
	vi.restoreAllMocks();
});

describe("file picker support", () => {
	it("allows the pickers at the top level", () => {
		withPickers(true);
		framing("top");

		expect(canUseFilePicker()).toBe(true);
		expect(canUseSavePicker()).toBe(true);
		expect(canUseDirectoryPicker()).toBe(true);
		expect(pickersBlockedByEmbedding()).toBe(false);
	});

	it("allows the pickers in a same-origin frame", () => {
		withPickers(true);
		framing("same-origin");

		expect(canUseFilePicker()).toBe(true);
		expect(pickersBlockedByEmbedding()).toBe(false);
	});

	it("refuses the pickers in a cross-origin frame even though they exist", () => {
		withPickers(true);
		framing("cross-origin");

		// The bug this guards: a presence test says yes here, and the call throws.
		expect("showOpenFilePicker" in window).toBe(true);
		expect(canUseFilePicker()).toBe(false);
		expect(canUseSavePicker()).toBe(false);
		expect(canUseDirectoryPicker()).toBe(false);
		expect(pickersBlockedByEmbedding()).toBe(true);
	});

	it("refuses when the browser has no pickers at all", () => {
		withPickers(false);
		framing("top");

		expect(canUseFilePicker()).toBe(false);
		// Not an embedding problem, so the UI must not blame the frame.
		expect(pickersBlockedByEmbedding()).toBe(false);
	});
});
