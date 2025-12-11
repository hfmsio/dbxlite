import type React from "react";
import { useState } from "react";
import { queryService } from "../services/streaming-query-service";

interface BigQuerySetupDialogProps {
	onClose: () => void;
	onSuccess: () => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

/**
 * BigQuery Setup Dialog
 * Allows users to configure their Google Cloud OAuth Client ID
 * and initiate the OAuth authentication flow.
 */
export default function BigQuerySetupDialog({
	onClose,
	onSuccess,
	showToast,
}: BigQuerySetupDialogProps) {
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConnect = async () => {
		if (!clientId.trim()) {
			setError("Please enter a valid Client ID");
			return;
		}

		if (!clientSecret.trim()) {
			setError("Please enter a valid Client Secret");
			return;
		}

		setIsConnecting(true);
		setError(null);

		try {
			await queryService.setupBigQuery(clientId.trim(), clientSecret.trim());
			// Enable auto-reconnect so connection persists across page reloads
			localStorage.setItem("bigquery-auto-connect", "true");
			showToast?.("Successfully connected to BigQuery!", "success", 4000);
			onSuccess();
			onClose();
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Failed to connect to BigQuery";
			setError(errorMsg);
			showToast?.(errorMsg, "error", 5000);
		} finally {
			setIsConnecting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !isConnecting && clientId.trim()) {
			handleConnect();
		} else if (e.key === "Escape") {
			onClose();
		}
	};

	return (
		<div
			className="modal-overlay"
			onClick={onClose}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10000,
			}}
		>
			<div
				className="modal-content"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bigquery-setup-title"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={handleKeyDown}
				style={{
					background: "var(--bg-primary)",
					border: "2px solid var(--border)",
					borderRadius: "8px",
					width: "550px",
					maxWidth: "90vw",
					maxHeight: "90vh",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{/* Header */}
				<div
					style={{
						padding: "16px 20px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						background: "var(--bg-secondary)",
					}}
				>
					<h2
						id="bigquery-setup-title"
						style={{
							margin: 0,
							fontSize: "18px",
							color: "var(--text-primary)",
						}}
					>
						Configure BigQuery Connection
					</h2>
					<button
						onClick={onClose}
						disabled={isConnecting}
						aria-label="Close dialog"
						style={{
							background: "none",
							border: "none",
							fontSize: "24px",
							cursor: isConnecting ? "not-allowed" : "pointer",
							color: "var(--text-secondary)",
							opacity: isConnecting ? 0.5 : 1,
						}}
						title="Close (Esc)"
					>
						<span aria-hidden="true">×</span>
					</button>
				</div>

				{/* Body */}
				<div
					style={{
						padding: "24px",
						overflowY: "auto",
						flex: 1,
					}}
				>
					<div style={{ marginBottom: "20px" }}>
						<h3
							style={{
								fontSize: "14px",
								fontWeight: 600,
								marginBottom: "12px",
								color: "var(--text-primary)",
							}}
						>
							Google Cloud OAuth Client ID
						</h3>
						<input
							type="text"
							value={clientId}
							onChange={(e) => {
								setClientId(e.target.value);
								setError(null);
							}}
							placeholder="123456789-abc123def456.apps.googleusercontent.com"
							disabled={isConnecting}
							style={{
								width: "100%",
								padding: "10px 12px",
								fontSize: "14px",
								fontFamily: "monospace",
								border: `1px solid ${error ? "var(--error)" : "var(--border)"}`,
								borderRadius: "4px",
								background: "var(--bg-primary)",
								color: "var(--text-primary)",
								outline: "none",
								transition: "border-color 0.2s",
							}}
							onFocus={(e) => {
								if (!error) e.currentTarget.style.borderColor = "var(--accent)";
							}}
							onBlur={(e) => {
								if (!error) e.currentTarget.style.borderColor = "var(--border)";
							}}
						/>
					</div>

					<div style={{ marginBottom: "24px" }}>
						<h3
							style={{
								fontSize: "14px",
								fontWeight: 600,
								marginBottom: "12px",
								color: "var(--text-primary)",
							}}
						>
							Client Secret
						</h3>
						<input
							type="password"
							value={clientSecret}
							onChange={(e) => {
								setClientSecret(e.target.value);
								setError(null);
							}}
							placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxx"
							disabled={isConnecting}
							style={{
								width: "100%",
								padding: "10px 12px",
								fontSize: "14px",
								fontFamily: "monospace",
								border: `1px solid ${error ? "var(--error)" : "var(--border)"}`,
								borderRadius: "4px",
								background: "var(--bg-primary)",
								color: "var(--text-primary)",
								outline: "none",
								transition: "border-color 0.2s",
							}}
							onFocus={(e) => {
								if (!error) e.currentTarget.style.borderColor = "var(--accent)";
							}}
							onBlur={(e) => {
								if (!error) e.currentTarget.style.borderColor = "var(--border)";
							}}
						/>
						{error && (
							<div
								style={{
									marginTop: "8px",
									fontSize: "13px",
									color: "var(--error)",
									display: "flex",
									alignItems: "center",
									gap: "4px",
								}}
							>
								<span>⚠️</span>
								<span>{error}</span>
							</div>
						)}
					</div>

					<div
						style={{
							padding: "16px",
							background: "var(--bg-secondary)",
							borderRadius: "6px",
							border: "1px solid var(--border)",
							fontSize: "13px",
							color: "var(--text-secondary)",
							lineHeight: "1.6",
						}}
					>
						<div
							style={{
								fontWeight: 600,
								marginBottom: "8px",
								color: "var(--text-primary)",
							}}
						>
							How to get your Client ID:
						</div>
						<ol style={{ margin: 0, paddingLeft: "20px" }}>
							<li>
								Go to{" "}
								<a
									href="https://console.cloud.google.com/apis/credentials"
									target="_blank"
									rel="noopener noreferrer"
									style={{ color: "var(--accent)", textDecoration: "none" }}
								>
									Google Cloud Console
								</a>
							</li>
							<li>Select or create a project</li>
							<li>Click "Create Credentials" → "OAuth client ID"</li>
							<li>Choose "Web application" as application type</li>
							<li>
								Add{" "}
								<code
									style={{
										background: "var(--bg-primary)",
										padding: "2px 6px",
										borderRadius: "3px",
										fontSize: "12px",
									}}
								>
									{window.location.origin}/oauth-callback
								</code>{" "}
								to "Authorized redirect URIs"
							</li>
							<li>
								Click "Create" - you'll see a popup with Client ID and Client
								Secret
							</li>
							<li>Copy both values and paste them above</li>
						</ol>
					</div>
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "16px 20px",
						borderTop: "1px solid var(--border)",
						display: "flex",
						justifyContent: "flex-end",
						gap: "12px",
						background: "var(--bg-secondary)",
					}}
				>
					<button
						onClick={onClose}
						disabled={isConnecting}
						style={{
							padding: "8px 16px",
							fontSize: "14px",
							background: "var(--bg-tertiary)",
							border: "1px solid var(--border)",
							borderRadius: "4px",
							cursor: isConnecting ? "not-allowed" : "pointer",
							color: "var(--text-primary)",
							opacity: isConnecting ? 0.5 : 1,
						}}
					>
						Cancel
					</button>
					<button
						onClick={handleConnect}
						disabled={isConnecting || !clientId.trim() || !clientSecret.trim()}
						style={{
							padding: "8px 20px",
							fontSize: "14px",
							background:
								isConnecting || !clientId.trim() || !clientSecret.trim()
									? "var(--bg-tertiary)"
									: "var(--accent)",
							border: "none",
							borderRadius: "4px",
							cursor:
								isConnecting || !clientId.trim() || !clientSecret.trim()
									? "not-allowed"
									: "pointer",
							color:
								isConnecting || !clientId.trim() || !clientSecret.trim()
									? "var(--text-muted)"
									: "white",
							fontWeight: 500,
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						{isConnecting ? (
							<>
								<span
									className="spinner"
									style={{ width: "14px", height: "14px" }}
								/>
								<span>Connecting...</span>
							</>
						) : (
							"Connect to BigQuery"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
