/**
 * Snowflake Connector
 *
 * Connects to Snowflake via the SQL REST API using OAuth 2.0 with PKCE.
 *
 * Wire format notes (these were learned the hard way; preserve them):
 *   - All scalars come back as strings; numeric types must be parsed.
 *   - VARIANT/OBJECT/ARRAY arrive as JSON-encoded strings.
 *   - BOOLEAN may be `'true'`/`'false'`/`true`/`false`/`1`/`0`.
 *   - TIMESTAMP_LTZ/NTZ are nanosecond-precision epoch strings ("1701648000.000000000").
 *   - TIMESTAMP_TZ is "epoch.fraction offset_minutes" (offset in minutes from UTC).
 *   - SHOW COLUMNS returns the per-column data_type as a JSON blob, not a plain type name.
 *
 * Chunk semantics (matches BigQueryConnector):
 *   - Schema is emitted on the first yielded chunk only.
 *   - `done: true` is set on the last chunk only.
 *   - For multi-partition results, one chunk is yielded per partition.
 *
 * API: https://docs.snowflake.com/en/developer-guide/sql-api/index
 */

import type {
	CatalogInfo,
	CloudConnector,
	ColumnInfo,
	ConnectionConfig,
	ConnectionTestResult,
	QueryChunk,
	QueryCostEstimate,
	QueryOptions,
	Schema,
	SchemaInfo,
	TableInfo,
	TableMetadata,
} from "./base"
import { type CredentialStoreLike, EncryptionManager } from "@ide/storage"
import { createLogger } from "./logger"
import { BrowserTransport, RequestTransport } from "./transport"
import { parseSnowflakeAccount } from "./snowflake-account"

const logger = createLogger("Snowflake")

// ---------------------------------------------------------------------------
// Public config + types
// ---------------------------------------------------------------------------

/**
 * Authentication mode discriminator.
 *
 * - `oauth`: Authorization Code + PKCE flow against a Snowflake Security
 *   Integration. Requires ACCOUNTADMIN to create the integration.
 * - `pat`: Programmatic Access Token (Snowsight → My Profile → Programmatic
 *   Access Tokens). No admin needed; user generates their own token.
 *   Bound to a specific role at creation time — role switching is not
 *   supported in this mode (generate a new PAT to switch roles).
 */
export type SnowflakeAuthConfig =
	| { mode: "oauth"; clientId: string; clientSecret?: string }
	| { mode: "pat"; token: string }

export interface SnowflakeConnectorConfig {
	/** CredentialStore for token + config persistence. */
	credentialStore: CredentialStoreLike
	/** Snowflake account (anything `parseSnowflakeAccount` accepts). */
	account: string
	/**
	 * Auth mode. Defaults to OAuth (with `clientId`/`clientSecret` read from
	 * the legacy top-level fields for backward compat). New callers should
	 * pass an explicit `auth` discriminator.
	 */
	auth?: SnowflakeAuthConfig
	/**
	 * @deprecated Use `auth: { mode: "oauth", clientId }`. Kept for backward
	 * compat with existing callers; ignored when `auth` is set.
	 */
	clientId?: string
	/**
	 * @deprecated Use `auth: { mode: "oauth", clientId, clientSecret }`.
	 * Kept for backward compat; ignored when `auth` is set.
	 */
	clientSecret?: string
	/** Default warehouse (required for query execution). */
	warehouse: string
	/** Default role; falls back to "PUBLIC" for the OAuth scope. */
	role?: string
	/** Default database. */
	database?: string
	/** Default schema. */
	schema?: string
	/** Optional transport override (for testing or alternate proxy). */
	transport?: RequestTransport
	/** Optional OAuth redirect URI override. Defaults to `${origin}/oauth-callback.html`. */
	redirectUri?: string
}

interface OAuthToken {
	access_token: string
	refresh_token?: string
	token_type: string
	expires_in: number
	scope?: string
	obtained_at: number
}

interface SnowflakePartitionInfo {
	rowCount: number
	uncompressedSize?: number
	compressedSize?: number
}

interface SnowflakeColumnMeta {
	name: string
	type: string
	nullable?: boolean
	precision?: number
	scale?: number
	length?: number
	byteLength?: number
}

interface SnowflakeStatementResponse {
	resultSetMetaData?: {
		numRows?: number
		format?: string
		partitionInfo?: SnowflakePartitionInfo[]
		rowType?: SnowflakeColumnMeta[]
	}
	data?: unknown[][]
	code?: string
	message?: string
	statementHandle?: string
	statementStatusUrl?: string
	sqlState?: string
	createdOn?: number
}

const STORED_CONFIG_KEYS = [
	"account",
	"clientId",
	"clientSecret",
	"warehouse",
	"database",
	"schema",
	"role",
] as const

type StoredConfig = {
	[K in (typeof STORED_CONFIG_KEYS)[number]]?: string
} & {
	/**
	 * Auth mode marker. Absent or "oauth" → OAuth flow; "pat" → load PAT
	 * from `patKey` instead of OAuth token. Backward-compatible: legacy
	 * stored configs without this field continue to restore as OAuth.
	 */
	authMode?: "oauth" | "pat"
}

// ---------------------------------------------------------------------------
// Cache (5-min TTL, mirrors BigQueryConnector's MetadataCache)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
	data: T
	timestamp: number
}

class MetadataCache {
	private cache = new Map<string, CacheEntry<unknown>>()
	private ttl = 5 * 60 * 1000

	get<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (!entry) return null
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key)
			return null
		}
		return entry.data as T
	}

	set<T>(key: string, data: T): void {
		this.cache.set(key, { data, timestamp: Date.now() })
	}

	clear(): void {
		this.cache.clear()
	}
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
	let s = ""
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Quote a Snowflake identifier (database/schema/table/column name) as
 * `"name"`, doubling any embedded `"` to `""`. Snowflake permits `"`
 * in identifiers; without escaping, a malicious or unusual name closes
 * the quoted identifier and injects SQL.
 */
function quoteSfIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`
}

/**
 * Escape a string for inclusion inside a single-quoted SQL literal —
 * doubles `'` to `''` and escapes backslashes. Use for `LIKE` patterns,
 * literal comparisons, etc.
 */
function escapeSfLiteral(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "''")
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const random = new Uint8Array(32)
	crypto.getRandomValues(random)
	const verifier = base64url(random)
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	)
	const challenge = base64url(new Uint8Array(hash))
	return { verifier, challenge }
}

