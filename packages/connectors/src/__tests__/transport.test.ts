import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BrowserTransport } from "../transport"

describe("BrowserTransport", () => {
	const fetchSpy = vi.fn()

	beforeEach(() => {
		vi.stubGlobal("fetch", fetchSpy)
		fetchSpy.mockReset()
		fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }))
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("rewrites Snowflake URLs to the dev proxy on localhost", async () => {
		const t = new BrowserTransport({
			useSnowflakeProxy: true,
			currentHostname: "localhost",
		})
		await t.request("https://acct.snowflakecomputing.com/api/v2/statements")
		expect(fetchSpy).toHaveBeenCalledWith(
			"/api/snowflake/acct/api/v2/statements",
			undefined,
		)
	})

	it("rewrites Snowflake URLs with region+cloud subdomains", async () => {
		const t = new BrowserTransport({
			useSnowflakeProxy: true,
			currentHostname: "localhost",
		})
		await t.request(
			"https://xy12345.us-east-2.aws.snowflakecomputing.com/oauth/token-request",
		)
		expect(fetchSpy).toHaveBeenCalledWith(
			"/api/snowflake/xy12345.us-east-2.aws/oauth/token-request",
			undefined,
		)
	})

	it("does not rewrite non-Snowflake URLs", async () => {
		const t = new BrowserTransport({
			useSnowflakeProxy: true,
			currentHostname: "localhost",
		})
		await t.request("https://example.com/api")
		expect(fetchSpy).toHaveBeenCalledWith("https://example.com/api", undefined)
	})

	it("does not rewrite when proxy disabled (non-localhost)", async () => {
		const t = new BrowserTransport({
			useSnowflakeProxy: false,
			currentHostname: "app.example.com",
		})
		await t.request("https://acct.snowflakecomputing.com/api/v2/statements")
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://acct.snowflakecomputing.com/api/v2/statements",
			undefined,
		)
	})

	it("auto-enables proxy on localhost by default", async () => {
		const t = new BrowserTransport({ currentHostname: "localhost" })
		await t.request("https://acct.snowflakecomputing.com/api/v2/foo")
		expect(fetchSpy).toHaveBeenCalledWith(
			"/api/snowflake/acct/api/v2/foo",
			undefined,
		)
	})

	it("auto-disables proxy on non-localhost by default", async () => {
		const t = new BrowserTransport({ currentHostname: "app.example.com" })
		await t.request("https://acct.snowflakecomputing.com/api/v2/foo")
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://acct.snowflakecomputing.com/api/v2/foo",
			undefined,
		)
	})
})
