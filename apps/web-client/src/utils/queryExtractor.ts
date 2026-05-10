/**
 * Split SQL on `;` characters that are at top level — i.e. NOT inside a
 * line comment (`-- ...`), block comment (`/* ... *\/`), single-quoted
 * string, or double-quoted identifier. Returns parts in the same shape as
 * `String.split(";")` so caller position-math stays valid.
 *
 * Doesn't try to parse fully (no dollar-quoted strings, no escape rules
 * beyond standard SQL `''` doubling) — the goal is just to stop comments
 * with embedded `;` from corrupting the split.
 */
function splitOnTopLevelSemicolons(sql: string): string[] {
	const parts: string[] = [];
	let buf = "";
	let i = 0;
	const n = sql.length;
	while (i < n) {
		const c = sql[i];
		const next = i + 1 < n ? sql[i + 1] : "";

		if (c === "-" && next === "-") {
			// Line comment — consume to end of line.
			while (i < n && sql[i] !== "\n") {
				buf += sql[i++];
			}
			continue;
		}
		if (c === "/" && next === "*") {
			// Block comment — consume to */
			buf += sql[i++];
			buf += sql[i++];
			while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) {
				buf += sql[i++];
			}
			if (i < n) {
				buf += sql[i++]; // *
				buf += sql[i++]; // /
			}
			continue;
		}
		if (c === "'" || c === '"') {
			// Quoted string / identifier. SQL doubles the quote to escape.
			const quote = c;
			buf += sql[i++];
			while (i < n) {
				if (sql[i] === quote) {
					if (sql[i + 1] === quote) {
						// Escaped quote — keep both, advance two.
						buf += sql[i++];
						buf += sql[i++];
						continue;
					}
					buf += sql[i++]; // closing quote
					break;
				}
				buf += sql[i++];
			}
			continue;
		}
		if (c === ";") {
			parts.push(buf);
			buf = "";
			i++;
			continue;
		}
		buf += sql[i++];
	}
	parts.push(buf);
	return parts;
}

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

	// Split into statements at semicolons that are OUTSIDE line comments,
	// block comments, single-quoted strings, and double-quoted identifiers.
	// A naive `fullText.split(";")` would slice through `;` characters that
	// appear inside `-- ... ;` comments and feed the post-semicolon comment
	// tail to the engine as its own statement, which the parser rejects.
	const parts = splitOnTopLevelSemicolons(fullText);

	const queries: Array<{
		start: number; // Start of raw part in original string
		textStart: number; // Start of actual text (after leading whitespace)
		end: number; // End of the query text (before semicolon)
		endWithSemicolon: number; // Position including the semicolon
		text: string;
	}> = [];
	let currentStart = 0;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const trimmedPart = part.trim();

		if (trimmedPart) {
			const start = currentStart;
			const leadingWhitespace = part.length - part.trimStart().length;
			const textStart = start + leadingWhitespace;
			const end = start + part.length;
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
