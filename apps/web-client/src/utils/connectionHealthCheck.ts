/**
 * Connection health check utility
 * Periodically verifies database connections are responsive
 */

import { queryService } from "../services/streaming-query-service";
import { errorMonitor } from "./errorMonitor";
import { createLogger } from "./logger";

const logger = createLogger("ConnectionHealthChecker");

export interface HealthStatus {
	isHealthy: boolean;
	lastCheck: Date;
	queryServiceStatus: "healthy" | "unhealthy" | "unknown";
	streamingServiceStatus: "healthy" | "unhealthy" | "unknown";
	consecutiveFailures: number;
	lastError?: string;
}

class ConnectionHealthChecker {
	private interval: NodeJS.Timeout | null = null;
	private checkIntervalMs = 30000; // Check every 30 seconds
	private timeoutMs = 5000; // 5 second timeout for health checks
	private paused: boolean = false; // Pause checks during active query execution
	private status: HealthStatus = {
		isHealthy: true,
		lastCheck: new Date(),
		queryServiceStatus: "unknown",
		streamingServiceStatus: "unknown",
		consecutiveFailures: 0,
	};
	private listeners: Set<(status: HealthStatus) => void> = new Set();

	/**
	 * Start health checking
	 */
	start(intervalMs: number = this.checkIntervalMs): void {
		if (this.interval) {
			logger.warn("Health checker already running");
			return;
		}

		logger.info("Starting connection health checks...");
		// Run immediate check
		this.performHealthCheck();

		// Schedule periodic checks
		this.interval = setInterval(() => {
			this.performHealthCheck();
		}, intervalMs);
	}

	/**
	 * Stop health checking
	 */
	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
			logger.info("Stopped connection health checks");
		}
	}

	/**
	 * Pause health checks (e.g., during active query execution)
	 */
	pause(): void {
		this.paused = true;
	}

	/**
	 * Resume health checks
	 */
	resume(): void {
		this.paused = false;
	}

	/**
	 * Perform a health check
	 */
	private async performHealthCheck(): Promise<void> {
		// Skip if paused (e.g., during active query execution to avoid concurrent queries)
		if (this.paused) {
			return;
		}

		try {
			// Skip health checks for BigQuery (REST API, doesn't need health pings)
			const activeConnector = queryService.getActiveConnectorType();
			if (activeConnector === "bigquery") {
				// Assume healthy for BigQuery - REST API will fail on actual queries if there are issues
				this.status.queryServiceStatus = "healthy";
				this.status.streamingServiceStatus = "healthy";
				this.status.isHealthy = true;
				this.status.consecutiveFailures = 0;
				this.status.lastCheck = new Date();
				this.notifyListeners();
				return;
			}

			// Simple ping query to verify connection (for DuckDB)
			const healthQuery = "SELECT 1 as health_check";

			// Check query service
			let queryServiceHealthy = false;
			try {
				const result = await Promise.race([
					queryService.executeQuery(healthQuery),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("Health check timeout")),
							this.timeoutMs,
						),
					),
				]);

				queryServiceHealthy = result?.rows && result.rows.length > 0;

				if (queryServiceHealthy) {
					this.status.queryServiceStatus = "healthy";
				} else {
					this.status.queryServiceStatus = "unhealthy";
				}
			} catch (err) {
				this.status.queryServiceStatus = "unhealthy";
				logger.warn("Query service health check failed:", err);
			}

			// Check streaming service (only for DuckDB)
			let streamingServiceHealthy = false;
			try {
				const result = await Promise.race([
					queryService.getRowCount(healthQuery),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("Health check timeout")),
							this.timeoutMs,
						),
					),
				]);

				streamingServiceHealthy = result.count >= 0;

				if (streamingServiceHealthy) {
					this.status.streamingServiceStatus = "healthy";
				} else {
					this.status.streamingServiceStatus = "unhealthy";
				}
			} catch (err) {
				this.status.streamingServiceStatus = "unhealthy";
				logger.warn("Streaming service health check failed:", err);
			}

			// Update overall health status
			const wasHealthy = this.status.isHealthy;
			this.status.isHealthy = queryServiceHealthy && streamingServiceHealthy;
			this.status.lastCheck = new Date();

			if (this.status.isHealthy) {
				this.status.consecutiveFailures = 0;
				this.status.lastError = undefined;
			} else {
				this.status.consecutiveFailures++;

				const errorMsg = `Health check failed: Query service ${this.status.queryServiceStatus}, Streaming service ${this.status.streamingServiceStatus}`;
				this.status.lastError = errorMsg;

				// Log to error monitor if it's a new failure
				if (wasHealthy) {
					errorMonitor.logError(
						"Connection Health",
						new Error(errorMsg),
						"warning",
						{
							queryServiceStatus: this.status.queryServiceStatus,
							streamingServiceStatus: this.status.streamingServiceStatus,
						},
					);
				}
			}

			// Notify listeners
			this.notifyListeners();
		} catch (err) {
			logger.error("Health check failed:", err);
			this.status.consecutiveFailures++;
			this.status.lastError = err instanceof Error ? err.message : String(err);
			errorMonitor.logError("Connection Health", err, "error");
		}
	}

	/**
	 * Get current health status
	 */
	getStatus(): HealthStatus {
		return { ...this.status };
	}

	/**
	 * Subscribe to health status updates
	 */
	subscribe(listener: (status: HealthStatus) => void): () => void {
		this.listeners.add(listener);
		// Immediately notify with current status
		listener({ ...this.status });
		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Notify all listeners of status updates
	 */
	private notifyListeners(): void {
		this.listeners.forEach((listener) => {
			try {
				listener({ ...this.status });
			} catch (err) {
				logger.error("Error in health check listener:", err);
			}
		});
	}

	/**
	 * Force an immediate health check
	 */
	async checkNow(): Promise<HealthStatus> {
		await this.performHealthCheck();
		return this.getStatus();
	}
}

// Singleton instance
export const connectionHealthChecker = new ConnectionHealthChecker();

// Export for debugging in console
if (typeof window !== "undefined") {
	(
		window as Window & { connectionHealthChecker?: ConnectionHealthChecker }
	).connectionHealthChecker = connectionHealthChecker;
}
