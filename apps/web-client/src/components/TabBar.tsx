import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	type AutocompleteMode,
	useAutocompleteMode,
	useSettingsStore,
} from "../stores/settingsStore";
import { LightbulbIcon } from "./Icons";

export interface QueryTab {
	id: string;
	name: string;
	query: string;
	isDirty: boolean;
	filePath?: string;
	hasWritePermission?: boolean;
}

interface TabBarProps {
	tabs: QueryTab[];
	activeTabId: string;
	editorHasFocus?: boolean;
	onTabChange: (tabId: string) => void;
	onTabClose: (tabId: string) => void;
	onTabAdd: () => void;
	onTabRename: (tabId: string, newName: string) => void;
	onToggleExamples?: () => void;
	examplesOpen?: boolean;
	showExamplesButton?: boolean;
	className?: string;
	canAddTab?: boolean;
	maxTabs?: number;
}

export default function TabBar({
	tabs,
	activeTabId,
	editorHasFocus = false,
	onTabChange,
	onTabClose,
	onTabAdd,
	onTabRename,
	onToggleExamples,
	examplesOpen = false,
	showExamplesButton = true,
	className,
	canAddTab = true,
	maxTabs = 10,
}: TabBarProps) {
	const [editingTabId, setEditingTabId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const autocompleteMode = useAutocompleteMode();

	useEffect(() => {
		if (editingTabId && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editingTabId]);

	const handleDoubleClick = (tab: QueryTab) => {
		setEditingTabId(tab.id);
		setEditingName(tab.name);
	};

	const handleRenameSubmit = () => {
		if (editingTabId && editingName.trim()) {
			onTabRename(editingTabId, editingName.trim());
		}
		setEditingTabId(null);
	};

	const handleRenameKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleRenameSubmit();
		} else if (e.key === "Escape") {
			setEditingTabId(null);
		}
	};

	return (
		<div className={`tab-bar ${className || ""}`}>
			<div className="tab-list" role="tablist" aria-label="Query tabs">
				{tabs.map((tab) => (
					<div
						key={tab.id}
						role="tab"
						data-testid="tab"
						data-active={tab.id === activeTabId}
						aria-selected={tab.id === activeTabId}
						aria-controls={`tabpanel-${tab.id}`}
						tabIndex={tab.id === activeTabId ? 0 : -1}
						className={`tab ${tab.id === activeTabId ? "active" : ""} ${tab.filePath ? "file-backed" : ""} ${tab.id === activeTabId && editorHasFocus ? "editing" : ""}`}
						onClick={() => onTabChange(tab.id)}
					>
						{editingTabId === tab.id ? (
							<input
								ref={inputRef}
								type="text"
								className="tab-name-input"
								aria-label={`Rename tab ${tab.name}`}
								value={editingName}
								onChange={(e) => setEditingName(e.target.value)}
								onBlur={handleRenameSubmit}
								onKeyDown={handleRenameKeyDown}
							/>
						) : (
							<span
								className="tab-name"
								onDoubleClick={() => handleDoubleClick(tab)}
								title={
									tab.filePath
										? `${tab.filePath}${tab.isDirty ? " (unsaved changes)" : ""}${
												tab.hasWritePermission === false
													? " - Permission required to save"
													: tab.hasWritePermission === true
														? " - Write permission granted"
														: ""
											}`
										: tab.isDirty
											? "Unsaved query"
											: "New query"
								}
							>
								{tab.filePath && tab.isDirty && (
									<span className="unsaved-dot" title="Unsaved changes"></span>
								)}
								{tab.filePath && <span style={{ marginRight: "4px" }}>📄</span>}
								{tab.filePath && tab.hasWritePermission === false && (
									<span
										style={{ marginRight: "4px" }}
										title="Write permission not granted"
									>
										🔒
									</span>
								)}
								{tab.filePath && tab.hasWritePermission === true && (
									<span
										style={{ marginRight: "4px", color: "var(--success)" }}
										title="Write permission granted"
									>
										✓
									</span>
								)}
								{tab.name}
								{tab.isDirty && !tab.filePath && (
									<span className="dirty-indicator">*</span>
								)}
							</span>
						)}
						{tabs.length > 1 && (
							<button
								className="tab-close"
								data-testid="tab-close"
								onClick={(e) => {
									e.stopPropagation();
									onTabClose(tab.id);
								}}
								title="Close tab"
								aria-label={`Close ${tab.name} tab${tab.isDirty ? " (has unsaved changes)" : ""}`}
							>
								<span aria-hidden="true">✕</span>
							</button>
						)}
					</div>
				))}
				<button
					className="tab-add"
					data-testid="tab-add"
					onClick={onTabAdd}
					disabled={!canAddTab}
					title={
						canAddTab
							? "New query tab (Cmd+T)"
							: `Maximum ${maxTabs} tabs allowed`
					}
					aria-label={canAddTab ? "Add new query tab (Ctrl+T or Cmd+T)" : `Maximum ${maxTabs} tabs allowed`}
				>
					<span aria-hidden="true">+</span>
				</button>

				<span
					className="tab-hint"
					style={{
						marginLeft: "12px",
						fontSize: "11px",
						color: "var(--text-muted)",
						whiteSpace: "nowrap",
						padding: "4px 8px",
						border: "1px solid var(--border)",
						borderRadius: "999px",
						lineHeight: 1.2,
					}}
					title="Press Esc twice to exit editor focus"
				>
					Esc Esc: leave editor
				</span>

				<AutocompleteModeChip mode={autocompleteMode} />

				{onToggleExamples && showExamplesButton && (
					<button
						className={`tab-examples ${examplesOpen ? "active" : ""}`}
						type="button"
						onClick={onToggleExamples}
						title="SQL Examples - DuckDB tutorials, basics, remote files & BigQuery queries"
						aria-pressed={examplesOpen}
						aria-label="SQL Examples - DuckDB tutorials, basics, remote files & BigQuery queries"
					>
						<LightbulbIcon size={16} />
					</button>
				)}

				</div>
		</div>
	);
}

