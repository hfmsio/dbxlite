/**
 * Import Progress Component
 *
 * Displays active import jobs with progress bars, pause/resume controls,
 * and status information.
 */

import type React from "react";
import { useEffect, useState } from "react";
import { importQueue } from "../services/import-queue";
import type { ImportJob } from "../types/materialization";
import { createLogger } from "../utils/logger";

const logger = createLogger("ImportProgress");

export const ImportProgressPanel: React.FC = () => {
	const [jobs, setJobs] = useState<ImportJob[]>([]);
	const [isMinimized, setIsMinimized] = useState(false);

	useEffect(() => {
		// Get initial jobs
		setJobs(importQueue.getActiveJobs());

		// Subscribe to updates
		const unsubscribe = importQueue.on((event) => {
			setJobs(importQueue.getActiveJobs());

			// Auto-expand when new job starts
			if (event.type === "job_started") {
				setIsMinimized(false);
			}
		});

		return unsubscribe;
	}, []);

	const formatSpeed = (mbps: number) => `${mbps.toFixed(2)} MB/s`;

	const formatTime = (seconds: number) => {
		if (seconds === Infinity || Number.isNaN(seconds)) return "∞";

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
	};

	const handlePause = async (jobId: string) => {
		try {
			await importQueue.pause(jobId);
		} catch (error: unknown) {
			logger.error("Failed to pause job", error);
		}
	};

	const handleResume = async (jobId: string) => {
		try {
			await importQueue.resume(jobId);
		} catch (error: unknown) {
			logger.error("Failed to resume job", error);
		}
	};

	const handleCancel = async (jobId: string) => {
		if (window.confirm("Cancel this import? Progress will be lost.")) {
			try {
				await importQueue.cancel(jobId);
			} catch (error: unknown) {
				logger.error("Failed to cancel job", error);
			}
		}
	};

	if (jobs.length === 0) {
		return null; // Don't show panel if no active jobs
	}

	return (
		<div className={`import-progress-panel ${isMinimized ? "minimized" : ""}`}>
			<div
				className="panel-header"
				onClick={() => setIsMinimized(!isMinimized)}
			>
				<h3>
					Import Jobs ({jobs.length})
					{jobs.some((j) => j.status === "running") && (
						<span className="spinner">⏳</span>
					)}
				</h3>
				<button className="toggle-button">{isMinimized ? "▲" : "▼"}</button>
			</div>

			{!isMinimized && (
				<div className="jobs-list">
					{jobs.map((job) => (
						<div key={job.id} className={`job-item status-${job.status}`}>
							<div className="job-header">
								<span
									className="job-name"
									title={`${job.schema}.${job.tableName}`}
								>
									{job.schema}.{job.tableName}
								</span>
								<span className={`job-status status-${job.status}`}>
									{job.status}
								</span>
							</div>

							{job.status === "running" && (
								<>
									<div className="progress-bar-container">
										<div
											className="progress-bar-fill"
											style={{
												width: `${Math.min(job.progress.percentComplete, 100)}%`,
											}}
										/>
									</div>

									<div className="progress-stats">
										<span className="progress-percent">
											{job.progress.percentComplete.toFixed(1)}%
										</span>
										<span>
											{job.progress.rowsProcessed.toLocaleString()} rows
										</span>
										{job.progress.speedMBps > 0 && (
											<span>{formatSpeed(job.progress.speedMBps)}</span>
										)}
										{job.progress.estimatedSecondsRemaining > 0 && (
											<span>
												ETA:{" "}
												{formatTime(job.progress.estimatedSecondsRemaining)}
											</span>
										)}
									</div>

									<div className="job-actions">
										<button
											onClick={() => handlePause(job.id)}
											className="action-btn pause"
											title="Pause import"
										>
											⏸️ Pause
										</button>
										<button
											onClick={() => handleCancel(job.id)}
											className="action-btn cancel"
											title="Cancel import"
										>
											❌ Cancel
										</button>
									</div>
								</>
							)}

							{job.status === "paused" && (
								<div className="job-actions">
									<button
										onClick={() => handleResume(job.id)}
										className="action-btn resume"
										title="Resume import"
									>
										▶️ Resume
									</button>
									<button
										onClick={() => handleCancel(job.id)}
										className="action-btn cancel"
										title="Cancel import"
									>
										❌ Cancel
									</button>
								</div>
							)}

							{job.status === "queued" && (
								<div className="queued-message">Waiting in queue...</div>
							)}

							{job.error && (
								<div className="error-message">
									<strong>Error:</strong> {job.error.message}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
