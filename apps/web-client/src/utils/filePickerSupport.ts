/**
 * Whether the File System Access pickers can actually be called here.
 *
 * `"showOpenFilePicker" in window` is not the question. Chrome exposes the
 * function inside a cross-origin iframe and then throws
 * `SecurityError: Cross origin sub frames aren't allowed to show a file
 * picker` when it is called, so a presence test sends the caller down the
 * picker path and the fallback never runs.
 *
 * Reading `window.top.location` throws on a cross-origin parent and succeeds
 * at the top level and in a same-origin frame, which is exactly the boundary
 * Chrome enforces. Framing alone is the wrong test: a same-origin frame may
 * use the pickers.
 */

function topWindowIsReachable(): boolean {
	try {
		// Throws a DOMException when the parent is cross-origin.
		void window.top?.location.href;
		return true;
	} catch {
		return false;
	}
}

function pickerUsable(name: keyof Window): boolean {
	if (typeof window === "undefined") return false;
	if (typeof window[name] !== "function") return false;
	return topWindowIsReachable();
}

/** `showOpenFilePicker` is present and callable. */
export function canUseFilePicker(): boolean {
	return pickerUsable("showOpenFilePicker" as keyof Window);
}

/** `showSaveFilePicker` is present and callable. */
export function canUseSavePicker(): boolean {
	return pickerUsable("showSaveFilePicker" as keyof Window);
}

/** `showDirectoryPicker` is present and callable. */
export function canUseDirectoryPicker(): boolean {
	return pickerUsable("showDirectoryPicker" as keyof Window);
}

/**
 * True when the pickers are blocked only because the page is embedded
 * cross-origin. Lets the UI explain the downgrade rather than silently
 * offering less.
 */
export function pickersBlockedByEmbedding(): boolean {
	if (typeof window === "undefined") return false;
	return (
		typeof window.showOpenFilePicker === "function" && !topWindowIsReachable()
	);
}
