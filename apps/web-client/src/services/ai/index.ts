/**
 * AI Service - Barrel Exports
 */

import { CredentialStore } from "@ide/storage";

export {
	getAllProviderTypes,
	getCredentialKey,
	getDefaultModel,
	getDefaultProvider,
	getProvider,
} from "./provider-registry";
export { buildSystemPrompt } from "./system-prompt";
export type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIProviderType,
	AIStreamChunk,
	ChatMessage,
	SQLBlock,
} from "./types";

/**
 * Obfuscated credential store for AI API keys.
 * Wraps CredentialStore with AES-GCM encryption using a device-bound key.
 * Prevents casual reading of plaintext API keys from localStorage,
 * but note this is NOT protection against a determined attacker with
 * full access to the browser (the key is stored in IndexedDB).
 */
class ObfuscatedCredentialStore {
	private store = new CredentialStore();
	private keyPromise: Promise<CryptoKey> | null = null;

	private async getDeviceKey(): Promise<CryptoKey> {
		if (!this.keyPromise) {
			this.keyPromise = this.loadOrCreateKey();
		}
		return this.keyPromise;
	}

	private async loadOrCreateKey(): Promise<CryptoKey> {
		// Try to load existing key from IndexedDB
		const stored = await this.idbGet("dbxlite-device-key");
		if (stored) {
			return crypto.subtle.importKey("raw", stored, "AES-GCM", false, [
				"encrypt",
				"decrypt",
			]);
		}
		// Generate a new random key and persist it
		const key = await crypto.subtle.generateKey(
			{ name: "AES-GCM", length: 256 },
			true,
			["encrypt", "decrypt"],
		);
		const exported = await crypto.subtle.exportKey("raw", key);
		await this.idbSet("dbxlite-device-key", new Uint8Array(exported));
		return key;
	}

	private idbGet(key: string): Promise<Uint8Array | null> {
		return new Promise((resolve) => {
			try {
				const req = indexedDB.open("dbxlite-keys", 1);
				req.onupgradeneeded = () => {
					req.result.createObjectStore("keys");
				};
				req.onsuccess = () => {
					const tx = req.result.transaction("keys", "readonly");
					const get = tx.objectStore("keys").get(key);
					get.onsuccess = () => resolve(get.result || null);
					get.onerror = () => resolve(null);
				};
				req.onerror = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
	}

	private idbSet(key: string, value: Uint8Array): Promise<void> {
		return new Promise((resolve) => {
			try {
				const req = indexedDB.open("dbxlite-keys", 1);
				req.onupgradeneeded = () => {
					req.result.createObjectStore("keys");
				};
				req.onsuccess = () => {
					const tx = req.result.transaction("keys", "readwrite");
					tx.objectStore("keys").put(value, key);
					tx.oncomplete = () => resolve();
					tx.onerror = () => resolve();
				};
				req.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	}

	async save(id: string, payload: unknown): Promise<void> {
		if (payload == null) {
			return this.store.save(id, null);
		}
		try {
			const key = await this.getDeviceKey();
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const encoded = new TextEncoder().encode(JSON.stringify(payload));
			const encrypted = await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv },
				key,
				encoded,
			);
			// Store as base64: iv + ciphertext
			const combined = new Uint8Array(iv.length + encrypted.byteLength);
			combined.set(iv);
			combined.set(new Uint8Array(encrypted), iv.length);
			return this.store.save(id, btoa(String.fromCharCode(...combined)));
		} catch {
			// Fallback to plain storage if crypto fails
			return this.store.save(id, payload);
		}
	}

	async load(id: string): Promise<unknown> {
		const raw = await this.store.load(id);
		if (!raw) return null;

		// If it's a string that looks like base64 (our encrypted format), decrypt
		if (typeof raw === "string" && raw.length > 24) {
			try {
				const key = await this.getDeviceKey();
				const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
				const iv = combined.slice(0, 12);
				const ciphertext = combined.slice(12);
				const decrypted = await crypto.subtle.decrypt(
					{ name: "AES-GCM", iv },
					key,
					ciphertext,
				);
				return JSON.parse(new TextDecoder().decode(decrypted));
			} catch {
				// Could be a legacy plaintext value, return as-is
				return raw;
			}
		}

		// Legacy plaintext value
		return raw;
	}
}

/** Shared credential store singleton for AI API keys (encrypted at rest) */
export const aiCredentialStore = new ObfuscatedCredentialStore();
