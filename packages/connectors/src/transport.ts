/**
 * RequestTransport — abstraction over fetch for connector HTTP requests.
 *
 * Lets us swap how requests are routed (direct vs proxy vs mock) without
 * touching connector logic. Snowflake uses this to route through a Vite
 * dev proxy when running on localhost (Snowflake's REST API has no CORS).
 *
 * In Phase 3a a server-side proxy implementation will land for production.
 */

export interface RequestTransport {
	request(url: string, init?: RequestInit): Promise<Response>
}

export interface BrowserTransportOptions {
	/**
	 * If true (default for localhost), Snowflake REST URLs are rewritten
	 * to a `/api/snowflake/:account/...` proxy path. Vite dev proxy maps
	 * these back to https://${account}.snowflakecomputing.com/...
	 */
	useSnowflakeProxy?: boolean
	/**
	 * Hostname check for proxy decision. Override in tests.
	 */
	currentHostname?: string
}

const DEFAULT_PROXY_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"])

/**
 * Default browser transport. Direct fetch for most URLs; for URLs targeting
 * `*.snowflakecomputing.com`, rewrites to the dev proxy when running on
 * localhost.
 */
export class BrowserTransport implements RequestTransport {
	private readonly useSnowflakeProxy: boolean

	constructor(opts: BrowserTransportOptions = {}) {
		const hostname =
			opts.currentHostname ??
			(typeof window !== "undefined" ? window.location.hostname : "")
		this.useSnowflakeProxy =
			opts.useSnowflakeProxy ?? DEFAULT_PROXY_HOSTS.has(hostname)
	}

	async request(url: string, init?: RequestInit): Promise<Response> {
		const finalUrl = this.useSnowflakeProxy ? this.maybeProxyUrl(url) : url
		return fetch(finalUrl, init)
	}

	/**
	 * Rewrite Snowflake URLs to the dev proxy.
	 * `https://acct.snowflakecomputing.com/api/v2/statements`
	 *   → `/api/snowflake/acct/api/v2/statements`
	 */
	private maybeProxyUrl(url: string): string {
		const match = url.match(
			/^https?:\/\/([^.]+(?:\.[^.]+)*)\.snowflakecomputing\.com(\/.*)?$/,
		)
		if (!match) return url
		const account = match[1]
		const rest = match[2] ?? ""
		return `/api/snowflake/${account}${rest}`
	}
}
