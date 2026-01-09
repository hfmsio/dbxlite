/**
 * ServerSettings - DuckDB server configuration tab
 *
 * Shows extensions, secrets, settings, and variables.
 * Only available in HTTP (Server) mode.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMode } from "../../hooks/useMode";
import { useServerInfo } from "../../hooks/useServerInfo";
import { useToast } from "../Toast";
import { RefreshIcon, SearchIcon, InfoIcon } from "../Icons";
import type {
	DuckDBExtension,
	DuckDBSecret,
	DuckDBSetting,
	DuckDBVariable,
	ExtensionAction,
	SettingMeta,
} from "../../types/server-info";

// Setting metadata for UI controls and helpful tips
const SETTING_META: Record<string, SettingMeta> = {
	threads: {
		tip: "Number of CPU threads for parallel query execution. Higher values improve performance for complex queries but use more system resources.",
		editable: true,
		type: "number",
		min: 1,
		max: 128,
	},
	memory_limit: {
		tip: "Maximum memory DuckDB can use. Format: number + unit (e.g., '4GB', '512MB'). Increase for large datasets, decrease if system runs low on memory.",
		editable: true,
		type: "select",
		options: ["512MB", "1GB", "2GB", "4GB", "8GB", "16GB", "32GB"],
	},
	max_memory: {
		tip: "Alias for memory_limit. Maximum memory available for query processing.",
		editable: true,
		type: "select",
		options: ["512MB", "1GB", "2GB", "4GB", "8GB", "16GB", "32GB"],
	},
	temp_directory: {
		tip: "Directory for temporary files when queries exceed memory. Leave empty for in-memory only (faster but limited by RAM).",
		editable: false,
		type: "text",
	},
	worker_threads: {
		tip: "Number of background worker threads for async operations. Usually set automatically based on CPU cores.",
		editable: true,
		type: "number",
		min: 1,
		max: 64,
	},
	external_threads: {
		tip: "Threads for external operations like file I/O. Increase if loading many files concurrently.",
		editable: true,
		type: "number",
		min: 1,
		max: 32,
	},
	default_order: {
		tip: "Default sort direction for ORDER BY when not specified. ASC = ascending (A-Z, 1-9), DESC = descending (Z-A, 9-1).",
		editable: true,
		type: "select",
		options: ["ASC", "DESC"],
	},
	enable_progress_bar: {
		tip: "Show progress indicator for long-running queries. Useful for monitoring but adds slight overhead.",
		editable: true,
		type: "boolean",
	},
	enable_object_cache: {
		tip: "Cache parsed objects in memory. Improves performance for repeated queries on same data.",
		editable: true,
		type: "boolean",
	},
};

type ServerTabId = "extensions" | "secrets" | "settings" | "variables";

// Extension type derived from install_path
type ExtensionType = "core" | "community";

function getExtensionType(ext: DuckDBExtension): ExtensionType {
	if (ext.install_path === "(BUILT-IN)" || ext.install_path?.includes("BUILT-IN")) {
		return "core";
	}
	return "community";
}

export default function ServerSettings() {
	const { isHttpMode } = useMode();
	const { showToast } = useToast();
	const {
		data,
		isLoading,
		error,
		lastRefreshed,
		actionInProgress,
		fetchServerInfo,
		performExtensionAction,
		updateSetting,
	} = useServerInfo(isHttpMode);

	const [activeTab, setActiveTab] = useState<ServerTabId>("extensions");

	// Fetch data on mount
	useEffect(() => {
		if (isHttpMode) {
			fetchServerInfo();
		}
	}, [isHttpMode, fetchServerInfo]);

	if (!isHttpMode) {
		return (
			<div className="settings-section">
				<div className="server-settings-not-available">
					<InfoIcon size={24} />
					<h3>Server Settings Not Available</h3>
					<p>
						Server settings are only available when connected to a DuckDB server.
						You are currently in WASM mode (browser-based DuckDB).
					</p>
					<p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px" }}>
						To use Server mode, run <code>duckdb -ui</code> locally and connect via the mode indicator.
					</p>
				</div>
			</div>
		);
	}

	const handleExtensionAction = async (
		ext: DuckDBExtension,
		action: ExtensionAction,
	) => {
		const result = await performExtensionAction(ext.extension_name, action);
		if (result.success) {
			showToast(
				`${action === "load" ? "Loaded" : "Installed"} ${ext.extension_name}`,
				"success",
			);
		} else {
			showToast(result.error || `Failed to ${action} extension`, "error");
		}
	};

	const handleSettingUpdate = async (name: string, value: string) => {
		const result = await updateSetting(name, value);
		if (result.success) {
			showToast(`Updated ${name}`, "success");
		} else {
			showToast(result.error || `Failed to update ${name}`, "error");
		}
	};

	const tabs: { id: ServerTabId; label: string; count?: number }[] = [
		{ id: "extensions", label: "Extensions", count: data?.extensions.length },
		{ id: "secrets", label: "Secrets", count: data?.secrets.length },
		{ id: "settings", label: "Settings", count: data?.settings.length },
		{ id: "variables", label: "Variables", count: data?.variables.length },
	];

	return (
		<div className="settings-section server-settings">
			{/* Header with refresh */}
			<div className="server-settings-header">
				<div className="server-settings-status">
					<span className="server-settings-connected">
						<span className="server-dot" />
						Connected to DuckDB Server
					</span>
					{lastRefreshed && (
						<span className="server-settings-updated">
							Updated {lastRefreshed.toLocaleTimeString()}
						</span>
					)}
				</div>
				<button
					onClick={fetchServerInfo}
					disabled={isLoading}
					className="server-settings-refresh"
					title="Refresh server info"
				>
					<RefreshIcon size={14} />
					Refresh
				</button>
			</div>

			{/* Sub-tabs */}
			<div className="server-settings-tabs">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={`server-settings-tab ${activeTab === tab.id ? "active" : ""}`}
					>
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<span className="server-settings-tab-count">{tab.count}</span>
						)}
					</button>
				))}
			</div>

			{/* Content */}
			<div className="server-settings-content">
				{isLoading && !data && (
					<div className="server-settings-loading">
						Loading server information...
					</div>
				)}

				{error && (
					<div className="server-settings-error">
						<span>Error: {error}</span>
						<button onClick={fetchServerInfo}>Retry</button>
					</div>
				)}

				{!isLoading && !error && data && (
					<>
						{activeTab === "extensions" && (
							<ExtensionsPanel
								extensions={data.extensions}
								actionInProgress={actionInProgress}
								onAction={handleExtensionAction}
							/>
						)}
						{activeTab === "secrets" && (
							<SecretsPanel secrets={data.secrets} />
						)}
						{activeTab === "settings" && (
							<SettingsPanel
								settings={data.settings}
								actionInProgress={actionInProgress}
								onUpdate={handleSettingUpdate}
							/>
						)}
						{activeTab === "variables" && (
							<VariablesPanel variables={data.variables} />
						)}
					</>
				)}
			</div>
		</div>
	);
}

