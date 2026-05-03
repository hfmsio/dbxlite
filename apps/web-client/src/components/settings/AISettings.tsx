/**
 * AISettings Component
 * Settings tab for configuring AI providers, API keys, and models.
 */

import { useCallback, useEffect, useState } from "react";
import {
	type AIProviderType,
	aiCredentialStore,
	getAllProviderTypes,
	getCredentialKey,
	getProvider,
} from "../../services/ai";
import { useAIChatStore } from "../../stores/aiChatStore";
import { hasPiiConsent, revokePiiConsent } from "../../utils/aiPiiConsent";
import ApiKeyInlineField from "../ai/ApiKeyInlineField";
import { CheckIcon } from "../Icons";

interface AISettingsProps {
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

export default function AISettings({ showToast }: AISettingsProps) {
	const {
		activeProvider,
		selectedModels,
		messages,
		setActiveProvider,
		setSelectedModel,
		clearMessages,
	} = useAIChatStore();

	const [savedKeys, setSavedKeys] = useState<Record<AIProviderType, boolean>>({
		openai: false,
		anthropic: false,
		gemini: false,
		groq: false,
	});

	// Tracks which providers have a stored PII consent grant. Used to
	// conditionally render the "Reset PII consent" row.
	const [consentGranted, setConsentGranted] = useState<
		Record<AIProviderType, boolean>
	>({
		openai: false,
		anthropic: false,
		gemini: false,
		groq: false,
	});

	const refreshSavedKeys = useCallback(async () => {
		const result: Record<string, boolean> = {};
		for (const type of getAllProviderTypes()) {
			const key = await aiCredentialStore.load(getCredentialKey(type));
			result[type] = !!key;
		}
		setSavedKeys(result as Record<AIProviderType, boolean>);
	}, []);

	const refreshConsent = useCallback(() => {
		const next: Record<string, boolean> = {};
		for (const type of getAllProviderTypes()) {
			next[type] = hasPiiConsent(type);
		}
		setConsentGranted(next as Record<AIProviderType, boolean>);
	}, []);

	useEffect(() => {
		refreshSavedKeys();
		refreshConsent();
	}, [refreshSavedKeys, refreshConsent]);

	// AISettings manages BYO providers only. When activeProvider is a warehouse
	// backend id (e.g. "snowflake-cortex"), narrow to a sensible BYO default.
	const BYO_TYPES: readonly AIProviderType[] = [
		"gemini",
		"groq",
		"openai",
		"anthropic",
	];
	const settingsProvider: AIProviderType = BYO_TYPES.includes(
		activeProvider as AIProviderType,
	)
		? (activeProvider as AIProviderType)
		: "gemini";

	const provider = getProvider(settingsProvider);

	const sectionStyle: React.CSSProperties = {
		marginBottom: "24px",
	};

	const labelStyle: React.CSSProperties = {
		display: "block",
		fontSize: "13px",
		fontWeight: 500,
		marginBottom: "6px",
		color: "var(--text-secondary)",
	};

	return (
		<div style={{ padding: "0 4px" }}>
			<h3
				style={{
					margin: "0 0 20px",
					fontSize: "18px",
					fontWeight: 600,
				}}
			>
				AI Assistant
			</h3>

			{activeProvider === "snowflake-cortex" && (
				<div
					style={{
						marginBottom: 16,
						padding: "10px 12px",
						background: "rgba(59, 130, 246, 0.08)",
						border: "1px solid rgba(59, 130, 246, 0.25)",
						borderRadius: 6,
						fontSize: 12,
						color: "var(--text-primary)",
						lineHeight: 1.5,
					}}
				>
					<strong>Snowflake Cortex is your active backend.</strong> The chat panel
					runs <code style={{ fontSize: 11 }}>SNOWFLAKE.CORTEX.COMPLETE(...)</code> on
					your warehouse - no external API key needed. The settings below configure
					BYO providers (current selection: <strong>{provider.displayName}</strong>).
					Switch backends from the chat-panel picker.
				</div>
			)}

			{/* Provider Selection */}
			<div style={sectionStyle}>
				<label style={labelStyle}>Provider</label>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: "8px",
					}}
				>
					{getAllProviderTypes().map((type) => {
						const p = getProvider(type);
						const isFree = p.models.some((m) => m.isFree);
						const hasSavedKey = savedKeys[type];
						return (
							<button
								key={type}
								onClick={() => setActiveProvider(type)}
								style={{
									padding: "10px 12px",
									background:
										activeProvider === type
											? "var(--bg-quaternary)"
											: "var(--bg-secondary)",
									border:
										activeProvider === type
											? "2px solid var(--accent)"
											: "1px solid var(--border-light)",
									borderRadius: "8px",
									cursor: "pointer",
									color: "var(--text-primary)",
									textAlign: "left",
									fontSize: "13px",
									position: "relative",
									transition: "all 0.2s",
								}}
							>
								<div style={{ fontWeight: 500 }}>{p.displayName}</div>
								<div
									style={{
										fontSize: "11px",
										color: isFree ? "#10b981" : "var(--text-muted)",
										marginTop: "2px",
									}}
								>
									{isFree ? "Free tier available" : "Paid"}
								</div>
								{hasSavedKey && (
									<div
										style={{
											position: "absolute",
											top: "6px",
											right: "8px",
										}}
									>
										<CheckIcon size={12} color="#10b981" />
									</div>
								)}
							</button>
						);
					})}
				</div>
			</div>

