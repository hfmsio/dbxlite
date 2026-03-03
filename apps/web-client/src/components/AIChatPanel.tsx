/**
 * AIChatPanel Component
 * Right-side drawer for the AI SQL Assistant.
 * Follows ToastHistory.tsx panel pattern.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	type AIProviderType,
	aiCredentialStore,
	getAllProviderTypes,
	getCredentialKey,
	getProvider,
} from "../services/ai";
import { useAIChatStore } from "../stores/aiChatStore";
import { AIChatMessage } from "./AIChatMessage";
import { SendIcon, SparklesIcon, StopIcon, TrashIcon, XIcon } from "./Icons";

interface AIChatPanelProps {
	onClose: () => void;
	onInsertSQL?: (sql: string) => void;
	getEditorContent?: () => string;
}

export function AIChatPanel({
	onClose,
	onInsertSQL,
	getEditorContent,
}: AIChatPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [input, setInput] = useState("");
	const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

	const {
		messages,
		isStreaming,
		error,
		activeProvider,
		selectedModels,
		sendMessage,
		stopStreaming,
		clearMessages,
		setActiveProvider,
		setError,
	} = useAIChatStore();

	// Check if API key is configured for active provider
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const key = await aiCredentialStore.load(
				getCredentialKey(activeProvider),
			);
			if (!cancelled) setHasApiKey(!!key);
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProvider]);

	// Close on ESC only if focus is inside the panel
	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (
				e.key === "Escape" &&
				panelRef.current?.contains(document.activeElement)
			) {
				onClose();
			}
		};
		document.addEventListener("keydown", handleEsc);
		return () => document.removeEventListener("keydown", handleEsc);
	}, [onClose]);

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const handleSend = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed || isStreaming) return;
		setInput("");
		sendMessage(trimmed, getEditorContent?.());
	}, [input, isStreaming, sendMessage, getEditorContent]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleQuickAction = (prompt: string) => {
		if (isStreaming) return;
		sendMessage(prompt, getEditorContent?.());
	};

	const provider = getProvider(activeProvider);

	return (
		<div
			ref={panelRef}
			style={{
				position: "fixed",
				top: 0,
				right: 0,
				bottom: 0,
				width: "450px",
				background: "var(--bg-primary)",
				borderLeft: "1px solid var(--border-light)",
				boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.15)",
				zIndex: 10000,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "12px 16px",
					borderBottom: "1px solid var(--border-light)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background: "var(--bg-secondary)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<SparklesIcon size={18} />
					<h3
						style={{
							margin: 0,
							fontSize: "15px",
							fontWeight: 600,
						}}
					>
						SQL Assistant
					</h3>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
					{/* Provider selector */}
					<select
						value={activeProvider}
						onChange={(e) => {
							setActiveProvider(e.target.value as AIProviderType);
							setError(null);
						}}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-light)",
							borderRadius: "4px",
							padding: "4px 6px",
							fontSize: "12px",
							cursor: "pointer",
						}}
					>
						{getAllProviderTypes().map((t) => {
							const p = getProvider(t);
							return (
								<option key={t} value={t}>
									{p.displayName}
								</option>
							);
						})}
					</select>
					{messages.length > 0 && (
						<button
							onClick={clearMessages}
							title="Clear chat"
							aria-label="Clear chat history"
							style={{
								background: "transparent",
								border: "none",
								color: "var(--text-muted)",
								cursor: "pointer",
								padding: "4px",
								borderRadius: "4px",
								display: "flex",
								alignItems: "center",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "var(--bg-tertiary)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
						>
							<TrashIcon size={14} />
						</button>
					)}
					<button
						onClick={onClose}
						title="Close AI assistant"
						aria-label="Close AI assistant panel"
						style={{
							background: "transparent",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							padding: "4px",
							borderRadius: "4px",
							display: "flex",
							alignItems: "center",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--bg-tertiary)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<XIcon size={16} />
					</button>
				</div>
			</div>

			{/* Messages area */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "12px 16px",
				}}
			>
				{hasApiKey === false ? (
					<WelcomeCard
						activeProvider={activeProvider}
						onSelectProvider={(p) => setActiveProvider(p)}
					/>
				) : messages.length === 0 ? (
					<EmptyState />
				) : (
					messages.map((msg) => (
						<AIChatMessage
							key={msg.id}
							message={msg}
							onInsertSQL={onInsertSQL}
						/>
					))
				)}
				{error && (
					<div
						style={{
							padding: "8px 12px",
							background: "rgba(239, 68, 68, 0.1)",
							border: "1px solid rgba(239, 68, 68, 0.3)",
							borderRadius: "6px",
							color: "#ef4444",
							fontSize: "12px",
							marginTop: "8px",
						}}
					>
						{error}
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Quick actions */}
			{hasApiKey && messages.length === 0 && (
				<div
					style={{
						padding: "0 16px 8px",
						display: "flex",
						gap: "6px",
						flexWrap: "wrap",
					}}
				>
					{[
						{ label: "Explain", prompt: "Explain this SQL query:" },
						{ label: "Fix Error", prompt: "Fix the error in this SQL:" },
						{ label: "Optimize", prompt: "Optimize this SQL query:" },
					].map((action) => (
						<button
							key={action.label}
							onClick={() => handleQuickAction(action.prompt)}
							disabled={isStreaming}
							style={{
								background: "var(--bg-tertiary)",
								border: "1px solid var(--border-light)",
								borderRadius: "14px",
								padding: "4px 12px",
								fontSize: "12px",
								color: "var(--text-secondary)",
								cursor: isStreaming ? "not-allowed" : "pointer",
								opacity: isStreaming ? 0.5 : 1,
								transition: "all 0.2s",
							}}
							onMouseEnter={(e) => {
								if (!isStreaming) {
									e.currentTarget.style.background = "var(--bg-quaternary)";
									e.currentTarget.style.color = "var(--text-primary)";
								}
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "var(--bg-tertiary)";
								e.currentTarget.style.color = "var(--text-secondary)";
							}}
						>
							{action.label}
						</button>
					))}
				</div>
			)}

			{/* Input area */}
			<div
				style={{
					padding: "12px 16px",
					borderTop: "1px solid var(--border-light)",
					background: "var(--bg-secondary)",
				}}
			>
				<div
					style={{
						display: "flex",
						gap: "8px",
						alignItems: "flex-end",
					}}
				>
					<textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							hasApiKey === false
								? "Configure an API key first..."
								: "Ask about SQL..."
						}
						disabled={hasApiKey === false}
						rows={1}
						style={{
							flex: 1,
							resize: "none",
							background: "var(--bg-primary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-light)",
							borderRadius: "8px",
							padding: "8px 12px",
							fontSize: "13px",
							fontFamily: "inherit",
							lineHeight: "1.4",
							maxHeight: "120px",
							overflowY: "auto",
							outline: "none",
						}}
						onInput={(e) => {
							const target = e.currentTarget;
							target.style.height = "auto";
							target.style.height = Math.min(target.scrollHeight, 120) + "px";
						}}
						onFocus={(e) => {
							e.currentTarget.style.borderColor = "var(--accent)";
						}}
						onBlur={(e) => {
							e.currentTarget.style.borderColor = "var(--border-light)";
						}}
					/>
					{isStreaming ? (
						<button
							onClick={stopStreaming}
							title="Stop generating"
							aria-label="Stop generating response"
							style={{
								background: "#ef4444",
								color: "white",
								border: "none",
								borderRadius: "8px",
								width: "36px",
								height: "36px",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexShrink: 0,
							}}
						>
							<StopIcon size={16} />
						</button>
					) : (
						<button
							onClick={handleSend}
							disabled={!input.trim() || hasApiKey === false}
							title="Send message"
							aria-label="Send message"
							style={{
								background:
									input.trim() && hasApiKey !== false
										? "var(--accent)"
										: "var(--bg-tertiary)",
								color:
									input.trim() && hasApiKey !== false
										? "white"
										: "var(--text-muted)",
								border: "none",
								borderRadius: "8px",
								width: "36px",
								height: "36px",
								cursor:
									input.trim() && hasApiKey !== false
										? "pointer"
										: "not-allowed",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexShrink: 0,
								transition: "all 0.2s",
							}}
						>
							<SendIcon size={16} />
						</button>
					)}
				</div>
				<div
					style={{
						fontSize: "10px",
						color: "var(--text-muted)",
						marginTop: "4px",
						textAlign: "right",
					}}
				>
					{provider.displayName} - {selectedModels[activeProvider]}
				</div>
			</div>

			{/* Blink animation for streaming cursor */}
			<style>{`
				@keyframes blink {
					50% { opacity: 0; }
				}
			`}</style>
		</div>
	);
}

