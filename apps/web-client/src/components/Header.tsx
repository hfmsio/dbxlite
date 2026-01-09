import type { ConnectorType } from "../services/streaming-query-service";
import { useMode } from "../hooks/useMode";
import {
	CheckCircleIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ClockIcon,
	FolderOpenIcon,
	PlayIcon,
	SaveIcon,
	SettingsIcon,
	StopIcon,
	XCircleIcon,
} from "./Icons";
import { Logo, Wordmark } from "./Logo";
import ModeIndicator from "./ModeIndicator";
import ThemeToggle from "./ThemeToggle";

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
	onConnectorChange: (type: ConnectorType) => void;

	// Settings
	showSettings: boolean;
	onToggleSettings: () => void;
	onOpenServerSettings?: () => void;
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
	onConnectorChange,
	showSettings: _showSettings,
	onToggleSettings,
	onOpenServerSettings,
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
					{initializing && (
						<span
							className="status-initializing"
							style={{ display: "flex", alignItems: "center", gap: "6px" }}
						>
							<ClockIcon size={14} />
							Initializing database...
						</span>
					)}
					{!initializing && reloadingFiles && (
						<span
							className="status-initializing"
							style={{ display: "flex", alignItems: "center", gap: "6px" }}
						>
							<ClockIcon size={14} />
							{filesTotal > 0
								? `Loading ${filesCompleted}/${filesTotal} files${currentLoadingFile ? ` - ${currentLoadingFile}` : ""}`
								: "Restoring files..."}
						</span>
					)}
					{initError && (
						<span
							className="status-error"
							style={{ display: "flex", alignItems: "center", gap: "6px" }}
						>
							<XCircleIcon size={14} />
							{initError}
						</span>
					)}
					{!initializing && !reloadingFiles && !initError && (
						<span
							className="status-ready"
							style={{ display: "flex", alignItems: "center", gap: "6px" }}
						>
							<CheckCircleIcon size={14} />
							Ready to query
						</span>
					)}
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
				<div className="connector-selector">
					<label htmlFor="connector-select">Connector:</label>
					<select
						id="connector-select"
						value={activeConnector}
						onChange={(e) => onConnectorChange(e.target.value as ConnectorType)}
						disabled={isDisabled}
						aria-label="Select database connector"
					>
						<option value="duckdb">
							{isHttpMode ? "DuckDB Server" : "DuckDB WASM"}
						</option>
						<option value="bigquery" disabled={!isBigQueryConnected}>
							BigQuery {!isBigQueryConnected ? "(not connected)" : ""}
						</option>
					</select>
				</div>
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
