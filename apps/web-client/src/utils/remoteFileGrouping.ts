/**
 * Remote File Grouping Utility
 * Parses remote URLs into hierarchical structure for better organization in explorer
 */

import { createLogger } from "./logger";

const logger = createLogger("RemoteFileGrouping");

export interface RemoteFileGroup {
	domain: string; // e.g., "huggingface.co"
	path: string; // e.g., "qnli/train" (last 2 segments or smart grouping)
	filename: string; // e.g., "0.parquet"
	fullPath: string; // Full path for tooltip/reference
}

const MAX_NAME_LENGTH = 40; // Max length before truncating with "..."

/**
 * Known domain patterns for smart grouping
 * Maps domain patterns to path extraction logic
 * Returns: { path: string, datasetEndIndex?: number } where datasetEndIndex indicates where dataset name ends
 */
const SMART_GROUPING: Record<
	string,
	(segments: string[]) => { path: string; datasetEndIndex?: number }
> = {
	// HuggingFace: Extract dataset name as the path, combine partition/file as filename
	"huggingface.co": (segments) => {
		// Path like: /api/datasets/databricks/databricks-dolly-15k/parquet/default/train/0.parquet
		// We want: path = "databricks/databricks-dolly-15k", filename = "default/train/0.parquet"
		if (segments.includes("datasets")) {
			const datasetIdx = segments.indexOf("datasets");
			// Get the dataset name (next 2 segments after 'datasets': org/dataset-name)
			const datasetName = segments
				.slice(datasetIdx + 1, datasetIdx + 3)
				.join("/");

			// Return dataset name as path, and mark where it ends so remaining can be used for filename
			return {
				path: datasetName,
				datasetEndIndex: datasetIdx + 3, // Everything after this index should be part of filename
			};
		}
		// Fallback: last 2 segments
		return { path: segments.slice(-3, -1).join("/") };
	},

	// AWS S3: Extract bucket and key prefix
	"s3.amazonaws.com": (segments) => {
		// Path like: /bucket-name/folder/subfolder/file.parquet
		// Extract: bucket-name/folder or last 2 segments
		if (segments.length > 2) {
			return { path: segments.slice(0, 2).join("/") };
		}
		return { path: segments.slice(-3, -1).join("/") };
	},

	// Google Cloud Storage
	"storage.googleapis.com": (segments) => {
		// Similar to S3
		if (segments.length > 2) {
			return { path: segments.slice(0, 2).join("/") };
		}
		return { path: segments.slice(-3, -1).join("/") };
	},
};

/**
 * Truncate a string with ellipsis if it exceeds max length
 */
function truncateWithEllipsis(
	str: string,
	maxLength: number = MAX_NAME_LENGTH,
): string {
	if (str.length <= maxLength) return str;
	return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * Parse a remote URL into hierarchical grouping structure
 * Returns 3-level hierarchy: domain -> path -> filename
 */
export function parseRemoteURL(url: string): RemoteFileGroup | null {
	try {
		const urlObj = new URL(url);
		const domain = urlObj.hostname;
		const pathname = urlObj.pathname;
		const segments = pathname.split("/").filter((s) => s.length > 0);

		if (segments.length === 0) {
			return null;
		}

		// Determine path using smart grouping or default (last 2 segments)
		let path: string;
		let filename: string;
		let datasetEndIndex: number | undefined;

		// Check if domain matches any smart grouping pattern
		const matchedPattern = Object.keys(SMART_GROUPING).find((pattern) =>
			domain.includes(pattern),
		);

		if (matchedPattern) {
			// Use smart grouping
			const result = SMART_GROUPING[matchedPattern](segments);
			path = result.path;
			datasetEndIndex = result.datasetEndIndex;

			// If datasetEndIndex is provided, build composite filename from remaining segments
			if (datasetEndIndex !== undefined && datasetEndIndex < segments.length) {
				// Combine all remaining segments as the filename (e.g., "default/train/0.parquet")
				filename = segments.slice(datasetEndIndex).join("/");
			} else {
				// Use last segment as filename
				filename = segments[segments.length - 1];
			}
		} else {
			// Default: use last 2 path segments (excluding filename)
			const pathSegments = segments.slice(0, -1); // All except filename

			if (pathSegments.length >= 2) {
				path = pathSegments.slice(-2).join("/");
			} else if (pathSegments.length === 1) {
				path = pathSegments[0];
			} else {
				path = ""; // Root level
			}

			filename = segments[segments.length - 1];
		}

		// Truncate long names
		const truncatedDomain = truncateWithEllipsis(domain);
		const truncatedPath = truncateWithEllipsis(path);
		const truncatedFilename = truncateWithEllipsis(filename, 60); // Longer limit for composite filenames

		return {
			domain: truncatedDomain,
			path: truncatedPath,
			filename: truncatedFilename,
			fullPath: pathname,
		};
	} catch (error) {
		logger.error("Failed to parse remote URL", error);
		return null;
	}
}

/**
 * Get a display name for a remote file (fallback if grouping is disabled)
 * Uses smart extraction or last path segment
 */
export function getRemoteDisplayName(url: string): string {
	const group = parseRemoteURL(url);
	if (!group) {
		return "remote_file";
	}

	// If path is meaningful, combine it with filename
	// e.g., "qnli/train/0.parquet" or just "0.parquet" if no path
	if (group.path) {
		return `${group.path}/${group.filename}`;
	}
	return group.filename;
}
