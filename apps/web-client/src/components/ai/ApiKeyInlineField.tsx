/**
 * ApiKeyInlineField
 *
 * Reusable paste-and-save form for an AI provider's API key.
 * Used in two places:
 *   - AIChatPanel WelcomeCard ("compact" variant) — first-run flow,
 *     paste-and-go without leaving the chat.
 *   - AISettings ("settings" variant) — full management surface (test/remove).
 *
 * Self-contained: handles aiCredentialStore.save, format validation,
 * and 1-token live verification. Calls onSaved when a key has been
 * persisted (caller refreshes its hasKey state).
 *
 * Encryption-at-rest is unchanged — the component only relocates the form;
 * persistence still goes through aiCredentialStore (AES-GCM, IndexedDB).
 *
 * Tracked as backlog item AI-1.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AIProviderType,
	aiCredentialStore,
	backendRegistry,
	getCredentialKey,
	getProvider,
} from "../../services/ai";

interface ApiKeyInlineFieldProps {
	provider: AIProviderType;
	/** Fired when a new key has been saved successfully. */
	onSaved?: () => void;
	/** Fired when an existing saved key is removed. */
	onRemoved?: () => void;
	/** Whether to show the test/remove controls when a key already exists. */
	showManagement?: boolean;
	variant?: "compact" | "settings";
}

const apiKeyUrls: Record<AIProviderType, string> = {
	gemini: "https://aistudio.google.com/app/apikey",
	groq: "https://console.groq.com/keys",
	openai: "https://platform.openai.com/api-keys",
	anthropic: "https://console.anthropic.com/settings/keys",
};

/**
 * Per-provider format validation. Bad paste → red border; never attempts save.
 *
 * Patterns are deliberately loose: we want to catch obvious wrong-provider
 * pastes, not validate every key permutation. The provider's verify call is
 * the source of truth for whether the key actually works.
 */
const apiKeyPatterns: Record<AIProviderType, RegExp> = {
	openai: /^sk-/,
	anthropic: /^sk-ant-/,
	gemini: /^AIza/,
	groq: /^gsk_/,
};

function validateFormat(provider: AIProviderType, key: string): boolean {
	if (!key) return false;
	return apiKeyPatterns[provider].test(key.trim());
}

