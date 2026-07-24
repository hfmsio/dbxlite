import type React from "react";
import { useState } from "react";
import {
	explainOAuthFailure,
	runPreflight,
	type PreflightResult,
} from "../services/bigquery-preflight";
import { queryService } from "../services/streaming-query-service";
import {
	CopyableValue,
	ExternalLink,
	Heads,
	Stage,
} from "./bigquery/SetupStep";

interface BigQuerySetupDialogProps {
	onClose: () => void;
	onSuccess: () => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

type Mode = "oauth" | "token";

const CONSENT_URL = "https://console.cloud.google.com/auth/overview";
const AUDIENCE_URL = "https://console.cloud.google.com/auth/audience";
const CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";
const BIGQUERY_API_URL =
	"https://console.cloud.google.com/apis/library/bigquery.googleapis.com";

/**
 * BigQuery setup.
 *
 * Two ways in, because they suit different moments:
 *
 *  - **Access token** needs no Google Cloud Console work at all. One command,
 *    paste, done. The token expires within the hour, so it is for trying
 *    BigQuery out rather than living on.
 *  - **OAuth** is the durable path, and is genuinely a multi-screen setup in
 *    Google Cloud. The wizard stages it and, critically, tells the user about
 *    the consent screen and test-user steps that block the obvious route, plus
 *    the unverified-app warning they will otherwise read as a failure.
 *
 * After connecting either way a preflight runs, because the failures that
 * matter here (API not enabled, no permission, no billing) do not surface
 * during auth at all — they surface later as an opaque 403 somewhere else.
 */
export default function BigQuerySetupDialog({
	onClose,
	onSuccess,
	showToast,
}: BigQuerySetupDialogProps) {
	const [mode, setMode] = useState<Mode>("oauth");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preflight, setPreflight] = useState<PreflightResult | null>(null);

	const redirectUri = `${window.location.origin}/oauth-callback`;

	const finish = async () => {
		localStorage.setItem("bigquery-auto-connect", "true");
		// Auth succeeding does not mean the connection is usable. Check before
		// declaring victory, so a missing API is reported here rather than as a
		// mystery 403 the first time the user runs a query.
		const result = await runPreflight(queryService);
		setPreflight(result);
		if (result.ok) {
			showToast?.("Connected to BigQuery", "success", 3000);
			onSuccess();
			onClose();
		}
	};

	const handleConnect = async () => {
		if (mode === "oauth" && !clientId.trim()) {
			setError("Enter the OAuth Client ID from step 2.");
			return;
		}
		if (mode === "token" && !accessToken.trim()) {
			setError("Paste the output of gcloud auth print-access-token.");
			return;
		}

		setIsConnecting(true);
		setError(null);
		setPreflight(null);

		try {
			if (mode === "token") {
				await queryService.setupBigQueryWithAccessToken(accessToken.trim());
			} else {
				// The secret is optional: the flow uses PKCE, and a browser client
				// cannot keep a secret anyway.
				await queryService.setupBigQuery(
					clientId.trim(),
					clientSecret.trim(),
				);
			}
			await finish();
		} catch (err) {
			const explained = explainOAuthFailure(err);
			setError(explained);
			showToast?.(explained, "error", 6000);
		} finally {
			setIsConnecting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !isConnecting) handleConnect();
	};

	const inputStyle: React.CSSProperties = {
		width: "100%",
		padding: "8px 10px",
		background: "var(--bg-primary)",
		border: `1px solid ${error ? "var(--error)" : "var(--border)"}`,
		borderRadius: 4,
		color: "var(--text-primary)",
		fontSize: 13,
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	};