// ---------------------------------------------------------------------------
// OAuth-callback channel constants — duplicated from
// apps/web-client/src/utils/oauth-constants.ts to keep the connector package
// app-agnostic. A unit test asserts both files agree.
// ---------------------------------------------------------------------------

const OAUTH_RESPONSE_LSKEY = "snowflake_oauth_response"
const OAUTH_ERROR_LSKEY = "snowflake_oauth_error"
const OAUTH_AUTO_CONNECT_LSKEY = "snowflake-auto-connect"
const OAUTH_BROADCAST_CHANNEL = "snowflake_oauth"
const OAUTH_CALLBACK_PATH = "/oauth-callback.html"

// ---------------------------------------------------------------------------
// Retry policy for transient API failures
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([408, 429, 503])
const MAX_RETRIES = 3

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export class SnowflakeConnector implements CloudConnector {
	readonly id = "snowflake"

	private readonly creds: CredentialStoreLike
	private readonly transport: RequestTransport
	/**
	 * Empty string ⇒ PKCE-only public-client mode (no Basic auth on token
	 * exchange). Non-empty ⇒ confidential client mode. Unused in PAT mode.
	 */
	private readonly clientSecret: string
	private readonly redirectUri: string

	/**
	 * Auth mode:
	 * - "oauth": refresh-token-backed OAuth flow (default, full admin setup)
	 * - "pat": Programmatic Access Token (no security integration needed;
	 *   token is sent as `Authorization: Bearer <pat>` on every API call)
	 */
	private authMode: "oauth" | "pat" = "oauth"
	/** Held in memory only when authMode === "pat". Persisted via creds. */
	private patToken: string = ""

	private readonly tokenKey = "snowflake-token"
	private readonly patKey = "snowflake-pat"
	private readonly configKey = "snowflake-config"

	private token: OAuthToken | null = null
	/**
	 * In-flight refresh-token promise. Coalesces concurrent refresh attempts
	 * so we don't fire multiple parallel `/oauth/token-request` calls for
	 * the same expired access token. Snowflake invalidates older refresh
	 * tokens when a new one is issued, so a race here means the second
	 * request uses a now-revoked refresh token and fails.
	 */
	private refreshPromise: Promise<void> | null = null
	private cache = new MetadataCache()
	private activeStatements = new Map<string, string>()

	private accountIdentifier: string
	private accountHostname: string
	private clientId: string
	private warehouse: string
	private database: string
	private schemaName: string
	private role: string

	constructor(config: SnowflakeConnectorConfig) {
		if (!config.credentialStore) {
			throw new Error("credentialStore is required for SnowflakeConnector")
		}
		if (!config.account) throw new Error("account is required")

		// Resolve auth mode. Prefer the new discriminator; fall back to the
		// legacy top-level clientId/clientSecret fields so existing call
		// sites keep working.
		const auth: SnowflakeAuthConfig =
			config.auth ??
			({
				mode: "oauth",
				clientId: config.clientId ?? "",
				clientSecret: config.clientSecret,
			} as SnowflakeAuthConfig)

		if (auth.mode === "oauth") {
			if (!auth.clientId) throw new Error("clientId is required for OAuth")
		} else {
			if (!auth.token) throw new Error("token is required for PAT auth")
		}

		const acc = parseSnowflakeAccount(config.account)
		this.accountIdentifier = acc.identifier
		this.accountHostname = acc.hostname

		this.creds = config.credentialStore
		this.transport = config.transport ?? new BrowserTransport()

		this.authMode = auth.mode
		if (auth.mode === "oauth") {
			this.clientId = auth.clientId
			this.clientSecret = auth.clientSecret ?? ""
			this.patToken = ""
		} else {
			this.clientId = ""
			this.clientSecret = ""
			this.patToken = auth.token
		}

		this.warehouse = config.warehouse ?? ""
		this.database = config.database ?? ""
		this.schemaName = config.schema ?? ""
		this.role = config.role ?? ""

		const origin =
			typeof window !== "undefined" ? window.location.origin : ""
		this.redirectUri = config.redirectUri ?? `${origin}${OAUTH_CALLBACK_PATH}`
	}

	// -------------------------------------------------------------------------
	// Public accessors (used by the service layer / settings UI)
	// -------------------------------------------------------------------------

	getWarehouse(): string {
		return this.warehouse
	}
	getDatabase(): string {
		return this.database
	}
	getDefaultSchema(): string {
		return this.schemaName
	}
	getRole(): string {
		return this.role
	}
	getAccount(): string {
		return this.accountIdentifier
	}
	/**
	 * Active auth mode. UI surfaces use this to gate role-switch and
	 * reconnect-on-role flows: PAT mode is bound to a single role at
	 * token-creation time, so role switching requires generating a new PAT.
	 */
	getAuthMode(): "oauth" | "pat" {
		return this.authMode
	}

	private get baseUrl(): string {
		return `https://${this.accountHostname}`
	}

	// -------------------------------------------------------------------------
	// Connect / OAuth
	// -------------------------------------------------------------------------

	async connect(config: ConnectionConfig): Promise<void> {
		// Allow opts to override warehouse/role/etc. on (re)connect.
		const opts = (config?.options ?? {}) as Partial<StoredConfig> & {
			account?: string
		}
		if (opts.account) {
			const acc = parseSnowflakeAccount(opts.account)
			this.accountIdentifier = acc.identifier
			this.accountHostname = acc.hostname
		}
		if (opts.clientId) this.clientId = opts.clientId
		if (opts.clientSecret) {
			throw new Error("clientSecret cannot be updated via connect()")
		}
		if (opts.warehouse !== undefined) this.warehouse = opts.warehouse
		if (opts.database !== undefined) this.database = opts.database
		if (opts.schema !== undefined) this.schemaName = opts.schema
		if (opts.role !== undefined) this.role = opts.role

		// PAT mode: no popup, no PKCE, no token exchange. The token is
		// already present (set in the constructor); persist it + config and
		// we're done. The first apiRequest will surface auth errors if the
		// token is invalid.
		if (this.authMode === "pat") {
			await this.creds.save(this.patKey, this.patToken)
			await this.creds.save(this.configKey, this.snapshotConfig())
			this.cache.clear()
			logger.info("Connected (PAT mode)")
			return
		}

		const pkce = await generatePKCE()
		const state =
			typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: base64url(crypto.getRandomValues(new Uint8Array(16)))

		// Scope MUST include role; empty role causes "invalid consent request"
		const role = this.role || "PUBLIC"
		const scope = `session:role:${role}`

		const authUrl = new URL(`${this.baseUrl}/oauth/authorize`)
		authUrl.searchParams.set("client_id", this.clientId)
		authUrl.searchParams.set("response_type", "code")
		authUrl.searchParams.set("redirect_uri", this.redirectUri)
		authUrl.searchParams.set("scope", scope)
		authUrl.searchParams.set("state", state)
		authUrl.searchParams.set("code_challenge", pkce.challenge)
		authUrl.searchParams.set("code_challenge_method", "S256")

		logger.debug("Opening OAuth popup", {
			redirectUri: this.redirectUri,
			scope,
		})

		const popup = window.open(
			authUrl.toString(),
			"snowflake_oauth",
			"width=600,height=700,scrollbars=yes",
		)
		if (!popup) {
			throw new Error("Failed to open OAuth popup. Please allow popups.")
		}

		const code = await this.waitForOAuthCallback(popup, state)

		await this.exchangeCodeForToken(code, pkce.verifier)

		await this.creds.save(this.configKey, this.snapshotConfig())
		this.cache.clear()
		logger.info("Connected")
	}

	/**
	 * Wait for OAuth callback via three independent channels:
	 *   1. BroadcastChannel (most reliable for same-origin popups)
	 *   2. window.postMessage (works when opener reference survives)
	 *   3. localStorage poll + storage event (survives cross-origin redirects)
	 *
	 * A 5-minute hard timeout bounds the wait. Cancellation is not detected
	 * via popup.closed — see comment on the poll interval below for why.
	 */
	private waitForOAuthCallback(
		popup: Window,
		expectedState: string,
	): Promise<string> {
		// Clear stale data from prior attempts
		try {
			localStorage.removeItem(OAUTH_RESPONSE_LSKEY)
			localStorage.removeItem(OAUTH_ERROR_LSKEY)
		} catch {
			// localStorage may be unavailable in some test envs
		}

		return new Promise<string>((resolve, reject) => {
			let resolved = false
			let broadcastChannel: BroadcastChannel | null = null
			if (typeof BroadcastChannel !== "undefined") {
				try {
					broadcastChannel = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL)
				} catch {
					broadcastChannel = null
				}
			}

			const cleanup = () => {
				clearTimeout(timeout)
				clearInterval(pollInterval)
				window.removeEventListener("message", handleMessage)
				window.removeEventListener("storage", handleStorage)
				broadcastChannel?.close()
			}

			const settle = (codeOrError: { code: string } | { error: string }) => {
				if (resolved) return
				resolved = true
				cleanup()
				try {
					popup.close()
				} catch {
					// popup may already be gone
				}
				if ("error" in codeOrError) {
					reject(new Error(codeOrError.error))
				} else {
					resolve(codeOrError.code)
				}
			}

			const processResponse = (raw: string): boolean => {
				try {
					const data = JSON.parse(raw) as { code?: string; state?: string }
					if (data.state !== expectedState) {
						settle({ error: "OAuth state mismatch" })
						return true
					}
					if (typeof data.code !== "string") {
						settle({ error: "OAuth response missing code" })
						return true
					}
					settle({ code: data.code })
					return true
				} catch {
					settle({ error: "Invalid OAuth response format" })
					return true
				}
			}

			const checkLocalStorage = (): boolean => {
				let response: string | null = null
				let error: string | null = null
				try {
					response = localStorage.getItem(OAUTH_RESPONSE_LSKEY)
					error = localStorage.getItem(OAUTH_ERROR_LSKEY)
				} catch {
					return false
				}

				if (error) {
					try {
						localStorage.removeItem(OAUTH_ERROR_LSKEY)
					} catch {}
					settle({ error: `OAuth error: ${error}` })
					return true
				}
				if (response) {
					try {
						localStorage.removeItem(OAUTH_RESPONSE_LSKEY)
					} catch {}
					return processResponse(response)
				}
				return false
			}

			const handleStorage = (event: StorageEvent) => {
				if (resolved) return
				if (event.key === OAUTH_RESPONSE_LSKEY && event.newValue) {
					try {
						localStorage.removeItem(OAUTH_RESPONSE_LSKEY)
					} catch {}
					processResponse(event.newValue)
				} else if (event.key === OAUTH_ERROR_LSKEY && event.newValue) {
					try {
						localStorage.removeItem(OAUTH_ERROR_LSKEY)
					} catch {}
					settle({ error: `OAuth error: ${event.newValue}` })
				}
			}

			const handleMessage = (event: MessageEvent) => {
				if (resolved) return
				if (event.origin !== window.location.origin) return
				const data = event.data
				if (data?.type === "oauth_code") {
					if (data.state !== expectedState) {
						settle({ error: "OAuth state mismatch" })
						return
					}
					settle({ code: data.code })
				} else if (data?.type === "oauth_error") {
					settle({ error: `OAuth error: ${data.error}` })
				}
			}

			if (broadcastChannel) {
				broadcastChannel.onmessage = (event) => {
					if (resolved) return
					const data = event.data
					if (data?.type === "oauth_code") {
						if (data.state !== expectedState) {
							settle({ error: "OAuth state mismatch" })
							return
						}
						settle({ code: data.code })
					} else if (data?.type === "oauth_error") {
						settle({ error: `OAuth error: ${data.error}` })
					}
				}
			}

			window.addEventListener("message", handleMessage)
			window.addEventListener("storage", handleStorage)

			const timeout = setTimeout(() => {
				settle({ error: "OAuth timeout - no response after 5 minutes" })
			}, 300000)

			// Deliberately do NOT poll `popup.closed`. Under
			// Cross-Origin-Opener-Policy: same-origin (set globally by the
			// dbxlite-cloud Vercel config and by the local dev server for
			// DuckDB threading), the parent's popup handle becomes a
			// browsing-context-less Window once the popup navigates cross-origin
			// to Snowflake — `popup.closed` then reports `true` while the
			// consent screen is still live, producing false-positive
			// "cancelled by user" rejects. The 5-minute hard timeout above
			// bounds the wait if the user genuinely closes the popup.
			const pollInterval = setInterval(() => {
				if (resolved) return
				checkLocalStorage()
			}, 100)

			// Initial check in case the callback already wrote before we attached
			checkLocalStorage()
		})
	}

	private async exchangeCodeForToken(
		code: string,
		verifier: string,
	): Promise<void> {
		const tokenUrl = `${this.baseUrl}/oauth/token-request`
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: this.redirectUri,
			code_verifier: verifier,
		})
		// Public-client (PKCE-only) mode: include client_id in the body and
		// omit the Authorization header. Confidential mode: HTTP Basic auth
		// with client_id:client_secret. Snowflake supports both, gated on the
		// Security Integration's OAUTH_CLIENT_TYPE setting.
		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
		}
		if (this.clientSecret) {
			headers.Authorization =
				"Basic " + btoa(`${this.clientId}:${this.clientSecret}`)
		} else {
			body.append("client_id", this.clientId)
		}
		const response = await this.transport.request(tokenUrl, {
			method: "POST",
			headers,
			body: body.toString(),
		})
		if (!response.ok) {
			const text = await response.text().catch(() => "")
			throw new Error(`Token exchange failed: ${response.status} ${text}`)
		}
		const json = (await response.json()) as Partial<OAuthToken>
		this.token = {
			access_token: json.access_token ?? "",
			refresh_token: json.refresh_token,
			token_type: json.token_type ?? "Bearer",
			expires_in: json.expires_in ?? 3600,
			scope: json.scope,
			obtained_at: Date.now(),
		}
		await this.creds.save(this.tokenKey, this.token)
	}

	private async refreshToken(): Promise<void> {
		if (!this.token?.refresh_token) {
			throw new Error("No refresh token available")
		}
		const tokenUrl = `${this.baseUrl}/oauth/token-request`
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: this.token.refresh_token,
		})
		// Same client-auth logic as exchangeCodeForToken — gated on
		// confidential vs public client type.
		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
		}
		if (this.clientSecret) {
			headers.Authorization =
				"Basic " + btoa(`${this.clientId}:${this.clientSecret}`)
		} else {
			body.append("client_id", this.clientId)
		}
		const response = await this.transport.request(tokenUrl, {
			method: "POST",
			headers,
			body: body.toString(),
		})
		if (!response.ok) {
			throw new Error(`Token refresh failed: ${response.status}`)
		}
		const json = (await response.json()) as Partial<OAuthToken>
		// Snowflake may omit refresh_token in refresh responses; keep the old one.
		this.token = {
			access_token: json.access_token ?? this.token.access_token,
			refresh_token: json.refresh_token ?? this.token.refresh_token,
			token_type: json.token_type ?? this.token.token_type,
			expires_in: json.expires_in ?? this.token.expires_in,
			scope: json.scope ?? this.token.scope,
			obtained_at: Date.now(),
		}
		await this.creds.save(this.tokenKey, this.token)
	}

	private async ensureValidToken(): Promise<OAuthToken> {
		if (!this.token) {
			const stored = (await this.creds.load(this.tokenKey)) as
				| OAuthToken
				| null
			if (stored) this.token = stored
		}
		if (!this.token) {
			throw new Error("Not authenticated. Please connect first.")
		}
		const expiresAt =
			this.token.obtained_at + this.token.expires_in * 1000 - 60000
		if (Date.now() >= expiresAt) {
			if (!this.token.refresh_token) {
				throw new Error("Token expired. Please reconnect.")
			}
			// Coalesce concurrent refresh attempts. If one is already in
			// flight, await it instead of firing a parallel call.
			if (!this.refreshPromise) {
				this.refreshPromise = this.refreshToken().finally(() => {
					this.refreshPromise = null
				})
			}
			await this.refreshPromise
		}
		return this.token
	}

	/**
	 * Resolve the bearer credential and Snowflake token-type header for the
	 * current auth mode. Returns a tuple consumed by `apiRequest`.
	 *
	 * For PAT mode, the token is loaded once from the credential store and
	 * cached in memory; Snowflake validates it server-side on each request.
	 */
	private async resolveBearer(): Promise<{
		bearer: string
		tokenType: "OAUTH" | "PROGRAMMATIC_ACCESS_TOKEN"
	}> {
		if (this.authMode === "pat") {
			if (!this.patToken) {
				const stored = (await this.creds.load(this.patKey)) as string | null
				if (stored) this.patToken = stored
			}
			if (!this.patToken) {
				throw new Error("Not authenticated. Please connect first.")
			}
			return { bearer: this.patToken, tokenType: "PROGRAMMATIC_ACCESS_TOKEN" }
		}
		const token = await this.ensureValidToken()
		return { bearer: token.access_token, tokenType: "OAUTH" }
	}

	// -------------------------------------------------------------------------
	// API request with retry on 408/429/503
	// -------------------------------------------------------------------------

	private async apiRequest(
		endpoint: string,
		options: RequestInit = {},
		body?: Record<string, unknown>,
	): Promise<Response> {
		const { bearer, tokenType } = await this.resolveBearer()
		const url = `${this.baseUrl}/api/v2${endpoint}`
		const headers: Record<string, string> = {
			Authorization: `Bearer ${bearer}`,
			"Content-Type": "application/json",
			Accept: "application/json",
			"X-Snowflake-Authorization-Token-Type": tokenType,
			...((options.headers as Record<string, string>) ?? {}),
		}
		const requestBody = body !== undefined ? JSON.stringify(body) : options.body

		let lastResponse: Response | null = null
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			lastResponse = await this.transport.request(url, {
				...options,
				headers,
				body: requestBody,
			})
			if (lastResponse.ok) return lastResponse
			if (!RETRYABLE_STATUS.has(lastResponse.status)) break
			if (attempt === MAX_RETRIES) break
			const backoffMs = 250 * Math.pow(2, attempt) // 250, 500, 1000
			logger.warn(
				`Snowflake API ${lastResponse.status}; retrying in ${backoffMs}ms`,
				{ url, attempt: attempt + 1 },
			)
			await sleep(backoffMs)
		}

		await this.handleSnowflakeError(lastResponse as Response)
		throw new Error("unreachable") // handleSnowflakeError always throws
	}

	private async handleSnowflakeError(response: Response): Promise<never> {
		let message = `Snowflake API error: ${response.status} ${response.statusText}`
		try {
			const errorJson = (await response.json()) as {
				message?: string
				code?: string
			}
			if (errorJson.message) message = errorJson.message
		} catch {
			// non-JSON body, keep default
		}
		if (response.status === 401) {
			message += "\n\nYour session has expired. Please reconnect."
		} else if (response.status === 403) {
			message += "\n\nPlease ensure you have the necessary permissions."
		}
		throw new Error(message)
	}

	private async executeStatement(
		sql: string,
		opts?: { timeout?: number; signal?: AbortSignal },
	): Promise<SnowflakeStatementResponse> {
		const body: Record<string, unknown> = {
			statement: sql,
			timeout: opts?.timeout ?? 60,
			resultSetMetaData: { format: "jsonv2" },
			// Always include warehouse — Snowflake gives a clearer error when blank.
			warehouse: this.warehouse,
		}
		if (this.database) body.database = this.database
		if (this.schemaName) body.schema = this.schemaName
		if (this.role) body.role = this.role

		const response = await this.apiRequest(
			"/statements",
			{ method: "POST", signal: opts?.signal },
			body,
		)
		return (await response.json()) as SnowflakeStatementResponse
	}

	private async fetchPartition(
		statementHandle: string,
		partitionIndex: number,
		signal?: AbortSignal,
	): Promise<SnowflakeStatementResponse> {
		const response = await this.apiRequest(
			`/statements/${statementHandle}?partition=${partitionIndex}`,
			{ method: "GET", signal },
		)
		return (await response.json()) as SnowflakeStatementResponse
	}

	// -------------------------------------------------------------------------
	// Catalog discovery
	// -------------------------------------------------------------------------

	/**
	 * Run a metadata fetch under a client-side timeout via AbortController.
	 * The Snowflake SQL API can sit on a request for minutes if the warehouse
	 * is slow, the schema is huge, or a metadata cache miss hits a slow path.
	 * The explorer otherwise shows an indefinite spinner. 30s is generous for
	 * a SHOW; if it times out the user gets an actionable error.
	 */
	private async withMetadataTimeout<T>(
		op: string,
		fn: (signal: AbortSignal) => Promise<T>,
		timeoutMs = 30_000,
	): Promise<T> {
		const ctl = new AbortController()
		const timer = setTimeout(() => ctl.abort(), timeoutMs)
		try {
			return await fn(ctl.signal)
		} catch (err) {
			if (ctl.signal.aborted) {
				throw new Error(
					`${op} timed out after ${timeoutMs / 1000}s. The warehouse may be slow to respond or the target may be very large. Try again, or check Snowflake's query history.`,
				)
			}
			throw err
		} finally {
			clearTimeout(timer)
		}
	}

	async listProjects(): Promise<CatalogInfo[]> {
		const cached = this.cache.get<CatalogInfo[]>("databases")
		if (cached) return cached

		const result = await this.withMetadataTimeout(
			"Listing databases",
			(signal) => this.executeStatement("SHOW DATABASES", { signal }),
		)
		const databases: CatalogInfo[] = []
		for (const row of result.data ?? []) {
			const name = row[1] as string
			databases.push({
				id: name,
				name,
				type: "database",
				description: row[6] as string | undefined,
			})
		}
		this.cache.set("databases", databases)
		return databases
	}

	async listDatasets(databaseName: string): Promise<SchemaInfo[]> {
		const cacheKey = `schemas:${databaseName}`
		const cached = this.cache.get<SchemaInfo[]>(cacheKey)
		if (cached) return cached

		const result = await this.withMetadataTimeout(
			`Listing schemas in ${databaseName}`,
			(signal) =>
				this.executeStatement(
					`SHOW SCHEMAS IN DATABASE ${quoteSfIdent(databaseName)}`,
					{ signal },
				),
		)
		const schemas: SchemaInfo[] = []
		for (const row of result.data ?? []) {
			const name = row[1] as string
			schemas.push({
				id: name,
				name,
				catalog: databaseName,
				description: row[6] as string | undefined,
			})
		}
		this.cache.set(cacheKey, schemas)
		return schemas
	}

	async listTables(
		databaseName: string,
		schemaName: string,
	): Promise<TableMetadata[]> {
		const cacheKey = `tables:${databaseName}:${schemaName}`
		const cached = this.cache.get<TableMetadata[]>(cacheKey)
		if (cached) return cached

		// SHOW TABLES and SHOW VIEWS are independent — fire them in parallel
		// so the explorer expand cost is one round-trip, not two. Matters
		// most for large shared schemas like SNOWFLAKE_SAMPLE_DATA.TPCH_SF1000
		// where each SHOW can take several seconds.
		const fqs = `${quoteSfIdent(databaseName)}.${quoteSfIdent(schemaName)}`
		const [tableResult, viewResult] = await this.withMetadataTimeout(
			`Listing objects in ${databaseName}.${schemaName}`,
			(signal) =>
				Promise.all([
					this.executeStatement(`SHOW TABLES IN ${fqs}`, { signal }),
					this.executeStatement(`SHOW VIEWS IN ${fqs}`, { signal }),
				]),
		)

		const tables: TableMetadata[] = []

		for (const row of tableResult.data ?? []) {
			tables.push({
				id: row[1] as string,
				name: row[1] as string,
				catalog: databaseName,
				schema: schemaName,
				type: ((row[4] as string) ?? "TABLE").toLowerCase(),
				rowCount: row[7] ? parseInt(row[7] as string, 10) : undefined,
				sizeBytes: row[8] ? parseInt(row[8] as string, 10) : undefined,
				description: row[5] as string | undefined,
				created: row[0] ? new Date(row[0] as string) : undefined,
			})
		}

		for (const row of viewResult.data ?? []) {
			tables.push({
				id: row[1] as string,
				name: row[1] as string,
				catalog: databaseName,
				schema: schemaName,
				type: "view",
				description: row[5] as string | undefined,
				created: row[0] ? new Date(row[0] as string) : undefined,
			})
		}

		this.cache.set(cacheKey, tables)
		return tables
	}

	async getTableMetadata(
		databaseName: string,
		schemaName: string,
		tableName: string,
	): Promise<TableMetadata> {
		const cacheKey = `table:${databaseName}:${schemaName}:${tableName}`
		const cached = this.cache.get<TableMetadata>(cacheKey)
		if (cached) return cached

		// Fire columns + tables-like in parallel under one timeout — same
		// pattern as listTables.
		const fqt = `${quoteSfIdent(databaseName)}.${quoteSfIdent(schemaName)}.${quoteSfIdent(tableName)}`
		const [columnsResult, tableResult] = await this.withMetadataTimeout(
			`Loading metadata for ${databaseName}.${schemaName}.${tableName}`,
			(signal) =>
				Promise.all([
					this.executeStatement(`SHOW COLUMNS IN TABLE ${fqt}`, { signal }),
					this.executeStatement(
						`SHOW TABLES LIKE '${escapeSfLiteral(tableName)}' IN ${quoteSfIdent(databaseName)}.${quoteSfIdent(schemaName)}`,
						{ signal },
					),
				]),
		)
		const columns: ColumnInfo[] = []
		for (const row of columnsResult.data ?? []) {
			// SHOW COLUMNS returns data_type as a JSON string with the
			// internal storage shape (FIXED / TEXT / TIMESTAMP_NTZ / ...).
			// Format it back to the user-facing types DESCRIBE TABLE shows
			// (NUMBER(p,s), VARCHAR(n), TIMESTAMP_NTZ(p), ...).
			const dataTypeJson = row[3] as string
			const columnType = formatSnowflakeColumnType(dataTypeJson)
			columns.push({
				name: row[2] as string,
				type: columnType,
				nullable: (row[4] as string) === "Y",
				comment: row[8] as string | undefined,
			})
		}

		let metadata: TableMetadata = {
			id: tableName,
			name: tableName,
			catalog: databaseName,
			schema: schemaName,
			columns,
		}
		const tableRow = tableResult.data?.[0]
		if (tableRow) {
			metadata = {
				...metadata,
				type: ((tableRow[4] as string) ?? "table").toLowerCase(),
				rowCount: tableRow[7]
					? parseInt(tableRow[7] as string, 10)
					: undefined,
				sizeBytes: tableRow[8]
					? parseInt(tableRow[8] as string, 10)
					: undefined,
				description: tableRow[5] as string | undefined,
				created: tableRow[0] ? new Date(tableRow[0] as string) : undefined,
			}
		}

		this.cache.set(cacheKey, metadata)
		return metadata
	}

	async getSchema(): Promise<Schema> {
		const tables: TableInfo[] = []
		if (this.database && this.schemaName) {
			try {
				const tableMetas = await this.listTables(
					this.database,
					this.schemaName,
				)
				for (const t of tableMetas) {
					const full = await this.getTableMetadata(
						this.database,
						this.schemaName,
						t.name,
					)
					tables.push({
						name: t.name,
						schema: this.schemaName,
						type: t.type,
						columns: full.columns,
					})
				}
			} catch (e) {
				logger.error("Failed to get schema", e)
			}
		}
		return {
			tables,
			database: this.database || undefined,
		}
	}

	// -------------------------------------------------------------------------
	// Query (with real partition iteration)
	// -------------------------------------------------------------------------

	async *query(
		sql: string,
		opts?: QueryOptions,
	): AsyncGenerator<QueryChunk> {
		if (!this.warehouse) {
			throw new Error(
				"Snowflake warehouse is not set. Configure a warehouse before running queries.",
			)
		}

		// Snowflake's v2 SQL API rejects `USE <object>` in single-statement
		// requests — it's listed under "Commands that change the context of
		// the session" in the docs. Surface a clear error pointing users to
		// the topbar dropdowns (which dbxlite implements via per-statement
		// session params + ALTER SESSION on the catalog/schema chips).
		// Docs: https://docs.snowflake.com/en/developer-guide/sql-api/intro#limitations-of-the-sql-api
		const useMatch = sql.match(/^\s*USE\s+(\w+)/i)
		if (useMatch) {
			const target = useMatch[1].toUpperCase()
			const chipHint =
				target === "WAREHOUSE"
					? "warehouse"
					: target === "ROLE"
						? "role"
						: target === "SCHEMA"
							? "schema"
							: "database"
			throw new Error(
				`USE is not supported by Snowflake's SQL API. To switch ${chipHint}, click the snowflake icon in the top-right toolbar and use the ${chipHint} chip. To run a single query against another ${chipHint}, fully qualify it (e.g. \`SELECT * FROM db.schema.table\`). Docs: https://docs.snowflake.com/en/developer-guide/sql-api/intro#limitations-of-the-sql-api`,
			)
		}

		const signal = opts?.signal
		if (signal?.aborted) {
			throw new DOMException("Query aborted before start", "AbortError")
		}

		const initial = await this.executeStatement(sql, {
			timeout: opts?.timeout ? Math.floor(opts.timeout / 1000) : 60,
			signal,
		})

		// 090001 = "Statement executed successfully" — only present on certain
		// async-mode responses. Other codes indicate failure.
		if (initial.code && initial.code !== "090001") {
			throw new Error(initial.message ?? `Query failed with code ${initial.code}`)
		}

		// Track the handle immediately so cancel() can find it even mid-fetch.
		const queryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
		if (initial.statementHandle) {
			this.activeStatements.set(queryId, initial.statementHandle)
		}

		// On abort mid-stream, fire-and-forget cancel to stop billing.
		const handleAbort = () => {
			if (initial.statementHandle) {
				this.cancel(queryId).catch(() => {
					// Best-effort; the statement may already be done.
				})
			}
		}
		signal?.addEventListener("abort", handleAbort)

		try {
			const rowType = initial.resultSetMetaData?.rowType ?? []
			const partitions = initial.resultSetMetaData?.partitionInfo ?? []
			const totalRows = initial.resultSetMetaData?.numRows

			const schema: Schema | undefined = rowType.length
				? {
						tables: [
							{
								name: "query_result",
								columns: rowType.map((col) => ({
									name: col.name,
									type: col.type,
									nullable: col.nullable,
								})),
							},
						],
				  }
				: undefined

			// Partition 0 is included in the initial response
			const firstRows = this.parseRows(initial.data ?? [], rowType)
			const isLast = partitions.length <= 1

			yield {
				rows: firstRows,
				done: isLast,
				schema,
				totalRows: isLast ? totalRows : undefined,
				connectorQueryId: initial.statementHandle,
			}

			// Fetch and yield additional partitions
			for (let i = 1; i < partitions.length; i++) {
				if (signal?.aborted) {
					throw new DOMException("Query aborted", "AbortError")
				}
				if (!initial.statementHandle) break // can't fetch without a handle
				const part = await this.fetchPartition(
					initial.statementHandle,
					i,
					signal,
				)
				const rows = this.parseRows(part.data ?? [], rowType)
				const last = i === partitions.length - 1
				yield {
					rows,
					done: last,
					totalRows: last ? totalRows : undefined,
				}
			}
		} finally {
			signal?.removeEventListener("abort", handleAbort)
			this.activeStatements.delete(queryId)
		}
	}

	async cancel(queryId: string): Promise<void> {
		const handle = this.activeStatements.get(queryId)
		if (!handle) return
		try {
			await this.apiRequest(`/statements/${handle}/cancel`, { method: "POST" })
		} catch (error) {
			logger.error("Failed to cancel query", error)
		} finally {
			this.activeStatements.delete(queryId)
		}
	}

	async estimateQueryCost(_sql: string): Promise<QueryCostEstimate> {
		// Snowflake doesn't expose a free dry-run cost API.
		return {
			estimatedBytes: 0,
			estimatedCostUSD: undefined,
			cachingPossible: true,
		}
	}

	async testConnection(): Promise<ConnectionTestResult> {
		const start = Date.now()
		try {
			await this.resolveBearer()
			await this.executeStatement("SELECT 1 AS test")
			return {
				success: true,
				latencyMs: Date.now() - start,
				metadata: {
					account: this.accountIdentifier,
					warehouse: this.warehouse,
					database: this.database,
					schema: this.schemaName,
					role: this.role,
				},
			}
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Connection test failed",
				latencyMs: Date.now() - start,
			}
		}
	}

	isConnected(): boolean {
		if (this.authMode === "pat") {
			// PATs have a server-side expiry (max 90d) but no client-readable
			// expiry timestamp — we treat the in-memory token as "connected"
			// and let the SQL API surface auth failures if the token is
			// revoked or expired.
			return !!this.patToken
		}
		if (!this.token) return false
		// If we have a refresh token, we can roll the access token on demand
		// (query() does this automatically), so the user is effectively
		// connected regardless of access-token freshness. Without a refresh
		// token, fall back to strict expiry check.
		if (this.token.refresh_token) return true
		const expiresAt =
			this.token.obtained_at + this.token.expires_in * 1000 - 60000
		return Date.now() < expiresAt
	}

	async initializeFromStorage(): Promise<boolean> {
		// Detect auth mode from stored config first; legacy configs without
		// authMode default to OAuth (back-compat).
		const config = (await this.creds.load(this.configKey)) as
			| StoredConfig
			| null
		const storedMode = config?.authMode ?? "oauth"
		this.authMode = storedMode

		if (storedMode === "pat") {
			const stored = (await this.creds.load(this.patKey)) as string | null
			if (!stored) return false
			this.patToken = stored
		} else {
			const token = (await this.creds.load(this.tokenKey)) as
				| OAuthToken
				| null
			if (!token) return false
			this.token = token
		}

		if (config) {
			if (config.account) {
				try {
					const acc = parseSnowflakeAccount(config.account)
					this.accountIdentifier = acc.identifier
					this.accountHostname = acc.hostname
				} catch {
					// keep existing
				}
			}
			if (config.clientId) this.clientId = config.clientId
			if (config.clientSecret) {
				// secret is part of stored config; if present, restore it
				;(this as unknown as { clientSecret: string }).clientSecret =
					config.clientSecret
			}
			this.warehouse = config.warehouse ?? this.warehouse
			this.database = config.database ?? this.database
			this.schemaName = config.schema ?? this.schemaName
			this.role = config.role ?? this.role
		}

		if (!this.isConnected()) {
			if (this.token.refresh_token) {
				try {
					await this.refreshToken()
					return true
				} catch (e) {
					logger.debug("Token refresh failed during initialization", e)
					return false
				}
			}
			return false
		}
		return true
	}

	async updateConfig(config: {
		warehouse?: string
		database?: string
		schema?: string
		role?: string
	}): Promise<void> {
		if (config.warehouse !== undefined) this.warehouse = config.warehouse
		if (config.database !== undefined) this.database = config.database
		if (config.schema !== undefined) this.schemaName = config.schema
		if (config.role !== undefined) this.role = config.role
		await this.creds.save(this.configKey, this.snapshotConfig())
		this.cache.clear()
	}

	async revoke(): Promise<void> {
		this.token = null
		this.patToken = ""
		this.cache.clear()
		this.activeStatements.clear()
		await this.creds.save(this.tokenKey, null)
		await this.creds.save(this.patKey, null)
		await this.creds.save(this.configKey, null)
		try {
			localStorage.removeItem(OAUTH_AUTO_CONNECT_LSKEY)
		} catch {}
	}

	clearCache(): void {
		this.cache.clear()
	}

	async exportEncrypted(passphrase: string): Promise<string> {
		if (!this.token) throw new Error("No token to export")
		const config = await this.creds.load(this.configKey)
		const em = new EncryptionManager()
		return em.encryptWithPassphrase(
			passphrase,
			JSON.stringify({ token: this.token, config }),
		)
	}

	async importEncrypted(blob: string, passphrase: string): Promise<void> {
		const em = new EncryptionManager()
		const txt = await em.decryptWithPassphrase(passphrase, blob)
		const obj = JSON.parse(txt) as {
			token: OAuthToken
			config: StoredConfig | null
		}
		await this.creds.save(this.tokenKey, obj.token)
		await this.creds.save(this.configKey, obj.config)
		this.token = obj.token
		if (obj.config) {
			if (obj.config.account) {
				const acc = parseSnowflakeAccount(obj.config.account)
				this.accountIdentifier = acc.identifier
				this.accountHostname = acc.hostname
			}
			if (obj.config.clientId) this.clientId = obj.config.clientId
			this.warehouse = obj.config.warehouse ?? ""
			this.database = obj.config.database ?? ""
			this.schemaName = obj.config.schema ?? ""
			this.role = obj.config.role ?? ""
		}
		this.cache.clear()
	}

	// -------------------------------------------------------------------------
	// Row / value parsing
	// -------------------------------------------------------------------------

	private parseRows(
		data: unknown[][],
		rowType: SnowflakeColumnMeta[],
	): Record<string, unknown>[] {
		if (!data || data.length === 0) return []
		if (!rowType || rowType.length === 0) return []

		return data.map((row) => {
			const obj: Record<string, unknown> = {}
			rowType.forEach((col, index) => {
				obj[col.name] = parseSnowflakeValue(row[index], col)
			})
			return obj
		})
	}

	private snapshotConfig(): StoredConfig {
		const config: StoredConfig = {
			account: this.accountIdentifier,
			clientId: this.clientId,
			warehouse: this.warehouse,
			database: this.database,
			schema: this.schemaName,
			role: this.role,
			authMode: this.authMode,
		}
		// Only persist clientSecret when present (confidential client mode).
		// Public client mode stores no secret — even encrypted at rest, an
		// absent secret is the strongest defense.
		if (this.clientSecret) {
			config.clientSecret = this.clientSecret
		}
		return config
	}
}

