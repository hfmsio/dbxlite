/**
 * URL Detection Utility
 * Detects remote file URLs in SQL queries for auto-discovery
 */

export interface DetectedURL {
	url: string;
	type: "parquet" | "csv" | "json" | "unknown";
	position: number;
}

/**
 * Extract remote file URLs from SQL query
 * Matches URLs in single quotes, double quotes, or unquoted
 */
export function detectRemoteURLs(sql: string): DetectedURL[] {
	const urls: DetectedURL[] = [];

	// Pattern to match URLs in various formats:
	// - 'https://...'
	// - "https://..."
	// - https://... (unquoted, less common)
	const urlPattern =
		/(['"]?)(https?:\/\/[^\s'"]+\.(parquet|csv|json|jsonl|ndjson))(['"]?)/gi;

	let match;
	while ((match = urlPattern.exec(sql)) !== null) {
		const quote1 = match[1];
		const url = match[2];
		const extension = match[3].toLowerCase();
		const quote2 = match[4];

		// Only include if quotes match (or both empty)
		if (quote1 === quote2) {
			let type: "parquet" | "csv" | "json" | "unknown" = "unknown";

			if (extension === "parquet") type = "parquet";
			else if (extension === "csv") type = "csv";
			else if (["json", "jsonl", "ndjson"].includes(extension)) type = "json";

			urls.push({
				url,
				type,
				position: match.index,
			});
		}
	}

	// Remove duplicates (same URL might appear multiple times)
	const uniqueUrls = urls.filter(
		(item, index, self) => index === self.findIndex((t) => t.url === item.url),
	);

	return uniqueUrls;
}

/**
 * Generate a friendly name from URL
 * e.g., "https://example.com/path/to/data.parquet" -> "data"
 */
export function extractNameFromURL(url: string): string {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const segments = pathname.split("/").filter((s) => s.length > 0);
		const lastSegment = segments[segments.length - 1];

		// Remove extension
		const nameWithoutExt = lastSegment.replace(
			/\.(parquet|csv|json|jsonl|ndjson)$/i,
			"",
		);

		// Clean up name (replace special chars with underscores)
		const cleaned = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, "_");

		return cleaned || "remote_data";
	} catch {
		return "remote_data";
	}
}

/**
 * Estimate file size from URL (if Content-Length header available)
 */
export async function getRemoteFileSize(
	url: string,
): Promise<number | undefined> {
	try {
		const response = await fetch(url, { method: "HEAD" });
		const contentLength = response.headers.get("Content-Length");
		return contentLength ? parseInt(contentLength, 10) : undefined;
	} catch {
		return undefined;
	}
}
