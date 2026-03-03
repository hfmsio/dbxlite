/**
 * AISettings Component
 * Settings tab for configuring AI providers, API keys, and models.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AIProviderType,
	aiCredentialStore,
	getAllProviderTypes,
	getCredentialKey,
	getProvider,
} from "../../services/ai";
import { useAIChatStore } from "../../stores/aiChatStore";
import { CheckIcon, KeyIcon, TrashIcon } from "../Icons";

interface AISettingsProps {
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

const apiKeyUrls: Record<AIProviderType, string> = {
	gemini: "https://aistudio.google.com/app/apikey",
	groq: "https://console.groq.com/keys",
	openai: "https://platform.openai.com/api-keys",
	anthropic: "https://console.anthropic.com/settings/keys",
};

export default function AISettings({ showToast }: AISettingsProps) {
	const {
		activeProvider,
		selectedModels,
		messages,
		setActiveProvider,
		setSelectedModel,
		clearMessages,
	} = useAIChatStore();

	const [apiKey, setApiKey] = useState("");
	const [savedKeys, setSavedKeys] = useState<Record<AIProviderType, boolean>>({
		openai: false,
		anthropic: false,
		gemini: false,
		groq: false,
	});
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<"success" | "error" | null>(
		null,
	);
	const testAbortRef = useRef<AbortController | null>(null);

	// Abort any in-flight test on unmount
	useEffect(() => {
		return () => {
			testAbortRef.current?.abort();
		};
	}, []);

	// Load which providers have saved keys
	useEffect(() => {
		(async () => {
			const result: Record<string, boolean> = {};
			for (const type of getAllProviderTypes()) {
				const key = await aiCredentialStore.load(getCredentialKey(type));
				result[type] = !!key;
			}
			setSavedKeys(result as Record<AIProviderType, boolean>);
		})();
	}, []);

	const handleSaveKey = useCallback(async () => {
		if (!apiKey.trim()) return;
		await aiCredentialStore.save(
			getCredentialKey(activeProvider),
			apiKey.trim(),
		);
		setSavedKeys((prev) => ({ ...prev, [activeProvider]: true }));
		setApiKey("");
		showToast?.("API key saved", "success", 2000);
	}, [apiKey, activeProvider, showToast]);

	const handleRemoveKey = useCallback(async () => {
		await aiCredentialStore.save(getCredentialKey(activeProvider), null);
		setSavedKeys((prev) => ({ ...prev, [activeProvider]: false }));
		showToast?.("API key removed", "info", 2000);
	}, [activeProvider, showToast]);

	const handleTestKey = useCallback(async () => {
		setTesting(true);
		setTestResult(null);

		// Abort any previous test
		testAbortRef.current?.abort();
		const controller = new AbortController();
		testAbortRef.current = controller;

		try {
			const key = (await aiCredentialStore.load(
				getCredentialKey(activeProvider),
			)) as string | null;
			if (!key) {
				setTestResult("error");
				showToast?.("No API key saved", "error", 2000);
				return;
			}

			const provider = getProvider(activeProvider);
			const model = selectedModels[activeProvider];
			const testMessages = [
				{ role: "user" as const, content: "Say 'OK' and nothing else." },
			];

			let gotResponse = false;
			for await (const chunk of provider.streamChat(
				testMessages,
				{
					apiKey: key,
					model,
					maxTokens: 10,
				},
				controller.signal,
			)) {
				if (chunk.type === "text") {
					gotResponse = true;
					break;
				}
				if (chunk.type === "error") {
					throw new Error(chunk.error);
				}
			}

			if (gotResponse) {
				setTestResult("success");
				showToast?.("API key is valid", "success", 2000);
			} else {
				setTestResult("error");
				showToast?.("No response received", "error", 2000);
			}
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			setTestResult("error");
			showToast?.(`Test failed: ${(err as Error).message}`, "error", 4000);
		} finally {
			testAbortRef.current = null;
			setTesting(false);
		}
	}, [activeProvider, selectedModels, showToast]);

	const provider = getProvider(activeProvider);

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
				<label style={labelStyle}>
					API Key
					{savedKeys[activeProvider] && (
						<span
							style={{
								color: "#10b981",
								fontWeight: "normal",
								marginLeft: "8px",
								fontSize: "11px",
							}}
						>
							Configured
						</span>
					)}
				</label>
				{savedKeys[activeProvider] ? (
					<div style={{ display: "flex", gap: "8px" }}>
						<button
							onClick={handleTestKey}
							disabled={testing}
							style={{
								flex: 1,
								padding: "8px 12px",
								background:
									testResult === "success"
										? "rgba(16, 185, 129, 0.1)"
										: testResult === "error"
											? "rgba(239, 68, 68, 0.1)"
											: "var(--bg-tertiary)",
								border: `1px solid ${
									testResult === "success"
										? "#10b981"
										: testResult === "error"
											? "#ef4444"
											: "var(--border-light)"
								}`,
								borderRadius: "6px",
								color: "var(--text-primary)",
								fontSize: "13px",
								cursor: testing ? "wait" : "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "6px",
							}}
						>
							<KeyIcon size={14} />
							{testing
								? "Testing..."
								: testResult === "success"
									? "Key is valid"
									: testResult === "error"
										? "Test failed"
										: "Test Key"}
						</button>
						<button
							onClick={handleRemoveKey}
							title="Remove API key"
							style={{
								padding: "8px 12px",
								background: "var(--bg-tertiary)",
								border: "1px solid var(--border-light)",
								borderRadius: "6px",
								color: "#ef4444",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								gap: "4px",
								fontSize: "13px",
							}}
						>
							<TrashIcon size={14} />
							Remove
						</button>
					</div>
				) : (
					<div style={{ display: "flex", gap: "8px" }}>
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSaveKey();
							}}
							placeholder="Paste your API key..."
							style={{
								flex: 1,
								padding: "8px 12px",
								background: "var(--bg-primary)",
								color: "var(--text-primary)",
								border: "1px solid var(--border-light)",
								borderRadius: "6px",
								fontSize: "13px",
								outline: "none",
							}}
						/>
						<button
							onClick={handleSaveKey}
							disabled={!apiKey.trim()}
							style={{
								padding: "8px 16px",
								background: apiKey.trim()
									? "var(--accent)"
									: "var(--bg-tertiary)",
								color: apiKey.trim() ? "white" : "var(--text-muted)",
								border: "none",
								borderRadius: "6px",
								fontSize: "13px",
								cursor: apiKey.trim() ? "pointer" : "not-allowed",
							}}
						>
							Save
						</button>
					</div>
				)}
				<a
					href={apiKeyUrls[activeProvider]}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						display: "inline-block",
						marginTop: "6px",
						fontSize: "12px",
						color: "var(--accent)",
						textDecoration: "none",
					}}
				>
					Get a {provider.displayName} API key
				</a>
			</div>

			{/* Model Selection */}
			<div style={sectionStyle}>
				<label style={labelStyle}>Model</label>
				<select
					value={selectedModels[activeProvider]}
					onChange={(e) => setSelectedModel(activeProvider, e.target.value)}
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
