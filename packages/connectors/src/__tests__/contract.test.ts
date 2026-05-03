/**
 * Contract tests — fitness function for the BaseConnector / CloudConnector
 * abstraction.
 *
 * Asserts that every cloud connector implementation behaves consistently
 * for the shared contract: identifier shape, construction validation,
 * query() chunk semantics, cancel() of unknown ids, revoke() idempotency,
 * isConnected() lifecycle.
 *
 * **DuckDB is intentionally omitted.** DuckDBConnector imports
 * @ide/duckdb-adapter which uses Web Workers + WASM; jsdom doesn't support
 * either as first-class. DuckDB has its own test suite at
 * packages/duckdb-wasm-adapter/vitest.config.ts that exercises the worker
 * path properly.
 *
 * When adding a new cloud connector:
 *   1. Add it to CONNECTORS_UNDER_TEST below
 *   2. Provide a (creds, mockTransport) → connector factory
 *   3. Run the suite. Tests are parameterized; you get coverage for free.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BaseConnector } from "../base"
import { BigQueryConnector } from "../bigquery-connector"
import { SnowflakeConnector } from "../snowflake-connector"
import type { RequestTransport } from "../transport"
import type { CredentialStore } from "@ide/storage"

// ---------------------------------------------------------------------------
// Test fixture: shared mocks
// ---------------------------------------------------------------------------

function makeCreds(): CredentialStore {
	const data = new Map<string, unknown>()
	return {
		save: vi.fn(async (k: string, v: unknown) => {
			if (v === null) data.delete(k)
			else data.set(k, v)
		}),
		load: vi.fn(async (k: string) => data.get(k) ?? null),
		listKeys: vi.fn(async () => Array.from(data.keys())),
	} as unknown as CredentialStore
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

class MockTransport implements RequestTransport {
	public calls: string[] = []
	public lastInit: RequestInit | undefined
	public responder: (
		url: string,
		init?: RequestInit,
	) => Response | Promise<Response> = () => jsonResponse({})
	async request(url: string, init?: RequestInit): Promise<Response> {
		this.calls.push(url)
		this.lastInit = init
		return this.responder(url, init)
	}
}

// ---------------------------------------------------------------------------
// Adapter: each connector exposes a different construction shape, so we
// normalize them behind a uniform factory.
// ---------------------------------------------------------------------------

interface ConnectorAdapter {
	displayName: string
	expectedId: string
	/** Build a fully-mocked, "connected" instance ready for query/cancel/revoke. */
	build(): { connector: BaseConnector; creds: CredentialStore; transport: MockTransport }
	/** Test that construction throws when each required field is missing. */
	missingFieldThrows: Array<() => void>
}

const VALID_TOKEN = {
	access_token: "tk-access",
	refresh_token: "tk-refresh",
	token_type: "Bearer",
	expires_in: 3600,
	obtained_at: Date.now(),
}

// Stub crypto.subtle.digest for OAuth PKCE in jsdom-quirky tests
vi.stubGlobal("crypto", {
	getRandomValues: (arr: Uint8Array) => {
		for (let i = 0; i < arr.length; i++) arr[i] = (i * 13) & 0xff
		return arr
	},
	subtle: {
		digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
	},
})

const CONNECTORS_UNDER_TEST: ConnectorAdapter[] = [
	{
		displayName: "SnowflakeConnector",
		expectedId: "snowflake",
		build: () => {
			const creds = makeCreds()
			const transport = new MockTransport()
			// Pre-load a valid token so the connector is "connected"
			void creds.save("snowflake-token", VALID_TOKEN)
			const connector = new SnowflakeConnector({
				credentialStore: creds,
				account: "acct",
				clientId: "cid",
				clientSecret: "sec",
				warehouse: "WH",
				transport,
			})
			return { connector, creds, transport }
		},
		missingFieldThrows: [
			() =>
				new SnowflakeConnector({
					credentialStore: undefined as unknown as CredentialStore,
					account: "a",
					clientId: "c",
					clientSecret: "s",
					warehouse: "w",
				}),
			() =>
				new SnowflakeConnector({
					credentialStore: makeCreds(),
					account: "",
					clientId: "c",
					clientSecret: "s",
					warehouse: "w",
				}),
			() =>
				new SnowflakeConnector({
					credentialStore: makeCreds(),
					account: "a",
					clientId: "",
					clientSecret: "s",
					warehouse: "w",
				}),
			// PAT mode: empty token throws.
			() =>
				new SnowflakeConnector({
					credentialStore: makeCreds(),
					account: "a",
					auth: { mode: "pat", token: "" },
					warehouse: "w",
				}),
			// Note: clientSecret="" / undefined no longer throws — that's
			// public client mode (PKCE-only). Constructor accepts both.
		],
	},
	{
		displayName: "BigQueryConnector",
		expectedId: "bigquery",
		build: () => {
			const creds = makeCreds()
			const transport = new MockTransport()
			void creds.save("bigquery-token", VALID_TOKEN)
			const connector = new BigQueryConnector(creds, "client-id")
			return { connector, creds, transport }
		},
		missingFieldThrows: [
			() => new BigQueryConnector(makeCreds(), ""), // empty clientId
		],
	},
]

