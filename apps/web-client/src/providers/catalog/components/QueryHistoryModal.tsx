/**
 * QueryHistoryModal
 *
 * Searchable list of recent queries for any provider that implements
 * `listRecentQueries`. Click a row to load the query into the editor (new
 * tab if dirty, replace if not — handled by host.insertIntoEditor).
 *
 * Triggered from a 📜 button in the catalog explorer's section header.
 *
 * Trade-offs of the modal placement:
 *   - Hides the editor while open (no drag/drop into editor, no
 *     side-by-side reference)
 *   - Cheapest to ship; iterate to a side drawer if usage shows users
 *     want persistent visibility
 *
 * Permission errors fall back to an explicit hint (Snowflake's
 * QUERY_HISTORY_BY_USER requires MONITOR USAGE).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type {
	CatalogProvider,
	CatalogProviderHostHandlers,
	PrivilegeHelp,
	QueryHistoryEntry,
} from "../types"

interface QueryHistoryModalProps {
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	onClose: () => void
}

type StatusFilter = "all" | "success" | "failed"

/** Server-side fetch caps. Snowflake's QUERY_HISTORY_BY_USER caps at 10000. */
const LIMIT_OPTIONS = [100, 500, 2000] as const
const DEFAULT_LIMIT: (typeof LIMIT_OPTIONS)[number] = 100
/** DOM render cap. 200 rows expand+collapse smoothly; "Show all" overrides. */
const RENDER_CAP = 200

