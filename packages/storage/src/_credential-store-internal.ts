/**
 * Internal: plaintext localStorage adapter for credential persistence.
 *
 * NOT EXPORTED from the package. App code should use
 * `EncryptedCredentialStore` (re-exported from index.ts) which wraps
 * this class with AES-GCM encryption.
 *
 * The class is preserved as the byte-level adapter under the hood —
 * removing it entirely would require also rewriting
 * `EncryptedCredentialStore` to talk to localStorage directly. The
 * indirection is fine; the export was the problem.
 */
import type { CredentialStoreLike } from "./types";

export class CredentialStore implements CredentialStoreLike {
	constructor() {}

	async save(id: string, payload: unknown): Promise<void> {
		if (payload == null) {
			localStorage.removeItem("cred:" + id);
			return;
		}
		localStorage.setItem("cred:" + id, JSON.stringify(payload));
	}

	async load(id: string): Promise<unknown> {
		const x = localStorage.getItem("cred:" + id);
		if (!x) return null;
		try {
			return JSON.parse(x);
		} catch (_e) {
			return null;
		}
	}

	listKeys(): string[] {
		const res: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith("cred:")) res.push(k.slice("cred:".length));
		}
		return res;
	}
}
