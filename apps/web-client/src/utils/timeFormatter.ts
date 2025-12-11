/**
 * Format milliseconds into human-friendly time strings
 *
 * Examples:
 *   45 ms -> "45ms"
 *   1234 ms -> "1.2s"
 *   65000 ms -> "1m 5s"
 *   3661000 ms -> "1h 1m"
 */
export function formatExecutionTime(ms: number): string {
	if (ms < 1000) {
		// Less than 1 second - show milliseconds
		return `${Math.round(ms)}ms`;
	}

	if (ms < 60000) {
		// Less than 1 minute - show seconds with 1 decimal place
		const seconds = ms / 1000;
		return `${seconds.toFixed(1)}s`;
	}

	if (ms < 3600000) {
		// Less than 1 hour - show minutes and seconds
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);

		if (seconds === 0) {
			return `${minutes}m`;
		}
		return `${minutes}m ${seconds}s`;
	}

	// 1 hour or more - show hours and minutes
	const hours = Math.floor(ms / 3600000);
	const minutes = Math.floor((ms % 3600000) / 60000);

	if (minutes === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${minutes}m`;
}
