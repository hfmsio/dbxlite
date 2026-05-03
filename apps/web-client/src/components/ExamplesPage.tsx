/**
 * SQL Examples Page (/examples)
 *
 * Browseable index of every example query bundled with dbxlite, driven
 * by the same `sampleQueries` registry the in-app ExamplesPanel uses.
 * Search filter + dialect chips on top, expandable section accordions
 * below, click-to-open in the main app.
 *
 * The in-app panel stays the quick-load surface ("I want this query in
 * a tab right now"). This page is the browse / learn surface.
 */

import type React from "react";
import { useMemo, useState } from "react";
import { exampleGroups, type SampleQuery } from "../examples/sampleQueries";
import { generateExampleURL } from "../utils/urlParams";

type DialectFilter = "all" | "duckdb" | "bigquery" | "snowflake";

const containerStyle: React.CSSProperties = {
	minHeight: "100vh",
	backgroundColor: "var(--bg-primary)",
	color: "var(--text-primary)",
	padding: "32px 40px",
};

const headerStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-start",
	marginBottom: 24,
	gap: 16,
	flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
	fontSize: 28,
	fontWeight: 700,
	color: "var(--text-primary)",
	margin: 0,
};

const backLinkStyle: React.CSSProperties = {
	padding: "8px 16px",
	backgroundColor: "var(--bg-tertiary)",
	color: "var(--text-primary)",
	textDecoration: "none",
	borderRadius: 6,
	fontSize: 13,
	fontWeight: 500,
	border: "1px solid var(--border)",
};

const toolbarStyle: React.CSSProperties = {
	display: "flex",
	gap: 12,
	alignItems: "center",
	marginBottom: 24,
	flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
	flex: 1,
	minWidth: 240,
	padding: "8px 12px",
	background: "var(--bg-secondary)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
	borderRadius: 6,
	fontSize: 13,
	outline: "none",
};

const chipStyle = (active: boolean): React.CSSProperties => ({
	padding: "6px 12px",
	background: active ? "var(--accent)" : "var(--bg-secondary)",
	color: active ? "white" : "var(--text-secondary)",
	border: "1px solid var(--border)",
	borderRadius: 16,
	fontSize: 12,
	fontWeight: active ? 600 : 400,
	cursor: "pointer",
});

const sectionCardStyle: React.CSSProperties = {
	marginBottom: 16,
	background: "var(--bg-secondary)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	overflow: "hidden",
};

const sectionHeaderStyle = (color: string): React.CSSProperties => ({
	padding: "14px 18px",
	display: "flex",
	alignItems: "center",
	gap: 10,
	cursor: "pointer",
	background: "transparent",
	border: "none",
	width: "100%",
	textAlign: "left",
	color: "var(--text-primary)",
	borderLeft: `4px solid ${color}`,
});

const exampleCardStyle: React.CSSProperties = {
	padding: "12px 16px",
	borderTop: "1px solid var(--border)",
	display: "flex",
	flexDirection: "column",
	gap: 8,
};

const dialectBadgeStyle = (
	connector: SampleQuery["connector"],
): React.CSSProperties => {
	const colors: Record<string, { bg: string; fg: string; label: string }> = {
		duckdb: { bg: "rgba(255, 192, 35, 0.15)", fg: "#f0b500", label: "DuckDB" },
		bigquery: { bg: "rgba(66, 133, 244, 0.15)", fg: "#4285f4", label: "BigQuery" },
		snowflake: { bg: "rgba(41, 181, 232, 0.15)", fg: "#29b5e8", label: "Snowflake" },
	};
	const c = colors[connector ?? "duckdb"] ?? colors.duckdb;
	return {
		display: "inline-block",
		padding: "2px 8px",
		fontSize: 10,
		fontWeight: 600,
		letterSpacing: "0.03em",
		textTransform: "uppercase",
		background: c.bg,
		color: c.fg,
		borderRadius: 3,
	};
};

const codePreviewStyle: React.CSSProperties = {
	background: "var(--bg-primary)",
	border: "1px solid var(--border)",
	borderRadius: 6,
	padding: 12,
	fontSize: 12,
	fontFamily:
		"ui-monospace, SFMono-Regular, 'JetBrains Mono', 'Fira Code', monospace",
	color: "var(--text-primary)",
	whiteSpace: "pre",
	overflowX: "auto",
	maxHeight: 320,
	overflowY: "auto",
	lineHeight: 1.55,
};

const buttonStyle: React.CSSProperties = {
	padding: "6px 14px",
	background: "var(--accent)",
	color: "white",
	border: "none",
	borderRadius: 6,
	fontSize: 12,
	fontWeight: 500,
	cursor: "pointer",
	textDecoration: "none",
	display: "inline-block",
};

function dialectLabel(connector: SampleQuery["connector"]): string {
	switch (connector) {
		case "bigquery":
			return "BigQuery";
		case "snowflake":
			return "Snowflake";
		default:
			return "DuckDB";
	}
}

