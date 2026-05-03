/**
 * DropdownChip
 *
 * Generic, accessible dropdown attached to a chip in the explorer's context
 * strip. Click the chip → opens a popup with options; selecting one calls
 * `onSelect`. Supports keyboard nav (arrow keys, Enter, Escape, Tab) and
 * search-as-you-type when the option list is large.
 *
 * Disabled when a query is in flight (parent passes `disabled`); shows a
 * tooltip explaining why.
 */

import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react"

interface DropdownChipOption {
	value: string
	label?: string
	/** Secondary text rendered to the right (e.g. warehouse size). */
	secondary?: string
}

interface DropdownChipProps {
	/** The chip itself — already rendered by the parent. We wrap it. */
	children: React.ReactNode
	/** Loaded once on first open; can be re-fetched via `reloadKey`. */
	loadOptions: () => Promise<DropdownChipOption[]>
	/** Currently selected value (rendered with a check). */
	currentValue?: string
	onSelect: (value: string) => void | Promise<void>
	/** Show "Query in progress — wait" tooltip and prevent open. */
	disabled?: boolean
	/** Accessible name (and tooltip) for the chip trigger. */
	ariaLabel?: string
	/** When changed, drops the cached options and re-fetches on next open. */
	reloadKey?: string | number
	/** Threshold above which we render a search input. Default 15. */
	searchThreshold?: number
}

const DEFAULT_SEARCH_THRESHOLD = 15

