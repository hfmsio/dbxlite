import { afterEach, describe, expect, it } from "vitest";
import { serverModeProbeWorthwhile } from "../serverModeReachable";

const real = window.location.hostname;

function servedFrom(hostname: string) {
	Object.defineProperty(window, "location", {
		configurable: true,
		value: { ...window.location, hostname },
	});
}

afterEach(() => servedFrom(real));

describe("serverModeProbeWorthwhile", () => {
	it.each(["localhost", "127.0.0.1", "::1"])(
		"probes when the page itself is local (%s)",
		(host) => {
			servedFrom(host);
			expect(serverModeProbeWorthwhile()).toBe(true);
		},
	);

	it.each(["sql.dbxlite.com", "apps.example-host.com", "example.org"])(
		"stays silent on a remote origin (%s)",
		(host) => {
			// The CLI server only ever listens on the visitor's own machine, so
			// each probe from a hosted page is a guaranteed failed request.
			servedFrom(host);
			expect(serverModeProbeWorthwhile()).toBe(false);
		},
	);
});
