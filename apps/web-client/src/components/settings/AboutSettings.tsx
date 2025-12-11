import type React from "react";
import { Logo, Wordmark } from "../Logo";

const linkStyle: React.CSSProperties = {
	color: "var(--accent)",
	textDecoration: "none",
	fontWeight: 500,
	fontSize: 12,
};

const techBadgeStyle: React.CSSProperties = {
	padding: "4px 10px",
	fontSize: 11,
	fontWeight: 500,
	borderRadius: 4,
	backgroundColor: "var(--bg-tertiary)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
};

const cardStyle: React.CSSProperties = {
	padding: 14,
	borderRadius: 10,
	backgroundColor: "var(--bg-secondary)",
	border: "1px solid var(--border)",
};

const cardTitleStyle: React.CSSProperties = {
	fontSize: 12,
	fontWeight: 600,
	color: "var(--text-primary)",
	marginBottom: 8,
	display: "flex",
	alignItems: "center",
	gap: 8,
};

function AboutSettings() {
	const currentYear = new Date().getFullYear();

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
			{/* Header Row - Logo + Tagline */}
			<div style={{ display: "flex", gap: 20, alignItems: "stretch", paddingBottom: 8 }}>
				{/* Logo & Title */}
				<div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 280 }}>
					<Logo size={48} />
					<div>
						<h1 style={{ fontSize: 28, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center" }}>
							<Wordmark size="lg" style={{ fontSize: "28px" }} />
						</h1>
						<p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
							Browser-based SQL workbench
						</p>
					</div>
				</div>

				{/* Tagline */}
				<div style={{ flex: 1, display: "flex", alignItems: "center" }}>
					<p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
						A lightweight SQL workbench powered by{" "}
						<a href="https://duckdb.org/docs/api/wasm/overview" style={linkStyle} target="_blank" rel="noopener noreferrer">
							DuckDB WASM
						</a>
						. Query local files, remote URLs, and cloud data warehouses - all without leaving your browser. Your data stays local.
					</p>
				</div>

			</div>

			{/* Main Content - 2x2 Grid */}
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12, flex: 1 }}>
				{/* Features Card */}
				<div style={cardStyle}>
					<div style={cardTitleStyle}>
						<span>✨</span> Features
					</div>
					<ul style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, paddingLeft: 16 }}>
						<li>Query CSV, Parquet, JSON, Excel, DuckDB files</li>
						<li>Files of any size via OPFS (Chrome)</li>
						<li>Multi-tab SQL editor with Monaco</li>
						<li>Connect to BigQuery for cloud analysis</li>
						<li>8 color themes · Export to CSV, JSON, Parquet</li>
						<li>No backend - runs entirely in browser</li>
					</ul>
				</div>

				{/* Built With Card */}
				<div style={{
					...cardStyle,
					background: "linear-gradient(135deg, rgba(217, 119, 87, 0.08) 0%, rgba(204, 153, 102, 0.08) 100%)",
					borderColor: "rgba(217, 119, 87, 0.2)",
					display: "flex",
					flexDirection: "column",
				}}>
					{/* Claude Code Section */}
					<div style={{ paddingBottom: 12, borderBottom: "1px solid rgba(217, 119, 87, 0.15)" }}>
						<div style={{ ...cardTitleStyle, fontSize: 12, marginBottom: 10 }}>
							<div style={{
								width: 32,
								height: 32,
								borderRadius: 7,
								background: "linear-gradient(135deg, #d97757 0%, #cc9966 100%)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								boxShadow: "0 2px 8px rgba(217, 119, 87, 0.3)",
							}}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="white">
									<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
								</svg>
							</div>
							Built with Claude Code
						</div>
						<p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
							Developed with{" "}
							<a href="https://claude.ai/code" style={linkStyle} target="_blank" rel="noopener noreferrer">Claude Code</a>,
							{" "}Anthropic's AI coding assistant.
						</p>
					</div>

					{/* Tech Stack Section */}
					<div style={{ paddingTop: 18, flex: 1 }}>
						<div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 12, fontWeight: 600 }}>Tech Stack</div>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 6px" }}>
							<a href="https://duckdb.org/docs/api/wasm/overview" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(255, 224, 0, 0.15)", borderColor: "rgba(255, 224, 0, 0.3)", color: "#dfc900", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>🦆</span>DuckDB WASM
								</span>
							</a>
							<a href="https://react.dev" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(97, 218, 251, 0.15)", borderColor: "rgba(97, 218, 251, 0.3)", color: "#61dafb", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>⚛</span>React
								</span>
							</a>
							<a href="https://www.typescriptlang.org" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(49, 120, 198, 0.15)", borderColor: "rgba(49, 120, 198, 0.3)", color: "#3178c6", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>TS</span>TypeScript
								</span>
							</a>
							<a href="https://microsoft.github.io/monaco-editor" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(0, 122, 204, 0.15)", borderColor: "rgba(0, 122, 204, 0.3)", color: "#007acc", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>M</span>Monaco
								</span>
							</a>
							<a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(189, 52, 254, 0.15)", borderColor: "rgba(189, 52, 254, 0.3)", color: "#bd34fe", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>⚡</span>Vite
								</span>
							</a>
							<a href="https://zustand-demo.pmnd.rs" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(244, 114, 182, 0.15)", borderColor: "rgba(244, 114, 182, 0.3)", color: "#f472b6", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>🐻</span>Zustand
								</span>
							</a>
							<a href="https://arrow.apache.org" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(232, 69, 69, 0.15)", borderColor: "rgba(232, 69, 69, 0.3)", color: "#e84545", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>→</span>Arrow
								</span>
							</a>
							<a href="https://pnpm.io" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(244, 174, 38, 0.15)", borderColor: "rgba(244, 174, 38, 0.3)", color: "#f4ae26", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>📦</span>pnpm
								</span>
							</a>
							<a href="https://vitest.dev" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
								<span style={{ ...techBadgeStyle, backgroundColor: "rgba(106, 173, 63, 0.15)", borderColor: "rgba(106, 173, 63, 0.3)", color: "#6aad3f", cursor: "pointer", display: "flex", justifyContent: "center" }}>
									<span style={{ marginRight: 4 }}>✓</span>Vitest
								</span>
							</a>
						</div>
					</div>
				</div>

				{/* Roadmap Card */}
				<div style={cardStyle}>
					<div style={cardTitleStyle}>
						<span>🗺️</span> Roadmap
					</div>
					<ul style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, paddingLeft: 16 }}>
						<li>Snowflake connector</li>
						<li>Databricks connector</li>
					</ul>
					<p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
						Feature request?{" "}
						<a href="https://github.com" style={linkStyle} target="_blank" rel="noopener noreferrer">
							Open an issue on GitHub
						</a>
					</p>
				</div>

				{/* Links & Resources Card */}
				<div style={cardStyle}>
					<div style={cardTitleStyle}>
						<span>🔗</span> Resources
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<a href="/examples" style={{ ...linkStyle, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ opacity: 0.7 }}>📝</span> SQL Examples
						</a>
						<a href="/screenshots" style={{ ...linkStyle, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ opacity: 0.7 }}>📸</span> Screenshots
						</a>
						<a href="https://duckdb.org/docs" style={{ ...linkStyle, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }} target="_blank" rel="noopener noreferrer">
							<span style={{ opacity: 0.7 }}>🦆</span> DuckDB Docs
						</a>
						<a href="https://cloud.google.com/bigquery/docs" style={{ ...linkStyle, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }} target="_blank" rel="noopener noreferrer">
							<span style={{ opacity: 0.7 }}>☁️</span> BigQuery Docs
						</a>
					</div>
				</div>
			</div>

			{/* Footer Row - License & Copyright */}
			<div style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				paddingTop: 12,
				borderTop: "1px solid var(--border)",
				fontSize: 11,
				color: "var(--text-muted)",
			}}>
				<div>
					MIT License · Provided "as is" without warranty
				</div>
				<div>
					<span style={{ fontWeight: 600 }}>dbx</span>
					<span style={{ color: "var(--accent)" }}>·</span>
					<span>lite</span>
					{" "}© {currentYear} · Made with DuckDB WASM & Claude Code
				</div>
			</div>
		</div>
	);
}

export default AboutSettings;
