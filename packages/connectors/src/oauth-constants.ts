/**
 * OAuth callback constants — single source of truth shared across the
 * connectors package and the web-client app.
 *
 * Imported by:
 *   - SnowflakeConnector (waits for the callback, validates state)
 *   - apps/web-client/src/oauth-callback page (delivers the code via
 *     three channels: postMessage, BroadcastChannel, localStorage)
 *   - apps/web-client/src/utils/oauth-constants.ts (re-exports for
 *     historical import paths in the app)
 *
 * Renaming a key here propagates to all consumers. Don't hardcode the
 * strings elsewhere — every duplication has caused a regression.
 */

export const SNOWFLAKE_OAUTH_RESPONSE_KEY = "snowflake_oauth_response";
export const SNOWFLAKE_OAUTH_ERROR_KEY = "snowflake_oauth_error";
export const SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY = "snowflake-auto-connect";
export const SNOWFLAKE_TOKEN_KEY = "snowflake-token";
export const SNOWFLAKE_CONFIG_KEY = "snowflake-config";
export const SNOWFLAKE_PKCE_VERIFIER_KEY = "snowflake_pkce_verifier";
export const SNOWFLAKE_OAUTH_STATE_KEY = "snowflake_oauth_state";

export const SNOWFLAKE_OAUTH_BROADCAST_CHANNEL = "snowflake_oauth";
export const SNOWFLAKE_OAUTH_CALLBACK_PATH = "/oauth-callback.html";

export type OAuthCodeMessage = {
	type: "oauth_code";
	code: string;
	state: string;
};

export type OAuthErrorMessage = {
	type: "oauth_error";
	error: string;
};

export type OAuthMessage = OAuthCodeMessage | OAuthErrorMessage;
