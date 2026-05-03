/**
 * CatalogExplorer — generic tree explorer for any CatalogProvider.
 *
 * Loading strategy:
 *   - Catalogs (databases): eager on mount
 *   - Schemas: eager when catalog is expanded
 *   - Tables/views: lazy when schema is expanded
 *
 * Per-row spinners while loading. Provider's underlying cache handles
 * repeat-expansion within TTL.
 *
 * Interactions:
 *   - Click table/view → insert SELECT into editor (provider-dictated SQL)
 *   - Right-click → menu of provider-specific actions (insert SELECT,
 *     copy FQN, show DDL, etc.)
 *   - Drag-and-drop a table/view onto the editor → inserts qualified name
 *
 * The host wires `insertIntoEditor` / `openConnectionEdit` / `copyToClipboard`
 * via the `host` prop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
	CatalogInfo,
	SchemaInfo,
	TableMetadata,
} from "@ide/connectors"
import type {
	CatalogProvider,
	CatalogProviderHostHandlers,
	NodeAction,
	SessionContextChip,
} from "./types"
import QueryHistoryModal from "./components/QueryHistoryModal"
import SessionChipRenderer from "./components/SessionChipRenderer"
import { searchTree } from "./searchTree"
import { createLogger } from "../../utils/logger"

const logger = createLogger("CatalogExplorer")

interface CatalogExplorerProps {
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
}

type LoadState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "loaded"; data: T }
	| { status: "error"; error: string; help?: import("./types").PrivilegeHelp | null }

interface CatalogNode {
	info: CatalogInfo
	expanded: boolean
	schemas: LoadState<SchemaNode[]>
}

interface SchemaNode {
	info: SchemaInfo
	expanded: boolean
	tables: LoadState<TableMetadata[]>
}

interface ContextMenuState {
	x: number
	y: number
	actions: NodeAction[]
}

export default function CatalogExplorer({
	provider,
	host,
}: CatalogExplorerProps) {
	const [catalogs, setCatalogs] = useState<LoadState<CatalogNode[]>>({
		status: "idle",
	})
	const [sectionExpanded, setSectionExpanded] = useState(true)
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
	const [contextChips, setContextChips] = useState<SessionContextChip[]>([])
	const [pinnedIds, setPinnedIds] = useState<string[]>(
		() => provider.getPinnedCatalogs?.() ?? [],
	)
	const refreshPinned = useCallback(() => {
		setPinnedIds(provider.getPinnedCatalogs?.() ?? [])
	}, [provider])
	const [searchQuery, setSearchQuery] = useState("")
	const [searchVisible, setSearchVisible] = useState(false)
	const searchInputRef = useRef<HTMLInputElement | null>(null)
	const [showHistory, setShowHistory] = useState(false)

	// Keyboard shortcut: "/" focuses the search input
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				e.key === "/" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey &&
				document.activeElement?.tagName !== "INPUT" &&
				document.activeElement?.tagName !== "TEXTAREA"
			) {
				const explorerHasFocus = document
					.querySelector(`[data-catalog-provider="${provider.id}"]`)
					?.contains(document.activeElement)
				if (explorerHasFocus) {
					e.preventDefault()
					setSearchVisible(true)
					setTimeout(() => searchInputRef.current?.focus(), 0)
				}
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [provider.id])

	// ---------------------------------------------------------------------------
	// Catalog loading
	// ---------------------------------------------------------------------------

	const loadCatalogs = useCallback(async () => {
		setCatalogs({ status: "loading" })
		try {
			const list = await provider.listCatalogs()
			setCatalogs({
				status: "loaded",
				data: list.map((info) => ({
					info,
					expanded: false,
					schemas: { status: "idle" },
				})),
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to list catalogs"
			logger.error("listCatalogs failed", err)
			setCatalogs({ status: "error", error: msg })
		}
	}, [provider])

	useEffect(() => {
		// Reload whenever the provider changes (or on mount).
		loadCatalogs()
	}, [loadCatalogs])

	// Periodically refresh session-context chips so they reflect edits.
	useEffect(() => {
		if (!provider.getSessionContext) return
		const update = () => setContextChips(provider.getSessionContext!())
		update()
		const id = setInterval(update, 3000)
		return () => clearInterval(id)
	}, [provider])

	const refresh = useCallback(() => {
		provider.refresh()
		loadCatalogs()
	}, [provider, loadCatalogs])

	// ---------------------------------------------------------------------------
	// Tree mutation helpers
	// ---------------------------------------------------------------------------

	const updateCatalog = useCallback(
		(catalogId: string, fn: (n: CatalogNode) => CatalogNode) => {
			setCatalogs((curr) => {
				if (curr.status !== "loaded") return curr
				return {
					...curr,
					data: curr.data.map((c) => (c.info.id === catalogId ? fn(c) : c)),
				}
			})
		},
		[],
	)

	const updateSchema = useCallback(
		(
			catalogId: string,
			schemaId: string,
			fn: (s: SchemaNode) => SchemaNode,
		) => {
			updateCatalog(catalogId, (c) => {
				if (c.schemas.status !== "loaded") return c
				return {
					...c,
					schemas: {
						...c.schemas,
						data: c.schemas.data.map((s) =>
							s.info.id === schemaId ? fn(s) : s,
						),
					},
				}
			})
		},
		[updateCatalog],
	)

	const toggleCatalog = useCallback(
		async (catalogId: string) => {
			let needsLoad = false
			updateCatalog(catalogId, (c) => {
				const expanded = !c.expanded
				if (expanded && c.schemas.status === "idle") {
					needsLoad = true
					return { ...c, expanded, schemas: { status: "loading" } }
				}
				return { ...c, expanded }
			})
			if (!needsLoad) return

			try {
				const schemas = await provider.listSchemas(catalogId)
				updateCatalog(catalogId, (c) => ({
					...c,
					schemas: {
						status: "loaded",
						data: schemas.map((info) => ({
							info,
							expanded: false,
							tables: { status: "idle" },
						})),
					},
				}))
			} catch (err) {
				const errObj =
					err instanceof Error ? err : new Error(String(err))
				const msg = errObj.message || "Failed to list schemas"
				const help =
					provider.getPrivilegeHelp?.("listSchemas", errObj) ?? null
				updateCatalog(catalogId, (c) => ({
					...c,
					schemas: { status: "error", error: msg, help },
				}))
			}
		},
		[provider, updateCatalog],
	)

	const toggleSchema = useCallback(
		async (catalogId: string, schemaId: string) => {
			let needsLoad = false
			updateSchema(catalogId, schemaId, (s) => {
				const expanded = !s.expanded
				if (expanded && s.tables.status === "idle") {
					needsLoad = true
					return { ...s, expanded, tables: { status: "loading" } }
				}
				return { ...s, expanded }
			})
			if (!needsLoad) return

			try {
				const tables = await provider.listTables(catalogId, schemaId)
				updateSchema(catalogId, schemaId, (s) => ({
					...s,
					tables: { status: "loaded", data: tables },
				}))
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Failed to list tables"
				updateSchema(catalogId, schemaId, (s) => ({
					...s,
					tables: { status: "error", error: msg },
				}))
			}
		},
		[provider, updateSchema],
	)

	// ---------------------------------------------------------------------------
	// Action dispatch (right-click + click)
	// ---------------------------------------------------------------------------

	const showContextMenu = useCallback(
		(e: React.MouseEvent, actions: NodeAction[]) => {
			if (!actions.length) return
			e.preventDefault()
			e.stopPropagation()
			setContextMenu({ x: e.clientX, y: e.clientY, actions })
		},
		[],
	)

	const handleTableClick = useCallback(
		(catalog: string, schema: string, table: TableMetadata) => {
			host.insertIntoEditor(
				provider.generateSelect(catalog, schema, table.name),
			)
		},
		[host, provider],
	)

	const handleTableDragStart = useCallback(
		(
			e: React.DragEvent,
			catalog: string,
			schema: string,
			table: TableMetadata,
		) => {
			const sql = provider.generateSelect(catalog, schema, table.name)
			const fqn = provider.qualifyName(catalog, schema, table.name)
			// Editors typically read text/plain; use SQL as the primary payload.
			e.dataTransfer.setData("text/plain", sql)
			e.dataTransfer.setData(
				"application/x-catalog-table",
				JSON.stringify({
					provider: provider.id,
					catalog,
					schema,
					table: table.name,
					fqn,
				}),
			)
			e.dataTransfer.effectAllowed = "copyMove"
		},
		[provider],
	)

	const handleColumnDragStart = useCallback(
		(e: React.DragEvent, columnName: string) => {
			e.dataTransfer.setData(
				"text/plain",
				provider.qualifyColumn(columnName),
			)
			e.dataTransfer.effectAllowed = "copy"
		},
		[provider],
	)

	// ---------------------------------------------------------------------------
	// Context menu close on outside click / escape
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (!contextMenu) return
		const close = () => setContextMenu(null)
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") close()
		}
		// Use a microtask before attaching to avoid the same click that opened it.
		const id = setTimeout(() => {
			window.addEventListener("click", close)
			window.addEventListener("keydown", onKey)
		}, 0)
		return () => {
			clearTimeout(id)
			window.removeEventListener("click", close)
			window.removeEventListener("keydown", onKey)
		}
	}, [contextMenu])

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	const totalCatalogs =
		catalogs.status === "loaded" ? catalogs.data.length : 0
	const catalogTerm = provider.catalogTerm ?? {
		singular: "catalog",
		plural: "catalogs",
	}

	return (
		<div
			style={{
				borderBottom: "1px solid var(--border)",
				padding: "8px 0",
			}}
			data-catalog-provider={provider.id}
		>
			{/* Section header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					padding: "4px 12px",
					cursor: "pointer",
					userSelect: "none",
					fontSize: 12,
					fontWeight: 600,
					color: "var(--text-secondary)",
					textTransform: "uppercase",
					letterSpacing: 0.5,
					gap: 6,
				}}
				onClick={() => setSectionExpanded(!sectionExpanded)}
			>
				<Chevron expanded={sectionExpanded} />
				<span style={{ color: provider.accentColor, fontSize: 14 }}>
					{provider.icon}
				</span>
				<span>{provider.displayName}</span>
				{catalogs.status === "loading" && <Spinner />}
				{catalogs.status === "loaded" && (
					<span
						style={{
							marginLeft: "auto",
							fontSize: 11,
							fontWeight: 400,
							color: "var(--text-muted)",
						}}
					>
						{totalCatalogs}{" "}
					{totalCatalogs === 1 ? catalogTerm.singular : catalogTerm.plural}
					</span>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						setSearchVisible((v) => !v)
						if (!searchVisible) {
							setTimeout(() => searchInputRef.current?.focus(), 0)
						} else {
							setSearchQuery("")
						}
					}}
					title={searchVisible ? "Hide filter" : "Filter (or press /)"}
					aria-label={`Toggle ${catalogTerm.singular} filter`}
					aria-pressed={searchVisible}
					style={{
						background: "none",
						border: "none",
						color: searchVisible ? "var(--accent)" : "var(--text-muted)",
						cursor: "pointer",
						padding: "0 4px",
						fontSize: 12,
					}}
				>
					🔍
				</button>
				{provider.listRecentQueries && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							setShowHistory(true)
						}}
						title="Query history"
						aria-label="Show query history"
						style={{
							background: "none",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							padding: "0 4px",
							fontSize: 12,
						}}
					>
						📜
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						refresh()
					}}
					title="Refresh"
					aria-label="Refresh"
					style={{
						background: "none",
						border: "none",
						color: "var(--text-muted)",
						cursor: "pointer",
						padding: "0 4px",
						fontSize: 12,
					}}
				>
					↻
				</button>
			</div>

			{sectionExpanded && (
				<>
					{contextChips.length > 0 && (
						<ContextStrip
							chips={contextChips}
							provider={provider}
							host={host}
							onEdit={
								provider.onEditConnection
									? () => provider.onEditConnection!(host)
									: undefined
							}
						/>
					)}

					{/* Search input — hidden by default; toggled via 🔍 button or "/" */}
					{searchVisible && (
						<div
							style={{
								margin: "0 8px 6px",
								position: "relative",
							}}
						>
							<input
								ref={searchInputRef}
								type="text"
								placeholder={`Filter loaded ${catalogTerm.plural} / schemas / tables…`}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										if (searchQuery) {
											setSearchQuery("")
										} else {
											setSearchVisible(false)
											searchInputRef.current?.blur()
										}
									}
								}}
								aria-label={`Search loaded ${catalogTerm.plural}, schemas, and tables`}
								style={{
									width: "100%",
									padding: "5px 26px 5px 8px",
									fontSize: 12,
									background: "var(--bg-secondary)",
									border: "1px solid var(--border)",
									borderRadius: 4,
									color: "var(--text-primary)",
									outline: "none",
								}}
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									title="Clear search"
									aria-label="Clear search"
									style={{
										position: "absolute",
										right: 4,
										top: "50%",
										transform: "translateY(-50%)",
										background: "none",
										border: "none",
										color: "var(--text-muted)",
										cursor: "pointer",
										fontSize: 14,
										padding: "0 4px",
									}}
								>
									×
								</button>
							)}
						</div>
					)}

					<div style={{ padding: "2px 0 0 4px" }}>
						{catalogs.status === "loading" && (
							<NodeRow indent={0} muted>
								Loading {catalogTerm.plural}…
							</NodeRow>
						)}
						{catalogs.status === "error" && (
							<NodeRow indent={0} muted>
								⚠️ {catalogs.error}
							</NodeRow>
						)}
						{catalogs.status === "loaded" &&
							catalogs.data.length === 0 && (
								<NodeRow indent={0} muted>
									No {catalogTerm.plural} found
								</NodeRow>
							)}
						{catalogs.status === "loaded" &&
							(() => {
								const filtered = searchQuery
									? searchTree(catalogs.data, searchQuery)
									: catalogs.data
								if (searchQuery && filtered.length === 0) {
									return (
										<NodeRow indent={0} muted>
											No matches in loaded data — expand a{" "}
											{catalogTerm.singular} to load more schemas, then
											search again.
										</NodeRow>
									)
								}
								const pinSet = new Set(pinnedIds)
								// When searching, suppress the pinned/unpinned split — the
								// flat filtered list is more useful for navigation.
								const showPinnedSection = !searchQuery
								const pinned = showPinnedSection
									? filtered.filter((c) => pinSet.has(c.info.id))
									: []
								const unpinned = showPinnedSection
									? filtered.filter((c) => !pinSet.has(c.info.id))
									: filtered
								const renderRow = (cat: CatalogNode) => (
									<CatalogRow
										key={cat.info.id}
										node={cat}
										provider={provider}
										host={host}
										isPinned={pinSet.has(cat.info.id)}
										onPin={() => {
											provider.pinCatalog?.(cat.info.id)
											refreshPinned()
										}}
										onUnpin={() => {
											provider.unpinCatalog?.(cat.info.id)
											refreshPinned()
										}}
										onToggle={() => toggleCatalog(cat.info.id)}
										onSchemaToggle={(schemaId) =>
											toggleSchema(cat.info.id, schemaId)
										}
										onTableClick={handleTableClick}
										onTableDragStart={handleTableDragStart}
										onColumnDragStart={handleColumnDragStart}
										onContextMenu={showContextMenu}
									/>
								)
								return (
									<>
										{pinned.length > 0 && (
											<>
												<div
													style={{
														padding: "6px 12px 2px",
														fontSize: 10,
														color: "var(--text-muted)",
														textTransform: "uppercase",
														letterSpacing: 0.5,
														fontWeight: 600,
													}}
												>
													📌 Pinned
												</div>
												{pinned.map(renderRow)}
												<div
													style={{
														borderTop: "1px solid var(--border)",
														margin: "4px 8px",
													}}
												/>
											</>
										)}
										{unpinned.map(renderRow)}
									</>
								)
							})()}
					</div>
				</>
			)}

			{contextMenu && (
				<ContextMenuPopover
					x={contextMenu.x}
					y={contextMenu.y}
					actions={contextMenu.actions}
					onClose={() => setContextMenu(null)}
				/>
			)}

			{showHistory && provider.listRecentQueries && (
				<QueryHistoryModal
					provider={provider}
					host={host}
					onClose={() => setShowHistory(false)}
				/>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Catalog row + recursion
// ---------------------------------------------------------------------------

interface CatalogRowProps {
	node: CatalogNode
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	isPinned?: boolean
	onPin?: () => void
	onUnpin?: () => void
	onToggle: () => void
	onSchemaToggle: (schemaId: string) => void
	onTableClick: (
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onTableDragStart: (
		e: React.DragEvent,
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onColumnDragStart: (e: React.DragEvent, columnName: string) => void
	onContextMenu: (e: React.MouseEvent, actions: NodeAction[]) => void
}

function CatalogRow(props: CatalogRowProps) {
	const { node, provider, host, isPinned, onPin, onUnpin } = props
	const baseActions = useMemo(
		() => provider.getCatalogActions?.({ catalog: node.info }, host) ?? [],
		[provider, node.info, host],
	)
	const actions = useMemo(() => {
		const supportsPinning = !!provider.pinCatalog && !!provider.unpinCatalog
		if (!supportsPinning) return baseActions
		const pinAction: NodeAction = isPinned
			? {
					id: "unpin",
					label: "Unpin from top",
					icon: "📌",
					onSelect: () => onUnpin?.(),
				}
			: {
					id: "pin",
					label: "Pin to top",
					icon: "📌",
					onSelect: () => onPin?.(),
				}
		const sep: NodeAction = {
			id: "pin-sep",
			label: "",
			separator: true,
			onSelect: () => {},
		}
		return baseActions.length > 0
			? [pinAction, sep, ...baseActions]
			: [pinAction]
	}, [baseActions, isPinned, provider.pinCatalog, provider.unpinCatalog, onPin, onUnpin])

	return (
		<>
			<NodeRow
				indent={0}
				icon="🗄"
				onClick={props.onToggle}
				onContextMenu={(e) => props.onContextMenu(e, actions)}
				suffix={node.schemas.status === "loading" ? <Spinner /> : null}
			>
				<Chevron expanded={node.expanded} />
				<span>{node.info.name}</span>
				{isPinned && (
					<span
						aria-hidden="true"
						title="Pinned"
						style={{
							fontSize: 10,
							marginLeft: 6,
							opacity: 0.7,
						}}
					>
						📌
					</span>
				)}
			</NodeRow>
			{node.expanded && (
				<>
					{node.schemas.status === "loading" && (
						<NodeRow indent={1} muted>
							Loading schemas…
						</NodeRow>
					)}
					{node.schemas.status === "error" && (
						<PrivilegeErrorRow
							indent={1}
							error={node.schemas.error}
							help={node.schemas.help}
							host={host}
						/>
					)}
					{node.schemas.status === "loaded" &&
						node.schemas.data.length === 0 && (
							<NodeRow indent={1} muted>
								No schemas
							</NodeRow>
						)}
					{node.schemas.status === "loaded" &&
						node.schemas.data.map((schema) => (
							<SchemaRow
								key={schema.info.id}
								catalogName={node.info.name}
								schema={schema}
								provider={provider}
								host={host}
								onToggle={() => props.onSchemaToggle(schema.info.id)}
								onTableClick={props.onTableClick}
								onTableDragStart={props.onTableDragStart}
								onColumnDragStart={props.onColumnDragStart}
								onContextMenu={props.onContextMenu}
							/>
						))}
				</>
			)}
		</>
	)
}

interface SchemaRowProps {
	catalogName: string
	schema: SchemaNode
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	onToggle: () => void
	onTableClick: (
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onTableDragStart: (
		e: React.DragEvent,
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onColumnDragStart: (e: React.DragEvent, columnName: string) => void
	onContextMenu: (e: React.MouseEvent, actions: NodeAction[]) => void
}

function SchemaRow(props: SchemaRowProps) {
	const { catalogName, schema, provider, host } = props
	const actions = useMemo(
		() =>
			provider.getSchemaActions?.(
				{ catalog: catalogName, schema: schema.info },
				host,
			) ?? [],
		[provider, catalogName, schema.info, host],
	)

	return (
		<>
			<NodeRow
				indent={1}
				icon="📁"
				onClick={props.onToggle}
				onContextMenu={(e) => props.onContextMenu(e, actions)}
				suffix={schema.tables.status === "loading" ? <Spinner /> : null}
			>
				<Chevron expanded={schema.expanded} />
				<span>{schema.info.name}</span>
			</NodeRow>
			{schema.expanded && (
				<>
					{schema.tables.status === "loading" && (
						<NodeRow indent={2} muted>
							Loading objects…
						</NodeRow>
					)}
					{schema.tables.status === "error" && (
						<NodeRow indent={2} muted>
							⚠️ {schema.tables.error}
						</NodeRow>
					)}
					{schema.tables.status === "loaded" &&
						schema.tables.data.length === 0 && (
							<NodeRow indent={2} muted>
								No tables or views
							</NodeRow>
						)}
					{schema.tables.status === "loaded" &&
						schema.tables.data.map((t) => (
							<TableRow
								key={`${t.type}:${t.id}`}
								catalogName={catalogName}
								schemaName={schema.info.name}
								table={t}
								provider={provider}
								host={host}
								onTableClick={props.onTableClick}
								onTableDragStart={props.onTableDragStart}
								onColumnDragStart={props.onColumnDragStart}
								onContextMenu={props.onContextMenu}
							/>
						))}
				</>
			)}
		</>
	)
}

/**
 * Returns onClick + onDoubleClick handlers that disambiguate a single click
 * from a double-click. Without this, the browser fires onClick twice before
 * onDoubleClick on a double-click, so the single-click action runs once or
 * twice before the double-click action lands. The single-click action is
 * deferred ~SINGLE_DELAY_MS so a follow-up dblclick can cancel it.
 *
 * Trade-off: ~220ms latency on single click. That's below the perception
 * threshold for "feels sluggish" (~250ms) and below the OS dblclick window
 * (typically 500ms), which is the constraint that matters.
 */
const SINGLE_CLICK_DELAY_MS = 220
function useClickOrDoubleClick(
	onSingle: () => void,
	onDouble: () => void,
): { onClick: () => void; onDoubleClick: () => void } {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		},
		[],
	)
	return {
		onClick: () => {
			if (timerRef.current) return // a click is already pending
			timerRef.current = setTimeout(() => {
				timerRef.current = null
				onSingle()
			}, SINGLE_CLICK_DELAY_MS)
		},
		onDoubleClick: () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current)
				timerRef.current = null
			}
			onDouble()
		},
	}
}

interface TableRowProps {
	catalogName: string
	schemaName: string
	table: TableMetadata
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	onTableClick: (
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onTableDragStart: (
		e: React.DragEvent,
		catalog: string,
		schema: string,
		table: TableMetadata,
	) => void
	onColumnDragStart: (e: React.DragEvent, columnName: string) => void
	onContextMenu: (e: React.MouseEvent, actions: NodeAction[]) => void
}

function TableRow(props: TableRowProps) {
	const { catalogName, schemaName, table, provider, host } = props
	const [expanded, setExpanded] = useState(false)
	const [columns, setColumns] = useState<
		LoadState<NonNullable<TableMetadata["columns"]>>
	>(
		// Seed with columns already on TableMetadata if listTables provided them.
		table.columns?.length
			? { status: "loaded", data: table.columns }
			: { status: "idle" },
	)

	const actions = useMemo(
		() =>
			provider.getTableActions?.(
				{ catalog: catalogName, schema: schemaName, table },
				host,
			) ?? [],
		[provider, catalogName, schemaName, table, host],
	)

	const toggleExpand = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation()
			const next = !expanded
			setExpanded(next)
			if (!next) return
			if (columns.status === "loaded" || columns.status === "loading") return
			setColumns({ status: "loading" })
			try {
				const meta = await provider.getTableMetadata(
					catalogName,
					schemaName,
					table.name,
				)
				setColumns({
					status: "loaded",
					data: meta.columns ?? [],
				})
			} catch (err) {
				setColumns({
					status: "error",
					error:
						err instanceof Error ? err.message : "Failed to load columns",
				})
			}
		},
		[expanded, columns.status, provider, catalogName, schemaName, table.name],
	)

	const fqn = provider.qualifyName(catalogName, schemaName, table.name)

	// Single-click expands columns; double-click inserts SELECT.
	// Disambiguated via setTimeout so the browser's two clicks during a
	// double-click don't fire the expand toggle in between.
	const clickHandlers = useClickOrDoubleClick(
		() => {
			void toggleExpand({ stopPropagation: () => {} } as React.MouseEvent)
		},
		() => props.onTableClick(catalogName, schemaName, table),
	)

	return (
		<>
			<NodeRow
				indent={2}
				icon={table.type === "view" ? "👁" : "▦"}
				onClick={clickHandlers.onClick}
				onDoubleClick={clickHandlers.onDoubleClick}
				onContextMenu={(e) => props.onContextMenu(e, actions)}
				draggable
				onDragStart={(e) =>
					props.onTableDragStart(e, catalogName, schemaName, table)
				}
				title={`${fqn} — click to expand · double-click to insert SELECT · drag to editor · right-click for more`}
				prefix={
					<button
						type="button"
						onClick={toggleExpand}
						aria-label={expanded ? "Collapse columns" : "Show columns"}
						title={expanded ? "Hide columns" : "Show columns"}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: 0,
							color: "var(--text-muted)",
							display: "inline-flex",
							alignItems: "center",
						}}
					>
						<Chevron expanded={expanded} />
					</button>
				}
			>
				<span>{table.name}</span>
				{table.type && table.type !== "table" && (
					<span
						style={{
							fontSize: 10,
							color: "var(--text-muted)",
							marginLeft: 6,
							textTransform: "uppercase",
						}}
					>
						{table.type}
					</span>
				)}
			</NodeRow>
			{expanded && (
				<>
					{columns.status === "loading" && (
						<NodeRow indent={3} muted>
							Loading columns…
						</NodeRow>
					)}
					{columns.status === "error" && (
						<NodeRow indent={3} muted>
							⚠️ {columns.error}
						</NodeRow>
					)}
					{columns.status === "loaded" && columns.data.length === 0 && (
						<NodeRow indent={3} muted>
							No columns
						</NodeRow>
					)}
					{columns.status === "loaded" &&
						columns.data.map((col: NonNullable<TableMetadata["columns"]>[number]) => (
							<ColumnRow
								key={col.name}
								column={col}
								qualifiedName={`${fqn}.${provider.qualifyColumn(col.name)}`}
								onDragStart={(e) =>
									props.onColumnDragStart(e, col.name)
								}
								onDoubleClick={() =>
									host.insertIntoEditor(provider.qualifyColumn(col.name))
								}
								onCopyName={async () => {
									await host.copyToClipboard(col.name)
									host.showToast?.("Column name copied", "success")
								}}
								onCopyQualified={async () => {
									await host.copyToClipboard(
										`${fqn}.${provider.qualifyColumn(col.name)}`,
									)
									host.showToast?.("Qualified name copied", "success")
								}}
								onContextMenu={(e) =>
									props.onContextMenu(e, [
										{
											id: "insert-name",
											label: "Insert column name",
											icon: "▪",
											onSelect: () =>
												host.insertIntoEditor(
													provider.qualifyColumn(col.name),
												),
										},
										{
											id: "copy-name",
											label: "Copy column name",
											icon: "📋",
											onSelect: async () => {
												await host.copyToClipboard(col.name)
												host.showToast?.("Copied", "success")
											},
										},
										{
											id: "copy-qualified",
											label: "Copy fully-qualified name",
											icon: "📎",
											onSelect: async () => {
												await host.copyToClipboard(
													`${fqn}.${provider.qualifyColumn(col.name)}`,
												)
												host.showToast?.("Copied", "success")
											},
										},
									])
								}
							/>
						))}
				</>
			)}
		</>
	)
}

