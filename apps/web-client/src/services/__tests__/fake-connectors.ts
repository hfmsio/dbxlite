/**
 * Test-environment stubs for characterizing StreamingQueryService
 * (WS-A / A0 in docs/REFACTOR-PLAN.md).
 *
 * The connector doubles themselves live in the characterization test, because
 * `vi.mock`'s factory is hoisted and can only close over `vi.hoisted` values
 * declared in the same module. What lives here is the piece that needs no
 * hoisting.
 */

/**
 * Minimal in-memory IndexedDB stand-in.
 *
 * jsdom ships no IndexedDB, and `StreamingQueryService.initialize()` awaits
 * `ResultCache.init()` unconditionally — so without this, initialize() throws
 * before any behavior under test can run. The cache itself is dead code (no
 * caller ever passes `cacheResults: true`) and A1 deletes it, at which point
 * this stub goes with it.
 */
export function installFakeIndexedDB(): void {
	const fakeRequest = () => {
		const req: {
			result: unknown;
			error: unknown;
			onsuccess: ((ev?: unknown) => void) | null;
			onerror: ((ev?: unknown) => void) | null;
			onupgradeneeded: ((ev?: unknown) => void) | null;
		} = {
			result: {
				objectStoreNames: { contains: () => true },
				transaction: () => null,
				createObjectStore: () => ({ createIndex: () => {} }),
			},
			error: null,
			onsuccess: null,
			onerror: null,
			onupgradeneeded: null,
		};
		queueMicrotask(() => req.onsuccess?.({ target: req }));
		return req;
	};

	Object.defineProperty(globalThis, "indexedDB", {
		configurable: true,
		writable: true,
		value: { open: () => fakeRequest() },
	});
}
