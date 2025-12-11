/**
 * Remove SQL comments from a query
 * Handles both single-line (--) and multi-line (/* *\/) comments
 */
function stripSQLComments(sql: string): string {
	let result = sql;

	// Remove multi-line comments /* ... */
	result = result.replace(/\/\*[\s\S]*?\*\//g, "");

	// Remove single-line comments -- ...
	// Split by newlines, remove comment portion, rejoin
	result = result
		.split("\n")
		.map((line) => {
			const commentIndex = line.indexOf("--");
			if (commentIndex >= 0) {
				// Keep everything before the --
				return line.substring(0, commentIndex);
			}
			return line;
		})
		.join("\n");

	return result.trim();
}

/**
 * Extract the SQL query at the cursor position
 * Uses semicolon as delimiter to separate multiple queries
 *
 * Behavior:
 * - If text is selected, returns the selected text
 * - If cursor is within a statement, returns that statement
 * - If cursor is ON the semicolon or in whitespace after it, returns the PREVIOUS statement
 *   (this matches the natural flow: type statement, hit semicolon, hit Cmd+Enter)
 */
export function extractQueryAtCursor(
	fullText: string,
	cursorPosition: number,
	selectedText?: string,
): string {
	// If text is selected, return only the selected portion (with comments stripped)
	if (selectedText?.trim()) {
		return stripSQLComments(selectedText.trim());
	}

	// Split by semicolon to get all queries
	// Track both the end of the text AND the position including the semicolon
	const queries: Array<{
		start: number; // Start of raw part in original string
		textStart: number; // Start of actual text (after leading whitespace)
		end: number; // End of the query text (before semicolon)
		endWithSemicolon: number; // Position including the semicolon
		text: string;
	}> = [];
	let currentStart = 0;

	// Find all queries separated by semicolons
	const parts = fullText.split(";");

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const trimmedPart = part.trim();

		if (trimmedPart) {
			// Calculate the actual position in the original string
			const start = currentStart;
			// Calculate where actual text begins (after leading whitespace)
			const leadingWhitespace = part.length - part.trimStart().length;
			const textStart = start + leadingWhitespace;
			const end = start + part.length;
			// Include the semicolon position (except for the last part which may not have one)
			const hasSemicolon = i < parts.length - 1;
			const endWithSemicolon = hasSemicolon ? end + 1 : end;

			queries.push({
				start,
				textStart,
				end,
				endWithSemicolon,
				text: trimmedPart,
			});
		}

		// Move to next part (+ 1 for the semicolon)
		currentStart += part.length + 1;
	}

	// Find which query contains the cursor
	// Track the previous query to handle the "gap" case
	let previousQuery: (typeof queries)[0] | null = null;

	for (const query of queries) {
		// If cursor is in leading whitespace before the first query, return first query
		if (!previousQuery && cursorPosition < query.textStart) {
			return stripSQLComments(query.text);
		}

		// If cursor is in the gap between previous query's semicolon and this query's actual text,
		// prefer the previous statement (user just finished typing it)
		// This includes whitespace after semicolon but before the next query's text
		if (
			previousQuery &&
			cursorPosition > previousQuery.endWithSemicolon &&
			cursorPosition < query.textStart
		) {
			return stripSQLComments(previousQuery.text);
		}

		// Check if cursor is within this query's text OR at its semicolon
		if (
			cursorPosition >= query.textStart &&
			cursorPosition <= query.endWithSemicolon
		) {
			return stripSQLComments(query.text);
		}

		previousQuery = query;
	}

	// If cursor is past the last query (e.g., trailing whitespace after last semicolon)
	if (previousQuery && cursorPosition > previousQuery.endWithSemicolon) {
		return stripSQLComments(previousQuery.text);
	}

	// If cursor is not within any query, return the last non-empty query
	// or the entire text if no semicolons found
	if (queries.length > 0) {
		return stripSQLComments(queries[queries.length - 1].text);
	}

	return stripSQLComments(fullText.trim());
}
