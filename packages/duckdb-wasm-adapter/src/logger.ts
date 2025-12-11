/**
 * Structured Logger for DuckDB Adapter Package
 *
 * Provides consistent logging across the DuckDB adapter with:
 * - Log levels (debug, info, warn, error)
 * - Contextual logging with module prefixes
 * - Structured data logging
 * - Environment-aware output (suppressed in production)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
	level: LogLevel;
	module: string;
	message: string;
	data?: unknown;
	timestamp: string;
	error?: Error;
}

interface LoggerConfig {
	minLevel: LogLevel;
	enableTimestamps: boolean;
	enableInProduction: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
	minLevel: import.meta.env?.DEV ? "debug" : "warn",
	enableTimestamps: false,
	enableInProduction: false,
};

let config: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the logger
 */
export function configureLogger(newConfig: Partial<LoggerConfig>): void {
	config = { ...config, ...newConfig };
}

/**
 * Check if logging is enabled for a given level
 */
function shouldLog(level: LogLevel): boolean {
	if (!config.enableInProduction && import.meta.env?.PROD) {
		return level === "error"; // Always log errors in production
	}
	return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
	const parts: string[] = [];

	if (config.enableTimestamps) {
		parts.push(`[${entry.timestamp}]`);
	}

	parts.push(`[${entry.module}]`);
	parts.push(entry.message);

	return parts.join(" ");
}

/**
 * Get appropriate console method for log level
 */
function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
	switch (level) {
		case "debug":
			return console.debug;
		case "info":
			return console.info;
		case "warn":
			return console.warn;
		case "error":
			return console.error;
		default:
			return console.log;
	}
}

/**
 * Core logging function
 */
function log(
	level: LogLevel,
	module: string,
	message: string,
	data?: unknown,
	error?: Error,
): void {
	if (!shouldLog(level)) return;

	const entry: LogEntry = {
		level,
		module,
		message,
		data,
		timestamp: new Date().toISOString(),
		error,
	};

	const consoleMethod = getConsoleMethod(level);
	const formattedMessage = formatLogEntry(entry);

	if (error) {
		consoleMethod(formattedMessage, error);
	} else if (data !== undefined) {
		consoleMethod(formattedMessage, data);
	} else {
		consoleMethod(formattedMessage);
	}
}

/**
 * Create a logger instance for a specific module
 */
export function createLogger(module: string) {
	return {
		debug: (message: string, data?: unknown) =>
			log("debug", module, message, data),
		info: (message: string, data?: unknown) =>
			log("info", module, message, data),
		warn: (message: string, data?: unknown) =>
			log("warn", module, message, data),
		error: (message: string, error?: Error | unknown, data?: unknown) => {
			const err = error instanceof Error ? error : undefined;
			const extraData = error instanceof Error ? data : error;
			log("error", module, message, extraData, err);
		},
	};
}
