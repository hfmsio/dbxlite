/**
 * Value-pinning test: catches an accidental rename that would break
 * cross-tab OAuth callbacks. Constants now live in a single file
 * (packages/connectors/src/oauth-constants.ts); this test imports them
 * via the re-export at apps/web-client/src/utils/oauth-constants.ts to
 * confirm the package + the historical app import path agree.
 */
import { describe, expect, it } from "vitest"
import {
	SNOWFLAKE_OAUTH_BROADCAST_CHANNEL,
	SNOWFLAKE_OAUTH_CALLBACK_PATH,
	SNOWFLAKE_OAUTH_RESPONSE_KEY,
	SNOWFLAKE_OAUTH_ERROR_KEY,
	SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY,
} from "../utils/oauth-constants"

describe("Snowflake OAuth constants pin to known values", () => {
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