// Filter type for extensions
type ExtensionFilter = "all" | "core" | "community";

// Extensions Panel
function ExtensionsPanel({
	extensions,
	actionInProgress,
	onAction,
}: {
	extensions: DuckDBExtension[];
	actionInProgress: string | null;
	onAction: (ext: DuckDBExtension, action: ExtensionAction) => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<ExtensionFilter>("all");

	const filteredExtensions = useMemo(() => {
		return extensions.filter((ext) => {
			if (filter !== "all") {
				const extType = getExtensionType(ext);
				if (extType !== filter) return false;
			}
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				return (
					ext.extension_name.toLowerCase().includes(query) ||
					ext.description?.toLowerCase().includes(query)
				);
			}
			return true;
		});
	}, [extensions, filter, searchQuery]);

	const counts = useMemo(() => {
		const core = extensions.filter((e) => getExtensionType(e) === "core").length;
		const community = extensions.filter((e) => getExtensionType(e) === "community").length;
		return { all: extensions.length, core, community };
	}, [extensions]);

	if (extensions.length === 0) {
		return <div className="server-settings-empty">No extensions found</div>;
	}

	return (
		<div className="extensions-panel">
			<div className="extensions-toolbar">
				<div className="extensions-search">
					<SearchIcon size={14} />
					<input
						type="text"
						placeholder="Search extensions..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					{searchQuery && (
						<button onClick={() => setSearchQuery("")}>×</button>
					)}
				</div>
				<div className="extensions-filters">
					<button
						className={filter === "all" ? "active" : ""}
						onClick={() => setFilter("all")}
					>
						All ({counts.all})
					</button>
					<button
						className={filter === "core" ? "active" : ""}
						onClick={() => setFilter("core")}
					>
						Core ({counts.core})
					</button>
					<button
						className={filter === "community" ? "active" : ""}
						onClick={() => setFilter("community")}
					>
						Community ({counts.community})
					</button>
				</div>
			</div>

			<div className="extensions-table-wrap">
				<table className="server-info-table">
					<thead>
						<tr>
							<th>Extension</th>
							<th>Type</th>
							<th>Status</th>
							<th>Description</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{filteredExtensions.map((ext) => {
							const isActionInProgress = actionInProgress?.includes(ext.extension_name);
							const extType = getExtensionType(ext);
							return (
								<tr key={ext.extension_name}>
									<td className="ext-name">{ext.extension_name}</td>
									<td>
										<span className={`ext-type-badge ${extType}`}>{extType}</span>
									</td>
									<td>
										{ext.loaded ? (
											<span className="server-info-status loaded">Loaded</span>
										) : ext.installed ? (
											<span className="server-info-status installed">Installed</span>
										) : (
											<span className="server-info-status not-installed">Not Installed</span>
										)}
									</td>
									<td className="ext-description">{ext.description || "-"}</td>
									<td className="ext-actions">
										{!ext.loaded && ext.installed && (
											<button
												className="server-info-action-btn load"
												onClick={() => onAction(ext, "load")}
												disabled={!!isActionInProgress}
											>
												{isActionInProgress && actionInProgress?.startsWith("load") ? "..." : "Load"}
											</button>
										)}
										{!ext.installed && (
											<button
												className="server-info-action-btn install"
												onClick={() => onAction(ext, "install")}
												disabled={!!isActionInProgress}
											>
												{isActionInProgress && actionInProgress?.startsWith("install") ? "..." : "Install"}
											</button>
										)}
										{ext.loaded && <span className="ext-active-label">Active</span>}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{filteredExtensions.length === 0 && (
					<div className="server-settings-empty">No extensions match your search</div>
				)}
			</div>
		</div>
	);
}

// Secrets Panel
function SecretsPanel({ secrets }: { secrets: DuckDBSecret[] }) {
	if (secrets.length === 0) {
		return (
			<div className="server-settings-empty">
				No secrets configured. Use CREATE SECRET to add cloud credentials.
			</div>
		);
	}

	return (
		<div className="secrets-panel">
			<table className="server-info-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Provider</th>
						<th>Scope</th>
					</tr>
				</thead>
				<tbody>
					{secrets.map((secret) => (
						<tr key={secret.name}>
							<td style={{ fontFamily: "monospace", fontWeight: 500 }}>{secret.name}</td>
							<td>
								<span className={`server-info-secret-type ${secret.type.toLowerCase()}`}>
									{secret.type}
								</span>
							</td>
							<td>{secret.provider}</td>
							<td style={{ fontFamily: "monospace", fontSize: "11px" }}>{secret.scope || "*"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// Tooltip for settings
function SettingTooltip({
	tip,
	isReadonly,
	anchorRect,
}: {
	tip: string;
	isReadonly: boolean;
	anchorRect: DOMRect;
}) {
	const tooltipStyle: React.CSSProperties = {
		position: "fixed",
		left: anchorRect.right + 12,
		top: anchorRect.top + anchorRect.height / 2,
		transform: "translateY(-50%)",
		zIndex: 10001,
	};

	if (anchorRect.right + 12 + 340 > window.innerWidth) {
		tooltipStyle.left = anchorRect.left - 12 - 340;
	}

	return createPortal(
		<div className="setting-tooltip-portal" style={tooltipStyle}>
			<div className="setting-tooltip-content">{tip}</div>
			{isReadonly && (
				<div className="setting-tooltip-readonly">This setting is read-only</div>
			)}
		</div>,
		document.body,
	);
}

// Settings Panel
function SettingsPanel({
	settings,
	actionInProgress,
	onUpdate,
}: {
	settings: DuckDBSetting[];
	actionInProgress: string | null;
	onUpdate: (name: string, value: string) => void;
}) {
	const [editingValue, setEditingValue] = useState<Record<string, string>>({});
	const [tooltip, setTooltip] = useState<{ name: string; rect: DOMRect } | null>(null);

	if (settings.length === 0) {
		return <div className="server-settings-empty">No settings found</div>;
	}

	const handleValueChange = (name: string, value: string) => {
		setEditingValue((prev) => ({ ...prev, [name]: value }));
	};

	const handleSave = (name: string, currentValue: string) => {
		const newValue = editingValue[name];
		if (newValue !== undefined && newValue !== currentValue) {
			onUpdate(name, newValue);
			setEditingValue((prev) => {
				const next = { ...prev };
				delete next[name];
				return next;
			});
		}
	};

	const handleCancel = (name: string) => {
		setEditingValue((prev) => {
			const next = { ...prev };
			delete next[name];
			return next;
		});
	};

	const renderInput = (setting: DuckDBSetting) => {
		const meta = SETTING_META[setting.name];
		const isUpdating = actionInProgress === `setting:${setting.name}`;
		const currentEditValue = editingValue[setting.name];
		const displayValue = currentEditValue ?? setting.value;
		const hasChanges = currentEditValue !== undefined && currentEditValue !== setting.value;

		if (!meta?.editable) {
			return <span className="setting-value-readonly">{setting.value}</span>;
		}

		if (meta.type === "boolean") {
			return (
				<label className="setting-toggle">
					<input
						type="checkbox"
						checked={displayValue === "true"}
						disabled={isUpdating}
						onChange={(e) => onUpdate(setting.name, e.target.checked ? "true" : "false")}
					/>
					<span className="setting-toggle-slider" />
					<span className="setting-toggle-label">
						{displayValue === "true" ? "Enabled" : "Disabled"}
					</span>
				</label>
			);
		}

		if (meta.type === "select" && meta.options) {
			const currentInOptions = meta.options.includes(setting.value);
			const options = currentInOptions ? meta.options : [setting.value, ...meta.options];

			return (
				<select
					className="setting-select"
					value={displayValue}
					disabled={isUpdating}
					onChange={(e) => onUpdate(setting.name, e.target.value)}
				>
					{options.map((opt) => (
						<option key={opt} value={opt}>{opt}</option>
					))}
				</select>
			);
		}

		if (meta.type === "number") {
			return (
				<div className="setting-number-input">
					<input
						type="number"
						className="setting-input"
						value={displayValue}
						min={meta.min}
						max={meta.max}
						disabled={isUpdating}
						onChange={(e) => handleValueChange(setting.name, e.target.value)}
						onBlur={() => hasChanges && handleSave(setting.name, setting.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && hasChanges) {
								handleSave(setting.name, setting.value);
							} else if (e.key === "Escape") {
								handleCancel(setting.name);
							}
						}}
					/>
					{hasChanges && (
						<div className="setting-input-actions">
							<button
								className="setting-save-btn"
								onClick={() => handleSave(setting.name, setting.value)}
								disabled={isUpdating}
							>
								{isUpdating ? "..." : "Save"}
							</button>
							<button
								className="setting-cancel-btn"
								onClick={() => handleCancel(setting.name)}
								disabled={isUpdating}
							>
								×
							</button>
						</div>
					)}
				</div>
			);
		}

		return <span className="setting-value-readonly">{setting.value}</span>;
	};

	const handleShowTooltip = (name: string, event: React.MouseEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		setTooltip({ name, rect });
	};

	return (
		<div className="settings-panel">
			<div className="settings-header-tip">
				<InfoIcon size={14} />
				<span>Hover over the info icon for details. Changes take effect immediately.</span>
			</div>
			<div className="settings-list">
				{settings.map((setting) => {
					const meta = SETTING_META[setting.name];
					return (
						<div key={setting.name} className="setting-item">
							<div className="setting-name-row">
								<span className="setting-name">{setting.name}</span>
								<div
									className="setting-info-icon"
									onMouseEnter={(e) => handleShowTooltip(setting.name, e)}
									onMouseLeave={() => setTooltip(null)}
								>
									<InfoIcon size={14} />
								</div>
								{!meta?.editable && (
									<span className="setting-readonly-badge">Read-only</span>
								)}
							</div>
							<div className="setting-value-row">{renderInput(setting)}</div>
						</div>
					);
				})}
			</div>
			{tooltip && (
				<SettingTooltip
					tip={SETTING_META[tooltip.name]?.tip || settings.find((s) => s.name === tooltip.name)?.description || "No description"}
					isReadonly={!SETTING_META[tooltip.name]?.editable}
					anchorRect={tooltip.rect}
				/>
			)}
		</div>
	);
}

// Variables Panel
function VariablesPanel({ variables }: { variables: DuckDBVariable[] }) {
	if (variables.length === 0) {
		return (
			<div className="server-settings-empty">
				No session variables. Use SET variable = value to define variables.
			</div>
		);
	}

	return (
		<div className="variables-panel">
			{variables.map((variable) => (
				<div key={variable.name} className="server-info-kv-item">
					<span className="server-info-kv-name">{variable.name}</span>
					<span className="server-info-kv-value">{String(variable.value)}</span>
					<span className="server-info-kv-type">{variable.type}</span>
				</div>
			))}
		</div>
	);
}
