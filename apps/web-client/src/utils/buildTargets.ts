/**
 * Which parts of the app this build ships.
 *
 * The embedded build is a WASM-only SQL workbench: the warehouse connectors
 * sign in through a popup and a redirect, neither of which a sandboxed
 * cross-origin frame can complete, so offering them there presents a feature
 * that cannot work. Server mode is likewise a local-CLI arrangement.
 *
 * Set at build time (`VITE_EMBEDDED_BUILD=1`) rather than sniffed at runtime,
 * so the default build is untouched and the switch is visible in one place.
 */
export const EMBEDDED_BUILD = import.meta.env.VITE_EMBEDDED_BUILD === "1";

/** Whether the BigQuery and Snowflake connectors are offered. */
export const WAREHOUSE_CONNECTORS_ENABLED = !EMBEDDED_BUILD;
