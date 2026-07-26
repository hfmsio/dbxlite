/**
 * Unit tests for the BigQuery setup preflight and error mapping.
 */

import { describe, expect, it, vi } from "vitest";
import {
	explainApiFailure,
	explainOAuthFailure,
	runPreflight,
	type PreflightTarget,
} from "../bigquery-preflight";

const target = (over: Partial<PreflightTarget> = {}): PreflightTarget => ({
	getBigQueryProjects: vi.fn().mockResolvedValue([{ id: "p1" }]),
	executeQueryOnConnector: vi.fn().mockResolvedValue({ rows: [] }),
	...over,
});

describe("runPreflight", () => {
	it("passes when projects are visible and a query runs", async () => {
		const result = await runPreflight(target());

		expect(result.ok).toBe(true);
		expect(result.checks.map((c) => c.status)).toEqual(["ok", "ok"]);
	});

	it("reports how many projects were found", async () => {
		const result = await runPreflight(
			target({
				getBigQueryProjects: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
			}),
		);

		expect(result.checks[0].detail).toBe("2 projects visible");
	});

	it("singularises a lone project", async () => {
		const result = await runPreflight(target());

		expect(result.checks[0].detail).toBe("1 project visible");
	});

	it("fails with an enable-the-API remedy when no projects come back", async () => {
		const result = await runPreflight(
			target({ getBigQueryProjects: vi.fn().mockResolvedValue([]) }),
		);

		expect(result.ok).toBe(false);
		expect(result.checks[0].remedy).toMatch(/Enable the BigQuery API/i);
	});

	it("skips the query check rather than blaming the query", async () => {
		// Reporting "query failed" when the real problem is "no projects" sends
		// people to the wrong screen.
		const result = await runPreflight(
			target({ getBigQueryProjects: vi.fn().mockResolvedValue([]) }),
		);

		expect(result.checks[1].status).toBe("skipped");
	});

	it("does not attempt a query when there is no project", async () => {
		const executeQueryOnConnector = vi.fn();
		await runPreflight(
			target({
				getBigQueryProjects: vi.fn().mockResolvedValue([]),
				executeQueryOnConnector,
			}),
		);

		expect(executeQueryOnConnector).not.toHaveBeenCalled();
	});

	it("surfaces a project-listing failure with its remedy", async () => {
		const result = await runPreflight(
			target({
				getBigQueryProjects: vi
					.fn()
					.mockRejectedValue(new Error("BigQuery API has not been used")),
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.checks[0].remedy).toMatch(/not enabled/i);
	});

	it("reports a query failure separately from project discovery", async () => {
		const result = await runPreflight(
			target({
				executeQueryOnConnector: vi
					.fn()
					.mockRejectedValue(new Error("403 permission denied")),
			}),
		);

		expect(result.checks[0].status).toBe("ok");
		expect(result.checks[1].status).toBe("failed");
		expect(result.checks[1].remedy).toMatch(/BigQuery User/);
	});

	it("runs the test query against the discovered project", async () => {
		const executeQueryOnConnector = vi.fn().mockResolvedValue({});
		const result = await runPreflight(
			target({
				getBigQueryProjects: vi.fn().mockResolvedValue([{ id: "chosen" }]),
				executeQueryOnConnector,
			}),
		);

		expect(executeQueryOnConnector).toHaveBeenCalledWith(
			"bigquery",
			"SELECT 1 AS ok",
		);
		expect(result.checks[1].detail).toContain("chosen");
	});
});

describe("explainOAuthFailure", () => {
	it("names the exact redirect URI on a mismatch", () => {
		const explained = explainOAuthFailure(new Error("redirect_uri_mismatch"));

		expect(explained).toContain(`${window.location.origin}/oauth-callback`);
		expect(explained).toMatch(/port-sensitive/);
	});

	it("points access_denied at the test-user list", () => {
		expect(explainOAuthFailure(new Error("access_denied"))).toMatch(
			/test user/i,
		);
	});

	it("points invalid_client at the client id and app type", () => {
		expect(explainOAuthFailure(new Error("invalid_client"))).toMatch(
			/Web application/,
		);
	});

	it("treats invalid_grant as retryable rather than misconfigured", () => {
		expect(explainOAuthFailure(new Error("invalid_grant"))).toMatch(
			/connecting again/i,
		);
	});

	it("explains a Workspace admin block", () => {
		expect(explainOAuthFailure(new Error("admin_policy_enforced"))).toMatch(
			/admin/i,
		);
	});

	it("explains an org-internal client", () => {
		expect(explainOAuthFailure(new Error("org_internal"))).toMatch(/External/);
	});

	it("passes an unrecognised error through unchanged", () => {
		expect(explainOAuthFailure(new Error("something odd"))).toBe(
			"something odd",
		);
	});

	it("handles a non-Error value", () => {
		expect(explainOAuthFailure("plain string")).toBe("plain string");
	});
});

describe("explainApiFailure", () => {
	it.each([
		["BigQuery API has not been used in project"],
		["SERVICE_DISABLED"],
		["api is not enabled"],
	])("maps %s to enable-the-API", (message) => {
		expect(explainApiFailure(new Error(message))).toMatch(/not enabled/i);
	});

	it("maps a permission error to the required role", () => {
		expect(explainApiFailure(new Error("403 permission denied"))).toMatch(
			/BigQuery User/,
		);
	});

	it("maps a 401 to an expired pasted token", () => {
		expect(explainApiFailure(new Error("401 unauthenticated"))).toMatch(
			/expired/i,
		);
	});

	it("maps a billing error to enabling billing", () => {
		expect(
			explainApiFailure(new Error("billing has not been enabled")),
		).toMatch(/billing/i);
	});

	it("passes an unrecognised error through unchanged", () => {
		expect(explainApiFailure(new Error("weird"))).toBe("weird");
	});
});
