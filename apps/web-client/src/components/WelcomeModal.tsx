/**
 * WelcomeModal - First-time user welcome experience
 * Shows feature highlights and offers to set up example tabs
 */

import { useEffect, useRef } from "react";
import { Logo, Wordmark } from "./Logo";

interface WelcomeModalProps {
	isOpen: boolean;
	isLoading?: boolean;
	onGetStarted: () => void;
	onSkip: () => void;
}

const FEATURES = [
	{ icon: "files", label: "Any File, Any Size", desc: "DuckDB files, CSV, Parquet, JSON, Excel - local via OPFS or query directly from cloud URLs", color: "var(--accent)" },
	{ icon: "database", label: "DuckDB in Browser", desc: "Full SQL database runs in your browser. Your data never leaves your machine", color: "var(--success)" },
	{ icon: "cloud", label: "Cloud Warehouses", desc: "BigQuery today. Snowflake & Databricks planned", color: "var(--warning)" },
	{ icon: "tabs", label: "Multi-Tab Editor", desc: "Monaco-powered editor with syntax highlighting", color: "var(--accent)" },
	{ icon: "keyboard", label: "Keyboard-Friendly", desc: "Extensive shortcuts for keyboard warriors", color: "var(--error)" },
	{ icon: "tree", label: "Data Explorer", desc: "Tree views for files & Excel sheets. Press Enter on cells to view large content, arrows to navigate", color: "var(--success)" },
	{ icon: "download", label: "Export Anywhere", desc: "Download results as Parquet, CSV, or JSON", color: "var(--accent)" },
	{ icon: "palette", label: "10 Color Themes", desc: "Light & dark themes to match your preference", color: "var(--warning)" },
	{ icon: "settings", label: "Extensive Customizations", desc: "Date/time formats, column alignment, fonts, grid settings, autocomplete modes, and more", color: "var(--error)" },
];

const EXAMPLE_TABS = [
	{ name: "Remote Data", desc: "Query CSV from GitHub" },
	{ name: "DuckDB Intro", desc: "CTEs & aggregations" },
	{ name: "Analytics", desc: "Window functions & LAG" },
];

// Icon components
function FilesIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
			<polyline points="14 2 14 8 20 8" />
		</svg>
	);
}

function DatabaseIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<ellipse cx="12" cy="5" rx="9" ry="3" />
			<path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
			<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
		</svg>
	);
}

function CloudIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
		</svg>
	);
}

function TabsIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<line x1="3" y1="9" x2="21" y2="9" />
			<line x1="9" y1="3" x2="9" y2="9" />
		</svg>
	);
}

function KeyboardIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
			<path d="M6 8h.001" />
			<path d="M10 8h.001" />
			<path d="M14 8h.001" />
			<path d="M18 8h.001" />
			<path d="M8 12h.001" />
			<path d="M12 12h.001" />
			<path d="M16 12h.001" />
			<path d="M7 16h10" />
		</svg>
	);
}

function TreeIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M12 3v18" />
			<path d="M8 7h8" />
			<path d="M6 11h12" />
			<path d="M8 15h8" />
			<path d="M10 19h4" />
		</svg>
	);
}

function DownloadIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
	);
}

function PaletteIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="13.5" cy="6.5" r="0.5" fill={color} />
			<circle cx="17.5" cy="10.5" r="0.5" fill={color} />
			<circle cx="8.5" cy="7.5" r="0.5" fill={color} />
			<circle cx="6.5" cy="12.5" r="0.5" fill={color} />
			<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
		</svg>
	);
}

function SettingsIcon({ color }: { color: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
			<circle cx="12" cy="12" r="3" />
			<line x1="12" y1="1" x2="12" y2="3" />
			<line x1="12" y1="21" x2="12" y2="23" />
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
			<line x1="1" y1="12" x2="3" y2="12" />
			<line x1="21" y1="12" x2="23" y2="12" />
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
		</svg>
	);
}

function getIconComponent(icon: string, color: string) {
	switch (icon) {
		case "files": return <FilesIcon color={color} />;
		case "database": return <DatabaseIcon color={color} />;
		case "cloud": return <CloudIcon color={color} />;
		case "tabs": return <TabsIcon color={color} />;
		case "keyboard": return <KeyboardIcon color={color} />;
		case "tree": return <TreeIcon color={color} />;
		case "download": return <DownloadIcon color={color} />;
		case "palette": return <PaletteIcon color={color} />;
		case "settings": return <SettingsIcon color={color} />;
		default: return null;
	}
}

