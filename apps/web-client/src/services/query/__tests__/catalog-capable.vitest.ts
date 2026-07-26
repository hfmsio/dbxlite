/**
 * Unit tests for the catalog capability narrows (WS-A / A9-A10).
 */

import type { BaseConnector } from "@ide/connectors";
import { describe, expect, it, vi } from "vitest";
import {
	requireCatalog,
	supportsCacheClear,
	supportsCatalog,
	supportsProjectDefaults,
} from "../catalog-capable";

const connectorWith = (methods: Record<string, unknown>) =>
	methods as unknown as BaseConnector;

describe("supportsCatalog", () => {
	it("accepts a connector implementing the method", () => {
		expect(
			supportsCatalog(connectorWith({ listProjects: vi.fn() }), "listProjects"),
		).toBe(true);
	});

	it("rejects a connector missing the method", () => {
		expect(supportsCatalog(connectorWith({}), "listProjects")).toBe(false);
	});

	it("rejects a non-function property of the right name", () => {
		expect(
			supportsCatalog(connectorWith({ listProjects: "yes" }), "listProjects"),
		).toBe(false);
	});

	it("rejects a null connector", () => {
		expect(supportsCatalog(null, "listProjects")).toBe(false);
	});

	it("narrows per method, not all-or-nothing", () => {
		// Cloud connectors genuinely differ; demanding the whole interface
		// would reject one over a method the caller never touches.
		const partial = connectorWith({ listProjects: vi.fn() });

		expect(supportsCatalog(partial, "listProjects")).toBe(true);
		expect(supportsCatalog(partial, "estimateQueryCost")).toBe(false);
	});
});

describe("requireCatalog", () => {
	it("returns the connector when the capability is present", () => {
		const connector = connectorWith({ listProjects: vi.fn() });

		expect(
			requireCatalog(connector, "listProjects", "not init", "not supported"),
		).toBe(connector);
	});

	it("throws the not-initialized message for an empty slot", () => {
		expect(() =>
			requireCatalog(null, "listProjects", "not init", "not supported"),
		).toThrow("not init");
	});

	it("throws the not-supported message for a connector missing the method", () => {
		expect(() =>
			requireCatalog(
				connectorWith({}),
				"listProjects",
				"not init",
				"not supported",
			),
		).toThrow("not supported");
	});

	it("keeps the two messages distinct, since both are user-facing", () => {
		const notInit = "BigQuery connector not initialized";
		const unsupported = "Project listing not supported";

		expect(() =>
			requireCatalog(null, "listProjects", notInit, unsupported),
		).toThrow(notInit);
		expect(() =>
			requireCatalog(connectorWith({}), "listProjects", notInit, unsupported),
		).toThrow(unsupported);
	});
});

describe("supportsProjectDefaults", () => {
	it("accepts a connector with the default-project accessors", () => {
		expect(
			supportsProjectDefaults(
				connectorWith({ getDefaultProject: vi.fn(), setDefaultProject: vi.fn() }),
			),
		).toBe(true);
	});

	it("rejects a connector without them", () => {
		expect(supportsProjectDefaults(connectorWith({}))).toBe(false);
	});

	it("rejects null", () => {
		expect(supportsProjectDefaults(null)).toBe(false);
	});
});

describe("supportsCacheClear", () => {
	it("accepts a connector with clearCache", () => {
		expect(supportsCacheClear(connectorWith({ clearCache: vi.fn() }))).toBe(
			true,
		);
	});

	it("rejects a connector without it", () => {
		expect(supportsCacheClear(connectorWith({}))).toBe(false);
	});

	it("rejects null", () => {
		expect(supportsCacheClear(null)).toBe(false);
	});
});
