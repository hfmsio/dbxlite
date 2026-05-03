/**
 * Per-provider PII consent for BYO AI backends.
 *
 * Why: when the user sends a message to a BYO provider (OpenAI, Anthropic,
 * etc.), the system prompt includes the current editor content and chat
 * history is appended on every turn. That data leaves the browser to a
 * third party. Warehouse backends (Snowflake Cortex, BQ ML) don't need
 * this — data stays inside the user's existing warehouse.
 *
 * One-time per provider: once granted, we don't re-prompt. Decline is
 * not persisted — next send re-asks. Cleared on logout via the same
 * localStorage namespace if we add that later.
 */

const KEY_PREFIX = "ai-pii-consent:";

export interface PiiConsentRecord {
	grantedAt: number;
}

export function hasPiiConsent(providerId: string): boolean {
	try {
		return localStorage.getItem(KEY_PREFIX + providerId) !== null;
	} catch {
		return false;
	}
}

export function grantPiiConsent(providerId: string): void {
	try {
		const record: PiiConsentRecord = { grantedAt: Date.now() };
		localStorage.setItem(KEY_PREFIX + providerId, JSON.stringify(record));
	} catch {
		// localStorage may be unavailable (private mode, quota); fail open —
		// next send re-prompts.
	}
}

export function revokePiiConsent(providerId: string): void {
	try {
		localStorage.removeItem(KEY_PREFIX + providerId);
	} catch {
		// no-op
	}
}
