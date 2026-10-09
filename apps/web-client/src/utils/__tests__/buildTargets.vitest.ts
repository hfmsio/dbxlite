import { describe, expect, it } from "vitest";
import {
	EMBEDDED_BUILD,
	WAREHOUSE_CONNECTORS_ENABLED,
} from "../buildTargets";

/**
 * The default build must keep every connector. The flag only subtracts, and
 * only when a build asks for it, so a missing or misspelt env value can never
 * quietly drop BigQuery and Snowflake from the normal app.
 */
describe("build targets", () => {
	it("ships the warehouse connectors unless the build opts out", () => {
		expect(EMBEDDED_BUILD).toBe(false);
		expect(WAREHOUSE_CONNECTORS_ENABLED).toBe(true);
	});
});
