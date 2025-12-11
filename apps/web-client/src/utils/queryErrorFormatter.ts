import type { ConnectorType } from "../services/streaming-query-service";
import type { DataSource } from "../types/data-source";

interface QueryErrorContext {
	errorMessage: string;
	sql: string;
	connectorType: ConnectorType;
	dataSources: DataSource[];
}

interface FormattedQueryError {
	userMessage: string;
	catalogName?: string; // For catalog errors, includes the name for potential fixes
}

/**
 * Formats query execution errors into user-friendly messages with actionable solutions
 */
export function formatQueryError(ctx: QueryErrorContext): FormattedQueryError {
	const { errorMessage, sql, connectorType, dataSources } = ctx;

	let userMsg = errorMessage || "Query execution failed";
	let catalogName: string | undefined;

	// DuckDB-specific catalog error
	if (
		connectorType === "duckdb" &&
		errorMessage.includes("Catalog") &&
		errorMessage.includes("does not exist")
	) {
		const catalogMatch = errorMessage.match(
			/Catalog ["']?(\w+)["']? does not exist/i,
		);
		catalogName = catalogMatch ? catalogMatch[1] : undefined;

		if (catalogName) {
			userMsg =
				`❌ Database catalog "${catalogName}" is not attached!\n\n` +
				`The query references a catalog/database that isn't loaded.\n\n` +
				`💡 Solutions:\n` +
				`1. Re-upload the ${catalogName}.duckdb file (will auto-attach)\n` +
				`2. Manual: Run this first → ATTACH '${catalogName}.duckdb' AS ${catalogName};\n` +
				`3. Or remove "${catalogName}." prefix from your query if not needed`;
		} else {
			userMsg =
				`❌ Database catalog not found!\n\n` +
				`The query references a catalog/database that isn't loaded.\n\n` +
				`💡 Solutions:\n` +
				`1. Re-upload the .duckdb file (will auto-attach)\n` +
				`2. Or check the catalog name in your query`;
		}

		return { userMessage: userMsg, catalogName };
	}

	// BigQuery catalog error (likely wrong connector)
	if (
		connectorType === "bigquery" &&
		(errorMessage.includes("Catalog") ||
			errorMessage.includes("does not exist"))
	) {
		userMsg =
			`❌ BigQuery query failed!\n\n` +
			`${errorMessage}\n\n` +
			`💡 This looks like the query was sent to DuckDB instead of BigQuery.\n` +
			`Please check that BigQuery is properly connected in Settings → Connections.`;
		return { userMessage: userMsg };
	}

	// DuckDB vague error - likely file access issue
	if (
		errorMessage === "Error" ||
		errorMessage.includes("Exception") ||
		errorMessage.includes("send() with Arrow IPC failed")
	) {
		const fileMatches = sql.match(/'([^']+\.csv)'/gi);
		if (fileMatches) {
			const fileNames = fileMatches.map((m) => m.replace(/'/g, ""));
			const inaccessibleFiles = fileNames.filter((fileName) => {
				const ds = dataSources.find(
					(d) => d.filePath === fileName || d.name === fileName,
				);
				return (
					ds &&
					(ds.permissionStatus === "prompt" || ds.permissionStatus === "denied")
				);
			});

			if (inaccessibleFiles.length > 0) {
				userMsg =
					`❌ Cannot access file(s): ${inaccessibleFiles.join(", ")}\n\n` +
					`The file handle has expired or permission was denied.\n\n` +
					`💡 Solutions:\n` +
					`1. Re-upload the file(s) using the file picker\n` +
					`2. Click the file in the explorer to grant permission again\n` +
					`3. Or remove these files from your query`;
			} else {
				userMsg =
					`❌ Query failed with file access error\n\n` +
					`DuckDB couldn't access one or more files in your query.\n` +
					`Files referenced: ${fileNames.join(", ")}\n\n` +
					`💡 Please re-upload any missing files.`;
			}
		} else {
			userMsg = `Query failed: ${errorMessage}\n\nPlease check your query syntax and file access.`;
		}
		return { userMessage: userMsg };
	}

	// File not found
	if (errorMessage.includes("No files found")) {
		userMsg = `File not found: ${errorMessage}. Please upload the file using the file selector.`;
		return { userMessage: userMsg };
	}

	// Permission denied
	if (errorMessage.includes("Permission denied")) {
		userMsg = `Permission denied: The browser couldn't access the file. Please try uploading again.`;
		return { userMessage: userMsg };
	}

	// CORS error
	if (
		errorMessage.includes("CORS") ||
		errorMessage.includes("Access-Control-Allow-Origin")
	) {
		userMsg =
			`❌ Remote file blocked by CORS policy\n\n` +
			`The remote server doesn't allow requests from this origin (localhost).\n\n` +
			`💡 Solutions:\n` +
			`1. Download the file and upload it locally instead\n` +
			`2. Use a proxy service that adds CORS headers\n` +
			`3. Contact the file host to enable CORS for your domain`;
		return { userMessage: userMsg };
	}

	// 404 error
	if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
		userMsg =
			`❌ Remote file not found (HTTP 404)\n\n` +
			`The URL in your query doesn't exist or has been moved.\n\n` +
			`💡 Solutions:\n` +
			`1. Check the URL for typos\n` +
			`2. Verify the file still exists at that location\n` +
			`3. Update your query with the correct URL`;
		return { userMessage: userMsg };
	}

	// 403 error
	if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
		userMsg =
			`❌ Access denied to remote file (HTTP 403)\n\n` +
			`The server requires authentication or doesn't allow access.\n\n` +
			`💡 Solutions:\n` +
			`1. Check if the file requires authentication\n` +
			`2. Verify you have permission to access the file\n` +
			`3. Download the file and upload it locally instead`;
		return { userMessage: userMsg };
	}

	// Network error
	if (
		errorMessage.includes("Failed to fetch") ||
		errorMessage.includes("timeout") ||
		errorMessage.includes("NetworkError")
	) {
		userMsg =
			`❌ Network error accessing remote file\n\n` +
			`The file couldn't be downloaded due to a network issue.\n\n` +
			`💡 Solutions:\n` +
			`1. Check your internet connection\n` +
			`2. Verify the server is online and accessible\n` +
			`3. Try again in a few moments\n` +
			`4. Download the file and upload it locally instead`;
		return { userMessage: userMsg };
	}

	// Stack overflow
	if (errorMessage.includes("maximum call stack")) {
		userMsg = `Query too large: This query processes too much data. Try limiting results with LIMIT clause.`;
		return { userMessage: userMsg };
	}

	return { userMessage: userMsg };
}
