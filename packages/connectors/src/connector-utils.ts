/**
 * Shared utilities used by multiple connector implementations
 * (BigQueryConnector, SnowflakeConnector, future Databricks etc.).
 *
 * If you're tempted to copy any of these into a connector file,
 * extend the utility instead. We've already paid the duplication
 * cost twice.
 */

/**
 * Encode bytes as URL-safe base64 (RFC 4648 §5).
 * Drop trailing '=' padding, swap '+' → '-' and '/' → '_'.
 *
 * Used by OAuth PKCE flows in both BigQuery and Snowflake.
 */
export function base64url(buffer: Uint8Array): string {
	let s = "";
	for (let i = 0; i < buffer.length; i++) s += String.fromCharCode(buffer[i]);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * SHA-256 of a UTF-8 string. Returns the digest as a Uint8Array.
 * Used by OAuth PKCE code-challenge derivation.
 */
export async function sha256(text: string): Promise<Uint8Array> {
	const enc = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", enc);
	return new Uint8Array(hash);
}

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * In-memory TTL cache for connector-side metadata (catalog listings,
 * schema introspections). Per-connector instance — sharing across
 * connectors would mean cross-vendor invalidation rules we don't
 * have.
 *
 * Default TTL is 5 minutes; override via the constructor.
 */
export class MetadataCache<T = unknown> {
	private cache = new Map<string, CacheEntry<T>>();
	private ttlMs: number;

	constructor(ttlMs = 5 * 60 * 1000) {
		this.ttlMs = ttlMs;
	}

	get<U extends T = T>(key: string): U | null {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key);
			return null;
		}
		return entry.data as U;
	}

	set<U extends T = T>(key: string, data: U): void {
		this.cache.set(key, {
			data: data as T,
			timestamp: Date.now(),
		});
	}

	delete(key: string): void {
		this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}
}

/** An in-flight request awaiting the worker's reply. */
interface PendingParse<TRequest, TResponse> {
	request: TRequest;
	resolve: (response: TResponse) => void;
	reject: (reason: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Worker-backed parse pool for offloading CPU-heavy chunk parsing
 * (Snowflake's typed-row decoding, BigQuery's STRUCT walk) off the
 * main thread.
 *
 * Lifecycle:
 *   - Lazily creates the worker on first request via the supplied
 *     factory (so jsdom / restricted-host environments don't pay
 *     for a worker that won't be used)
 *   - Falls back to the supplied main-thread parser, permanently, if
 *     the worker can't be built OR errors at runtime
 *   - Tracks pending requests by sequence id; resolves when the worker
 *     posts the matching reply
 *   - terminate() is idempotent and safe on revoke
 *
 * Failure contract (the reason this class was rewritten): a request
 * MUST always settle. A worker that crashes mid-parse, or never replies,
 * must not leave the caller's `await` hanging forever. On any worker
 * failure every in-flight request is re-run on the main thread — which
 * both completes the query when the crash was environmental (OOM,
 * structured-clone limits) and surfaces a real error when the data is
 * genuinely unparseable, the same visible failure the pre-worker code
 * produced. After a runtime error the pool stays on the main thread for
 * good, rather than rebuilding a worker that will crash on the next page.
 */
export class WorkerParsePool<TRequest, TResponse> {
	private worker: Worker | null = null;
	/**
	 * Sticky: once true, every request goes straight to the main thread.
	 * Set when the worker can't be constructed, when there's no Worker
	 * global, or when the worker throws at runtime. terminate() (an
	 * ordinary disconnect) does NOT set it — a later reconnect may build a
	 * fresh worker.
	 */
	private disabled = false;
	private handlers = new Map<string, PendingParse<TRequest, TResponse>>();
	private seq = 0;

	constructor(
		private readonly factory: () => Worker,
		private readonly mainThreadFallback: (
			req: TRequest,
		) => Promise<TResponse> | TResponse,
		private readonly logger: { warn: (msg: string, err?: unknown) => void } = {
			warn: () => undefined,
		},
		/**
		 * Backstop for a worker that neither replies nor errors (silently
		 * wedged): after this long a single request degrades to the main
		 * thread instead of hanging. Per-request — it does not tear down the
		 * worker, so one slow reply doesn't punish other requests.
		 */
		private readonly requestTimeoutMs = 30_000,
	) {}

	send(request: TRequest): Promise<TResponse> {
		const worker = this.ensureWorker();
		if (!worker) {
			return this.runFallback(request);
		}
		return new Promise<TResponse>((resolve, reject) => {
			const id = `p_${++this.seq}`;
			const timer = setTimeout(() => {
				if (this.handlers.delete(id)) {
					this.logger.warn(
						"[WorkerParsePool] request timed out, reparsing on main thread",
					);
					this.runFallback(request).then(resolve, reject);
				}
			}, this.requestTimeoutMs);
			this.handlers.set(id, { request, resolve, reject, timer });
			// We tag the message with the id; consumer protocol must echo it back.
			worker.postMessage({ id, ...(request as Record<string, unknown>) });
		});
	}

	terminate(): void {
		// Settle anything in flight before tearing down so no caller hangs.
		// An explicit terminate() is a disconnect, not a failure, so it does
		// not disable the pool.
		this.drainToMainThread("pool terminated");
		this.teardownWorker();
	}

	private ensureWorker(): Worker | null {
		if (this.worker) return this.worker;
		if (this.disabled) return null;

		try {
			if (typeof Worker === "undefined") {
				this.disabled = true;
				return null;
			}
			const worker = this.factory();
			worker.onmessage = (e: MessageEvent<TResponse & { id: string }>) => {
				const pending = this.handlers.get(e.data.id);
				if (pending) {
					this.handlers.delete(e.data.id);
					clearTimeout(pending.timer);
					pending.resolve(e.data);
				}
			};
			worker.onerror = (err) => {
				this.logger.warn("[WorkerParsePool] worker error, using main thread", err);
				// Sticky: stop rebuilding a worker that crashes, and reparse
				// everything in flight on the main thread so no query hangs.
				this.disabled = true;
				this.drainToMainThread("worker error");
				this.teardownWorker();
			};
			this.worker = worker;
			return worker;
		} catch (err) {
			this.logger.warn("[WorkerParsePool] init failed, using main thread", err);
			this.disabled = true;
			return null;
		}
	}

	private teardownWorker(): void {
		if (this.worker) {
			try {
				this.worker.terminate();
			} catch {
				// non-critical
			}
			this.worker = null;
		}
	}

	/** Re-run every in-flight request on the main thread and settle it. */
	private drainToMainThread(reason: string): void {
		if (this.handlers.size === 0) return;
		this.logger.warn(
			`[WorkerParsePool] ${reason}; reparsing ${this.handlers.size} in-flight request(s) on main thread`,
		);
		const pending = [...this.handlers.values()];
		this.handlers.clear();
		for (const p of pending) {
			clearTimeout(p.timer);
			this.runFallback(p.request).then(p.resolve, p.reject);
		}
	}

	/** Run the main-thread parser, normalising sync throws into a rejection. */
	private runFallback(request: TRequest): Promise<TResponse> {
		try {
			return Promise.resolve(this.mainThreadFallback(request));
		} catch (err) {
			return Promise.reject(err);
		}
	}
}
