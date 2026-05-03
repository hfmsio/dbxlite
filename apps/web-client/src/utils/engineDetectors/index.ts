/**
 * Engine Detectors Index
 *
 * Auto-registers all engine detector plugins.
 * Import this module to enable engine detection for all supported engines.
 *
 * To add a new engine:
 * 1. Create a new file (e.g., snowflake.ts) with the detector pattern
 * 2. Import and register it here
 */

import { registerEngineDetector } from "../queryEngineDetector";
import { duckdbDetector } from "./duckdb";
import { bigqueryDetector } from "./bigquery";
import { snowflakeDetector } from "./snowflake";

// Auto-register all built-in detectors
registerEngineDetector(duckdbDetector);
registerEngineDetector(bigqueryDetector);
registerEngineDetector(snowflakeDetector);

// Re-export detectors for direct access if needed
export { duckdbDetector } from "./duckdb";
export { bigqueryDetector } from "./bigquery";
export { snowflakeDetector } from "./snowflake";

// Re-export core types and functions
export {
	registerEngineDetector,
	detectQueryEngine,
	getRegisteredEngines,
	hasEngineSignals,
	type EngineDetectorPlugin,
	type DetectionPattern,
	type EngineDetection,
} from "../queryEngineDetector";
