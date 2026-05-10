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

/**
 * Worker-backed parse pool for offloading CPU-heavy chunk parsing
 * (Snowflake's typed-row decoding, BigQuery's STRUCT walk) off the
 * main thread.
 *
 * Lifecycle:
 *   - Lazily creates the worker on first request via the supplied
 *     factory (so jsdom / restricted-host environments don't pay
 *     for a worker that won't be used)
 *   - Falls back to the supplied main-thread parser if Worker
 *     construction fails (sets a sticky bit so we don't retry)
 *   - Tracks pending requests by sequence id; resolves when the
 *     worker posts the matching reply
 *   - terminate() is idempotent and safe on revoke
 */
export class WorkerParsePool<TRequest, TResponse> {
	private worker: Worker | null = null;
	private initTried = false;
	private handlers = new Map<string, (response: TResponse) => void>();
	private seq = 0;

	constructor(
		private readonly factory: () => Worker,
		private readonly mainThreadFallback: (
			req: TRequest,
		) => Promise<TResponse> | TResponse,
		private readonly logger: { warn: (msg: string, err?: unknown) => void } = {
			warn: () => undefined,
		},
	) {}

	async send(request: TRequest): Promise<TResponse> {
		const worker = await this.ensureWorker();
		if (!worker) {
			return this.mainThreadFallback(request);
		}
		return new Promise((resolve) => {
			const id = `p_${++this.seq}`;
			this.handlers.set(id, resolve);
			// We tag the message with the id; consumer protocol must echo it back.
			worker.postMessage({ id, ...(request as Record<string, unknown>) });
		});
	}

	terminate(): void {
		if (this.worker) {
			try {
				this.worker.terminate();
			} catch {
				// non-critical
			}
			this.worker = null;
		}
		this.initTried = false;
		this.handlers.clear();
	}

	private async ensureWorker(): Promise<Worker | null> {
		if (this.worker) return this.worker;
		if (this.initTried) return null;
		this.initTried = true;

		try {
			if (typeof Worker === "undefined") return null;
			this.worker = this.factory();
			this.worker.onmessage = (
				e: MessageEvent<TResponse & { id: string }>,
			) => {
				const handler = this.handlers.get(e.data.id);
				if (handler) {
					this.handlers.delete(e.data.id);
					handler(e.data);
				}
			};
			this.worker.onerror = (err) => {
				this.logger.warn("[WorkerParsePool] worker error", err);
				this.terminate();
			};
			return this.worker;
		} catch (err) {
			this.logger.warn("[WorkerParsePool] init failed, using main thread", err);
			return null;
		}
	}
}
