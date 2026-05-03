/**
 * ComputeStatusBadge
 *
 * Renders a small colored pill showing the active compute resource's state
 * (RUNNING / STARTING / SUSPENDED / SUSPENDING / RESIZING / UNKNOWN). One-
 * click resume button when SUSPENDED.
 *
 * Polling cadence: 30s while document is visible. Pauses when hidden.
 *
 * State machine:
 *   - Manual action (Resume/Suspend) → flip badge optimistically →
 *     suppress polling for 10s → re-poll after 2s to confirm
 *   - This avoids badge flicker between "user just resumed" and "next poll
 *     reads the new state"
 *
 * Provider must implement getComputeStatus / resumeCompute. Renders
 * nothing when those are missing (capability-gated).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { CatalogProvider, ComputeStatus, ComputeStatusState } from "../types"

interface ComputeStatusBadgeProps {
	provider: CatalogProvider
	/** Optional named compute resource. Defaults to provider's active. */
	name?: string
	/** Brief label rendered next to the dot, e.g. "Warehouse". */
	label?: string
	/** Notify parent of status changes (used for tooltips, dropdown sync). */
	onStatusChange?: (status: ComputeStatus) => void
}

const POLL_INTERVAL_MS = 30_000
const POST_ACTION_QUIET_MS = 10_000
const POST_ACTION_RECHECK_MS = 2_000

interface BadgeStyle {
	color: string
	background: string
	label: string
	animated?: boolean
}

const STYLES: Record<ComputeStatusState, BadgeStyle> = {
	running: { color: "#2ea043", background: "#1a3024", label: "RUNNING" },
	starting: {
		color: "#d29922",
		background: "#2d2510",
		label: "STARTING",
		animated: true,
	},
	suspended: { color: "#8b949e", background: "#2a2d33", label: "SUSPENDED" },
	suspending: {
		color: "#f85149",
		background: "#3a1d1d",
		label: "SUSPENDING",
		animated: true,
	},
	resizing: {
		color: "#a371f7",
		background: "#2c2240",
		label: "RESIZING",
		animated: true,
	},
	unknown: { color: "#8b949e", background: "transparent", label: "UNKNOWN" },
}

export default function ComputeStatusBadge({
	provider,
	name,
	label,
	onStatusChange,
}: ComputeStatusBadgeProps) {
	const [status, setStatus] = useState<ComputeStatus | null>(null)
	const [resuming, setResuming] = useState(false)
	const quietUntilRef = useRef<number>(0)
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const fetchStatus = useCallback(async () => {
		if (!provider.getComputeStatus) return
		if (Date.now() < quietUntilRef.current) return
		try {
			const next = await provider.getComputeStatus(name)
			setStatus(next)
			onStatusChange?.(next)
		} catch {
			// Failure is non-fatal — show UNKNOWN; permission errors common
			setStatus({ state: "unknown", lastChecked: new Date() })
		}
	}, [provider, name, onStatusChange])

	// Initial + polling
	useEffect(() => {
		if (!provider.getComputeStatus) return
		fetchStatus()
		const arm = () => {
			if (intervalRef.current != null) return
			intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)
		}
		const disarm = () => {
			if (intervalRef.current != null) {
				clearInterval(intervalRef.current)
				intervalRef.current = null
			}
		}
		arm()
		const onVis = () => (document.hidden ? disarm() : arm())
		// Snowflake auto-resumes the warehouse when a query runs against
		// a SUSPENDED one — we'd otherwise sit on the stale SUSPENDED
		// badge until the next 30s tick. Refresh on query-complete.
		const onQueryDone = () => fetchStatus()
		document.addEventListener("visibilitychange", onVis)
		window.addEventListener("dbxlite:query-completed", onQueryDone)
		return () => {
			disarm()
			document.removeEventListener("visibilitychange", onVis)
			window.removeEventListener("dbxlite:query-completed", onQueryDone)
		}
	}, [fetchStatus, provider])

	const handleResume = useCallback(async () => {
		if (!provider.resumeCompute) return
		setResuming(true)
		// Optimistic UI: flip to "starting" immediately
		setStatus({
			state: "starting",
			size: status?.size,
			lastChecked: new Date(),
		})
		quietUntilRef.current = Date.now() + POST_ACTION_QUIET_MS
		try {
			await provider.resumeCompute(name)
			// Re-poll after a short delay to confirm
			setTimeout(() => {
				quietUntilRef.current = 0
				fetchStatus()
			}, POST_ACTION_RECHECK_MS)
		} catch {
			// Revert optimistic flip; let next poll catch up
			quietUntilRef.current = 0
			fetchStatus()
		} finally {
			setResuming(false)
		}
	}, [provider, name, status?.size, fetchStatus])

	if (!provider.getComputeStatus) return null
	if (!status) {
		return (
			<span
				aria-label="Compute status loading"
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					padding: "1px 6px",
					fontSize: 9.5,
					color: "var(--text-muted)",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				}}
			>
				…
			</span>
		)
	}

	const style = STYLES[status.state]
	const showResumeButton = status.state === "suspended" && !!provider.resumeCompute

	return (
		<>
			<span
				aria-live="polite"
				aria-label={`Compute ${label ?? "status"}: ${style.label}${status.size ? ` (${status.size})` : ""}`}
				title={`Compute is ${style.label}${status.size ? ` · size ${status.size}` : ""}\nLast checked ${status.lastChecked.toLocaleTimeString()}`}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					padding: "1px 6px",
					fontSize: 9.5,
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					color: style.color,
					background: style.background,
					borderRadius: 3,
					whiteSpace: "nowrap",
				}}
			>
				<span
					style={{
						display: "inline-block",
						width: 6,
						height: 6,
						borderRadius: "50%",
						background: style.color,
						animation: style.animated ? "csb-pulse 1.2s ease-in-out infinite" : undefined,
					}}
				/>
				<style>{`@keyframes csb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
				{style.label}
			</span>
			{showResumeButton && (
				<button
					type="button"
					onClick={handleResume}
					disabled={resuming}
					title="Resume compute"
					aria-label="Resume compute"
					style={{
						marginLeft: 4,
						padding: "1px 6px",
						fontSize: 10,
						background: "var(--accent)",
						color: "white",
						border: "none",
						borderRadius: 3,
						cursor: resuming ? "wait" : "pointer",
						opacity: resuming ? 0.6 : 1,
					}}
				>
					{resuming ? "…" : "Resume"}
				</button>
			)}
		</>
	)
}