/**
 * Click-to-change chip showing the active autocomplete mode. Opens a
 * popover with Off / Lite / Full options. Color-coded by capability:
 *   - off:  muted (autocomplete disabled, only Monaco's word match)
 *   - lite: blue accent (keywords + dialect functions + table names)
 *   - full: green accent (dot completion + alias resolution + columns)
 */
function AutocompleteModeChip({ mode }: { mode: AutocompleteMode }) {
	const [open, setOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
		null,
	);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const setMode = useSettingsStore((s) => s.setAutocompleteMode);

	// Open: compute viewport coordinates so the menu can be `position: fixed`
	// and escape the .tab-list parent which has overflow-x: auto.
	const toggle = () => {
		if (!open && buttonRef.current) {
			const r = buttonRef.current.getBoundingClientRect();
			setMenuPos({ top: r.bottom + 4, left: r.left });
		}
		setOpen((v) => !v);
	};

	// Close on outside click or Escape.
	useEffect(() => {
		if (!open) return;
		const onDocMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				!buttonRef.current?.contains(target) &&
				!menuRef.current?.contains(target)
			) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDocMouseDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDocMouseDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const accent = (m: AutocompleteMode) =>
		m === "off"
			? "var(--text-muted)"
			: m === "lite"
				? "var(--accent, #4a8eff)"
				: "var(--success, #44d27a)";

	const description = (m: AutocompleteMode) =>
		m === "off"
			? "Monaco word-match only"
			: m === "lite"
				? "Keywords + dialect functions + tables"
				: "Everything: dot completion, alias resolution, columns";

	const modeName = mode === "off" ? "Off" : mode === "lite" ? "Lite" : "Full";
	const label = `Autocomplete: ${modeName}`;
	const accentColor = accent(mode);
	const tooltip = `Autocomplete is ${modeName.toLowerCase()} (${description(mode)}). Click to change.`;

	return (
		<div
			className="tab-autocomplete-mode"
			data-mode={mode}
			style={{ marginLeft: "8px", display: "inline-block" }}
		>
			<button
				ref={buttonRef}
				type="button"
				onClick={toggle}
				aria-haspopup="menu"
				aria-expanded={open}
				title={tooltip}
				style={{
					fontSize: "11px",
					color: accentColor,
					background: "transparent",
					whiteSpace: "nowrap",
					padding: "4px 8px",
					border: `1px solid ${accentColor}`,
					borderRadius: "999px",
					lineHeight: 1.2,
					fontWeight: 500,
					opacity: mode === "off" ? 0.7 : 1,
					cursor: "pointer",
				}}
			>
				{label}
			</button>
			{open && menuPos && (
				<div
					ref={menuRef}
					role="menu"
					aria-label="Autocomplete mode"
					style={{
						position: "fixed",
						top: menuPos.top,
						left: menuPos.left,
						minWidth: "240px",
						background: "var(--bg-elevated, #1e1e1e)",
						border: "1px solid var(--border)",
						borderRadius: "8px",
						boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
						padding: "4px",
						zIndex: 9999,
					}}
				>
					{(["off", "lite", "full"] as AutocompleteMode[]).map((m) => {
						const isActive = m === mode;
						return (
							<button
								key={m}
								type="button"
								role="menuitemradio"
								aria-checked={isActive}
								onClick={() => {
									setMode(m);
									setOpen(false);
								}}
								style={{
									width: "100%",
									textAlign: "left",
									background: isActive
										? "var(--bg-hover, rgba(255,255,255,0.06))"
										: "transparent",
									border: "none",
									padding: "8px 10px",
									borderRadius: "4px",
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: "8px",
									color: "var(--text-primary)",
									fontSize: "12px",
								}}
								onMouseEnter={(e) => {
									if (!isActive)
										e.currentTarget.style.background =
											"var(--bg-hover, rgba(255,255,255,0.06))";
								}}
								onMouseLeave={(e) => {
									if (!isActive) e.currentTarget.style.background = "transparent";
								}}
							>
								<span
									aria-hidden="true"
									style={{
										width: "8px",
										height: "8px",
										borderRadius: "50%",
										background: accent(m),
										flexShrink: 0,
									}}
								/>
								<span style={{ flex: 1 }}>
									<div style={{ fontWeight: isActive ? 600 : 400 }}>
										{m === "off" ? "Off" : m === "lite" ? "Lite" : "Full"}
									</div>
									<div
										style={{
											fontSize: "11px",
											color: "var(--text-muted)",
											marginTop: "2px",
										}}
									>
										{description(m)}
									</div>
								</span>
								{isActive && (
									<span aria-hidden="true" style={{ color: accent(m) }}>
										✓
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
