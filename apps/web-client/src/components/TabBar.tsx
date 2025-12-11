import type React from "react";
import { useEffect, useRef, useState } from "react";
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