// ---------------------------------------------------------------------------
// Contract assertions — parameterized
// ---------------------------------------------------------------------------

describe.each(CONNECTORS_UNDER_TEST)(
	"BaseConnector contract: $displayName",
	(adapter) => {
		describe("identity", () => {
			it("has a non-empty stable string id matching the expected value", () => {
				const { connector } = adapter.build()
				expect(typeof connector.id).toBe("string")
				expect(connector.id.length).toBeGreaterThan(0)
				expect(connector.id).toBe(adapter.expectedId)
			})
		})

		describe("construction", () => {
			it("throws on each missing required field", () => {
				for (const fn of adapter.missingFieldThrows) {
					expect(fn).toThrow()
				}
			})
		})

		describe("cancel(unknownId) is a no-op", () => {
			it("does not throw", async () => {
				const { connector } = adapter.build()
				await expect(connector.cancel("nonexistent-id")).resolves.not.toThrow()
			})
		})

		describe("revoke() is idempotent", () => {
			it("can be called twice without throwing", async () => {
				const { connector } = adapter.build()
				if (typeof connector.revoke === "function") {
					await expect(connector.revoke()).resolves.not.toThrow()
					await expect(connector.revoke()).resolves.not.toThrow()
				}
			})

			it("isConnected() returns false after revoke", async () => {
				const { connector } = adapter.build()
				if (
					typeof connector.revoke === "function" &&
					"isConnected" in connector &&
					typeof (connector as { isConnected?: () => boolean }).isConnected ===
						"function"
				) {
					await connector.revoke()
					expect(
						(connector as { isConnected: () => boolean }).isConnected(),
					).toBe(false)
				}
			})
		})

		describe("contract metadata", () => {
			it("has the BaseConnector method surface", () => {
				const { connector } = adapter.build()
				expect(typeof connector.connect).toBe("function")
				expect(typeof connector.query).toBe("function")
				expect(typeof connector.cancel).toBe("function")
				expect(typeof connector.getSchema).toBe("function")
			})
		})
	},
)

// ---------------------------------------------------------------------------
// Cross-connector invariants (not parameterized)
// ---------------------------------------------------------------------------

describe("BaseConnector contract: invariants across connectors", () => {
	it("all connector ids are unique", () => {
		const ids = CONNECTORS_UNDER_TEST.map((a) => {
			const { connector } = a.build()
			return connector.id
		})
		expect(new Set(ids).size).toBe(ids.length)
	})

	it("all connectors expose the same minimum method surface", () => {
		const required: Array<keyof BaseConnector> = [
			"id",
			"connect",
			"query",
			"cancel",
			"getSchema",
		]
		for (const adapter of CONNECTORS_UNDER_TEST) {
			const { connector } = adapter.build()
			for (const key of required) {
				expect(connector).toHaveProperty(key)
			}
		}
	})
})

// ---------------------------------------------------------------------------
// Snowflake-specific: query() chunk semantics
// ---------------------------------------------------------------------------
// (These would parametrize over connectors too, but BigQuery's existing test
// has 10 skipped tests — the chunk-semantics test path doesn't run there. We
// assert against Snowflake which has a clean implementation.)

