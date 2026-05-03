/**
 * OAuth callback constants — single source of truth.
 *
 * Imported by:
 *   - Snowflake connector (waits for callback)
 *   - oauth-callback page (delivers callback via 3 channels)
 *
 * Renaming a key here propagates to both ends. Don't hardcode these strings
 * elsewhere.
 *
 * Note: this file is also referenced by the OAuth callback HTML page, which
 * is registered as a Vite multi-page entry in vite.config.ts so it can
 * `import` from this module like any other source file.
 */

export const SNOWFLAKE_OAUTH_RESPONSE_KEY = "snowflake_oauth_response"
export const SNOWFLAKE_OAUTH_ERROR_KEY = "snowflake_oauth_error"
export const SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY = "snowflake-auto-connect"
export const SNOWFLAKE_TOKEN_KEY = "snowflake-token"
export const SNOWFLAKE_CONFIG_KEY = "snowflake-config"
export const SNOWFLAKE_PKCE_VERIFIER_KEY = "snowflake_pkce_verifier"
export const SNOWFLAKE_OAUTH_STATE_KEY = "snowflake_oauth_state"

export const SNOWFLAKE_OAUTH_BROADCAST_CHANNEL = "snowflake_oauth"
export const SNOWFLAKE_OAUTH_CALLBACK_PATH = "/oauth-callback.html"

export type OAuthCodeMessage = {
	type: "oauth_code"
	code: string
	state: string
}

export type OAuthErrorMessage = {
	type: "oauth_error"
	error: string
}

export type OAuthMessage = OAuthCodeMessage | OAuthErrorMessage