function ColumnRow(props: {
	column: NonNullable<TableMetadata["columns"]>[number]
	qualifiedName: string
	/** Double-click handler — inserts the qualified column name. */
	onDoubleClick: () => void
	onDragStart: (e: React.DragEvent) => void
	onCopyName: () => void | Promise<void>
	onCopyQualified: () => void | Promise<void>
	onContextMenu: (e: React.MouseEvent) => void
}) {
	const { column } = props
	const tooltip = `${props.qualifiedName} · ${column.type}${
		column.nullable === false ? " · NOT NULL" : ""
	}${column.comment ? ` · ${column.comment}` : ""} — double-click to insert`
	return (
		<NodeRow
			indent={3}
			icon="▪"
			onDoubleClick={props.onDoubleClick}
			onContextMenu={props.onContextMenu}
			draggable
			onDragStart={props.onDragStart}
			title={tooltip}
		>
			<span style={{ color: "var(--text-primary)" }}>{column.name}</span>
			<span
				style={{
					marginLeft: 8,
					color: "var(--text-muted)",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: 11,
				}}
			>
				{column.type}
			</span>
		</NodeRow>
	)
}

// ---------------------------------------------------------------------------
// Generic UI bits
// ---------------------------------------------------------------------------

interface NodeRowProps {
	indent: number
	icon?: string
	/** Optional element rendered before the icon (e.g. a chevron toggle). */
	prefix?: React.ReactNode
	muted?: boolean
	suffix?: React.ReactNode
	onClick?: () => void
	onDoubleClick?: () => void
	onContextMenu?: (e: React.MouseEvent) => void
	onDragStart?: (e: React.DragEvent) => void
	draggable?: boolean
	title?: string
	children: React.ReactNode
}