function WelcomeCard({
	activeProvider,
	onSelectProvider,
}: {
	activeProvider: AIProviderType;
	onSelectProvider: (p: AIProviderType) => void;
}) {
	const providers: {
		type: AIProviderType;
		name: string;
		desc: string;
		free: boolean;
	}[] = [
		{
			type: "gemini",
			name: "Google Gemini",
			desc: "Free - 15 req/min",
			free: true,
		},
		{ type: "groq", name: "Groq", desc: "Free - 30 req/min", free: true },
		{ type: "openai", name: "OpenAI", desc: "Paid - GPT-4o", free: false },
		{
			type: "anthropic",
			name: "Anthropic",
			desc: "Paid - Claude",
			free: false,
		},
	];

	const apiKeyUrls: Record<AIProviderType, string> = {
		gemini: "https://aistudio.google.com/app/apikey",
		groq: "https://console.groq.com/keys",
		openai: "https://platform.openai.com/api-keys",
		anthropic: "https://console.anthropic.com/settings/keys",
	};

	return (
		<div
			style={{
				textAlign: "center",
				padding: "32px 16px",
			}}
		>
			<SparklesIcon size={40} style={{ marginBottom: "16px", opacity: 0.4 }} />
			<h4
				style={{
					margin: "0 0 8px",
					fontSize: "16px",
					fontWeight: 600,
				}}
			>
				Get Started with AI SQL Assistant
			</h4>
			<p
				style={{
					color: "var(--text-muted)",
					fontSize: "13px",
					margin: "0 0 20px",
					lineHeight: "1.5",
				}}
			>
				Choose a provider and add your API key.
				<br />
				Gemini and Groq offer free tiers.
			</p>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					textAlign: "left",
				}}
			>
				{providers.map((p) => (
					<button
						key={p.type}
						onClick={() => onSelectProvider(p.type)}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "10px 14px",
							background:
								activeProvider === p.type
									? "var(--bg-quaternary)"
									: "var(--bg-secondary)",
							border:
								activeProvider === p.type
									? "1px solid var(--accent)"
									: "1px solid var(--border-light)",
							borderRadius: "8px",
							cursor: "pointer",
							color: "var(--text-primary)",
							fontSize: "13px",
							transition: "all 0.2s",
						}}
					>
						<div>
							<div style={{ fontWeight: 500 }}>{p.name}</div>
							<div
								style={{
									fontSize: "11px",
									color: p.free ? "#10b981" : "var(--text-muted)",
									marginTop: "2px",
								}}
							>
								{p.desc}
							</div>
						</div>
						<a
							href={apiKeyUrls[p.type]}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							style={{
								fontSize: "11px",
								color: "var(--accent)",
								textDecoration: "none",
							}}
						>
							Get Key
						</a>
					</button>
				))}
			</div>

			<p
				style={{
					color: "var(--text-muted)",
					fontSize: "11px",
					margin: "16px 0 0",
				}}
			>
				Add your API key in Settings &gt; AI tab
			</p>
		</div>
	);
}

function EmptyState() {
	return (
		<div
			style={{
				textAlign: "center",
				padding: "48px 16px",
				color: "var(--text-muted)",
			}}
		>
			<SparklesIcon size={48} style={{ marginBottom: "16px", opacity: 0.2 }} />
			<div style={{ fontSize: "14px", marginBottom: "6px" }}>
				Ask anything about SQL
			</div>
			<div style={{ fontSize: "12px" }}>
				Write queries, explain code, fix errors, or optimize performance
			</div>
		</div>
	);
}
