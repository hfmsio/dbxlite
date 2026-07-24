/**
 * AIChatPanel Component
 * Right-side drawer for the AI SQL Assistant.
 * Follows ToastHistory.tsx panel pattern.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { type AIProviderType, backendRegistry } from "../services/ai";
import { queryService } from "../services/streaming-query-service";
import { useAIChatStore } from "../stores/aiChatStore";
import { grantPiiConsent, hasPiiConsent } from "../utils/aiPiiConsent";
import { AIChatMessage } from "./AIChatMessage";
import ApiKeyInlineField from "./ai/ApiKeyInlineField";
import { SendIcon, SparklesIcon, StopIcon, TrashIcon, XIcon } from "./Icons";
import PiiConsentDialog from "./PiiConsentDialog";

interface AIChatPanelProps {
	onClose: () => void;
	onInsertSQL?: (sql: string) => void;
	getEditorContent?: () => string;
}

const iconButtonStyle: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "var(--text-muted)",
	cursor: "pointer",
	padding: "4px",
	borderRadius: "4px",
	display: "flex",
	alignItems: "center",
};

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
		setSelectedModel,
		setError,
	} = useAIChatStore();

	// Track availability of the active backend (BYO: has key; warehouse:
	// connector active + connected). Re-checks when the user switches.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const backend = backendRegistry.get(activeProvider);
			if (!backend) {
				if (!cancelled) setHasApiKey(false);
				return;
			}
			const available = await backend.isAvailable();
			if (!cancelled) setHasApiKey(available);
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

	// PII consent gate. BYO backends send editor + chat content to a third
	// party; warehouse backends keep data inside the user's warehouse and
	// don't need this. Once granted per-provider, never re-prompted.
	// pendingSendRef holds the (content, editorContent) to dispatch after
	// the dialog confirms — keeps the consent flow generic across handleSend
	// and handleQuickAction.
	const [consentDialogFor, setConsentDialogFor] = useState<{
		providerId: string;
		providerLabel: string;
	} | null>(null);
	const pendingSendRef = useRef<{
		content: string;
		editorContent: string | undefined;
	} | null>(null);

	const dispatchSend = useCallback(
		(content: string, editorContent: string | undefined) => {
			const activeBackend = backendRegistry.get(activeProvider);
			if (
				activeBackend?.kind === "byo" &&
				!hasPiiConsent(activeProvider)
			) {
				pendingSendRef.current = { content, editorContent };
				setConsentDialogFor({
					providerId: activeProvider,
					providerLabel: activeBackend.label,
				});
				return;
			}
			sendMessage(content, editorContent);
		},
		[activeProvider, sendMessage],
	);

	const handleConsentConfirm = useCallback(() => {
		if (!consentDialogFor) return;
		grantPiiConsent(consentDialogFor.providerId);
		const pending = pendingSendRef.current;
		pendingSendRef.current = null;
		setConsentDialogFor(null);
		if (pending) {
			sendMessage(pending.content, pending.editorContent);
		}
	}, [consentDialogFor, sendMessage]);

	const handleConsentCancel = useCallback(() => {
		pendingSendRef.current = null;
		setConsentDialogFor(null);
	}, []);

	const handleSend = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed || isStreaming) return;
		setInput("");
		dispatchSend(trimmed, getEditorContent?.());
	}, [input, isStreaming, dispatchSend, getEditorContent]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleQuickAction = (prompt: string) => {
		if (isStreaming) return;
		dispatchSend(prompt, getEditorContent?.());
	};

	const backend = backendRegistry.get(activeProvider);

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
			{/* Header — two rows so the title never competes with the pickers for
			    horizontal space. Row 1: title + tools. Row 2: backend + model. */}
			<div
				style={{
					padding: "10px 14px",
					borderBottom: "1px solid var(--border-light)",
					background: "var(--bg-secondary)",
					display: "flex",
					flexDirection: "column",
					gap: "8px",
				}}
			>
				{/* Row 1: title + tools */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							minWidth: 0,
						}}
					>
						<SparklesIcon size={16} style={{ color: "var(--accent)" }} />
						<h3
							style={{
								margin: 0,
								fontSize: "13px",
								fontWeight: 600,
								letterSpacing: "0.2px",
								color: "var(--text-primary)",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							AI SQL Assistant
						</h3>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "2px",
							flexShrink: 0,
						}}
					>
						{messages.length > 0 && (
							<button
								onClick={clearMessages}
								title="Clear chat"
								aria-label="Clear chat history"
								style={iconButtonStyle}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										"var(--bg-tertiary)";
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
							style={iconButtonStyle}
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

				{/* Row 2: backend + model pickers. Always visible, side-by-side,
				    flex-1 so they share the row evenly without forcing wrap. */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "6px",
					}}
				>
					<BackendPicker
						activeId={activeProvider}
						onChange={(id) => {
							setActiveProvider(id);
							setError(null);
						}}
					/>
					<ModelPicker
						backendId={activeProvider}
						selectedModels={selectedModels}
						onChange={(modelId) => {
							setSelectedModel(activeProvider, modelId);
							setError(null);
						}}
					/>
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
						onKeySaved={() => setHasApiKey(true)}
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
					{backend?.label ?? activeProvider}
					{selectedModels[activeProvider]
						? ` · ${selectedModels[activeProvider]}`
						: ""}
				</div>
			</div>

			{/* Blink animation for streaming cursor */}
			<style>{`
				@keyframes blink {
					50% { opacity: 0; }
				}
			`}</style>

			{consentDialogFor && (
				<PiiConsentDialog
					providerLabel={consentDialogFor.providerLabel}
					onConfirm={handleConsentConfirm}
					onCancel={handleConsentCancel}
				/>
			)}
		</div>
	);
}