export default function ApiKeyInlineField({
	provider,
	onSaved,
	onRemoved,
	showManagement = false,
	variant = "compact",
}: ApiKeyInlineFieldProps) {
	const [apiKey, setApiKey] = useState("");
	const [hasSavedKey, setHasSavedKey] = useState<boolean | null>(null);
	const [verifying, setVerifying] = useState(false);
	const [verifyResult, setVerifyResult] = useState<
		{ ok: true } | { ok: false; message: string } | null
	>(null);
	const verifyAbortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			verifyAbortRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const key = await aiCredentialStore.load(getCredentialKey(provider));
			if (!cancelled) setHasSavedKey(!!key);
		})();
		return () => {
			cancelled = true;
		};
	}, [provider]);

	const formatValid = validateFormat(provider, apiKey);
	const formatError =
		apiKey.trim().length > 0 && !formatValid
			? `Doesn't look like a ${getProvider(provider).displayName} key`
			: null;

	const verifyKey = useCallback(
		async (key: string): Promise<{ ok: true } | { ok: false; message: string }> => {
			verifyAbortRef.current?.abort();
			const controller = new AbortController();
			verifyAbortRef.current = controller;

			try {
				const p = getProvider(provider);
				const model = p.models[0]?.id;
				if (!model) return { ok: false, message: "No model registered for provider" };

				for await (const chunk of p.streamChat(
					[{ role: "user", content: "Reply with the single word OK." }],
					{ apiKey: key, model, maxTokens: 256 },
					controller.signal,
				)) {
					if (chunk.type === "error") {
						return { ok: false, message: chunk.error ?? "Verification failed" };
					}
					if (chunk.type === "text") {
						return { ok: true };
					}
				}
				return { ok: false, message: "No response received" };
			} catch (err) {
				if ((err as Error).name === "AbortError") return { ok: false, message: "Cancelled" };
				return { ok: false, message: (err as Error).message };
			} finally {
				verifyAbortRef.current = null;
			}
		},
		[provider],
	);

	const handleSave = useCallback(async () => {
		const trimmed = apiKey.trim();
		if (!trimmed || !formatValid) return;

		setVerifying(true);
		setVerifyResult(null);

		const verdict = await verifyKey(trimmed);

		if (!verdict.ok) {
			setVerifying(false);
			setVerifyResult(verdict);
			return;
		}

		// Verified — persist.
		await aiCredentialStore.save(getCredentialKey(provider), trimmed);
		// A BYO backend's availability is "is a key stored", so the registry
		// cannot see this change on its own.
		backendRegistry.notifyAvailabilityChanged();
		setHasSavedKey(true);
		setApiKey("");
		setVerifying(false);
		setVerifyResult({ ok: true });
		onSaved?.();
	}, [apiKey, formatValid, provider, verifyKey, onSaved]);

	const handleRemove = useCallback(async () => {
		await aiCredentialStore.save(getCredentialKey(provider), null);
		backendRegistry.notifyAvailabilityChanged();
		setHasSavedKey(false);
		setVerifyResult(null);
		onRemoved?.();
	}, [provider, onRemoved]);

	const compactPad = variant === "compact" ? "6px 10px" : "8px 12px";
	const fontSize = variant === "compact" ? 12 : 13;

	if (hasSavedKey === null) {
		return null; // initial async load
	}

	if (hasSavedKey && !showManagement) {
		// Caller manages their own "configured" indicator (e.g. WelcomeCard collapses the row).
		return null;
	}

	if (hasSavedKey && showManagement) {
		return (
			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<span style={{ fontSize, color: "#10b981" }}>Configured</span>
				<button
					type="button"
					onClick={handleRemove}
					style={{
						padding: compactPad,
						background: "var(--bg-tertiary)",
						border: "1px solid var(--border-light)",
						borderRadius: 6,
						color: "#ef4444",
						cursor: "pointer",
						fontSize,
					}}
				>
					Remove
				</button>
			</div>
		);
	}

	return (
		<div>
			<div style={{ display: "flex", gap: 8 }}>
				<input
					type="password"
					value={apiKey}
					onChange={(e) => {
						setApiKey(e.target.value);
						setVerifyResult(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave();
					}}
					placeholder={`Paste ${getProvider(provider).displayName} key…`}
					autoComplete="off"
					autoCorrect="off"
					spellCheck={false}
					style={{
						flex: 1,
						padding: compactPad,
						background: "var(--bg-primary)",
						color: "var(--text-primary)",
						border: `1px solid ${
							formatError ? "#ef4444" : "var(--border-light)"
						}`,
						borderRadius: 6,
						fontSize,
						outline: "none",
					}}
				/>
				<button
					type="button"
					onClick={handleSave}
					disabled={!formatValid || verifying}
					style={{
						padding: compactPad,
						background: formatValid && !verifying ? "var(--accent)" : "var(--bg-tertiary)",
						color: formatValid && !verifying ? "white" : "var(--text-muted)",
						border: "none",
						borderRadius: 6,
						fontSize,
						cursor: formatValid && !verifying ? "pointer" : "not-allowed",
						minWidth: 80,
					}}
				>
					{verifying ? "Verifying…" : "Save"}
				</button>
			</div>
			{formatError && (
				<div style={{ marginTop: 4, fontSize: 11, color: "#ef4444" }}>
					{formatError}
				</div>
			)}
			{verifyResult && !verifyResult.ok && (
				<div style={{ marginTop: 4, fontSize: 11, color: "#ef4444" }}>
					{verifyResult.message}
				</div>
			)}
			{verifyResult?.ok && (
				<div style={{ marginTop: 4, fontSize: 11, color: "#10b981" }}>
					Verified ✓
				</div>
			)}
			<div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
				<a
					href={apiKeyUrls[provider]}
					target="_blank"
					rel="noopener noreferrer"
					style={{ color: "var(--accent)", textDecoration: "none" }}
				>
					Get a {getProvider(provider).displayName} key →
				</a>
				<span> · Encrypted in your browser. Sent only to {getProvider(provider).displayName}; never to dbxlite servers.</span>
			</div>
		</div>
	);
}