export default function DropdownChip(props: DropdownChipProps) {
	const {
		children,
		loadOptions,
		currentValue,
		onSelect,
		disabled,
		ariaLabel,
		reloadKey,
		searchThreshold = DEFAULT_SEARCH_THRESHOLD,
	} = props

	const [open, setOpen] = useState(false)
	const [options, setOptions] = useState<DropdownChipOption[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [filter, setFilter] = useState("")
	const [highlightIdx, setHighlightIdx] = useState(0)
	const triggerRef = useRef<HTMLButtonElement | null>(null)
	const listRef = useRef<HTMLDivElement | null>(null)
	const searchRef = useRef<HTMLInputElement | null>(null)
	const id = useId()

	// Reset cached options when reloadKey changes
	useEffect(() => {
		setOptions(null)
		setError(null)
	}, [reloadKey])

	const handleOpen = useCallback(async () => {
		if (disabled || open) return
		setOpen(true)
		setFilter("")
		setHighlightIdx(0)
		if (options || loading) return
		setLoading(true)
		try {
			const list = await loadOptions()
			setOptions(list)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load options")
		} finally {
			setLoading(false)
		}
	}, [disabled, open, options, loading, loadOptions])

	const handleClose = useCallback(() => {
		setOpen(false)
		// Return focus to trigger
		setTimeout(() => triggerRef.current?.focus(), 0)
	}, [])

	// Close on outside click / Escape
	useEffect(() => {
		if (!open) return
		const onDocClick = (e: MouseEvent) => {
			if (
				!listRef.current?.contains(e.target as Node) &&
				!triggerRef.current?.contains(e.target as Node)
			) {
				setOpen(false)
			}
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation()
				handleClose()
			}
		}
		// Defer attach so the click that opened doesn't immediately close.
		const id = setTimeout(() => {
			document.addEventListener("mousedown", onDocClick)
			document.addEventListener("keydown", onKey)
		}, 0)
		return () => {
			clearTimeout(id)
			document.removeEventListener("mousedown", onDocClick)
			document.removeEventListener("keydown", onKey)
		}
	}, [open, handleClose])

	// Auto-close if disabled becomes true (query starts mid-dropdown)
	useEffect(() => {
		if (disabled && open) setOpen(false)
	}, [disabled, open])

	// Auto-focus search input when present
	useEffect(() => {
		if (open && options && options.length >= searchThreshold) {
			setTimeout(() => searchRef.current?.focus(), 0)
		}
	}, [open, options, searchThreshold])

	const filtered = useMemo(() => {
		if (!options) return []
		const f = filter.trim().toLowerCase()
		if (!f) return options
		return options.filter((o) => {
			const hay = `${o.value} ${o.label ?? ""} ${o.secondary ?? ""}`.toLowerCase()
			return hay.includes(f)
		})
	}, [options, filter])

	const handleSelect = useCallback(
		async (value: string) => {
			handleClose()
			try {
				await onSelect(value)
			} catch {
				// Caller is responsible for error reporting
			}
		},
		[handleClose, onSelect],
	)

	const handleKeyNav = useCallback(
		(e: React.KeyboardEvent) => {
			if (filtered.length === 0) return
			if (e.key === "ArrowDown") {
				e.preventDefault()
				setHighlightIdx((i) => (i + 1) % filtered.length)
			} else if (e.key === "ArrowUp") {
				e.preventDefault()
				setHighlightIdx((i) => (i - 1 + filtered.length) % filtered.length)
			} else if (e.key === "Enter") {
				e.preventDefault()
				const opt = filtered[highlightIdx]
				if (opt) handleSelect(opt.value)
			}
		},
		[filtered, highlightIdx, handleSelect],
	)

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? `${id}-list` : undefined}
				aria-label={ariaLabel}
				title={
					disabled
						? "Query in progress — wait to switch"
						: ariaLabel
				}
				onClick={handleOpen}
				disabled={disabled}
				style={{
					display: "inline-flex",
					alignItems: "center",
					background: "transparent",
					border: "none",
					padding: 0,
					margin: 0,
					cursor: disabled ? "not-allowed" : "pointer",
					opacity: disabled ? 0.6 : 1,
					font: "inherit",
					color: "inherit",
				}}
			>
				{children}
			</button>

			{open && (
				<div
					ref={listRef}
					role="listbox"
					id={`${id}-list`}
					onKeyDown={handleKeyNav}
					style={{
						position: "absolute",
						zIndex: 10002,
						minWidth: 220,
						maxWidth: 360,
						maxHeight: 320,
						overflowY: "auto",
						background: "var(--bg-primary)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
						padding: 4,
						marginTop: 4,
						fontSize: 12,
					}}
				>
					{loading && (
						<div
							style={{
								padding: "8px 10px",
								color: "var(--text-muted)",
								fontStyle: "italic",
							}}
						>
							Loading…
						</div>
					)}
					{error && (
						<div
							style={{
								padding: "8px 10px",
								color: "var(--error)",
								whiteSpace: "pre-wrap",
							}}
						>
							⚠️ {error}
						</div>
					)}
					{!loading && !error && options && (
						<>
							{options.length >= searchThreshold && (
								<input
									ref={searchRef}
									type="text"
									value={filter}
									onChange={(e) => {
										setFilter(e.target.value)
										setHighlightIdx(0)
									}}
									placeholder="Filter…"
									style={{
										width: "100%",
										padding: "6px 8px",
										marginBottom: 4,
										background: "var(--bg-secondary)",
										border: "1px solid var(--border)",
										borderRadius: 4,
										color: "var(--text-primary)",
										fontSize: 12,
										outline: "none",
									}}
								/>
							)}
							{filtered.length === 0 && (
								<div
									style={{
										padding: "8px 10px",
										color: "var(--text-muted)",
									}}
								>
									No matches
								</div>
							)}
							{filtered.map((opt, i) => {
								const isCurrent = opt.value === currentValue
								const isHighlighted = i === highlightIdx
								return (
									<button
										key={opt.value}
										type="button"
										role="option"
										aria-selected={isCurrent}
										onMouseEnter={() => setHighlightIdx(i)}
										onClick={() => handleSelect(opt.value)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											width: "100%",
											padding: "5px 8px",
											background: isHighlighted
												? "var(--bg-secondary)"
												: "transparent",
											border: "none",
											borderRadius: 4,
											cursor: "pointer",
											color: "var(--text-primary)",
											textAlign: "left",
											fontFamily:
												"ui-monospace, SFMono-Regular, Menlo, monospace",
											fontSize: 12,
										}}
									>
										<span
											style={{ width: 14, color: "var(--accent)" }}
											aria-hidden="true"
										>
											{isCurrent ? "✓" : ""}
										</span>
										<span style={{ flex: 1 }}>
											{opt.label ?? opt.value}
										</span>
										{opt.secondary && (
											<span
												style={{
													color: "var(--text-muted)",
													fontSize: 10.5,
												}}
											>
												{opt.secondary}
											</span>
										)}
									</button>
								)
							})}
						</>
					)}
				</div>
			)}
		</>
	)
}