function NodeRow(props: NodeRowProps) {
	const ref = useRef<HTMLDivElement>(null)
	return (
		<div
			ref={ref}
			onClick={props.onClick}
			onDoubleClick={props.onDoubleClick}
			onContextMenu={props.onContextMenu}
			onDragStart={props.onDragStart}
			draggable={props.draggable}
			title={props.title}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "3px 12px 3px ",
				paddingLeft: 12 + props.indent * 14,
				fontSize: 13,
				color: props.muted ? "var(--text-muted)" : "var(--text-primary)",
				cursor: props.onClick || props.onDoubleClick ? "pointer" : "default",
				userSelect: "none",
				lineHeight: 1.4,
			}}
			onMouseEnter={(e) => {
				if (props.onClick) {
					e.currentTarget.style.background = "var(--bg-secondary)"
				}
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent"
			}}
		>
			{props.prefix}
			{props.icon && (
				<span style={{ flexShrink: 0, fontSize: 12 }}>{props.icon}</span>
			)}
			<span
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					flex: 1,
					minWidth: 0,
				}}
			>
				{props.children}
			</span>
			{props.suffix}
		</div>
	)
}

/**
 * Compact privilege-error row. When the provider returns a `PrivilegeHelp`,
 * we render a 🔒 + short title with the full error in a tooltip and a
 * one-click "Copy GRANT" button. Falls back to the raw error otherwise.
 */