export function WelcomeModal({
	isOpen,
	isLoading = false,
	onGetStarted,
	onSkip,
}: WelcomeModalProps) {
	const getStartedButtonRef = useRef<HTMLButtonElement>(null);
	const skipButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

	// Focus management
	useEffect(() => {
		if (isOpen) {
			previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
			setTimeout(() => {
				getStartedButtonRef.current?.focus();
			}, 0);
		} else {
			if (previouslyFocusedElementRef.current) {
				setTimeout(() => {
					previouslyFocusedElementRef.current?.focus();
					previouslyFocusedElementRef.current = null;
				}, 0);
			}
		}
	}, [isOpen]);

	// Keyboard handling
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isLoading) {
				e.preventDefault();
				onSkip();
			} else if (e.key === "Tab") {
				e.preventDefault();
				if (document.activeElement === getStartedButtonRef.current) {
					skipButtonRef.current?.focus();
				} else {
					getStartedButtonRef.current?.focus();
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, isLoading, onSkip]);

	if (!isOpen) return null;

	return (
		<div
			className="welcome-modal-overlay"
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
				zIndex: 10001,
				backdropFilter: "blur(4px)",
			}}
			onClick={isLoading ? undefined : onSkip}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="welcome-title"
				className="welcome-modal"
				style={{
					background: "var(--bg-secondary)",
					borderRadius: "16px",
					padding: "28px",
					maxWidth: "640px",
					width: "90%",
					border: "1px solid var(--border-light)",
					boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
					maxHeight: "90vh",
					overflow: "auto",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header with Logo */}
				<div style={{ textAlign: "center", marginBottom: "20px" }}>
					<div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
						<Logo size={56} />
						<Wordmark size="lg" style={{ fontSize: "32px" }} />
					</div>
					<p
						style={{
							margin: 0,
							fontSize: "13px",
							color: "var(--text-muted)",
						}}
					>
						A powerful SQL workbench powered by DuckDB WASM
					</p>
				</div>

				{/* Features - 2 column grid */}
				<div
					style={{
						background: "var(--bg-tertiary)",
						borderRadius: "12px",
						padding: "16px",
						marginBottom: "16px",
					}}
				>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
						{FEATURES.map((feature, idx) => (
							<div
								key={idx}
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: "10px",
									padding: "8px",
									borderRadius: "8px",
									background: "var(--bg-secondary)",
									border: "1px solid var(--border)",
									...(idx === FEATURES.length - 1 ? { gridColumn: "1 / -1" } : {}),
								}}
							>
								<div
									style={{
										width: "28px",
										height: "28px",
										borderRadius: "6px",
										background: `color-mix(in srgb, ${feature.color} 15%, transparent)`,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
									}}
								>
									{getIconComponent(feature.icon, feature.color)}
								</div>
								<div style={{ minWidth: 0 }}>
									<div
										style={{
											fontSize: "12px",
											fontWeight: 600,
											color: "var(--text-primary)",
											marginBottom: "2px",
										}}
									>
										{feature.label}
									</div>
									<div
										style={{
											fontSize: "10px",
											color: "var(--text-muted)",
											lineHeight: 1.3,
										}}
									>
										{feature.desc}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Example tabs preview */}
				<div style={{ marginBottom: "20px" }}>
					<p
						style={{
							margin: "0 0 10px 0",
							fontSize: "12px",
							color: "var(--text-secondary)",
							textAlign: "center",
						}}
					>
						We'll set up 3 example tabs for you:
					</p>
					<div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
						{EXAMPLE_TABS.map((tab, idx) => (
							<div
								key={idx}
								style={{
									background: "var(--bg-tertiary)",
									border: "1px solid var(--border)",
									borderRadius: "6px",
									padding: "6px 10px",
									fontSize: "11px",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
									{tab.name}
								</div>
								<div style={{ color: "var(--text-muted)", fontSize: "10px" }}>
									{tab.desc}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Actions */}
				<div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
					<button
						ref={skipButtonRef}
						onClick={onSkip}
						disabled={isLoading}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							padding: "10px 20px",
							borderRadius: "8px",
							fontSize: "13px",
							fontWeight: 500,
							cursor: isLoading ? "not-allowed" : "pointer",
							transition: "all 0.2s",
							opacity: isLoading ? 0.5 : 1,
						}}
						onMouseEnter={(e) => {
							if (!isLoading) e.currentTarget.style.background = "var(--border-light)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--bg-tertiary)";
						}}
					>
						Skip
					</button>
					<button
						ref={getStartedButtonRef}
						onClick={onGetStarted}
						disabled={isLoading}
						style={{
							background: "var(--accent)",
							color: "white",
							border: "none",
							padding: "10px 28px",
							borderRadius: "8px",
							fontSize: "13px",
							fontWeight: 600,
							cursor: isLoading ? "not-allowed" : "pointer",
							transition: "all 0.2s",
							display: "flex",
							alignItems: "center",
							gap: "8px",
							boxShadow: "0 4px 12px color-mix(in srgb, var(--accent) 40%, transparent)",
						}}
						onMouseEnter={(e) => {
							if (!isLoading) e.currentTarget.style.opacity = "0.9";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.opacity = "1";
						}}
					>
						{isLoading ? (
							<>
								<span
									style={{
										width: "14px",
										height: "14px",
										border: "2px solid rgba(255,255,255,0.3)",
										borderTopColor: "white",
										borderRadius: "50%",
										animation: "spin 0.8s linear infinite",
									}}
								/>
								Setting up...
							</>
						) : (
							"Get Started"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
