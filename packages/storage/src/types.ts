/**
 * Shared types for @ide/storage.
 */

export interface CredentialStoreLike {
	save(id: string, payload: unknown): Promise<void>;
	load(id: string): Promise<unknown>;
	listKeys(): string[];
}
