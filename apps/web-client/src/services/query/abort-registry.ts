/**
 * AbortRegistry — the set of in-flight queries and their cancellation handles.
 *
 * Extracted from StreamingQueryService (WS-A / A2 in docs/REFACTOR-PLAN.md).
 * This was the service's most genuinely isolated piece of state: a
 * `Map<queryId, AbortController>` plus cancel-one and cancel-all. Nothing else
 * in the service reads it, so it moves out without a seam.
 */

/**
 * Named port so the collaborator passes the swap test — a caller can supply a
 * different implementation (a no-op for tests, an instrumented one for
 * diagnostics) without the service knowing.
 */
export interface AbortRegistry {
	/** Start tracking a query. Returns the controller to abort it with. */
	register(queryId: string): AbortController;
	/** Stop tracking a query that finished on its own. */
	release(queryId: string): void;
	/** Abort one query and stop tracking it. No-op if unknown. */
	cancel(queryId: string): void;
	/** Abort every tracked query and clear the registry. */
	cancelAll(): void;
	/** How many queries are currently in flight. */
	readonly size: number;
}

export class InMemoryAbortRegistry implements AbortRegistry {
	private readonly controllers = new Map<string, AbortController>();

	register(queryId: string): AbortController {
		const controller = new AbortController();
		this.controllers.set(queryId, controller);
		return controller;
	}

	release(queryId: string): void {
		this.controllers.delete(queryId);
	}

	cancel(queryId: string): void {
		const controller = this.controllers.get(queryId);
		if (controller) {
			controller.abort();
			this.controllers.delete(queryId);
		}
	}

	cancelAll(): void {
		for (const controller of this.controllers.values()) {
			controller.abort();
		}
		this.controllers.clear();
	}

	get size(): number {
		return this.controllers.size;
	}
}
