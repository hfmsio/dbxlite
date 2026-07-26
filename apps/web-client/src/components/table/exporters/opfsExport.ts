/**
 * Main-thread OPFS helpers for the streamed export path.
 *
 * The DuckDB worker writes the finished Parquet into an OPFS file (see the
 * worker's opfs_* ops); this side reads that file and streams it to the user's
 * Save-picker destination without ever holding the whole thing in memory —
 * `file.stream().pipeTo(writable)` copies chunk by chunk.
 *
 * OPFS is shared across the window and its workers within an origin, so the
 * file the worker wrote is visible here by name.
 */

/** Unique scratch name per export so concurrent exports never collide. */
export function opfsExportName(seed: string): string {
	// Date.now()+random is fine: this is a scratch filename, not a security token.
	return `__dbxlite_export_${seed}_${Date.now()}_${Math.random()
		.toString(36)
		.slice(2)}.parquet`;
}

/**
 * Stream an OPFS file to a writable (the Save-picker file), then flush it.
 * Reports bytes written so the UI can show progress on a large copy.
 */
export async function streamOpfsFileToWritable(
	opfsName: string,
	writable: FileSystemWritableFileStream,
	onBytes?: (bytesWritten: number, totalBytes: number) => void,
): Promise<number> {
	const root = await navigator.storage.getDirectory();
	const handle = await root.getFileHandle(opfsName);
	const file = await handle.getFile();
	const total = file.size;

	let written = 0;
	// A pass-through that counts bytes as they flow to disk. Keeps memory at
	// one chunk — nothing is accumulated.
	const counter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			written += chunk.byteLength;
			onBytes?.(written, total);
			controller.enqueue(chunk);
		},
	});

	await file.stream().pipeThrough(counter).pipeTo(writable);
	return total;
}

/** Best-effort removal of the scratch OPFS file. Never throws. */
export async function removeOpfsFile(opfsName: string): Promise<void> {
	try {
		const root = await navigator.storage.getDirectory();
		await root.removeEntry(opfsName);
	} catch {
		// Already gone, or OPFS unavailable — nothing to clean up.
	}
}