function WelcomeCard({
	activeProvider,
	onSelectProvider,
	onKeySaved,
}: {
	activeProvider: string; // backend id; only BYO ids surface in the WelcomeCard rows
	onSelectProvider: (p: string) => void;
	onKeySaved: () => void;
}) {
	// Narrow incoming string to AIProviderType for the BYO grid; default to gemini if it's a warehouse id.
	const initialBYO: AIProviderType = (
		["gemini", "groq", "openai", "anthropic"] as const
	).includes(activeProvider as AIProviderType)
		? (activeProvider as AIProviderType)
		: "gemini";
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

	// Free providers expand by default; one expanded at a time.
	const [expanded, setExpanded] = useState<AIProviderType>(initialBYO);

	const handleToggle = (p: AIProviderType) => {
		if (expanded === p) {
			setExpanded((cur) => cur); // no-op; clicking expanded row keeps it open
			return;
		}
		setExpanded(p);
		onSelectProvider(p);
	};

	return (
		<div style={{ padding: "16px 8px" }}>
			<div style={{ textAlign: "center", marginBottom: "20px" }}>
				<SparklesIcon size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
				<h4
					style={{
						margin: "0 0 6px",
						fontSize: "16px",
						fontWeight: 600,
					}}
				>
					Get Started with AI SQL Assistant
				</h4>
				<p
					style={{
						color: "var(--text-muted)",
						fontSize: "12px",
						margin: 0,
						lineHeight: "1.5",
					}}
				>
					Pick a provider, paste a key. Gemini and Groq are free.
				</p>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					textAlign: "left",
				}}
			>
				{providers.map((p) => {
					const isExpanded = expanded === p.type;
					return (
						<div
							key={p.type}
							style={{
								background: isExpanded
									? "var(--bg-quaternary)"
									: "var(--bg-secondary)",
								border: isExpanded
									? "1px solid var(--accent)"
									: "1px solid var(--border-light)",
								borderRadius: "8px",
								transition: "background 0.15s, border 0.15s",
							}}
						>
							<button
								type="button"
								onClick={() => handleToggle(p.type)}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									width: "100%",
									padding: "10px 14px",
									background: "transparent",
									border: "none",
									cursor: "pointer",
									color: "var(--text-primary)",
									fontSize: "13px",
									textAlign: "left",
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
								<span
									style={{
										fontSize: "11px",
										color: "var(--text-muted)",
									}}
								>
									{isExpanded ? "▾" : "▸"}
								</span>
							</button>
							{isExpanded && (
								<div style={{ padding: "0 14px 12px" }}>
									<ApiKeyInlineField
										provider={p.type}
										onSaved={onKeySaved}
										variant="compact"
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>

			<p
				style={{
					color: "var(--text-muted)",
					fontSize: "11px",
					margin: "16px 0 0",
					textAlign: "center",
				}}
			>
				Manage all keys in Settings → AI tab.
			</p>
		</div>
	);
}

/**
 * Backend picker — grouped by kind (BYO providers / Connected warehouse).
 * Warehouse rows are disabled until the matching connector is connected.
 * (Backlog AI-5.)
 */
function BackendPicker({
	activeId,
	onChange,
}: {
	activeId: string;
	onChange: (id: string) => void;
}) {
	const [available, setAvailable] = useState<Set<string>>(new Set());

	// listAvailable() can change for three independent reasons, and all three
	// have to be subscribed to or the picker goes stale:
	//   1. a warehouse backend registering/unregistering  -> registry onChange
	//   2. the user adding or removing a BYO API key      -> registry onChange,
	//      via the explicit notify from the key field
	//   3. a warehouse connector connecting/disconnecting -> onConnectorState,
	//      because WarehouseChatBackend.isAvailable() reads connection state
	// A conversion that only watched the registry would silently drop (3).
	useEffect(() => {
		let cancelled = false;
		const update = async () => {
			const list = await backendRegistry.listAvailable();
			if (cancelled) return;
			setAvailable(new Set(list.map((b) => b.id)));
		};
		update();
		const offRegistry = backendRegistry.onChange(update);
		const offConnector = queryService.onConnectorState(update);
		return () => {
			cancelled = true;
			offRegistry();
			offConnector();
		};
	}, []);

	const all = backendRegistry.list();
	const byo = all.filter((b) => b.kind === "byo");
	const warehouse = all.filter((b) => b.kind === "warehouse");

	return (
		<select
			value={activeId}
			onChange={(e) => onChange(e.target.value)}
			style={{
				background: "var(--bg-tertiary)",
				color: "var(--text-primary)",
				border: "1px solid var(--border-light)",
				borderRadius: "4px",
				padding: "4px 6px",
				fontSize: "12px",
				cursor: "pointer",
				maxWidth: 180,
			}}
		>
			<optgroup label="BYO providers">
				{byo.map((b) => (
					<option key={b.id} value={b.id} disabled={!available.has(b.id)}>
						{b.label}
						{available.has(b.id) ? "" : " (no key)"}
					</option>
				))}
			</optgroup>
			{warehouse.length > 0 && (
				<optgroup label="Connected warehouse">
					{warehouse.map((b) => (
						<option key={b.id} value={b.id} disabled={!available.has(b.id)}>
							{b.label}
							{available.has(b.id) ? "" : " (not connected)"}
						</option>
					))}
				</optgroup>
			)}
		</select>
	);
}

/**
 * ModelPicker — small dropdown next to BackendPicker. Shown only when the
 * active backend exposes more than one model. Default selection (when the
 * store doesn't yet have one for this backend) is the backend's first model.
 */
function ModelPicker({
	backendId,
	selectedModels,
	onChange,
}: {
	backendId: string;
	selectedModels: Record<string, string>;
	onChange: (modelId: string) => void;
}) {
	const backend = backendRegistry.get(backendId);
	if (!backend || backend.models.length <= 1) return null;
	const current = selectedModels[backendId] ?? backend.models[0]?.id;
	return (
		<select
			value={current}
			onChange={(e) => onChange(e.target.value)}
			title={`Model for ${backend.label}`}
			aria-label={`Select model for ${backend.label}`}
			style={{
				background: "var(--bg-tertiary)",
				color: "var(--text-primary)",
				border: "1px solid var(--border-light)",
				borderRadius: "4px",
				padding: "4px 6px",
				fontSize: "12px",
				cursor: "pointer",
				maxWidth: 180,
			}}
		>
			{backend.models.map((m) => (
				<option key={m.id} value={m.id}>
					{m.name}
				</option>
			))}
		</select>
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
