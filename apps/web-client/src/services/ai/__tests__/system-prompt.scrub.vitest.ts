/**
 * Credential-scrub tests for the AI system-prompt builder.
 *
 * Each test feeds a known-bad pattern through scrubCredentials and
 * asserts:
 *   1. the secret is replaced with [REDACTED:<pattern>]
 *   2. the matches array reports the count
 *   3. legitimate SQL containing keywords like "select" / "create"
 *      is not over-redacted
 */

import { describe, expect, it } from "vitest";
import { scrubCredentials } from "../system-prompt";

describe("scrubCredentials", () => {
	it("redacts OpenAI/Anthropic-style sk- keys", () => {
		const r = scrubCredentials("api_key = 'sk-FAKEABCDEFGHIJKLMNOPQRSTUVWXYZ'");
		expect(r.cleaned).toBe("api_key = '[REDACTED:openai-style]'");
		expect(r.matches).toContainEqual({ pattern: "openai-style", count: 1 });
	});

	it("redacts Google API keys", () => {
		// Google API keys: literal "AIza" + 35 chars
		const r = scrubCredentials(
			"const k = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'",
		);
		expect(r.cleaned).toContain("[REDACTED:google-api]");
		expect(r.matches[0]).toEqual({ pattern: "google-api", count: 1 });
	});

	it("redacts AWS access key IDs", () => {
		const r = scrubCredentials("AKIAIOSFODNN7EXAMPLE inside a comment");
		expect(r.cleaned).toContain("[REDACTED:aws-access]");
	});

	it("redacts GitHub PATs", () => {
		const r = scrubCredentials("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789");
		expect(r.cleaned).toContain("[REDACTED:github-pat]");
	});

	it("redacts JWTs", () => {
		const r = scrubCredentials(
			"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
		);
		expect(r.cleaned).toContain("[REDACTED:jwt]");
	});

	it("redacts PEM private keys (multiline)", () => {
		const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890==
-----END RSA PRIVATE KEY-----`;
		const r = scrubCredentials(pem);
		expect(r.cleaned).toBe("[REDACTED:private-key]");
		expect(r.matches[0]).toEqual({ pattern: "private-key", count: 1 });
	});

	it("does not redact legitimate SQL keywords", () => {
		const sql =
			"SELECT customer_id, COUNT(*) FROM orders WHERE created_at > '2024-01-01' GROUP BY 1";
		const r = scrubCredentials(sql);
		expect(r.cleaned).toBe(sql);
		expect(r.matches).toEqual([]);
	});

	it("counts multiple matches of the same pattern", () => {
		const r = scrubCredentials(
			"k1 = 'sk-AAAAAAAAAAAAAAAAAAAA'; k2 = 'sk-BBBBBBBBBBBBBBBBBBBB';",
		);
		expect(r.matches[0]).toEqual({ pattern: "openai-style", count: 2 });
		expect(r.cleaned.match(/REDACTED/g)?.length).toBe(2);
	});

	it("handles mixed pattern types in one input", () => {
		const r = scrubCredentials(
			"openai = 'sk-FAKEABCDEFGHIJKLMNOPQRSTUV'; aws = 'AKIAIOSFODNN7EXAMPLE'",
		);
		expect(r.matches.map((m) => m.pattern).sort()).toEqual([
			"aws-access",
			"openai-style",
		]);
		expect(r.cleaned).toContain("[REDACTED:openai-style]");
		expect(r.cleaned).toContain("[REDACTED:aws-access]");
	});

	it("returns empty matches for clean text", () => {
		const r = scrubCredentials("just some random text without any tokens");
		expect(r.matches).toEqual([]);
		expect(r.cleaned).toBe("just some random text without any tokens");
	});
});