function PrivilegeErrorRow({
	indent,
	error,
	help,
	host,
}: {
	indent: number
	error: string
	help: import("./types").PrivilegeHelp | null | undefined
	host: CatalogProviderHostHandlers
}) {
	if (!help) {
		// No structured help — show a single muted line, full text in tooltip.
		return (
			<NodeRow indent={indent} muted>
				<span title={error}>
					⚠️ {truncate(error, 80)}
				</span>
			</NodeRow>
		)
	}
	const firstCommand = help.commands[0]
	return (
		<NodeRow
			indent={indent}
			muted
			suffix={
				firstCommand && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							host.copyToClipboard(firstCommand.sql)
							host.showToast?.("GRANT copied — run as ACCOUNTADMIN", "success")
						}}
						title={`Copy: ${firstCommand.sql}`}
						style={{
							padding: "1px 6px",
							background: "var(--bg-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 3,
							color: "var(--text-secondary)",
							fontSize: 10,
							cursor: "pointer",
						}}
					>
						📋 GRANT
					</button>
				)
			}
		>
			<span title={`${help.body}\n\n${error}`}>
				🔒 {help.title}
			</span>
		</NodeRow>
	)
}

function truncate(text: string, max: number): string {
	const t = text.replace(/\s+/g, " ").trim()
	return t.length > max ? `${t.slice(0, max)}…` : t
}

