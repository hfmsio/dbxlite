import { useEffect, useState } from "react";
import { type ErrorEntry, errorMonitor } from "../utils/errorMonitor";

/**
 * Error monitoring panel for development mode
 * Shows recent errors, warnings, and info messages
 */
export default function ErrorMonitorPanel() {
	const [errors, setErrors] = useState<ErrorEntry[]>([]);
	const [isOpen, setIsOpen] = useState(false); // Start collapsed
	const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">(
		"all",
	);

	useEffect(() => {
		// Subscribe to error updates
		const unsubscribe = errorMonitor.subscribe(setErrors);
		// Get initial errors
		setErrors(errorMonitor.getAllErrors());
		return unsubscribe;
	}, []);

	const stats = errorMonitor.getStats();

	const filteredErrors =
		filter === "all" ? errors : errors.filter((e) => e.severity === filter);

	if (process.env.NODE_ENV !== "development") {
		return null; // Only show in development
	}

	// Hide completely if no errors
	if (stats.total === 0 && !isOpen) {
		return null;
	}

	return (
		<div className={`error-monitor ${isOpen ? "open" : "closed"}`}>
			{/* Header */}
			<div
				className="error-monitor-header"
				onClick={() => setIsOpen(!isOpen)}
			>
				<div className="flex-row gap-md">
					<span className="error-monitor-title">🔍 Error Monitor</span>
					<span className="error-monitor-stats">
						{stats.errors > 0 && (
							<span className="error-monitor-stat error">
								●{stats.errors} errors
							</span>
						)}
						{stats.warnings > 0 && (
							<span className="error-monitor-stat warning">
								●{stats.warnings} warnings
							</span>
						)}
						{stats.infos > 0 && (
							<span className="error-monitor-stat info">●{stats.infos} info</span>
						)}
						{stats.total === 0 && (
							<span className="error-monitor-stat success">✓ No errors</span>
						)}
					</span>
				</div>
				<div className="error-monitor-actions">
					<button
						onClick={(e) => {
							e.stopPropagation();
							errorMonitor.clear();
						}}
						className="error-monitor-clear-btn"
					>
						Clear
					</button>
					<span className="error-monitor-toggle">{isOpen ? "▼" : "▲"}</span>
				</div>
			</div>

			{/* Filters */}
			{isOpen && (
				<div className="error-monitor-filters">
					{(["all", "error", "warning", "info"] as const).map((f) => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={`error-monitor-filter-btn ${filter === f ? "active" : ""}`}
						>
							{f} (
							{f === "all"
								? stats.total
								: (stats[`${f}s` as keyof typeof stats] as number) || 0}
							)
						</button>
					))}
				</div>
			)}

			{/* Error list */}
			{isOpen && (
				<div className="error-monitor-list">
					{filteredErrors.length === 0 ? (
						<div className="error-monitor-empty">
							{`No ${filter === "all" ? "" : `${filter} `}messages`}
						</div>
					) : (
						filteredErrors.map((error) => (
							<div
								key={error.id}
								className={`error-monitor-entry ${error.severity}`}
							>
								<div className="error-monitor-entry-header">
									<span className="error-monitor-entry-type">{error.type}</span>
									<span className="error-monitor-entry-time">
										{error.timestamp.toLocaleTimeString()}
									</span>
								</div>
								<div className="error-monitor-entry-message">{error.message}</div>
								{error.context && (
									<details className="error-monitor-details">
										<summary>Context</summary>
										<pre>{JSON.stringify(error.context, null, 2)}</pre>
									</details>
								)}
								{error.stack && (
									<details className="error-monitor-details error-monitor-stack">
										<summary>Stack trace</summary>
										<pre>{error.stack}</pre>
									</details>
								)}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}