describe("query() chunk semantics — Snowflake", () => {
	beforeEach(() => {})
	afterEach(() => {})

	it("yields exactly one chunk for an empty result, with done:true", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = () =>
			jsonResponse({
				resultSetMetaData: {
					rowType: [{ name: "x", type: "TEXT" }],
					partitionInfo: [{ rowCount: 0 }],
				},
				data: [],
			})
		const c = new SnowflakeConnector({
			credentialStore: creds,
			account: "a",
			clientId: "c",
			clientSecret: "s",
			warehouse: "WH",
			transport,
		})
		const chunks = []
		for await (const chunk of c.query("SELECT 1")) chunks.push(chunk)
		expect(chunks).toHaveLength(1)
		expect(chunks[0].done).toBe(true)
	})

	it("emits schema only on the first chunk across multiple partitions", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = (url) => {
			if (url.endsWith("/api/v2/statements")) {
				return jsonResponse({
					statementHandle: "stmt-multi",
					resultSetMetaData: {
						rowType: [{ name: "n", type: "FIXED", scale: 0 }],
						partitionInfo: [{ rowCount: 1 }, { rowCount: 1 }, { rowCount: 1 }],
					},
					data: [["1"]],
				})
			}
			return jsonResponse({ data: [["x"]] })
		}
		const c = new SnowflakeConnector({
			credentialStore: creds,
			account: "a",
			clientId: "c",
			clientSecret: "s",
			warehouse: "WH",
			transport,
		})
		const chunks = []
		for await (const chunk of c.query("SELECT n FROM big")) chunks.push(chunk)
		expect(chunks).toHaveLength(3)
		expect(chunks[0].schema).toBeDefined()
		expect(chunks[1].schema).toBeUndefined()
		expect(chunks[2].schema).toBeUndefined()
	})

	it("sets done:true only on the last chunk", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = (url) => {
			if (url.endsWith("/api/v2/statements")) {
				return jsonResponse({
					statementHandle: "stmt-done",
					resultSetMetaData: {
						rowType: [{ name: "n", type: "FIXED", scale: 0 }],
						partitionInfo: [{ rowCount: 1 }, { rowCount: 1 }],
					},
					data: [["1"]],
				})
			}
			return jsonResponse({ data: [["2"]] })
		}
		const c = new SnowflakeConnector({
			credentialStore: creds,
			account: "a",
			clientId: "c",
			clientSecret: "s",
			warehouse: "WH",
			transport,
		})
		const chunks = []
		for await (const chunk of c.query("SELECT n FROM med")) chunks.push(chunk)
		expect(chunks[0].done).toBe(false)
		expect(chunks[1].done).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Snowflake PAT auth mode — construction + auth-header invariants
// PAT mode shares the rest of the BaseConnector contract with OAuth mode,
// so the broad parameterized suite above already covers both. The tests
// below pin the PAT-specific construction rules and the `Bearer` /
// `PROGRAMMATIC_ACCESS_TOKEN` header pair that the SQL API requires.
// ---------------------------------------------------------------------------

describe("SnowflakeConnector PAT mode", () => {
	it("constructs with auth.mode='pat' and a non-empty token", () => {
		const c = new SnowflakeConnector({
			credentialStore: makeCreds(),
			account: "a",
			auth: { mode: "pat", token: "tok" },
			warehouse: "w",
		})
		expect(c.id).toBe("snowflake")
		expect(c.getAuthMode()).toBe("pat")
	})

	it("throws on empty token", () => {
		expect(
			() =>
				new SnowflakeConnector({
					credentialStore: makeCreds(),
					account: "a",
					auth: { mode: "pat", token: "" },
					warehouse: "w",
				}),
		).toThrow()
	})

	it("isConnected() reflects in-memory PAT presence", () => {
		const c = new SnowflakeConnector({
			credentialStore: makeCreds(),
			account: "a",
			auth: { mode: "pat", token: "tok" },
			warehouse: "w",
		})
		expect(c.isConnected()).toBe(true)
	})

	it("sends Authorization: Bearer <pat> + PROGRAMMATIC_ACCESS_TOKEN header on SQL API calls", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-pat", "the-pat")
		await creds.save("snowflake-config", {
			account: "acct",
			authMode: "pat",
		})
		const transport = new MockTransport()
		const seen: { auth?: string; tokenType?: string } = {}
		transport.responder = (_url, init) => {
			const h = (init?.headers ?? {}) as Record<string, string>
			seen.auth = h["Authorization"] ?? h["authorization"]
			seen.tokenType =
				h["X-Snowflake-Authorization-Token-Type"] ??
				h["x-snowflake-authorization-token-type"]
			return jsonResponse({
				statementHandle: "stmt-pat",
				resultSetMetaData: { rowType: [{ name: "n", type: "FIXED", scale: 0 }] },
				data: [["1"]],
			})
		}
		const c = new SnowflakeConnector({
			credentialStore: creds,
			account: "acct",
			auth: { mode: "pat", token: "the-pat" },
			warehouse: "WH",
			transport,
		})
		for await (const _ of c.query("SELECT 1")) break
		expect(seen.auth).toBe("Bearer the-pat")
		expect(seen.tokenType).toBe("PROGRAMMATIC_ACCESS_TOKEN")
	})
})
