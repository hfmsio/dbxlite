/**
 * SnowflakeContextButton
 *
 * Topbar replacement for the previous read-only `❄ ROLE @ WAREHOUSE` chip.
 * Click → popover with the same role / warehouse / db / schema editors that
 * the catalog explorer renders. This makes context controls reachable even
 * when the explorer panel is hidden.
 *
 * Reuses `SessionChipRenderer` (the per-chip dropdown wirer) so behavior is
 * identical to the explorer's chip group.
 */

import { useEffect, useRef, useState } from "react"
import { snowflakeCatalogProvider } from "../providers/catalog/SnowflakeCatalogProvider"
import SessionChipRenderer from "../providers/catalog/components/SessionChipRenderer"
import type {
	CatalogProviderHostHandlers,
	SessionContextChip,
} from "../providers/catalog/types"

/**
 * Custom event used to ask DataSourceExplorer to open the Snowflake reconnect
 * modal. Decouples Header from DataSourceExplorer's local state — no prop
 * drilling, no shared store. The listener lives in DataSourceExplorer.
 */
export const OPEN_SNOWFLAKE_EDIT_EVENT = "dbxlite:open-snowflake-edit"

interface Props {
	role: string
	warehouse: string
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
	) => void
}

export default function SnowflakeContextButton({
	role,
	warehouse,
	showToast,
}: Props) {
	const [open, setOpen] = useState(false)
	const [chips, setChips] = useState<SessionContextChip[]>([])
	const containerRef = useRef<HTMLDivElement>(null)

	// Refresh chips when popover opens — picks up any session changes since
	// the popover was last opened.
	useEffect(() => {
		if (!open) return
		setChips(snowflakeCatalogProvider.getSessionContext?.() ?? [])
	}, [open])

	// Close on outside click + escape.
	useEffect(() => {
		if (!open) return
		const handleClick = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false)
			}
		}
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false)
		}
		document.addEventListener("mousedown", handleClick)
		document.addEventListener("keydown", handleKey)
		return () => {
			document.removeEventListener("mousedown", handleClick)
			document.removeEventListener("keydown", handleKey)
		}
	}, [open])

	const host: CatalogProviderHostHandlers = {
		insertIntoEditor: () => {
			/* not applicable here */
		},
		copyToClipboard: async (text) => {
			await navigator.clipboard.writeText(text)
		},
		showToast,
		openConnectionEdit: () => {
			// Cross-component signal: DataSourceExplorer listens for this and
			// opens the Snowflake reconnect dialog. See OPEN_SNOWFLAKE_EDIT_EVENT.
			window.dispatchEvent(new CustomEvent(OPEN_SNOWFLAKE_EDIT_EVENT))
			setOpen(false)
		},
	}

	const currentDatabase = chips.find((c) => c.id === "catalog")?.value

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
				title="Snowflake context — click to change role / warehouse / database / schema"
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					padding: "4px 10px",
					background: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					fontSize: 11,
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					color: "var(--text-primary)",
					whiteSpace: "nowrap",
					maxWidth: 280,
					overflow: "hidden",
					textOverflow: "ellipsis",
					cursor: "pointer",
					transition: "background 0.15s",
				}}
			>
				<span style={{ color: "#29b5e8" }}>❄️</span>
				<span style={{ color: "var(--text-muted)" }}>{role || "—"}</span>
				<span style={{ color: "var(--text-muted)" }}>@</span>
				<span>{warehouse || "—"}</span>
				<span
					aria-hidden="true"
					style={{
						color: "var(--text-muted)",
						fontSize: 9,
						marginLeft: 2,
					}}
				>
					▾
				</span>
			</button>

			{open && (
				<div
					role="dialog"
					aria-label="Snowflake session context"
					style={{
						position: "absolute",
						top: "calc(100% + 6px)",
						right: 0,
						background: "var(--bg-primary)",
						border: "1px solid var(--border)",
						borderRadius: 8,
						boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
						padding: 12,
						display: "flex",
						flexDirection: "column",
						gap: 8,
						minWidth: 320,
						maxWidth: 480,
						zIndex: 1000,
					}}
				>
					<div
						style={{
							fontSize: 10,
							color: "var(--text-muted)",
							textTransform: "uppercase",
							letterSpacing: 0.5,
						}}
					>
						Snowflake session
					</div>
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
						}}
					>
						{chips.length === 0 ? (
							<span style={{ color: "var(--text-muted)", fontSize: 11 }}>
								Not connected
							</span>
						) : (
							chips.map((chip) => (
								<SessionChipRenderer
									key={chip.id ?? chip.label}
									chip={chip}
									provider={snowflakeCatalogProvider}
									host={host}
									currentDatabase={currentDatabase}
								/>
							))
						)}
					</div>
					<div
						style={{
							fontSize: 10,
							color: "var(--text-muted)",
							marginTop: 4,
						}}
					>
						Tip: role changes require reconnecting (OAuth scope is locked).
					</div>
				</div>
			)}
		</div>
	)
}
