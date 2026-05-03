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
	}

	unregister(id: string): void {
		this.backends.delete(id);
	}
}

export const backendRegistry: BackendRegistry = new BackendRegistryImpl();

// Backends are registered lazily by App-level wiring (see
// `wire-warehouse-backends.ts`). Module-load auto-registration creates a
// side-effect chain in tests that import services/ai for any reason.