// ---------------------------------------------------------------------------
// Value parsing — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Parse a Snowflake value based on its column metadata.
 *
 * Snowflake quirks (jsonv2 wire format):
 *   - Numerics arrive as strings.
 *   - FIXED is the wire name for integer/decimal; scale=0 → integer,
 *     scale>0 → keep as string for precision.
 *   - VARIANT/OBJECT/ARRAY arrive as JSON-encoded strings.
 *   - BOOLEAN may be 'true'/'false'/true/false/1/0.
 *   - TIMESTAMP_LTZ/NTZ are nanosecond-precision epoch strings.
 *   - TIMESTAMP_TZ is "epoch.frac offset_minutes".
 */

/**
 * Render the data_type JSON returned by SHOW COLUMNS as the canonical
 * Snowflake type string DESCRIBE TABLE produces. SHOW COLUMNS returns
 * internal storage shapes (FIXED, TEXT, REAL, …); users expect
 * NUMBER(p,s), VARCHAR(n), FLOAT, etc.
 */
export function formatSnowflakeColumnType(dataTypeJson: string): string {
	let parsed: {
		type?: string
		precision?: number
		scale?: number
		length?: number
		fixed?: boolean
	}
	try {
		parsed = JSON.parse(dataTypeJson)
	} catch {
		return dataTypeJson || "UNKNOWN"
	}
	const t = (parsed.type ?? "").toUpperCase()
	switch (t) {
		case "FIXED": {
			const p = parsed.precision ?? 38
			const s = parsed.scale ?? 0
			return `NUMBER(${p},${s})`
		}
		case "TEXT": {
			// length === 16777216 is the unbounded VARCHAR; render as TEXT.
			const len = parsed.length
			if (len === undefined || len === 16_777_216) return "TEXT"
			return `VARCHAR(${len})`
		}
		case "BINARY": {
			const len = parsed.length
			return len !== undefined ? `BINARY(${len})` : "BINARY"
		}
		case "REAL":
			return "FLOAT"
		case "TIMESTAMP_NTZ":
		case "TIMESTAMP_LTZ":
		case "TIMESTAMP_TZ":
		case "TIME": {
			const p = parsed.precision ?? parsed.scale
			return p !== undefined ? `${t}(${p})` : t
		}
		// DATE, BOOLEAN, VARIANT, OBJECT, ARRAY, GEOGRAPHY, GEOMETRY,
		// VECTOR — pass through as-is.
		default:
			return t || "UNKNOWN"
	}
}

