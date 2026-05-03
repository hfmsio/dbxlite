import type { ConnectorType } from "../services/streaming-query-service";
import { useMode } from "../hooks/useMode";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	FolderOpenIcon,
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
					title="Toggle Data Source Explorer"
					aria-label={showExplorer ? "Hide explorer sidebar" : "Show explorer sidebar"}
					aria-expanded={showExplorer}
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					{showExplorer ? (
						<ChevronLeftIcon size={16} aria-hidden="true" />
					) : (
						<ChevronRightIcon size={16} aria-hidden="true" />
					)}
					Explorer
				</button>
				<button
					onClick={onOpenFile}
					className="file-button"
					title="Open SQL file (Cmd/Ctrl+O)"
					aria-label="Open SQL file (Ctrl+O or Cmd+O)"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<FolderOpenIcon size={16} aria-hidden="true" />
					Open SQL
				</button>
				<button
					onClick={onSaveFile}
					className="file-button"
					title="Save SQL file (Cmd/Ctrl+S)"
					aria-label="Save SQL file (Ctrl+S or Cmd+S)"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<SaveIcon size={16} aria-hidden="true" />
					Save
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
						Run (⌘↵)
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
					<label htmlFor="connector-select">Connector:</label>
					<select
						id="connector-select"
						value={activeConnector}
						onChange={(e) => onConnectorChange(e.target.value as ConnectorType)}
						disabled={isDisabled}
						aria-label="Select database connector"
						title={`Active connector: ${connectorLabel(activeConnector, isHttpMode)}`}
						style={{
							borderLeft: "3px solid var(--connector-accent)",
							boxShadow:
								"inset 2px 0 0 0 color-mix(in srgb, var(--connector-accent) 30%, transparent)",
						}}
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
						title="AI SQL Assistant (Cmd/Ctrl+Shift+A)"
						aria-label="Toggle AI SQL Assistant"
						style={{ display: "flex", alignItems: "center", gap: "6px" }}
					>
						<SparklesIcon size={16} aria-hidden="true" />
						AI
					</button>
				)}
				<ThemeToggle />
				<button
					className="settings-button"
					onClick={onToggleSettings}
					title="Settings & Security"
					aria-label="Open settings"
					style={{ display: "flex", alignItems: "center", gap: "6px" }}
				>
					<SettingsIcon size={16} aria-hidden="true" />
					Settings
				</button>
			</div>
		</header>
	);
}