function ExampleCard({ example }: { example: SampleQuery }) {
	const [expanded, setExpanded] = useState(false);
	const previewLines = example.sql.split("\n").length;

	return (
		<div style={exampleCardStyle}>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					gap: 12,
					flexWrap: "wrap",
				}}
			>
				<div style={{ flex: 1, minWidth: 200 }}>
					<div
						style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
					>
						<span
							style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
						>
							{example.label}
						</span>
						<span style={dialectBadgeStyle(example.connector)}>
							{dialectLabel(example.connector)}
						</span>
					</div>
					{example.hint && (
						<div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
							{example.hint}
						</div>
					)}
				</div>
				<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						style={{
							...buttonStyle,
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
						}}
						aria-expanded={expanded}
					>
						{expanded ? "Hide SQL" : `Show SQL (${previewLines} lines)`}
					</button>
					<a
						href={generateExampleURL(example.id, { autoRun: true })}
						style={buttonStyle}
					>
						Open in dbxlite
					</a>
				</div>
			</div>
			{expanded && <pre style={codePreviewStyle}>{example.sql}</pre>}
		</div>
	);
}

function matchesSearch(example: SampleQuery, query: string): boolean {
	if (!query) return true;
	const q = query.toLowerCase();
	return (
		example.label.toLowerCase().includes(q) ||
		(example.hint?.toLowerCase().includes(q) ?? false) ||
		example.sql.toLowerCase().includes(q)
	);
}

function matchesDialect(
	example: SampleQuery,
	filter: DialectFilter,
): boolean {
	if (filter === "all") return true;
	return (example.connector ?? "duckdb") === filter;
}

export default function ExamplesPage() {
	const [query, setQuery] = useState("");
	const [dialect, setDialect] = useState<DialectFilter>("all");
	// Section open/close state. Defaults from registry, overridable per-section.
	const [openSections, setOpenSections] = useState<Record<string, boolean>>(
		() => {
			const initial: Record<string, boolean> = {};
			for (const g of exampleGroups) initial[g.id] = g.defaultExpanded ?? true;
			return initial;
		},
	);

	// Filter groups: drop examples that don't match search/dialect, drop
	// groups that end up empty. Auto-expand sections with active matches.
	const filteredGroups = useMemo(() => {
		return exampleGroups
			.map((g) => ({
				...g,
				examples: g.examples.filter(
					(e) => matchesSearch(e, query) && matchesDialect(e, dialect),
				),
			}))
			.filter((g) => g.examples.length > 0);
	}, [query, dialect]);

	const totalMatches = filteredGroups.reduce(
		(n, g) => n + g.examples.length,
		0,
	);

	const isFiltering = query.length > 0 || dialect !== "all";

	return (
		<div style={containerStyle}>
			<header style={headerStyle}>
				<div>
					<h1 style={titleStyle}>SQL Examples</h1>
					<p
						style={{
							margin: "4px 0 0",
							fontSize: 13,
							color: "var(--text-muted)",
							maxWidth: 720,
						}}
					>
						Runnable SQL recipes for DuckDB, BigQuery, and Snowflake. Click any
						example to open it in the dbxlite editor - no install needed.
					</p>
				</div>
				<a href="/" style={backLinkStyle}>
					← Back to App
				</a>
			</header>

			<div style={toolbarStyle}>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search by label, hint, or SQL content…"
					style={searchInputStyle}
					aria-label="Search examples"
				/>
				{(["all", "duckdb", "bigquery", "snowflake"] as const).map((d) => (
					<button
						key={d}
						type="button"
						onClick={() => setDialect(d)}
						style={chipStyle(dialect === d)}
					>
						{d === "all" ? "All" : dialectLabel(d)}
					</button>
				))}
				{isFiltering && (
					<span
						style={{
							fontSize: 12,
							color: "var(--text-muted)",
							marginLeft: 4,
						}}
					>
						{totalMatches} match{totalMatches === 1 ? "" : "es"}
					</span>
				)}
			</div>

			{filteredGroups.length === 0 ? (
				<div
					style={{
						padding: 32,
						textAlign: "center",
						color: "var(--text-muted)",
						background: "var(--bg-secondary)",
						borderRadius: 8,
					}}
				>
					No examples match your filter.
				</div>
			) : (
				filteredGroups.map((group) => {
					// When filtering, force open so matches are visible without an
					// extra click. Otherwise honour the manual open state.
					const open = isFiltering ? true : openSections[group.id];
					return (
						<section key={group.id} style={sectionCardStyle}>
							<button
								type="button"
								style={sectionHeaderStyle(group.color)}
								onClick={() =>
									setOpenSections((s) => ({ ...s, [group.id]: !s[group.id] }))
								}
								aria-expanded={open}
							>
								<span
									style={{
										display: "inline-block",
										transform: open ? "rotate(90deg)" : "rotate(0deg)",
										transition: "transform 120ms",
										fontSize: 11,
										color: "var(--text-muted)",
									}}
								>
									▶
								</span>
								<span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>
									{group.label}
								</span>
								<span style={{ fontSize: 11, color: "var(--text-muted)" }}>
									{group.examples.length} example
									{group.examples.length === 1 ? "" : "s"}
								</span>
							</button>
							{open && (
								<>
									{group.description && (
										<div
											style={{
												padding: "8px 18px 12px",
												fontSize: 12,
												color: "var(--text-secondary)",
												borderTop: "1px solid var(--border)",
											}}
										>
											{group.description}
										</div>
									)}
									{group.examples.map((ex) => (
										<ExampleCard key={ex.id} example={ex} />
									))}
								</>
							)}
						</section>
					);
				})
			)}
		</div>
	);
}
