import { afterEach, describe, expect, it, vi } from "vitest";
import { duckdbBundleBaseUrls } from "../index";

/**
 * The app is built with a relative base and may be mounted under a path prefix
 * (the Zibby host does this). An origin-rooted `/duckdb` 404s there, and the
 * worker then falls back to the jsDelivr CDN, which a cross-origin-isolated
 * page refuses to construct a Worker from.
 */
describe("duckdbBundleBaseUrls", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function serveAt(href: string) {
		vi.stubGlobal("document", { baseURI: href });
		vi.stubGlobal("location", { origin: new URL(href).origin });
	}

	it("offers the app's own directory when mounted under a prefix", () => {
		serveAt("https://a32.zibby.run/apps/dbxlite/");
		const urls = duckdbBundleBaseUrls();
		expect(urls).toContain("https://a32.zibby.run/apps/dbxlite/duckdb");
	});

	it("keeps the origin root last so root-mounted apps still work", () => {
		serveAt("https://a32.zibby.run/apps/dbxlite/");
		const urls = duckdbBundleBaseUrls();
		expect(urls.at(-1)).toBe("https://a32.zibby.run/duckdb");
	});

	it("collapses to one candidate when the app is at the origin root", () => {
		serveAt("https://dbxlite.app/");
		const urls = duckdbBundleBaseUrls();
		expect(urls).toContain("https://dbxlite.app/duckdb");
		expect(new Set(urls).size).toBe(urls.length);
	});

	it("returns absolute urls with no trailing slash", () => {
		serveAt("https://dbxlite.app/sub/");
		for (const u of duckdbBundleBaseUrls()) {
			expect(() => new URL(u)).not.toThrow();
			expect(u.endsWith("/duckdb")).toBe(true);
		}
	});

	it("survives a context with no document", () => {
		vi.stubGlobal("location", { origin: "https://dbxlite.app" });
		vi.stubGlobal("document", undefined);
		expect(duckdbBundleBaseUrls()).toContain("https://dbxlite.app/duckdb");
	});
});