export function parseSnowflakeValue(
	value: unknown,
	col: { type: string; scale?: number },
): unknown {
	if (value === null || value === undefined) return null

	const upper = col.type.toUpperCase()

	switch (upper) {
		case "FIXED":
			return parseFixed(value, col.scale ?? 0)

		case "NUMBER":
		case "DECIMAL":
		case "NUMERIC":
			// Numeric with potential scale — treat like FIXED.
			return parseFixed(value, col.scale ?? 0)

		case "INT":
		case "INTEGER":
		case "BIGINT":
		case "SMALLINT":
		case "TINYINT":
		case "BYTEINT":
			return typeof value === "string" ? parseInt(value, 10) : value

		case "FLOAT":
		case "FLOAT4":
		case "FLOAT8":
		case "DOUBLE":
		case "DOUBLE PRECISION":
		case "REAL":
			return typeof value === "string" ? parseFloat(value) : value

		case "BOOLEAN":
			return value === true || value === "true" || value === 1

		case "DATE":
			// Snowflake DATE is days-since-epoch (string) in jsonv2
			if (typeof value === "string" && /^-?\d+$/.test(value)) {
				const days = parseInt(value, 10)
				return new Date(days * 86400000)
			}
			return value

		case "TIME":
			// "HH:MM:SS[.fraction]" — keep as string for formatters
			return value

		case "DATETIME":
		case "TIMESTAMP":
		case "TIMESTAMP_LTZ":
		case "TIMESTAMP_NTZ":
		case "TIMESTAMP_TZ":
			return parseSnowflakeTimestamp(value, upper)

		case "VARIANT":
		case "OBJECT":
		case "ARRAY":
			if (typeof value === "string") {
				try {
					return JSON.parse(value)
				} catch {
					return value
				}
			}
			return value

		case "BINARY":
			return value // hex string, leave as-is

		default:
			return value
	}
}

