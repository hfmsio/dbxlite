/**
 * Snowflake account identifier parsing.
 *
 * Snowflake accounts come in many forms; users paste any of them into the
 * setup dialog and the connector needs the canonical identifier + hostname.
 * Centralized so the dialog and connector can't drift.
 *
 * Accepted inputs:
 *   - `xy12345`                                       (legacy locator)
 *   - `xy12345.us-east-2`                             (locator + region)
 *   - `xy12345.us-east-2.aws`                         (locator + region + cloud)
 *   - `myorg-myacct`                                  (org-account format)
 *   - `https://xy12345.us-east-2.aws.snowflakecomputing.com`  (full URL)
 *   - `xy12345.us-east-2.aws.snowflakecomputing.com`  (hostname only)
 */

export interface SnowflakeAccount {
	/** Canonical identifier — what goes into URLs (e.g. `xy12345.us-east-2.aws`). */
	identifier: string
	/** Full hostname (e.g. `xy12345.us-east-2.aws.snowflakecomputing.com`). */
	hostname: string
}

const SNOWFLAKE_DOMAIN = ".snowflakecomputing.com"

export function parseSnowflakeAccount(input: string): SnowflakeAccount {
	const trimmed = input.trim()
	if (!trimmed) throw new Error("Snowflake account identifier is required")

	// Strip protocol if present
	let host = trimmed.replace(/^https?:\/\//i, "")

	// Strip path/query if present
	host = host.split("/")[0].split("?")[0]

	// If the hostname includes the snowflake domain, peel it off
	let identifier: string
	if (host.toLowerCase().endsWith(SNOWFLAKE_DOMAIN)) {
		identifier = host.slice(0, -SNOWFLAKE_DOMAIN.length)
	} else {
		identifier = host
	}

	identifier = identifier.toLowerCase()

	if (!identifier) {
		throw new Error(`Could not parse Snowflake account from: ${input}`)
	}

	// Validate: identifier characters
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(identifier)) {
		throw new Error(`Invalid Snowflake account identifier: ${identifier}`)
	}

	return {
		identifier,
		hostname: `${identifier}${SNOWFLAKE_DOMAIN}`,
	}
}
