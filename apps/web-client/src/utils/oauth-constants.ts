/**
 * @deprecated Import from `@ide/connectors` directly.
 *
 * This file exists only to preserve the import path used by the
 * oauth-callback HTML page (registered as a Vite multi-page entry)
 * and any in-app code that hasn't been migrated yet. The real
 * source of truth lives in `packages/connectors/src/oauth-constants.ts`.
 */
export {
	SNOWFLAKE_OAUTH_RESPONSE_KEY,
	SNOWFLAKE_OAUTH_ERROR_KEY,
	SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY,
	SNOWFLAKE_TOKEN_KEY,
	SNOWFLAKE_CONFIG_KEY,
	SNOWFLAKE_PKCE_VERIFIER_KEY,
	SNOWFLAKE_OAUTH_STATE_KEY,
	SNOWFLAKE_OAUTH_BROADCAST_CHANNEL,
	SNOWFLAKE_OAUTH_CALLBACK_PATH,
} from "@ide/connectors";
export type {
	OAuthCodeMessage,
	OAuthErrorMessage,
	OAuthMessage,
} from "@ide/connectors";
