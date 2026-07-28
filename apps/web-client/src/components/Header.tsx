import type { ConnectorType } from "../services/streaming-query-service";
import { useMode } from "../hooks/useMode";
import type { ResultsLayout } from "../stores/settingsStore";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	FolderOpenIcon,
	MaximizeIcon,
	MinimizeIcon,
	PanelBottomIcon,
	PanelHiddenIcon,
	PanelRightIcon,
	PlayIcon,
	SaveIcon,
	SettingsIcon,
	SparklesIcon,
	StopIcon,
} from "./Icons";
import { Logo, Wordmark } from "./Logo";
import ModeIndicator from "./ModeIndicator";
import SnowflakeContextButton from "./SnowflakeContextButton";
import ThemeToggle from "./ThemeToggle";

// Connector accent colors — match CatalogProvider.accentColor where applicable
// and the docs. These render through CSS custom properties so they stay
// theme-aware (themes can override --connector-accent-* if needed).
function connectorAccent(c: ConnectorType): string {
	switch (c) {
		case "duckdb":
			return "var(--connector-color-duckdb, #FFD700)"; // DuckDB yellow
		case "bigquery":
			return "var(--connector-color-bigquery, #4285F4)"; // Google blue
		case "snowflake":
			return "var(--connector-color-snowflake, #29B5E8)"; // Snowflake cyan
		default:
			return "var(--accent)";
	}
}

function connectorIcon(c: ConnectorType): string {
	switch (c) {
		case "duckdb":
			return "🦆";
		case "bigquery":
			return "🔵";
		case "snowflake":
			return "❄️";
		default:
			return "•";
	}
}

function connectorLabel(c: ConnectorType, isHttpMode: boolean): string {
	switch (c) {
		case "duckdb":
			return isHttpMode ? "DuckDB Server" : "DuckDB WASM";
		case "bigquery":
			return "BigQuery";
		case "snowflake":
			return "Snowflake";
		default:
			return c;
	}
}

interface HeaderProps {
	// Status
	initializing: boolean;
	reloadingFiles: boolean;
	initError: string | null;
	filesTotal: number;
	filesCompleted: number;
	currentLoadingFile: string;
	isLoading: boolean;
	isUploadingFiles: boolean;
	isExporting: boolean;
	showLongRunningOverlay: boolean;

	// Explorer
	showExplorer: boolean;
	onToggleExplorer: () => void;

	// Results grid layout (bottom / right / hidden)
	resultsLayout: ResultsLayout;
	onSetResultsLayout: (layout: ResultsLayout) => void;

	// Maximize (focus) overlay for the focused panel (editor / results)
	isPanelMaximized: boolean;
	activePanel: "editor" | "results" | null;
	onToggleMaximize: () => void;

	// File operations
	onOpenFile: () => void;
	onSaveFile: () => void;

	// Query operations
	onRunQuery: () => void;
	onStopQuery: () => void;

	// Connector
	activeConnector: ConnectorType;
	isBigQueryConnected: boolean;
	isSnowflakeConnected?: boolean;
	snowflakeContext?: { role: string; warehouse: string };
	onConnectorChange: (type: ConnectorType) => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
	) => void;

	// Settings
	showSettings: boolean;
	onToggleSettings: () => void;
	onOpenServerSettings?: () => void;

	// AI Chat
	showAIChat?: boolean;
	onToggleAIChat?: () => void;
}

