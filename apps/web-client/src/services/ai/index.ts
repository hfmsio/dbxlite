/**
 * AI Service - Barrel Exports
 */

import { EncryptedCredentialStore } from "@ide/storage";

export { backendRegistry } from "./backend-registry";
export { ByoChatBackend } from "./byo-backend";
// `wireWarehouseBackends` is intentionally NOT re-exported from the barrel
// so tests don't pull in streaming-query-service transitively. App.tsx
// imports it directly from "./services/ai/wire-warehouse-backends".
export {
	getAllProviderTypes,
	getCredentialKey,
	getDefaultModel,
	getDefaultProvider,
	getProvider,
} from "./provider-registry";
export { buildSystemPrompt, scrubCredentials } from "./system-prompt";
export type {
	AIMessage,
	AIModelInfo,
	AIProvider,
	AIProviderConfig,
	AIProviderType,
	AIStreamChunk,
	BackendRegistry,
	ChatBackend,
	ChatBackendErrorCode,
	ChatMessage,
	SQLBlock,
} from "./types";
export { ChatBackendError } from "./types";
export {
	MAX_PROMPT_TOKENS_WAREHOUSE,
	WAREHOUSE_TIMEOUT_MS,
	WarehouseChatBackend,
} from "./warehouse-backend";
export type { WarehouseAICapabilities } from "./warehouse-capabilities";

/**
 * Shared credential store singleton for AI API keys (encrypted at rest).
 * Implementation lives in `@ide/storage` so connectors can use the same
 * device-bound AES-GCM wrapper for OAuth tokens / client secrets.
 */
export const aiCredentialStore = new EncryptedCredentialStore();
