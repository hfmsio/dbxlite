/**
 * ModeIndicator - Shows current execution mode (WASM or Server) in the header.
 *
 * Displays a subtle colored badge with tooltip showing mode details.
 * In WASM mode: clicking opens a popover with mode info and switch option.
 * In HTTP mode: clicking opens settings modal to the Server tab.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMode, getModeTooltip, getModeSwitchUrl } from "../hooks/useMode";

interface ModeIndicatorProps {
	onOpenServerSettings?: () => void;
}

export function ModeIndicator({ onOpenServerSettings }: ModeIndicatorProps) {
	const { mode, label, isHttpMode, isWasmMode, serverAvailable } = useMode();
	const [showPopover, setShowPopover] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Close modal when pressing ESC
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setShowPopover(false);
			}
		}

		if (showPopover) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [showPopover]);

	const tooltip = getModeTooltip(mode);

	return (
		<div style={{ position: "relative" }}>
			<button
				ref={buttonRef}
				onClick={() => {
					if (isHttpMode && onOpenServerSettings) {
						onOpenServerSettings();
					} else {
						setShowPopover(!showPopover);
					}
				}}
				title={tooltip}
				className={`mode-indicator-badge ${isHttpMode ? "http" : "wasm"}`}
			>
				<span className={`mode-indicator-dot ${isHttpMode ? "http" : "wasm"}`} />
				{label}
			</button>

			{showPopover && createPortal(
				<>
					{/* Backdrop */}
					<div
						onClick={() => setShowPopover(false)}
						style={{
							position: "fixed",
							inset: 0,
							backgroundColor: "rgba(0, 0, 0, 0.5)",
							zIndex: 9999,
						}}
					/>
					{/* Modal */}
					<div
						ref={popoverRef}
						style={{
							position: "fixed",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							width: isWasmMode ? 380 : 320,
							backgroundColor: "var(--bg-primary)",
							border: "2px solid var(--accent-color)",
							borderRadius: 12,
							boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
							zIndex: 10000,
							overflow: "hidden",
							maxHeight: "85vh",
							overflowY: "auto",
						}}
					>
					{/* Header */}
					<div
						style={{
							padding: "12px 16px",
							borderBottom: "1px solid var(--border)",
							backgroundColor: "var(--bg-secondary)",
							position: "relative",
						}}
					>
						<button
							onClick={() => setShowPopover(false)}
							style={{
								position: "absolute",
								top: 8,
								right: 8,
								width: 24,
								height: 24,
								border: "none",
								background: "transparent",
								cursor: "pointer",
								fontSize: 18,
								color: "var(--text-muted)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 4,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "var(--bg-tertiary)";
								e.currentTarget.style.color = "var(--text-primary)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.color = "var(--text-muted)";
							}}
							title="Close (Esc)"
						>
							×
						</button>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span className={`mode-indicator-dot-lg ${isHttpMode ? "http" : "wasm"}`} />
							<span style={{ fontWeight: 600, fontSize: 13 }}>
								{isHttpMode ? "Server Mode" : "WASM Mode"}
							</span>
						</div>
						<p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
							{isHttpMode
								? "Connected to local DuckDB server"
								: "Running DuckDB in browser"}
						</p>
					</div>

					{/* Capabilities */}
					<div style={{ padding: "12px 16px" }}>
						<div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
							CAPABILITIES
						</div>
						<ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "var(--text-primary)", lineHeight: 1.6 }}>
							{isHttpMode ? (
								<>
									<li>Full native DuckDB engine</li>
									<li>All extensions available</li>
									<li>Direct filesystem access</li>
									<li>No memory limits</li>
								</>
							) : (
								<>
									<li>Zero-copy file handles (Chrome)</li>
									<li>BigQuery browser connector</li>
									<li>Works offline after first load</li>
								</>
							)}
						</ul>

						{!isHttpMode && (
							<div style={{ fontSize: 11, fontWeight: 600, marginTop: 12, marginBottom: 8, color: "var(--text-secondary)" }}>
								LIMITATIONS
							</div>
						)}
						{!isHttpMode && (
							<ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
								<li>~2-4GB memory limit</li>
								<li>Limited extensions</li>
								<li>No filesystem access</li>
							</ul>
						)}
					</div>

					{/* Mode Switch Section - only show when server is detected */}
					{isWasmMode && serverAvailable === true && (
						<div
							style={{
								padding: "12px 16px",
								borderTop: "1px solid var(--border)",
								backgroundColor: "var(--bg-secondary)",
							}}
						>
							<a
								href={getModeSwitchUrl("http")}
								style={{
									display: "block",
									width: "100%",
									padding: "10px 12px",
									fontSize: 11,
									backgroundColor: "var(--mode-http-bg)",
									border: "1px solid var(--mode-http-color)",
									borderRadius: 4,
									textAlign: "center",
									textDecoration: "none",
									color: "var(--mode-http-color)",
									fontWeight: 600,
								}}
							>
								🚀 Connect to local DuckDB server
							</a>
						</div>
					)}

					{/* Server Mode Instructions - only in WASM mode */}
					{isWasmMode && (
						<div
							style={{
								padding: "12px 16px",
								borderTop: "1px solid var(--border)",
							}}
						>
							<div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
								USE SERVER MODE
							</div>

							<div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 12 }}>
								<div style={{ fontWeight: 500, marginBottom: 4 }}>Quick Start (Hosted UI)</div>
								<code style={{
									display: "block",
									fontSize: 10,
									backgroundColor: "var(--bg-tertiary)",
									padding: "8px",
									borderRadius: 4,
									wordBreak: "break-all",
									lineHeight: 1.5,
								}}>
									ui_remote_url="https://sql.dbxlite.com" \<br />
									duckdb -unsigned -ui
								</code>
							</div>

							<div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 12 }}>
								<div style={{ fontWeight: 500, marginBottom: 4 }}>Local Development</div>
								<code style={{
									display: "block",
									fontSize: 10,
									backgroundColor: "var(--bg-tertiary)",
									padding: "8px",
									borderRadius: 4,
									lineHeight: 1.5,
								}}>
									git clone https://github.com/jaspeen/dbxlite<br />
									cd dbxlite && pnpm install && pnpm dev
								</code>
								<div style={{ fontWeight: 500, marginTop: 10, marginBottom: 4 }}>Then connect DuckDB</div>
								<code style={{
									display: "block",
									fontSize: 10,
									backgroundColor: "var(--bg-tertiary)",
									padding: "8px",
									borderRadius: 4,
									lineHeight: 1.5,
									wordBreak: "break-all",
								}}>
									ui_remote_url="http://localhost:5173" \<br />
									duckdb -unsigned -ui
								</code>
							</div>

							<div style={{
								marginTop: 8,
								padding: "8px 10px",
								backgroundColor: "var(--mode-http-bg)",
								borderRadius: 4,
								fontSize: 10,
								color: "var(--text-primary)",
								textAlign: "center",
							}}>
								Open <code style={{
									backgroundColor: "var(--bg-tertiary)",
									padding: "2px 6px",
									borderRadius: 3,
									fontWeight: 600,
								}}>http://localhost:4213</code> in browser
							</div>
						</div>
					)}

					{isHttpMode && (
						<div
							style={{
								padding: "12px 16px",
								borderTop: "1px solid var(--border)",
								backgroundColor: "var(--bg-secondary)",
							}}
						>
							<div style={{ fontSize: 11, color: "var(--text-muted)" }}>
								<p style={{ margin: 0 }}>
									To use WASM mode, visit{" "}
									<a
										href="https://sql.dbxlite.com"
										style={{ color: "var(--accent)" }}
									>
										sql.dbxlite.com
									</a>{" "}
									directly.
								</p>
							</div>
						</div>
					)}

					{/* Help Link */}
					<div
						style={{
							padding: "8px 16px",
							borderTop: "1px solid var(--border)",
							textAlign: "center",
						}}
					>
						<span
							style={{
								fontSize: 10,
								color: "var(--text-muted)",
							}}
						>
							See Settings → Help for more details
						</span>
					</div>
				</div>
				</>,
				document.body
			)}
		</div>
	);
}

export default ModeIndicator;
