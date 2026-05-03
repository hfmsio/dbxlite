// One-time consent before sending data to a BYO AI provider. Granted
// state lives in localStorage per provider; warehouse backends skip this.

import { useEffect } from "react";

interface Props {
	providerLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export default function PiiConsentDialog({
	providerLabel,
	onConfirm,
	onCancel,
}: Props) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onCancel]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="pii-consent-title"
			onClick={onCancel}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10001,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg-primary)",
					border: "2px solid var(--border)",
					borderRadius: 8,
					width: 540,
					maxWidth: "92vw",
					maxHeight: "92vh",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div
					style={{
						padding: "16px 20px",
						borderBottom: "1px solid var(--border)",
						background: "var(--bg-secondary)",
					}}
				>
					<h2
						id="pii-consent-title"
						style={{
							margin: 0,
							fontSize: 17,
							color: "var(--text-primary)",
						}}
					>
						Send data to {providerLabel}?
					</h2>
				</div>

				<div
					style={{
						padding: 20,
						overflowY: "auto",
						flex: 1,
						fontSize: 13.5,
						color: "var(--text-secondary)",
						lineHeight: 1.55,
					}}
				>
					<p style={{ marginTop: 0 }}>
						Sending this message will transmit the following to{" "}
						{providerLabel}:
					</p>
					<ul style={{ marginTop: 8, paddingLeft: 22 }}>
						<li>Your message</li>
						<li>The current editor SQL</li>
						<li>Recent chat history</li>
						<li>A system prompt for the active connector dialect</li>
					</ul>
					<p style={{ marginTop: 14 }}>
						<strong style={{ color: "var(--text-primary)" }}>Not sent:</strong>{" "}
						query results, file contents, or credentials.
					</p>
					<p style={{ marginTop: 14 }}>
						If your SQL contains PII, that text leaves your browser.
						Snowflake Cortex and BigQuery ML keep data inside the
						warehouse.
					</p>
				</div>

				<div
					style={{
						padding: "14px 20px",
						borderTop: "1px solid var(--border)",
						display: "flex",
						justifyContent: "flex-end",
						gap: 10,
						background: "var(--bg-secondary)",
					}}
				>
					<button
						onClick={onCancel}
						style={{
							padding: "8px 16px",
							fontSize: 14,
							background: "var(--bg-tertiary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							cursor: "pointer",
							color: "var(--text-primary)",
						}}
					>
						Don't send
					</button>
					<button
						onClick={onConfirm}
						autoFocus
						style={{
							padding: "8px 18px",
							fontSize: 14,
							background: "var(--accent)",
							border: "none",
							borderRadius: 4,
							cursor: "pointer",
							color: "white",
							fontWeight: 500,
						}}
					>
						Send to {providerLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
