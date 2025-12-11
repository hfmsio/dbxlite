/**
 * Error monitoring utility for tracking and displaying errors in development mode
 */

import { createLogger } from "./logger";

const logger = createLogger("ErrorMonitor");

export interface ErrorEntry {
	id: string;
	timestamp: Date;
	type: string;
	message: string;
	stack?: string;
	context?: Record<string, unknown>;
	severity: "error" | "warning" | "info";
}

class ErrorMonitor {
	private errors: ErrorEntry[] = [];
	private maxEntries = 100;
	private listeners: Set<(errors: ErrorEntry[]) => void> = new Set();

	/**
	 * Log an error to the monitor
	 */
	logError(
		type: string,
		error: unknown,
		severity: "error" | "warning" | "info" = "error",
		context?: Record<string, unknown>,
	): void {
		const errorObj =
			error instanceof Error
				? error
				: { message: String(error), stack: undefined };
		const entry: ErrorEntry = {
			id: `${Date.now()}_${Math.random()}`,
			timestamp: new Date(),
			type,
			message: errorObj.message,
			stack: errorObj.stack,
			context,
			severity,
		};

		this.errors.unshift(entry); // Add to beginning

		// Limit size
		if (this.errors.length > this.maxEntries) {
			this.errors = this.errors.slice(0, this.maxEntries);
		}

		// Notify listeners
		this.notifyListeners();

		// In development, also log via structured logger
		if (process.env.NODE_ENV === "development") {
			const logMethod =
				severity === "error"
					? logger.error
					: severity === "warning"
						? logger.warn
						: logger.info;
			logMethod(`[${type}] ${entry.message}`, {
				context,
				stack: errorObj.stack,
			});
		}
	}

	/**
	 * Get recent errors
	 */
	getRecentErrors(minutes: number = 5): ErrorEntry[] {
		const cutoff = Date.now() - minutes * 60 * 1000;
		return this.errors.filter((e) => e.timestamp.getTime() > cutoff);
	}

	/**
	 * Get all errors
	 */
	getAllErrors(): ErrorEntry[] {
		return [...this.errors];
	}

	/**
	 * Clear all errors
	 */
	clear(): void {
		this.errors = [];
		this.notifyListeners();
	}

	/**
	 * Subscribe to error updates
	 */
	subscribe(listener: (errors: ErrorEntry[]) => void): () => void {
		this.listeners.add(listener);
		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Notify all listeners of error updates
	 */
	private notifyListeners(): void {
		this.listeners.forEach((listener) => {
			try {
				listener([...this.errors]);
			} catch (err) {
				logger.error("Error in error monitor listener:", err);
			}
		});
	}

	/**
	 * Get error statistics
	 */
	getStats(): {
		total: number;
		errors: number;
		warnings: number;
		infos: number;
		lastError?: ErrorEntry;
	} {
		const stats = {
			total: this.errors.length,
			errors: this.errors.filter((e) => e.severity === "error").length,
			warnings: this.errors.filter((e) => e.severity === "warning").length,
			infos: this.errors.filter((e) => e.severity === "info").length,
			lastError: this.errors[0],
		};
		return stats;
	}
}

// Singleton instance
export const errorMonitor = new ErrorMonitor();

// Export for debugging in console
if (typeof window !== "undefined") {
	(window as Window & { errorMonitor?: ErrorMonitor }).errorMonitor =
		errorMonitor;
}
