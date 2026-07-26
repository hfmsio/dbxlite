/**
 * BackendRegistry (backlog AI-2)
 *
 * Central registry of ChatBackend instances. Replaces the direct
 * `getProvider(type)` calls in aiChatStore. Holds:
 *   - 4 BYO backends, registered at module load (always present in the list,
 *     filtered by isAvailable() per-render)
 *   - Warehouse backends, registered/unregistered by their CatalogProvider
 *     when the underlying connector activates/deactivates (AI-3 wires this in).
 */

import type { BackendRegistry, ChatBackend } from "./types";

class BackendRegistryImpl implements BackendRegistry {
	private backends = new Map<string, ChatBackend>();
	private readonly listeners = new Set<() => void>();

	list(): ChatBackend[] {
		return Array.from(this.backends.values());
	}

	async listAvailable(): Promise<ChatBackend[]> {
		const all = this.list();
		const flags = await Promise.all(all.map((b) => b.isAvailable().catch(() => false)));
		return all.filter((_, i) => flags[i]);
	}

	get(id: string): ChatBackend | undefined {
		return this.backends.get(id);
	}

	register(backend: ChatBackend): void {
		this.backends.set(backend.id, backend);
		this.notifyAvailabilityChanged();
	}

	unregister(id: string): void {
		this.backends.delete(id);
		this.notifyAvailabilityChanged();
	}

	/**
	 * Subscribe to anything that can change what listAvailable() returns.
	 * Returns an unsubscribe, matching the shape used elsewhere.
	 */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Announce that availability may have changed.
	 *
	 * Called by register/unregister, and also from outside when a source this
	 * registry cannot observe changes — specifically a BYO backend's
	 * `isAvailable()` reads whether an API key is stored, so adding or removing
	 * a key changes the answer without touching the registry at all.
	 */
	notifyAvailabilityChanged(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch {
				// A failing subscriber must not stop the others being told.
			}
		}
	}
}

export const backendRegistry: BackendRegistry = new BackendRegistryImpl();

// Backends are registered lazily by App-level wiring (see
// `wire-warehouse-backends.ts`). Module-load auto-registration creates a
// side-effect chain in tests that import services/ai for any reason.
