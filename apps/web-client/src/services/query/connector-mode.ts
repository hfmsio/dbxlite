/**
 * ConnectorMode — which DuckDB backend the app is talking to.
 *
 * Extracted from StreamingQueryService (WS-A / A4 in docs/REFACTOR-PLAN.md).
 * Mode is read by the pagination planner (temp-table materialization is
 * WASM-only) and by the schema-change subscription, so it needs to be a
 * value the collaborators can be handed rather than a private field on the
 * service. A7a folds this into the full ConnectorRegistry.
 *
 * Detection stays lazy: the mode is "wasm" until `detect()` runs during
 * initialize(), which is what the pre-extraction field default did.
 */

import { detectMode, type DbxliteMode } from "@ide/connectors";

export class ConnectorMode {
	private mode: DbxliteMode = "wasm";

	/** Resolve the mode from the environment. Called once, at initialize(). */
	detect(): DbxliteMode {
		this.mode = detectMode();
		return this.mode;
	}

	get(): DbxliteMode {
		return this.mode;
	}

	isHttp(): boolean {
		return this.mode === "http";
	}
}
