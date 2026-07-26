/**
 * Shared compute-status probe (WS-B / B5 in docs/REFACTOR-PLAN.md).
 *
 * Warehouse status changes server-side — Snowflake suspends and auto-resumes
 * on its own — so this is a category-2 poller: it cannot become a pure event,
 * and remains a poll. What it stops being is a *per-component* poll.
 *
 * Each badge used to own its own 30s interval, so N badges pointed at the same
 * warehouse meant N identical round trips. This makes the probe a single
 * ref-counted owner per warehouse: it starts on the first subscriber, stops on
 * the last, and hands every subscriber the same status.
 *
 * The behaviors the badge had are preserved here rather than dropped:
 *  - disarm while the tab is hidden, re-arm and refresh on return
 *  - refresh on `dbxlite:query-completed`, because a query against a SUSPENDED
 *    warehouse auto-resumes it and the badge would otherwise sit stale until
 *    the next tick
 *  - a quiet period after a user action, so an optimistic "starting" is not
 *    immediately overwritten by an in-flight poll
 *  - permanent disable once the cloud proxy is known to be absent; there is no
 *    point polling forever against something that isn't deployed
 */

import { CloudProxyUnavailableError } from "@ide/connectors";
import type { ComputeStatus } from "./types";

export const COMPUTE_POLL_INTERVAL_MS = 30_000;

/** The slice of a catalog provider this probe needs. */
export interface ComputeStatusSource {
	getComputeStatus?(name: string): Promise<ComputeStatus>;
}

type Listener = (status: ComputeStatus) => void;

class ComputeProbe {
	private readonly listeners = new Set<Listener>();
	private interval: ReturnType<typeof setInterval> | null = null;
	private status: ComputeStatus | null = null;
	private quietUntil = 0;
	/** The cloud proxy isn't deployed; one failure is enough to stop trying. */
	private proxyDown = false;
	private readonly onVisibility = () => {
		if (document.hidden) {
			this.disarm();
		} else {
			this.arm();
			void this.fetch();
		}
	};
	private readonly onQueryDone = () => {
		void this.fetch();
	};

	constructor(
		private readonly source: ComputeStatusSource,
		/**
		 * Optional, matching the badge's prop. Passed through to the provider
		 * exactly as before rather than coerced, so a provider that treats a
		 * missing name as "the session's warehouse" keeps working.
		 */
		private readonly name: string | undefined,
	) {}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		if (this.status) listener(this.status);

		if (this.listeners.size === 1) {
			this.start();
		}

		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.stop();
			}
		};
	}

	get subscriberCount(): number {
		return this.listeners.size;
	}

	get isRunning(): boolean {
		return this.interval !== null;
	}

	/** Suppress polling for a while, so an optimistic UI flip survives. */
	quiet(ms: number): void {
		this.quietUntil = Date.now() + ms;
	}

	/** End the quiet period and re-read immediately. */
	async refreshNow(): Promise<void> {
		this.quietUntil = 0;
		await this.fetch();
	}

	private start(): void {
		document.addEventListener("visibilitychange", this.onVisibility);
		window.addEventListener("dbxlite:query-completed", this.onQueryDone);
		void this.fetch();
		if (!document.hidden) this.arm();
	}

	private stop(): void {
		this.disarm();
		document.removeEventListener("visibilitychange", this.onVisibility);
		window.removeEventListener("dbxlite:query-completed", this.onQueryDone);
	}

	private arm(): void {
		if (this.interval !== null || this.proxyDown) return;
		this.interval = setInterval(() => void this.fetch(), COMPUTE_POLL_INTERVAL_MS);
	}

	private disarm(): void {
		if (this.interval !== null) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private async fetch(): Promise<void> {
		if (!this.source.getComputeStatus) return;
		if (this.proxyDown) return;
		if (Date.now() < this.quietUntil) return;

		try {
			this.publish(await this.source.getComputeStatus(this.name as string));
		} catch (err) {
			if (err instanceof CloudProxyUnavailableError) {
				this.proxyDown = true;
				this.disarm();
			}
			// Failure is non-fatal — show UNKNOWN. Permission errors are common.
			this.publish({ state: "unknown", lastChecked: new Date() });
		}
	}

	private publish(status: ComputeStatus): void {
		this.status = status;
		for (const listener of [...this.listeners]) {
			listener(status);
		}
	}
}

/**
 * One probe per (provider, warehouse). Keyed by the provider object so two
 * different connections to the same warehouse name don't share a probe.
 */
const probes = new WeakMap<ComputeStatusSource, Map<string, ComputeProbe>>();

export function getComputeProbe(
	source: ComputeStatusSource,
	name: string | undefined,
): ComputeProbe {
	let byName = probes.get(source);
	if (!byName) {
		byName = new Map();
		probes.set(source, byName);
	}
	const key = name ?? "";
	let probe = byName.get(key);
	if (!probe) {
		probe = new ComputeProbe(source, name);
		byName.set(key, probe);
	}
	return probe;
}

export type { ComputeProbe };