/**
 * Parse FIXED/NUMBER/DECIMAL.
 * - scale 0 → integer
 * - scale >0 → string preserved (precision matters)
 */
export function parseFixed(value: unknown, scale: number): unknown {
	if (value === null || value === undefined) return null
	if (scale > 0) {
		// Keep as string; downstream formatters/UI handle display.
		return typeof value === "string" ? value : String(value)
	}
	if (typeof value === "string") return parseInt(value, 10)
	if (typeof value === "number") return value
	return value
}

/**
 * Parse Snowflake timestamps.
 *
 * jsonv2 wire formats:
 *   TIMESTAMP_LTZ / TIMESTAMP_NTZ / TIMESTAMP / DATETIME:
 *     "epoch_seconds.fractional_nanoseconds"  e.g. "1701648000.000000000"
 *   TIMESTAMP_TZ:
 *     "epoch_seconds.fraction offset_minutes"  e.g. "1701648000.000000000 1440"
 *     where offset_minutes is minutes-since-midnight-UTC offset (1440 = +0:00,
 *     1500 = +1:00, 1380 = -1:00). Decoded as `(offset - 1440)` minutes.
 *
 * Returns a Date object. NTZ is intentionally still returned as a Date
 * representing the instant; downstream UI can format it as wall-clock.
 */
export function parseSnowflakeTimestamp(value: unknown, type: string): Date {
	if (typeof value !== "string") {
		// May already be a Date or pre-parsed value — best effort
		return value instanceof Date ? value : new Date(value as string)
	}

	let epochPart = value
	if (type === "TIMESTAMP_TZ") {
		const sp = value.indexOf(" ")
		if (sp !== -1) {
			epochPart = value.slice(0, sp)
			// We don't apply the offset to the Date object — Date is always UTC
			// internally. Callers that need wall-clock + offset rendering can
			// pass through a DTO; for now the instant is correct.
		}
	}

	// Snowflake jsonv2 epoch format: optional sign, digits, optional fraction.
	// Anything else (e.g. ISO 8601) falls back to Date constructor parsing,
	// which handles "2024-01-01T00:00:00Z" correctly.
	if (!/^-?\d+(\.\d+)?$/.test(epochPart)) {
		return new Date(value)
	}
	const num = parseFloat(epochPart)
	if (!Number.isFinite(num)) {
		return new Date(value)
	}
	return new Date(num * 1000)
}
