/**
 * Presentational pieces for the BigQuery setup wizard.
 *
 * Split out so the wizard file stays about the flow rather than about styling,
 * and so the copy-to-clipboard affordance exists once. The redirect URI in
 * particular has to be transcribed exactly, and hand-selecting it in a modal
 * is the single most error-prone moment of the whole setup.
 */

import { useCallback, useState } from "react";

export function Stage({
	number,
	title,
	subtitle,
	children,
}: {
	number: number;
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<section style={{ marginBottom: 20 }}>
			<div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
				<span
					aria-hidden
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 20,
						height: 20,
						borderRadius: "50%",
						background: "var(--accent)",
						color: "#fff",
						fontSize: 11,
						fontWeight: 700,
						flexShrink: 0,
					}}
				>
					{number}
				</span>
				<h3
					style={{
						margin: 0,
						fontSize: 13,
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					{title}
				</h3>
			</div>
			{subtitle && (
				<p
					style={{
						margin: "4px 0 0 28px",
						fontSize: 12,
						color: "var(--text-muted)",
					}}
				>
					{subtitle}
				</p>
			)}
			<div style={{ margin: "8px 0 0 28px" }}>{children}</div>
		</section>
	);
}

/** A value the user must transcribe exactly. Copy button, not hand-selection. */
export function CopyableValue({
	value,
	label,
}: {
	value: string;
	label: string;
}) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard can be blocked by permissions policy; the value is still
			// on screen and selectable, so this is not worth surfacing.
		}
	}, [value]);

	return (
		<div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
			<code
				style={{
					flex: 1,
					background: "var(--bg-primary)",
					border: "1px solid var(--border)",
					borderRadius: 4,
					padding: "6px 8px",
					fontSize: 12,
					wordBreak: "break-all",
					color: "var(--text-primary)",
				}}
			>
				{value}
			</code>
			<button
				type="button"
				onClick={copy}
				aria-label={`Copy ${label}`}
				style={{
					padding: "6px 10px",
					background: copied ? "var(--success, #2ea043)" : "var(--bg-tertiary)",
					color: copied ? "#fff" : "var(--text-primary)",
					border: "1px solid var(--border)",
					borderRadius: 4,
					fontSize: 11,
					fontWeight: 600,
					cursor: "pointer",
					whiteSpace: "nowrap",
				}}
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

export function ExternalLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			style={{ color: "var(--accent)", textDecoration: "none" }}
		>
			{children} ↗
		</a>
	);
}

/** A caution the user needs before they hit it, not after. */
export function Heads({ children }: { children: React.ReactNode }) {
	return (
		<p
			style={{
				margin: "8px 0 0",
				padding: "6px 8px",
				background: "var(--bg-primary)",
				borderLeft: "2px solid var(--warning, #d29922)",
				borderRadius: 2,
				fontSize: 11.5,
				lineHeight: 1.5,
				color: "var(--text-muted)",
			}}
		>
			{children}
		</p>
	);
}