function Chevron({ expanded }: { expanded: boolean }) {
	return (
		<span
			style={{
				display: "inline-block",
				transition: "transform 0.15s",
				transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
				fontSize: 9,
				color: "var(--text-muted)",
				width: 10,
				flexShrink: 0,
			}}
		>
			▶
		</span>
	)
}

function Spinner() {
	return (
		<span
			role="status"
			aria-label="loading"
			style={{
				display: "inline-block",
				width: 10,
				height: 10,
				border: "1.5px solid var(--border)",
				borderTopColor: "var(--accent)",
				borderRadius: "50%",
				animation: "catexp-spin 0.8s linear infinite",
				flexShrink: 0,
			}}
		>
			<style>{`@keyframes catexp-spin { to { transform: rotate(360deg); } }`}</style>
		</span>
	)
}

// ---------------------------------------------------------------------------
// Context strip + chips
// ---------------------------------------------------------------------------

function ContextStrip({
	chips,
	provider,
	host,
	onEdit,
}: {
	chips: SessionContextChip[]
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	onEdit?: () => void
}) {
	return (
		<div
			style={{
				margin: "4px 8px 8px",
				padding: "6px 10px",
				background: "var(--bg-primary)",
				border: "1px solid var(--border)",
				borderRadius: 6,
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: 11,
				color: "var(--text-secondary)",
				flexWrap: "nowrap",
				overflow: "hidden",
				minWidth: 0,
			}}
		>
			{chips.map((chip) => (
				<SessionChipRenderer
					key={chip.id ?? chip.label}
					chip={chip}
					provider={provider}
					host={host}
					currentDatabase={
						chips.find((c) => c.id === "catalog")?.value
					}
				/>
			))}
			{onEdit && (
				<button
					onClick={onEdit}
					title="Edit connection settings"
					aria-label="Edit connection"
					style={{
						marginLeft: "auto",
						background: "none",
						border: "none",
						cursor: "pointer",
						color: "var(--text-muted)",
						fontSize: 12,
						padding: "2px 4px",
					}}
				>
					✏︎
				</button>
			)}
		</div>
	)
}


