/**
 * AIChatMessage Component
 * Renders individual chat messages with SQL block extraction and action buttons.
 */

import React from "react";
import type { ChatMessage } from "../services/ai";
import { CopyIcon, CheckIcon } from "./Icons";

interface AIChatMessageProps {
	message: ChatMessage;
	onInsertSQL?: (sql: string) => void;
}

/** Simple markdown-lite renderer: bold, inline code, lists, and SQL blocks */
function renderContent(
	content: string,
	onInsertSQL?: (sql: string) => void,
): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Split on ```sql blocks
	const parts = content.split(/(```sql\s*\n[\s\S]*?```)/gi);

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (!part) continue;

		const sqlMatch = part.match(/^```sql\s*\n([\s\S]*?)```$/i);
		if (sqlMatch) {
			const sql = sqlMatch[1].trim();
			nodes.push(<SQLCodeBlock key={i} sql={sql} onInsert={onInsertSQL} />);
		} else {
			// Render as markdown-lite text
			nodes.push(<TextBlock key={i} text={part} />);
		}
	}

	return nodes;
}

function SQLCodeBlock({
	sql,
	onInsert,
}: {
	sql: string;
	onInsert?: (sql: string) => void;
}) {
	const [copied, setCopied] = React.useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(sql);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			style={{
				margin: "8px 0",
				borderRadius: "6px",
				overflow: "hidden",
				border: "1px solid var(--border-light)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "4px 8px",
					background: "var(--bg-quaternary)",
					fontSize: "11px",
					color: "var(--text-muted)",
				}}
			>
				<span>SQL</span>
				<div style={{ display: "flex", gap: "4px" }}>
					{onInsert && (
						<button
							onClick={() => onInsert(sql)}
							style={{
								background: "var(--accent)",
								color: "white",
								border: "none",
								borderRadius: "4px",
								padding: "2px 8px",
								fontSize: "11px",
								cursor: "pointer",
								transition: "opacity 0.2s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.opacity = "0.8";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.opacity = "1";
							}}
						>
							Insert
						</button>
					)}
					<button
						onClick={handleCopy}
						style={{
							background: "transparent",
							border: "1px solid var(--border-light)",
							borderRadius: "4px",
							padding: "2px 6px",
							cursor: "pointer",
							color: "var(--text-muted)",
							display: "flex",
							alignItems: "center",
							gap: "3px",
							fontSize: "11px",
						}}
					>
						{copied ? (
							<>
								<CheckIcon size={10} /> Copied
							</>
						) : (
							<>
								<CopyIcon size={10} /> Copy
							</>
						)}
					</button>
				</div>
			</div>
			<pre
				style={{
					margin: 0,
					padding: "10px 12px",
					background: "var(--bg-tertiary)",
					fontSize: "12px",
					lineHeight: "1.5",
					overflowX: "auto",
					fontFamily: 'Menlo, Monaco, "Courier New", monospace',
					color: "var(--text-primary)",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
				}}
			>
				{sql}
			</pre>
		</div>
	);
}

function TextBlock({ text }: { text: string }) {
	// Process inline formatting
	const lines = text.split("\n");
	const elements: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Headings
		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const sizes = { 1: "16px", 2: "14px", 3: "13px" } as Record<number, string>;
			elements.push(
				<div
					key={i}
					style={{
						fontSize: sizes[level] || "13px",
						fontWeight: 600,
						marginTop: i > 0 ? "8px" : 0,
						marginBottom: "4px",
					}}
				>
					{formatInline(headingMatch[2])}
				</div>,
			);
			continue;
		}

		// List items
		if (line.match(/^\s*[-*]\s/)) {
			elements.push(
				<div key={i} style={{ paddingLeft: "16px", position: "relative" }}>
					<span
						style={{ position: "absolute", left: "4px" }}
					>
						{"\u2022"}
					</span>
					{formatInline(line.replace(/^\s*[-*]\s/, ""))}
				</div>,
			);
		} else if (line.match(/^\s*\d+\.\s/)) {
			const num = line.match(/^\s*(\d+)\.\s/)?.[1];
			elements.push(
				<div key={i} style={{ paddingLeft: "16px", position: "relative" }}>
					<span style={{ position: "absolute", left: "0px" }}>{num}.</span>
					{formatInline(line.replace(/^\s*\d+\.\s/, ""))}
				</div>,
			);
		} else if (line.trim() === "") {
			elements.push(<div key={i} style={{ height: "8px" }} />);
		} else {
			elements.push(<div key={i}>{formatInline(line)}</div>);
		}
	}

	return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
	// Process **bold** and `inline code`
	const parts: React.ReactNode[] = [];
	const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		const token = match[0];
		if (token.startsWith("**")) {
			parts.push(
				<strong key={match.index}>{token.slice(2, -2)}</strong>,
			);
		} else if (token.startsWith("`")) {
			parts.push(
				<code
					key={match.index}
					style={{
						background: "var(--bg-quaternary)",
						padding: "1px 4px",
						borderRadius: "3px",
						fontSize: "0.9em",
						fontFamily: 'Menlo, Monaco, "Courier New", monospace',
					}}
				>
					{token.slice(1, -1)}
				</code>,
			);
		}
		lastIndex = match.index + token.length;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function AIChatMessage({ message, onInsertSQL }: AIChatMessageProps) {
	const isUser = message.role === "user";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: isUser ? "flex-end" : "flex-start",
				marginBottom: "12px",
			}}
		>
			<div
				style={{
					maxWidth: "90%",
					padding: "10px 14px",
					borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
					background: isUser ? "var(--accent)" : "var(--bg-secondary)",
					color: isUser ? "white" : "var(--text-primary)",
					fontSize: "13px",
					lineHeight: "1.6",
					wordBreak: "break-word",
				}}
			>
				{isUser ? (
					message.content
				) : (
					<>
						{renderContent(message.content, onInsertSQL)}
						{message.isStreaming && (
							<span
								style={{
									display: "inline-block",
									width: "6px",
									height: "14px",
									background: "var(--accent)",
									marginLeft: "2px",
									animation: "blink 1s step-end infinite",
									verticalAlign: "text-bottom",
								}}
							/>
						)}
					</>
				)}
			</div>
			<div
				style={{
					fontSize: "10px",
					color: "var(--text-muted)",
					marginTop: "4px",
					padding: "0 4px",
				}}
			>
				{new Date(message.timestamp).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				})}
			</div>
		</div>
	);
}