	const tabStyle = (active: boolean): React.CSSProperties => ({
		flex: 1,
		padding: "8px 12px",
		background: active ? "var(--bg-tertiary)" : "transparent",
		color: active ? "var(--text-primary)" : "var(--text-muted)",
		border: "1px solid var(--border)",
		borderBottom: active ? "none" : "1px solid var(--border)",
		borderRadius: "4px 4px 0 0",
		fontSize: 12,
		fontWeight: active ? 600 : 400,
		cursor: "pointer",
	});

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={onClose}
			onKeyDown={(e) => e.key === "Escape" && onClose()}
			role="presentation"
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Configure BigQuery connection"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg-secondary)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					width: "min(620px, 92vw)",
					maxHeight: "88vh",
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
					}}
				>
					<h2
						style={{
							margin: 0,
							fontSize: 16,
							fontWeight: 600,
							color: "var(--text-primary)",
						}}
					>
						Connect BigQuery
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						disabled={isConnecting}
						style={{
							background: "none",
							border: "none",
							color: "var(--text-muted)",
							fontSize: 20,
							cursor: isConnecting ? "not-allowed" : "pointer",
						}}
					>
						×
					</button>
				</div>

				{/* Body */}
				<div style={{ padding: "16px 20px", overflowY: "auto" }}>
					<div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
						<button
							type="button"
							style={tabStyle(mode === "oauth")}
							onClick={() => setMode("oauth")}
						>
							Sign in with Google
						</button>
						<button
							type="button"
							style={tabStyle(mode === "token")}
							onClick={() => setMode("token")}
						>
							Paste an access token
						</button>
					</div>

					{mode === "token" ? (
						<>
							<Stage
								number={1}
								title="Get a token from gcloud"
								subtitle="No Google Cloud Console setup needed for this route."
							>
								<CopyableValue
									value="gcloud auth print-access-token"
									label="gcloud command"
								/>
								<Heads>
									Google access tokens last about an hour and cannot be
									refreshed, so you will need to paste a new one when it
									expires. Use Sign in with Google for a connection that lasts.
								</Heads>
							</Stage>

							<Stage number={2} title="Paste it here">
								<input
									type="password"
									value={accessToken}
									onChange={(e) => setAccessToken(e.target.value)}
									onKeyDown={handleKeyDown}
									disabled={isConnecting}
									placeholder="ya29...."
									style={inputStyle}
								/>
							</Stage>
						</>
					) : (
						<>
							<Stage
								number={1}
								title="Prepare the project (one time)"
								subtitle="These two steps block the obvious route, so do them first."
							>
								<ul
									style={{
										margin: 0,
										paddingLeft: 18,
										fontSize: 12.5,
										lineHeight: 1.8,
										color: "var(--text-secondary, var(--text-primary))",
									}}
								>
									<li>
										Configure the{" "}
										<ExternalLink href={CONSENT_URL}>
											OAuth consent screen
										</ExternalLink>
										. Until it exists, creating a client is not offered.
									</li>
									<li>
										While it is in Testing, add your own Google account under{" "}
										<ExternalLink href={AUDIENCE_URL}>Audience</ExternalLink> as
										a test user, or sign-in is refused.
									</li>
									<li>
										Enable the{" "}
										<ExternalLink href={BIGQUERY_API_URL}>
											BigQuery API
										</ExternalLink>{" "}
										on the project you want to query.
									</li>
								</ul>
							</Stage>

							<Stage
								number={2}
								title="Create an OAuth client"
								subtitle="Credentials → Create credentials → OAuth client ID → Web application."
							>
								<ExternalLink href={CREDENTIALS_URL}>
									Open the Credentials page
								</ExternalLink>
								<div style={{ marginTop: 10 }}>
									<div
										style={{
											fontSize: 12,
											marginBottom: 4,
											color: "var(--text-muted)",
										}}
									>
										Add this under Authorized redirect URIs:
									</div>
									<CopyableValue value={redirectUri} label="redirect URI" />
								</div>
								<Heads>
									This must match exactly, including the port. If the dev server
									ever starts on a different port, add that origin too or you
									will get redirect_uri_mismatch. Google can take a few minutes
									to apply the change.
								</Heads>
							</Stage>

							<Stage number={3} title="Paste the credentials">
								<label
									htmlFor="bq-client-id"
									style={{
										display: "block",
										fontSize: 12,
										marginBottom: 4,
										color: "var(--text-muted)",
									}}
								>
									Client ID
								</label>
								<input
									id="bq-client-id"
									type="text"
									value={clientId}
									onChange={(e) => setClientId(e.target.value)}
									onKeyDown={handleKeyDown}
									disabled={isConnecting}
									placeholder="123456789-abc.apps.googleusercontent.com"
									style={inputStyle}
								/>
								<label
									htmlFor="bq-client-secret"
									style={{
										display: "block",
										fontSize: 12,
										margin: "10px 0 4px",
										color: "var(--text-muted)",
									}}
								>
									Client secret{" "}
									<span style={{ opacity: 0.7 }}>
										(optional, this flow uses PKCE)
									</span>
								</label>
								<input
									id="bq-client-secret"
									type="password"
									value={clientSecret}
									onChange={(e) => setClientSecret(e.target.value)}
									onKeyDown={handleKeyDown}
									disabled={isConnecting}
									placeholder="GOCSPX-..."
									style={inputStyle}
								/>
								<Heads>
									Google will warn that the app is not verified. That is
									expected for a client you just made for yourself: choose
									Advanced, then continue.
								</Heads>
							</Stage>
						</>
					)}

					{error && (
						<div
							role="alert"
							style={{
								marginTop: 12,
								padding: "10px 12px",
								background: "var(--bg-primary)",
								borderLeft: "3px solid var(--error)",
								borderRadius: 3,
								fontSize: 12.5,
								lineHeight: 1.6,
								color: "var(--error)",
							}}
						>
							{error}
						</div>
					)}

					{preflight && !preflight.ok && (
						<div
							style={{
								marginTop: 12,
								padding: "10px 12px",
								background: "var(--bg-primary)",
								border: "1px solid var(--border)",
								borderRadius: 4,
							}}
						>
							<div
								style={{
									fontSize: 12,
									fontWeight: 600,
									marginBottom: 6,
									color: "var(--text-primary)",
								}}
							>
								Signed in, but the connection is not usable yet:
							</div>
							{preflight.checks.map((check) => (
								<div
									key={check.id}
									style={{
										fontSize: 12,
										lineHeight: 1.6,
										marginBottom: 4,
										color:
											check.status === "ok"
												? "var(--text-muted)"
												: "var(--text-primary)",
									}}
								>
									<span aria-hidden style={{ marginRight: 6 }}>
										{check.status === "ok"
											? "✓"
											: check.status === "skipped"
												? "–"
												: "✕"}
									</span>
									{check.label}
									{check.remedy && (
										<div
											style={{
												marginLeft: 18,
												color: "var(--text-muted)",
												fontSize: 11.5,
											}}
										>
											{check.remedy}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
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
						type="button"
						onClick={onClose}
						disabled={isConnecting}
						style={{
							padding: "8px 14px",
							background: "transparent",
							color: "var(--text-muted)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							fontSize: 13,
							cursor: isConnecting ? "not-allowed" : "pointer",
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConnect}
						disabled={isConnecting}
						style={{
							padding: "8px 16px",
							background: "var(--accent)",
							color: "#fff",
							border: "none",
							borderRadius: 4,
							fontSize: 13,
							fontWeight: 600,
							cursor: isConnecting ? "not-allowed" : "pointer",
							opacity: isConnecting ? 0.6 : 1,
						}}
					>
						{isConnecting ? "Connecting…" : "Connect"}
					</button>
				</div>
			</div>
		</div>
	);
}