			{/* API Key */}
			<div style={sectionStyle}>
				<label style={labelStyle}>API Key</label>
				<ApiKeyInlineField
					provider={settingsProvider}
					showManagement
					variant="settings"
					onSaved={() => {
						void refreshSavedKeys();
						showToast?.("API key saved", "success", 2000);
					}}
					onRemoved={() => {
						void refreshSavedKeys();
						showToast?.("API key removed", "info", 2000);
					}}
				/>
			</div>

			{/* Model Selection */}
			<div style={sectionStyle}>
				<label style={labelStyle}>Model</label>
				<select
					value={selectedModels[settingsProvider] ?? provider.models[0]?.id}
					onChange={(e) => setSelectedModel(settingsProvider, e.target.value)}
					style={{
						width: "100%",
						padding: "8px 12px",
						background: "var(--bg-primary)",
						color: "var(--text-primary)",
						border: "1px solid var(--border-light)",
						borderRadius: "6px",
						fontSize: "13px",
						cursor: "pointer",
					}}
				>
					{provider.models.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
							{m.isFree ? " (Free)" : ""}
						</option>
					))}
				</select>
			</div>

			{/* Chat History */}
			<div style={sectionStyle}>
				<label style={labelStyle}>Chat History</label>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
						{messages.length} message{messages.length !== 1 ? "s" : ""}
					</span>
					{messages.length > 0 && (
						<button
							onClick={() => {
								clearMessages();
								showToast?.("Chat history cleared", "info", 2000);
							}}
							style={{
								padding: "6px 12px",
								background: "var(--bg-tertiary)",
								border: "1px solid var(--border-light)",
								borderRadius: "6px",
								color: "var(--text-muted)",
								fontSize: "12px",
								cursor: "pointer",
							}}
						>
							Clear History
						</button>
					)}
				</div>
			</div>

			{/* PII Consent — only render the row when the current settings
			    provider has a stored grant. Each BYO provider's first send
			    gates on a one-time consent dialog; this is where users
			    revoke and force the dialog to appear again on the next
			    send. */}
			{consentGranted[settingsProvider] && (
				<div style={sectionStyle}>
					<label style={labelStyle}>Data Sharing Consent</label>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
							You've granted permission to send messages to{" "}
							{provider.label}.
						</span>
						<button
							onClick={() => {
								revokePiiConsent(settingsProvider);
								refreshConsent();
								showToast?.(
									`Reset consent for ${provider.label}`,
									"info",
									2000,
								);
							}}
							style={{
								padding: "6px 12px",
								background: "var(--bg-tertiary)",
								border: "1px solid var(--border-light)",
								borderRadius: "6px",
								color: "var(--text-muted)",
								fontSize: "12px",
								cursor: "pointer",
							}}
						>
							Reset
						</button>
					</div>
				</div>
			)}

			{/* Free Tier Info */}
			<div
				style={{
					padding: "12px 14px",
					background: "var(--bg-secondary)",
					borderRadius: "8px",
					border: "1px solid var(--border-light)",
					fontSize: "12px",
					lineHeight: "1.6",
					color: "var(--text-muted)",
				}}
			>
				<div
					style={{
						fontWeight: 500,
						marginBottom: "4px",
						color: "var(--text-secondary)",
					}}
				>
					Free tier options
				</div>
				<div>
					<strong>Google Gemini</strong> - 15 requests/min, no credit card
					needed
				</div>
				<div>
					<strong>Groq</strong> - 30 requests/min, free for smaller models
				</div>
				<div style={{ marginTop: "4px", fontSize: "11px" }}>
					API keys are encrypted locally in your browser (AES-GCM with a
					device-bound key). They are never sent to any server except the AI
					provider you choose.
				</div>
				<div style={{ marginTop: "4px", fontSize: "11px" }}>
					Note: Gemini sends the API key as a URL parameter (required by their
					browser API). Other providers use secure HTTP headers.
				</div>
			</div>
		</div>
	);
}
