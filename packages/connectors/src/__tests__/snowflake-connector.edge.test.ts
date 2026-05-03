/**
 * Snowflake connector — edge cases (Phase 3b).
 *
 * Covers: encrypted export/import round-trip, malformed responses, network
 * failures, testConnection success+failure, MetadataCache TTL, listProjects/
 * Datasets/Tables happy path, updateConfig persistence.
 */

import { describe, expect, it, vi } from "vitest"

// Mock EncryptionManager — the real implementation uses argon2-browser's WASM
// module which can't be loaded by jsdom/Node. Replace with a deterministic
// passphrase-tagged Buffer-based cipher just for round-trip testing.
vi.mock("@ide/storage", async () => {
	const actual = await vi.importActual<typeof import("@ide/storage")>(
		"@ide/storage",
	)
	class FakeEncryptionManager {
		async encryptWithPassphrase(passphrase: string, plain: string) {
			// Tag the blob with the passphrase so decrypt can detect mismatches.
			const tagged = JSON.stringify({ p: passphrase, d: plain })
			return Buffer.from(tagged, "utf8").toString("base64")
		}
		async decryptWithPassphrase(passphrase: string, blob: string) {
			const decoded = Buffer.from(blob, "base64").toString("utf8")
			const obj = JSON.parse(decoded) as { p: string; d: string }
			if (obj.p !== passphrase) {
				throw new Error("Decryption failed: wrong passphrase")
			}
			return obj.d
		}
	}
	return { ...actual, EncryptionManager: FakeEncryptionManager }
})

import { SnowflakeConnector } from "../snowflake-connector"
import type { RequestTransport } from "../transport"
import type { CredentialStore } from "@ide/storage"

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
	public calls: Array<{ url: string; init?: RequestInit }> = []
	public responder: (
		url: string,
		init?: RequestInit,
		callIndex?: number,
	) => Response | Promise<Response> = () => jsonResponse({})

	async request(url: string, init?: RequestInit): Promise<Response> {
		const idx = this.calls.length
		this.calls.push({ url, init })
		return this.responder(url, init, idx)
	}
}

const VALID_TOKEN = {
	access_token: "tk-access",
	refresh_token: "tk-refresh",
	token_type: "Bearer",
	expires_in: 3600,
	obtained_at: Date.now(),
}

function makeConnector(opts?: {
	creds?: CredentialStore
	transport?: RequestTransport
}) {
	return new SnowflakeConnector({
		credentialStore: opts?.creds ?? makeCreds(),
		account: "acct",
		clientId: "client-id",
		clientSecret: "client-secret",
		warehouse: "WH",
		role: "ANALYST",
		database: "DB",
		schema: "PUBLIC",
		transport: opts?.transport ?? new MockTransport(),
	})
}

// ---------------------------------------------------------------------------
// exportEncrypted / importEncrypted round-trip
// ---------------------------------------------------------------------------

describe("encrypted credential export/import", () => {
	it("round-trips token + config via passphrase", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		await creds.save("snowflake-config", {
			account: "acct",
			clientId: "client-id",
			clientSecret: "client-secret",
			warehouse: "WH",
			role: "ANALYST",
			database: "DB",
			schema: "PUBLIC",
		})

		const c1 = makeConnector({ creds })
		await c1.initializeFromStorage()

		const blob = await c1.exportEncrypted("hunter2")
		expect(typeof blob).toBe("string")
		expect(blob.length).toBeGreaterThan(0)

		// Fresh connector, fresh credstore — import should restore everything
		const creds2 = makeCreds()
		const c2 = new SnowflakeConnector({
			credentialStore: creds2,
			account: "different",
			clientId: "different",
			clientSecret: "different",
			warehouse: "OTHER",
			transport: new MockTransport(),
		})
		await c2.importEncrypted(blob, "hunter2")

		expect(c2.getAccount()).toBe("acct")
		expect(c2.getWarehouse()).toBe("WH")
		expect(c2.getRole()).toBe("ANALYST")
		expect(c2.getDatabase()).toBe("DB")
		expect(c2.getDefaultSchema()).toBe("PUBLIC")
		expect(c2.isConnected()).toBe(true)

		const persistedToken = await creds2.load("snowflake-token")
		expect(persistedToken).toMatchObject({ access_token: VALID_TOKEN.access_token })
	})

	it("throws on wrong passphrase", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const c1 = makeConnector({ creds })
		await c1.initializeFromStorage()

		const blob = await c1.exportEncrypted("right")
		const c2 = new SnowflakeConnector({
			credentialStore: makeCreds(),
			account: "x",
			clientId: "x",
			clientSecret: "x",
			warehouse: "W",
			transport: new MockTransport(),
		})
		await expect(c2.importEncrypted(blob, "wrong")).rejects.toThrow()
	})

	it("exportEncrypted throws when no token", async () => {
		const c = makeConnector()
		await expect(c.exportEncrypted("p")).rejects.toThrow(/No token/)
	})
})

// ---------------------------------------------------------------------------
// MetadataCache TTL behaviour
// ---------------------------------------------------------------------------

