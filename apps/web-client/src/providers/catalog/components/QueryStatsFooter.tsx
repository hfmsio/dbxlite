/**
 * QueryStatsFooter
 *
 * Provider-agnostic component that renders post-execution stats for the
 * most recent query. Embedded in ResultPane's result-stats-footer.
 *
 * Snowflake provider: getQueryStats hits INFORMATION_SCHEMA.QUERY_HISTORY_BY_QUERY_ID
 * with eventual-consistency retry.
 * BigQuery provider (when migrated): bytes-scanned available from job
 * response — no separate lookup needed.
 *
 * Caller passes the queryId (connector-side identifier captured in
 * QueryResult.connectorQueryId); component fetches stats once and caches.
 *
 * Wired in for backlog item SF-T5.3.
 */

import { useEffect, useState } from "react"
import type { CatalogProvider, QueryRunStats } from "../types"

interface QueryStatsFooterProps {
	provider: CatalogProvider
	queryId: string
}

export default function QueryStatsFooter({
	provider,
	queryId,
}: QueryStatsFooterProps) {
	const [stats, setStats] = useState<QueryRunStats | null>(null)

	useEffect(() => {
		if (!provider.getQueryStats) return
		let cancelled = false
		provider
			.getQueryStats(queryId)
			.then((s) => {
				if (!cancelled) setStats(s)
			})
			.catch(() => {
				/* non-fatal */
			})
		return () => {
			cancelled = true
		}
	}, [provider, queryId])

	if (!provider.getQueryStats) return null
	if (!stats) return null

	const parts: string[] = []
	if (stats.rowsProduced != null) {
		parts.push(`${stats.rowsProduced.toLocaleString()} rows`)
	}
	if (stats.bytesScanned != null) {
		parts.push(`${formatBytes(stats.bytesScanned)} scanned`)
	}
	if (stats.durationMs != null) {
		parts.push(formatDuration(stats.durationMs))
	}
	if (stats.computeContext) {
		parts.push(
			`${stats.computeContext}${stats.computeSize ? ` (${stats.computeSize})` : ""}`,
		)
	}

	if (parts.length === 0) return null

	return (
		<div
			role="status"
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 10px",
				fontSize: 11,
				color: "var(--text-muted)",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				borderTop: "1px solid var(--border)",
			}}
		>
			<span
				aria-hidden="true"
				style={{ color: provider.accentColor, fontSize: 12 }}
			>
				{provider.icon}
			</span>
			<span>{parts.join(" · ")}</span>
		</div>
	)
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(2)} KB`
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`
	if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GB`
	return `${(n / 1024 ** 4).toFixed(2)} TB`
}

function formatDuration(ms: number): string {
	if (ms < 1) return `<1ms`
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
	const min = Math.floor(ms / 60_000)
	const s = Math.round((ms % 60_000) / 1000)
	return `${min}m ${s}s`
}
