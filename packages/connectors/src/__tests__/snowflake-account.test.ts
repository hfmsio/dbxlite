import { describe, expect, it } from "vitest"
import { parseSnowflakeAccount } from "../snowflake-account"

describe("parseSnowflakeAccount", () => {
	it("accepts a bare locator", () => {
		expect(parseSnowflakeAccount("xy12345")).toEqual({
			identifier: "xy12345",
			hostname: "xy12345.snowflakecomputing.com",
		})
	})

	it("accepts locator + region", () => {
		expect(parseSnowflakeAccount("xy12345.us-east-2")).toEqual({
			identifier: "xy12345.us-east-2",
			hostname: "xy12345.us-east-2.snowflakecomputing.com",
		})
	})

	it("accepts locator + region + cloud", () => {
		expect(parseSnowflakeAccount("xy12345.us-east-2.aws")).toEqual({
			identifier: "xy12345.us-east-2.aws",
			hostname: "xy12345.us-east-2.aws.snowflakecomputing.com",
		})
	})

	it("accepts org-account hyphenated form", () => {
		expect(parseSnowflakeAccount("myorg-myacct")).toEqual({
			identifier: "myorg-myacct",
			hostname: "myorg-myacct.snowflakecomputing.com",
		})
	})

	it("strips the snowflake domain from hostname-only input", () => {
		expect(
			parseSnowflakeAccount("xy12345.us-east-2.aws.snowflakecomputing.com"),
		).toEqual({
			identifier: "xy12345.us-east-2.aws",
			hostname: "xy12345.us-east-2.aws.snowflakecomputing.com",
		})
	})

	it("strips https:// prefix", () => {
		expect(
			parseSnowflakeAccount(
				"https://xy12345.us-east-2.aws.snowflakecomputing.com",
			),
		).toEqual({
			identifier: "xy12345.us-east-2.aws",
			hostname: "xy12345.us-east-2.aws.snowflakecomputing.com",
		})
	})

	it("strips paths/queries", () => {
		expect(
			parseSnowflakeAccount("https://xy12345.snowflakecomputing.com/login"),
		).toEqual({
			identifier: "xy12345",
			hostname: "xy12345.snowflakecomputing.com",
		})
	})

	it("lowercases the identifier", () => {
		expect(parseSnowflakeAccount("XY12345")).toEqual({
			identifier: "xy12345",
			hostname: "xy12345.snowflakecomputing.com",
		})
	})

	it("trims whitespace", () => {
		expect(parseSnowflakeAccount("  xy12345  ")).toEqual({
			identifier: "xy12345",
			hostname: "xy12345.snowflakecomputing.com",
		})
	})

	it("rejects empty input", () => {
		expect(() => parseSnowflakeAccount("")).toThrow(/required/i)
		expect(() => parseSnowflakeAccount("   ")).toThrow(/required/i)
	})

	it("rejects identifiers with disallowed characters", () => {
		expect(() => parseSnowflakeAccount("foo bar")).toThrow(/invalid/i)
		expect(() => parseSnowflakeAccount("foo!")).toThrow(/invalid/i)
	})
})