export default function Header({
	initializing,
	reloadingFiles,
	initError,
	filesTotal,
	filesCompleted,
	currentLoadingFile,
	isLoading,
	isUploadingFiles,
	isExporting,
	showLongRunningOverlay,
	showExplorer,
	onToggleExplorer,
	resultsLayout,
	onSetResultsLayout,
	isPanelMaximized,
	activePanel,
	onToggleMaximize,
	onOpenFile,
	onSaveFile,
	onRunQuery,
	onStopQuery,
	activeConnector,
	isBigQueryConnected,
	isSnowflakeConnected,
	snowflakeContext,
	onConnectorChange,
	showToast,
	showSettings: _showSettings,
	onToggleSettings,
	onOpenServerSettings,
	showAIChat: _showAIChat,
	onToggleAIChat,
}: HeaderProps) {
	const { isHttpMode } = useMode();
	const isDisabled =
		initializing || reloadingFiles || isUploadingFiles || isExporting;

	return (
		<header className="header">
			{/* Brand Section - Logo + Title + Status */}
			<div className="header-left header-section">
				<h1 className="app-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<Logo size={32} />
					<Wordmark size="lg" style={{ fontSize: "22px", letterSpacing: "-0.5px" }} />
					<span
						style={{
							borderLeft: "1px solid var(--divider-color)",
							paddingLeft: "8px",
							marginLeft: "8px",
							position: "relative",
							top: "1px",
						}}
					>
						<ModeIndicator onOpenServerSettings={onOpenServerSettings} />
					</span>
				</h1>
				<div className="status-indicator" style={{ position: "relative", top: "2px" }}>
					{(() => {
						// Single status dot — VSCode/IDE pattern. Steady state shows
						// just the dot (green); transient/error states show dot +
						// label. Tooltip always carries the human-readable status.
						const state: "ready" | "loading" | "error" = initError
							? "error"
							: initializing || reloadingFiles
								? "loading"
								: "ready"
						const label =
							state === "error"
								? initError ?? "Error"
								: initializing
									? "Initializing database…"
									: reloadingFiles
										? filesTotal > 0
											? `Loading ${filesCompleted}/${filesTotal} files${currentLoadingFile ? ` — ${currentLoadingFile}` : ""}`
											: "Restoring files…"
										: "Ready to query"
						const color =
							state === "error"
								? "#ef4444"
								: state === "loading"
									? "#f59e0b"
									: "#10b981"
						return (
							<span
								role="status"
								title={label}
								aria-label={label}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									color: state === "error" ? color : "var(--text-muted)",
									fontSize: 12,
								}}
							>
								<span
									style={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										background: color,
										boxShadow:
											state === "loading"
												? `0 0 6px ${color}`
												: undefined,
										animation:
											state === "loading"
												? "pulse 1.2s ease-in-out infinite"
												: undefined,
										flexShrink: 0,
									}}
								/>
								{state !== "ready" && <span>{label}</span>}
							</span>
						)
					})()}
				</div>
			</div>

			{/* Tools Section - Explorer + File Operations */}
			<div className="header-center header-section">
				<button
					onClick={onToggleExplorer}
					className="file-button"
					title="Show or hide the data source explorer (files, databases, tables)"
					aria-label={showExplorer ? "Hide explorer sidebar" : "Show explorer sidebar"}
					aria-expanded={showExplorer}
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					{showExplorer ? (
						<ChevronLeftIcon size={16} aria-hidden="true" />
					) : (
						<ChevronRightIcon size={16} aria-hidden="true" />
					)}
					<span className="btn-label">Explorer</span>
				</button>

				<div
					className="results-layout-toggle"
					role="group"
					aria-label="Results grid position"
				>
					{(
						[
							{
								value: "bottom",
								label: "Show results below the editor",
								Icon: PanelBottomIcon,
							},
							{
								value: "right",
								label: "Show results to the right of the editor",
								Icon: PanelRightIcon,
							},
							{
								value: "hidden",
								label: "Hide the results grid (give the editor the full pane)",
								Icon: PanelHiddenIcon,
							},
						] as const
					).map(({ value, label, Icon }) => (
						<button
							key={value}
							type="button"
							className={`results-layout-btn ${resultsLayout === value ? "active" : ""}`}
							onClick={() => onSetResultsLayout(value)}
							title={label}
							aria-label={label}
							aria-pressed={resultsLayout === value}
						>
							<Icon size={15} aria-hidden="true" />
						</button>
					))}
				</div>

				{(() => {
					const label = isPanelMaximized
						? "Exit the maximized view (Esc)"
						: activePanel === "results"
							? "Maximize the results grid to a focus overlay (Esc to close)"
							: "Maximize the editor to a focus overlay (Esc to close)";
					// Enabled while maximized (to restore) or when a panel is focused.
					const disabled = !isPanelMaximized && activePanel === null;
					return (
						<button
							type="button"
							onClick={onToggleMaximize}
							disabled={disabled}
							className="file-button icon-only"
							title={
								disabled
									? "Click into the editor or results first, then maximize it"
									: label
							}
							aria-label={label}
							aria-pressed={isPanelMaximized}
						>
							{isPanelMaximized ? (
								<MinimizeIcon size={16} aria-hidden="true" />
							) : (
								<MaximizeIcon size={16} aria-hidden="true" />
							)}
						</button>
					);
				})()}
				<button
					onClick={onOpenFile}
					className="file-button"
					title="Open SQL file (Cmd/Ctrl+O)"
					aria-label="Open SQL file (Ctrl+O or Cmd+O)"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<FolderOpenIcon size={16} aria-hidden="true" />
					<span className="btn-label">Open SQL</span>
				</button>
				<button
					onClick={onSaveFile}
					className="file-button"
					title="Save SQL file (Cmd/Ctrl+S)"
					aria-label="Save SQL file (Ctrl+S or Cmd+S)"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<SaveIcon size={16} aria-hidden="true" />
					<span className="btn-label">Save</span>
				</button>
			</div>

			{/* Actions Section - Run/Stop + Connector + Theme + Settings */}
			<div className="header-right header-section">
				{isLoading && !showLongRunningOverlay ? (
					<button
						onClick={onStopQuery}
						className="stop-button-header"
						title="Stop running query"
						aria-label="Stop running query"
						style={{ display: "flex", alignItems: "center", gap: "6px" }}
					>
						<StopIcon size={16} aria-hidden="true" />
						Stop Query
					</button>
				) : !isLoading ? (
					<button
						onClick={onRunQuery}
						className="run-button-header"
						disabled={isDisabled}
						title={
							initializing
								? "Waiting for database to initialize..."
								: reloadingFiles
									? "Restoring files from previous session..."
									: isUploadingFiles
										? "Uploading files..."
										: isExporting
											? "Exporting data..."
											: "Run query (Cmd/Ctrl+Enter)"
						}
						aria-label="Run query (Ctrl+Enter or Cmd+Enter)"
						style={{ display: "flex", alignItems: "center", gap: "6px" }}
					>
						<PlayIcon size={16} aria-hidden="true" />
						<span className="btn-label">Run (⌘↵)</span>
					</button>
				) : null}
				<div
					className="connector-selector"
					data-connector={activeConnector}
					style={{
						// CSS custom property the select reads for its accent.
						// One source of truth for connector colors — matches the
						// CatalogProvider.accentColor and the docs.
						["--connector-accent" as string]: connectorAccent(activeConnector),
					}}
				>
					<span className="connector-dot" aria-hidden="true" />
					<select
						id="connector-select"
						value={activeConnector}
						onChange={(e) => onConnectorChange(e.target.value as ConnectorType)}
						disabled={isDisabled}
						aria-label="Select database connector"
						title={`Active connector: ${connectorLabel(activeConnector, isHttpMode)}. Click to switch the database engine you're querying.`}
					>
						<option value="duckdb">
							{connectorIcon("duckdb")}{" "}
							{isHttpMode ? "DuckDB Server" : "DuckDB WASM"}
						</option>
						<option value="bigquery" disabled={!isBigQueryConnected}>
							{connectorIcon("bigquery")} BigQuery
							{!isBigQueryConnected ? " (not connected)" : ""}
						</option>
						<option value="snowflake" disabled={!isSnowflakeConnected}>
							{connectorIcon("snowflake")} Snowflake
							{!isSnowflakeConnected ? " (not connected)" : ""}
						</option>
					</select>
				</div>
				{activeConnector === "snowflake" && snowflakeContext && (
					<SnowflakeContextButton
						role={snowflakeContext.role}
						warehouse={snowflakeContext.warehouse}
						showToast={showToast}
					/>
				)}
				{onToggleAIChat && (
					<button
						onClick={onToggleAIChat}
						className="file-button"
						title="Toggle the AI SQL assistant: draft, explain, and fix queries (Cmd/Ctrl+Shift+A)"
						aria-label="Toggle AI SQL Assistant"
						style={{ display: "flex", alignItems: "center", gap: "6px" }}
					>
						<SparklesIcon size={16} aria-hidden="true" />
						<span className="btn-label">AI</span>
					</button>
				)}
				<ThemeToggle />
				<button
					className="settings-button"
					onClick={onToggleSettings}
					title="Open settings: appearance, connections, AI keys, and security"
					aria-label="Open settings"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<SettingsIcon size={16} aria-hidden="true" />
					<span className="btn-label">Settings</span>
				</button>
			</div>
		</header>
	);
}
