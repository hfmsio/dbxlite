import { useEffect, useState } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("OAuthCallback");

/**
 * OAuth Callback Handler
 * This component handles the OAuth redirect from Google after authentication.
 * Uses localStorage to communicate with the main window since window.opener
 * is lost when Google redirects back to this page.
 */
export default function OAuthCallback() {
	const [status, setStatus] = useState<"processing" | "success" | "error">(
		"processing",
	);
	const [message, setMessage] = useState("Processing authentication...");

	useEffect(() => {
		const handleCallback = () => {
			try {
				const params = new URLSearchParams(window.location.search);
				const code = params.get("code");
				const state = params.get("state");
				const error = params.get("error");

				logger.debug("Processing callback:", {
					code: `${code?.substring(0, 10)}...`,
					state,
					error,
					hasOpener: !!window.opener,
				});

				if (error) {
					setStatus("error");
					setMessage(`Authentication failed: ${error}`);
					// Store error in localStorage so main window can pick it up
					localStorage.setItem("bigquery_oauth_error", error);
					return;
				}

				if (!code || !state) {
					setStatus("error");
					setMessage("Missing authorization code or state parameter");
					localStorage.setItem("bigquery_oauth_error", "Missing code or state");
					return;
				}

				// Method 1: Try window.opener first (works if popup didn't navigate)
				if (window.opener && !window.opener.closed) {
					try {
						window.opener.postMessage(
							{
								type: "oauth_code",
								code,
								state,
							},
							window.location.origin,
						);

						setStatus("success");
						setMessage("Authentication successful! Closing window...");

						setTimeout(() => {
							window.close();
						}, 1000);
						return;
					} catch (err) {
						logger.error("Error posting message to opener:", err);
					}
				}

				// Method 2: Use localStorage as fallback (works even after navigation)
				logger.debug("Using localStorage fallback method");
				const oauthData = {
					type: "oauth_code",
					code,
					state,
					timestamp: Date.now(),
				};

				localStorage.setItem(
					"bigquery_oauth_response",
					JSON.stringify(oauthData),
				);

				setStatus("success");
				setMessage("Authentication successful! You can close this window.");

				// Try to close window after a short delay
				setTimeout(() => {
					try {
						window.close();
					} catch (e) {
						logger.debug("Could not auto-close window:", e);
					}
				}, 2000);
			} catch (err) {
				logger.error("Error in handleCallback:", err);
				setStatus("error");
				setMessage(
					`Error processing callback: ${err instanceof Error ? err.message : String(err)}`,
				);
				localStorage.setItem(
					"bigquery_oauth_error",
					err instanceof Error ? err.message : String(err),
				);
			}
		};

		handleCallback();
	}, []);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				height: "100vh",
				background: "var(--bg-primary, #ffffff)",
				fontFamily: "system-ui, -apple-system, sans-serif",
			}}
		>
			<div
				style={{
					textAlign: "center",
					padding: "40px",
					maxWidth: "400px",
				}}
			>
				{status === "processing" && (
					<>
						<div style={{ fontSize: "48px", marginBottom: "20px" }}>⏳</div>
						<h2
							style={{
								marginBottom: "16px",
								color: "var(--text-primary, #333)",
							}}
						>
							Processing...
						</h2>
						<p style={{ color: "var(--text-secondary, #666)" }}>{message}</p>
					</>
				)}

				{status === "success" && (
					<>
						<div style={{ fontSize: "48px", marginBottom: "20px" }}>✅</div>
						<h2
							style={{
								marginBottom: "16px",
								color: "var(--text-primary, #333)",
							}}
						>
							Success!
						</h2>
						<p style={{ color: "var(--text-secondary, #666)" }}>{message}</p>
						<p
							style={{
								fontSize: "12px",
								color: "var(--text-muted, #999)",
								marginTop: "20px",
							}}
						>
							This window will close automatically.
						</p>
					</>
				)}

				{status === "error" && (
					<>
						<div style={{ fontSize: "48px", marginBottom: "20px" }}>❌</div>
						<h2
							style={{ marginBottom: "16px", color: "var(--error, #dc2626)" }}
						>
							Error
						</h2>
						<p style={{ color: "var(--text-secondary, #666)" }}>{message}</p>
						<button
							onClick={() => window.close()}
							style={{
								marginTop: "20px",
								padding: "8px 16px",
								background: "var(--bg-tertiary, #f3f4f6)",
								border: "1px solid var(--border, #e5e7eb)",
								borderRadius: "4px",
								cursor: "pointer",
								fontSize: "14px",
							}}
						>
							Close Window
						</button>
					</>
				)}
			</div>
		</div>
	);
}