export default function QueryHistoryModal({
	provider,
	host,
	onClose,
}: QueryHistoryModalProps) {
	const [entries, setEntries] = useState<QueryHistoryEntry[] | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [help, setHelp] = useState<PrivilegeHelp | null>(null)
	const [filter, setFilter] = useState<StatusFilter>("all")
	const [query, setQuery] = useState("")
	const [expandedId, setExpandedId] = useState<string | null>(null)
	const [limit, setLimit] =
		useState<(typeof LIMIT_OPTIONS)[number]>(DEFAULT_LIMIT)
	const [showAll, setShowAll] = useState(false)

	const load = useCallback(async () => {
		if (!provider.listRecentQueries) return
		setLoading(true)
		setError(null)
		setHelp(null)
		try {
			const list = await provider.listRecentQueries(limit)
			setEntries(list)
		} catch (err) {
			const errObj = err instanceof Error ? err : new Error(String(err))
			const hint = provider.getPrivilegeHelp?.("queryHistory", errObj) ?? null
			if (hint) {
				setHelp(hint)
				setError(null)
			} else {
				setError(errObj.message || "Failed to load history")
			}
		} finally {
			setLoading(false)
		}
	}, [provider, limit])

	useEffect(() => {
		load()
	}, [load])

	// Close on Escape
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [onClose])

	const filtered = useMemo(() => {
		if (!entries) return []
		const q = query.trim().toLowerCase()
		return entries.filter((e) => {
			if (filter === "success" && e.status !== "success") return false
			if (filter === "failed" && e.status !== "failed") return false
			if (q && !e.text.toLowerCase().includes(q)) return false
			return true
		})
	}, [entries, query, filter])

	const visible = useMemo(
		() => (showAll ? filtered : filtered.slice(0, RENDER_CAP)),
		[filtered, showAll],
	)
	const trimmed = filtered.length - visible.length

	const handleLoad = useCallback(
		(entry: QueryHistoryEntry) => {
			host.insertIntoEditor(entry.text)
			host.showToast?.("Query loaded into editor", "success")
			onClose()
		},
		[host, onClose],
	)

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="query-history-title"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10001,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "80vw",
					maxWidth: 1100,
					maxHeight: "80vh",
					background: "var(--bg-primary)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "12px 16px",
						borderBottom: "1px solid var(--border)",
					}}
				>
					<h2
						id="query-history-title"
						style={{
							margin: 0,
							fontSize: 14,
							color: "var(--text-primary)",
							display: "flex",
							alignItems: "center",
							gap: 8,
						}}
					>
						<span style={{ color: provider.accentColor }}>{provider.icon}</span>
						<span>{provider.displayName} query history</span>
					</h2>
					<div style={{ marginLeft: 12, display: "flex", gap: 4 }}>
						{(["all", "success", "failed"] as StatusFilter[]).map((f) => (
							<button
								key={f}
								type="button"
								onClick={() => setFilter(f)}
								style={{
									padding: "3px 8px",
									fontSize: 11,
									background:
										filter === f ? "var(--accent)" : "var(--bg-secondary)",
									color: filter === f ? "white" : "var(--text-secondary)",
									border: "1px solid var(--border)",
									borderRadius: 3,
									cursor: "pointer",
									textTransform: "capitalize",
								}}
							>
								{f}
							</button>
						))}
					</div>
					<input
						type="text"
						placeholder="Filter queries…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{
							flex: 1,
							marginLeft: 8,
							padding: "5px 10px",
							fontSize: 12,
							background: "var(--bg-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							color: "var(--text-primary)",
							outline: "none",
						}}
					/>
					<select
						value={limit}
						onChange={(e) => {
							const next = Number(e.target.value) as (typeof LIMIT_OPTIONS)[number]
							setLimit(next)
							setShowAll(false)
						}}
						title="How many queries to fetch"
						style={{
							padding: "5px 8px",
							background: "var(--bg-secondary)",
							color: "var(--text-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							fontSize: 11,
							cursor: "pointer",
						}}
					>
						{LIMIT_OPTIONS.map((n) => (
							<option key={n} value={n}>
								Last {n}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={load}
						title="Refresh"
						aria-label="Refresh"
						style={{
							padding: "5px 10px",
							background: "var(--bg-secondary)",
							color: "var(--text-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							cursor: "pointer",
							fontSize: 11,
						}}
					>
						↻
					</button>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						style={{
							padding: "5px 10px",
							background: "none",
							color: "var(--text-muted)",
							border: "none",
							cursor: "pointer",
							fontSize: 18,
						}}
					>
						×
					</button>
				</div>

				{/* Body */}
				<div
					style={{
						flex: 1,
						overflowY: "auto",
						padding: 4,
					}}
				>
					{loading && (
						<div
							style={{
								padding: 32,
								textAlign: "center",
								color: "var(--text-muted)",
							}}
						>
							Loading…
						</div>
					)}
					{error && (
						<div
							style={{
								margin: 16,
								padding: 12,
								background: "var(--bg-secondary)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								color: "var(--text-secondary)",
								fontSize: 13,
								whiteSpace: "pre-wrap",
								lineHeight: 1.5,
							}}
						>
							⚠️ {error}
						</div>
					)}
					{help && (
						<PrivilegeHelpCard
							help={help}
							onCopied={(sql) =>
								host.showToast?.(`Copied: ${truncate(sql, 60)}`, "success")
							}
						/>
					)}
					{!loading && !error && !help && filtered.length === 0 && (
						<div
							style={{
								padding: 32,
								textAlign: "center",
								color: "var(--text-muted)",
							}}
						>
							No matching queries
						</div>
					)}
					{!loading && !error && !help && visible.length > 0 && (
						<table
							style={{
								width: "100%",
								borderCollapse: "collapse",
								fontSize: 12,
							}}
						>
							<thead>
								<tr
									style={{
										color: "var(--text-muted)",
										textAlign: "left",
										fontSize: 10,
										textTransform: "uppercase",
										letterSpacing: 0.5,
									}}
								>
									<th style={{ padding: "6px 10px" }}>Status</th>
									<th style={{ padding: "6px 10px" }}>Query</th>
									<th style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
										Duration
									</th>
									<th style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
										When
									</th>
									<th style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
										Compute
									</th>
								</tr>
							</thead>
							<tbody>
								{visible.map((entry) => {
									const isExpanded = expandedId === entry.queryId
									return (
										<Fragment key={entry.queryId}>
											<tr
												onClick={() =>
													setExpandedId(isExpanded ? null : entry.queryId)
												}
												title={isExpanded ? "Collapse" : "Click to expand SQL"}
												aria-expanded={isExpanded}
												style={{
													cursor: "pointer",
													borderTop: "1px solid var(--border)",
													background: isExpanded
														? "var(--bg-secondary)"
														: "transparent",
												}}
												onMouseEnter={(e) => {
													if (!isExpanded)
														e.currentTarget.style.background =
															"var(--bg-secondary)"
												}}
												onMouseLeave={(e) => {
													if (!isExpanded)
														e.currentTarget.style.background = "transparent"
												}}
											>
												<td
													style={{
														padding: "8px 10px",
														whiteSpace: "nowrap",
													}}
												>
													<StatusPill status={entry.status} />
												</td>
												<td
													style={{
														padding: "8px 10px",
														maxWidth: 0,
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
														fontFamily:
															"ui-monospace, SFMono-Regular, Menlo, monospace",
														color: "var(--text-primary)",
													}}
												>
													<span
														style={{
															display: "inline-block",
															width: 12,
															color: "var(--text-muted)",
															transition: "transform 0.15s",
															transform: isExpanded
																? "rotate(90deg)"
																: "rotate(0deg)",
														}}
													>
														›
													</span>{" "}
													{truncate(entry.text)}
													{entry.errorMessage && !isExpanded && (
														<span
															style={{
																display: "block",
																marginTop: 2,
																fontSize: 11,
																color: "var(--error)",
																fontFamily: "system-ui, sans-serif",
																whiteSpace: "normal",
															}}
														>
															{entry.errorMessage}
														</span>
													)}
												</td>
												<td
													style={{
														padding: "8px 10px",
														color: "var(--text-secondary)",
														whiteSpace: "nowrap",
													}}
												>
													{formatDuration(entry.durationMs)}
												</td>
												<td
													style={{
														padding: "8px 10px",
														color: "var(--text-secondary)",
														whiteSpace: "nowrap",
													}}
													title={entry.startTime.toLocaleString()}
												>
													{relativeTime(entry.startTime)}
												</td>
												<td
													style={{
														padding: "8px 10px",
														color: "var(--text-muted)",
														whiteSpace: "nowrap",
														fontFamily:
															"ui-monospace, SFMono-Regular, Menlo, monospace",
														fontSize: 11,
													}}
												>
													{entry.computeContext ?? "—"}
												</td>
											</tr>
											{isExpanded && (
												<tr
													style={{
														background: "var(--bg-secondary)",
													}}
												>
													<td colSpan={5} style={{ padding: "0 10px 12px 28px" }}>
														<ExpandedDetail
															entry={entry}
															onLoad={() => handleLoad(entry)}
															onCopy={() => {
																host.copyToClipboard(entry.text)
																host.showToast?.(
																	"SQL copied to clipboard",
																	"success",
																)
															}}
														/>
													</td>
												</tr>
											)}
										</Fragment>
									)
								})}
							</tbody>
						</table>
					)}
					{!loading && !error && !help && entries && entries.length > 0 && (
						<div
							style={{
								padding: "10px 14px",
								borderTop: "1px solid var(--border)",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								fontSize: 11,
								color: "var(--text-muted)",
								gap: 12,
							}}
						>
							<span>
								Showing {visible.length} of {filtered.length} matching ·{" "}
								{entries.length} fetched
							</span>
							{trimmed > 0 && (
								<button
									type="button"
									onClick={() => setShowAll(true)}
									style={btnStyle}
								>
									Show all {filtered.length}
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ExpandedDetail({
	entry,
	onLoad,
	onCopy,
}: {
	entry: QueryHistoryEntry
	onLoad: () => void
	onCopy: () => void
}) {
	return (
		<div
			style={{
				background: "var(--bg-primary)",
				border: "1px solid var(--border)",
				borderRadius: 4,
				padding: "10px 12px",
				marginTop: 4,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "flex-end",
					gap: 6,
					marginBottom: 8,
				}}
			>
				<button
					type="button"
					onClick={onCopy}
					title="Copy SQL to clipboard"
					style={btnStyle}
				>
					📋 Copy
				</button>
				<button
					type="button"
					onClick={onLoad}
					title="Load this SQL into the editor"
					style={{
						...btnStyle,
						background: "var(--accent)",
						color: "white",
						borderColor: "var(--accent)",
					}}
				>
					→ Load into editor
				</button>
			</div>
			<pre
				style={{
					margin: 0,
					padding: 0,
					maxHeight: 300,
					overflow: "auto",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: 12,
					color: "var(--text-primary)",
					lineHeight: 1.5,
				}}
			>
				{entry.text}
			</pre>
			{entry.errorMessage && (
				<div
					style={{
						marginTop: 8,
						padding: "8px 10px",
						background: "var(--bg-secondary)",
						borderLeft: "3px solid var(--error)",
						fontFamily: "system-ui, sans-serif",
						fontSize: 12,
						color: "var(--error)",
						whiteSpace: "pre-wrap",
					}}
				>
					{entry.errorMessage}
				</div>
			)}
		</div>
	)
}

const btnStyle: React.CSSProperties = {
	padding: "4px 10px",
	background: "var(--bg-secondary)",
	color: "var(--text-secondary)",
	border: "1px solid var(--border)",
	borderRadius: 3,
	cursor: "pointer",
	fontSize: 11,
	whiteSpace: "nowrap",
}

function PrivilegeHelpCard({
	help,
	onCopied,
}: {
	help: PrivilegeHelp
	onCopied?: (sql: string) => void
}) {
	const copy = (sql: string) => {
		navigator.clipboard?.writeText(sql).then(() => onCopied?.(sql))
	}
	return (
		<div
			style={{
				margin: 16,
				padding: 16,
				background: "var(--bg-secondary)",
				border: "1px solid var(--border)",
				borderLeft: "3px solid #d29922",
				borderRadius: 6,
				color: "var(--text-secondary)",
				fontSize: 13,
				lineHeight: 1.5,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 8,
					color: "var(--text-primary)",
					fontWeight: 600,
					fontSize: 14,
				}}
			>
				<span aria-hidden>🔒</span>
				<span>{help.title}</span>
			</div>
			<p style={{ margin: "0 0 12px" }}>{help.body}</p>
			<div
				style={{
					fontSize: 11,
					textTransform: "uppercase",
					letterSpacing: 0.5,
					color: "var(--text-muted)",
					marginBottom: 6,
				}}
			>
				Run these commands
			</div>
			{help.commands.map((cmd, i) => (
				<div
					key={i}
					style={{
						background: "var(--bg-primary)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						padding: "8px 10px",
						marginBottom: 8,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							marginBottom: cmd.description ? 4 : 0,
						}}
					>
						<code
							style={{
								flex: 1,
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: 12,
								color: "var(--text-primary)",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
						>
							{cmd.sql}
						</code>
						<button
							type="button"
							onClick={() => copy(cmd.sql)}
							title="Copy SQL"
							style={{
								padding: "3px 8px",
								background: "var(--bg-secondary)",
								color: "var(--text-secondary)",
								border: "1px solid var(--border)",
								borderRadius: 3,
								cursor: "pointer",
								fontSize: 11,
								whiteSpace: "nowrap",
							}}
						>
							📋 Copy
						</button>
					</div>
					{(cmd.description || cmd.runAs) && (
						<div
							style={{
								fontSize: 11,
								color: "var(--text-muted)",
								marginTop: 4,
							}}
						>
							{cmd.runAs && (
								<span>
									Run as <strong>{cmd.runAs}</strong>
									{cmd.description ? " — " : ""}
								</span>
							)}
							{cmd.description}
						</div>
					)}
				</div>
			))}
			{help.docsUrl && (
				<a
					href={help.docsUrl}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						fontSize: 12,
						color: "var(--accent)",
						textDecoration: "none",
					}}
				>
					Docs ↗
				</a>
			)}
		</div>
	)
}

function StatusPill({ status }: { status: QueryHistoryEntry["status"] }) {
	const styles: Record<
		QueryHistoryEntry["status"],
		{ color: string; label: string }
	> = {
		success: { color: "#2ea043", label: "✓" },
		failed: { color: "#f85149", label: "✗" },
		running: { color: "#d29922", label: "…" },
		cancelled: { color: "#8b949e", label: "⊘" },
	}
	const s = styles[status]
	return (
		<span
			title={status}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 18,
				height: 18,
				borderRadius: 9,
				background: "transparent",
				color: s.color,
				fontWeight: 700,
				fontSize: 12,
			}}
		>
			{s.label}
		</span>
	)
}

function truncate(text: string, max = 140): string {
	const t = text.replace(/\s+/g, " ").trim()
	return t.length > max ? `${t.slice(0, max)}…` : t
}

function formatDuration(ms: number): string {
	if (!ms || ms < 1) return "—"
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
	const min = Math.floor(ms / 60_000)
	const s = Math.round((ms % 60_000) / 1000)
	return `${min}m ${s}s`
}

function relativeTime(d: Date): string {
	const diff = Date.now() - d.getTime()
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return `${sec}s ago`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ago`
	const hr = Math.floor(min / 60)
	if (hr < 24) return `${hr}h ago`
	const days = Math.floor(hr / 24)
	return `${days}d ago`
}