// ---------------------------------------------------------------------------
// Context menu popover
// ---------------------------------------------------------------------------

function ContextMenuPopover(props: {
	x: number
	y: number
	actions: NodeAction[]
	onClose: () => void
}) {
	return (
		<div
			role="menu"
			style={{
				position: "fixed",
				left: props.x,
				top: props.y,
				background: "var(--bg-primary)",
				border: "1px solid var(--border)",
				borderRadius: 6,
				boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
				padding: "4px 0",
				minWidth: 240,
				maxWidth: 320,
				zIndex: 10001,
				fontSize: 13,
			}}
			onClick={(e) => e.stopPropagation()}
		>
			{props.actions.map((action) =>
				action.separator ? (
					<div
						key={action.id}
						style={{
							height: 1,
							background: "var(--border)",
							margin: "4px 0",
						}}
					/>
				) : (
					<button
						key={action.id}
						type="button"
						onClick={async () => {
							props.onClose()
							try {
								await action.onSelect()
							} catch (err) {
								console.error(err)
							}
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							width: "100%",
							padding: "6px 12px",
							background: "transparent",
							border: "none",
							cursor: "pointer",
							color: "var(--text-primary)",
							textAlign: "left",
							fontSize: 13,
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--bg-secondary)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent"
						}}
					>
						{action.icon && (
							<span style={{ width: 16, fontSize: 12 }}>{action.icon}</span>
						)}
						<span style={{ flex: 1 }}>{action.label}</span>
						{action.shortcut && (
							<span
								style={{
									color: "var(--text-muted)",
									fontSize: 11,
									fontFamily:
										"ui-monospace, SFMono-Regular, Menlo, monospace",
								}}
							>
								{action.shortcut}
							</span>
						)}
					</button>
				),
			)}
		</div>
	)
}