describe("MetadataCache integration", () => {
	it("caches listProjects across calls", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		let invocations = 0
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW DATABASES")) {
				invocations++
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [["2024-01-01", "DB1", null, null, null, null, "first"]],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })

		const first = await c.listProjects()
		const second = await c.listProjects()

		expect(invocations).toBe(1) // second call hit cache
		expect(first).toEqual(second)
		expect(first[0].id).toBe("DB1")
	})

	it("clearCache forces a fresh fetch", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		let invocations = 0
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW DATABASES")) {
				invocations++
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [["2024-01-01", "DB1", null, null, null, null, "first"]],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })

		await c.listProjects()
		c.clearCache()
		await c.listProjects()

		expect(invocations).toBe(2)
	})

	it("revoke clears the cache", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		let invocations = 0
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW DATABASES")) {
				invocations++
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [["2024-01-01", "DB1", null, null, null, null, ""]],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })

		await c.listProjects()
		await c.revoke()
		// Re-issue token so the second listProjects can run
		await creds.save("snowflake-token", VALID_TOKEN)
		await c.listProjects()

		expect(invocations).toBe(2)
	})
})

// ---------------------------------------------------------------------------
// listDatasets / listTables happy paths
// ---------------------------------------------------------------------------

describe("catalog discovery happy paths", () => {
	it("listDatasets returns SchemaInfo[] from SHOW SCHEMAS", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW SCHEMAS IN DATABASE")) {
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [
						[null, "PUBLIC", null, null, null, null, "default schema"],
						[null, "ANALYTICS", null, null, null, null, ""],
					],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })
		const schemas = await c.listDatasets("DB1")
		expect(schemas).toHaveLength(2)
		expect(schemas[0].name).toBe("PUBLIC")
		expect(schemas[0].catalog).toBe("DB1")
	})

	it("listTables merges SHOW TABLES + SHOW VIEWS", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW TABLES")) {
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [
						["2024-01-01", "ORDERS", null, null, "TABLE", "", null, "1000", "10240"],
					],
				})
			}
			if (body?.includes("SHOW VIEWS")) {
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [
						["2024-01-02", "ORDER_SUMMARY", null, null, null, "view comment", null, null, null],
					],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })
		const tables = await c.listTables("DB1", "PUBLIC")
		expect(tables).toHaveLength(2)
		expect(tables.find((t) => t.name === "ORDERS")?.type).toBe("table")
		expect(tables.find((t) => t.name === "ORDERS")?.rowCount).toBe(1000)
		expect(tables.find((t) => t.name === "ORDER_SUMMARY")?.type).toBe("view")
	})
})

// ---------------------------------------------------------------------------
// testConnection
// ---------------------------------------------------------------------------

describe("testConnection", () => {
	it("returns success with metadata when SELECT 1 succeeds", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = () =>
			jsonResponse({
				resultSetMetaData: {
					rowType: [{ name: "test", type: "FIXED", scale: 0 }],
					partitionInfo: [{ rowCount: 1 }],
				},
				data: [["1"]],
			})
		const c = makeConnector({ creds, transport })
		const result = await c.testConnection()
		expect(result.success).toBe(true)
		expect(result.metadata).toMatchObject({
			account: "acct",
			warehouse: "WH",
			role: "ANALYST",
			database: "DB",
			schema: "PUBLIC",
		})
		expect(result.latencyMs).toBeGreaterThanOrEqual(0)
	})

	it("returns failure with error message on auth failure", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = () =>
			jsonResponse({ message: "session expired" }, 401)
		const c = makeConnector({ creds, transport })
		const result = await c.testConnection()
		expect(result.success).toBe(false)
		expect(result.error).toMatch(/session expired/i)
	})

	it("returns failure when not authenticated", async () => {
		const c = makeConnector()
		const result = await c.testConnection()
		expect(result.success).toBe(false)
		expect(result.error).toMatch(/Not authenticated/i)
	})
})

// ---------------------------------------------------------------------------
// Network and malformed-response edge cases
// ---------------------------------------------------------------------------

describe("network + malformed-response edge cases", () => {
	it("propagates fetch rejection", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = () => {
			throw new Error("network down")
		}
		const c = makeConnector({ creds, transport })
		await expect(
			(async () => {
				for await (const _ of c.query("SELECT 1")) {
					// drain
				}
			})(),
		).rejects.toThrow(/network down/)
	})

	it("falls back to default error message on malformed JSON", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		transport.responder = () =>
			new Response("<<not json>>", {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		const c = makeConnector({ creds, transport })
		await expect(
			(async () => {
				for await (const _ of c.query("SELECT 1")) {
					// drain
				}
			})(),
		).rejects.toThrow(/Snowflake API error: 500/)
	})
})

// ---------------------------------------------------------------------------
// updateConfig persistence + cache clear
// ---------------------------------------------------------------------------

describe("updateConfig persistence behaviour", () => {
	it("clears the metadata cache after update", async () => {
		const creds = makeCreds()
		await creds.save("snowflake-token", VALID_TOKEN)
		const transport = new MockTransport()
		let invocations = 0
		transport.responder = (_url, init) => {
			const body = init?.body as string
			if (body?.includes("SHOW DATABASES")) {
				invocations++
				return jsonResponse({
					resultSetMetaData: { rowType: [] },
					data: [["2024-01-01", "DB1", null, null, null, null, ""]],
				})
			}
			return jsonResponse({})
		}
		const c = makeConnector({ creds, transport })

		await c.listProjects()
		await c.updateConfig({ warehouse: "OTHER_WH" })
		await c.listProjects()

		expect(invocations).toBe(2)
	})
})
