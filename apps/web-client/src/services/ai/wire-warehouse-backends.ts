/**
 * App-level wiring: register warehouse-AI backends with the registry.
 *
 * Called once at app startup. Kept separate from backend-registry.ts so
 * that registry consumers (tests, simple UI components) don't pull in the
 * streaming-query-service module graph at load time.
 */

import { createSnowflakeAICapabilities } from "../../providers/catalog/snowflake-ai-capabilities";
import { queryService } from "../streaming-query-service";
import { backendRegistry } from "./backend-registry";
import { ByoChatBackend } from "./byo-backend";
import { getAllProviderTypes, getProvider } from "./provider-registry";
import { WarehouseChatBackend } from "./warehouse-backend";

let wired = false;

/**
 * App-level wiring: registers all chat backends (BYO providers + Snowflake
 * Cortex) into the backend registry. Idempotent — safe to call multiple
 * times.
 *
 * Lives in this dedicated module (not in backend-registry.ts) so unit tests
 * that import services/ai/* don't pull in the heavy streaming-query-service
 * graph at module load.
 */
export function wireWarehouseBackends(): void {
	if (wired) return;
	wired = true;
	for (const type of getAllProviderTypes()) {
		backendRegistry.register(new ByoChatBackend(getProvider(type)));
	}
	backendRegistry.register(
		new WarehouseChatBackend(createSnowflakeAICapabilities(queryService)),
	);
}
