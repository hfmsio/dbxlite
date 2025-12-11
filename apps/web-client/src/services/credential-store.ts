/**
 * Credential Store (stub)
 *
 * Minimal implementation to satisfy TypeScript compilation.
 * TODO: Implement proper encrypted credential storage
 */

import type { ConnectionConfig } from "../types/materialization";

class CredentialStore {
	private credentials: Map<string, ConnectionConfig> = new Map();

	async set(key: string, config: ConnectionConfig): Promise<void> {
		this.credentials.set(key, config);
	}

	async get(key: string): Promise<ConnectionConfig | undefined> {
		return this.credentials.get(key);
	}

	async delete(key: string): Promise<void> {
		this.credentials.delete(key);
	}
}

export const credentialStore = new CredentialStore();
