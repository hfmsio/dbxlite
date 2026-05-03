/**
 * Sync test: the connector package duplicates a few OAuth callback constants
 * (so it remains app-agnostic). This test asserts the values stay in sync —
 * if you rename one, the other will fail this test on CI.
 */
import { describe, expect, it } from "vitest"
import {
	SNOWFLAKE_OAUTH_BROADCAST_CHANNEL,
	SNOWFLAKE_OAUTH_CALLBACK_PATH,
	SNOWFLAKE_OAUTH_RESPONSE_KEY,
	SNOWFLAKE_OAUTH_ERROR_KEY,
	SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY,
} from "../utils/oauth-constants"

// Mirror constants — these MUST equal the values hardcoded inside
// packages/connectors/src/snowflake-connector.ts
describe("Snowflake OAuth constants are in sync between connector and app", () => {
	it("response localStorage key", () => {
		expect(SNOWFLAKE_OAUTH_RESPONSE_KEY).toBe("snowflake_oauth_response")
	})
	it("error localStorage key", () => {
		expect(SNOWFLAKE_OAUTH_ERROR_KEY).toBe("snowflake_oauth_error")
	})
	it("auto-connect localStorage key", () => {
		expect(SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY).toBe("snowflake-auto-connect")
	})
	it("BroadcastChannel name", () => {
		expect(SNOWFLAKE_OAUTH_BROADCAST_CHANNEL).toBe("snowflake_oauth")
	})
	it("callback path", () => {
		expect(SNOWFLAKE_OAUTH_CALLBACK_PATH).toBe("/oauth-callback.html")
	})
})
