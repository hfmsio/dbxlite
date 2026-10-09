/**
 * Whether probing the local DuckDB CLI server is worth a request.
 *
 * Server mode is the `duckdb -ui` process on the visitor's own machine, so the
 * page is only ever a localhost one: either the CLI's own page or a dev server
 * it points at with `ui_remote_url`. From any other origin the probe cannot
 * succeed, and each attempt is a failed request in the console.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", ""]);

export function serverModeProbeWorthwhile(): boolean {
	if (typeof window === "undefined") return false;
	return LOCAL_HOSTS.has(window.location.hostname);
}
