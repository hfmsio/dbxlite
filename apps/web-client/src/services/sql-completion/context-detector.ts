/**
 * SQL context detection: classify the cursor position as table / column /
 * keyword / all and return the appropriate completion slice.
 *
 * Verbatim move from `lib/sqlCompletions.ts` as part of Phase 1. Behavior
 * unchanged. Phase 3b will extend `SqlContext` to carry `tablesInScope`
 * for FROM-clause-aware column filtering.
 */

import type { DialectKey } from "./dialects/types";
import {
	getFunctionsForDialect,
	getKeywordsForDialect,
} from "./dialect-registry";
import { type SQLCompletion } from "./static-completions";

/**
 * SQL completion context types
 */
export type SQLContext =
	| "table" // After FROM, JOIN: suggest table names
	| "column" // After SELECT, WHERE, ON, ORDER BY, GROUP BY: suggest columns
	| "keyword" // After complete clause: suggest next keywords
	| "all"; // Start of query or unknown context

/**
 * Detect the SQL context from the text before cursor.
 * Uses the full text up to cursor position for accurate detection.
 */
export function detectSQLContext(textUntilCursor: string): SQLContext {
	const upper = textUntilCursor.toUpperCase().trim();

	// Check what the last significant keyword is
	// Pattern: find the last occurrence of key SQL keywords

	// Regex to find last keyword position
	const patterns = {
		// Table contexts: immediately after these keywords, expect table name
		fromJoin:
			/\b(FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN)\s+$/i,
		// Column contexts: after these, expect column names
		select: /\bSELECT\s+(DISTINCT\s+)?$/i,
		selectAfterComma: /\bSELECT\s+.+,\s*$/i,
		where: /\bWHERE\s+$/i,
		whereAfterAnd: /\b(AND|OR)\s+$/i,
		on: /\bON\s+$/i,
		orderBy: /\bORDER\s+BY\s+$/i,
		orderByAfterComma: /\bORDER\s+BY\s+.+,\s*$/i,
		groupBy: /\bGROUP\s+BY\s+$/i,
		groupByAfterComma: /\bGROUP\s+BY\s+.+,\s*$/i,
		having: /\bHAVING\s+$/i,
		set: /\bSET\s+$/i,
		// Values context: after table name in UPDATE/INSERT
		insertInto: /\bINSERT\s+INTO\s+$/i,
		update: /\bUPDATE\s+$/i,
		deleteFrom: /\bDELETE\s+FROM\s+$/i,
	};

	// Check table contexts first (highest priority)
	if (
		patterns.fromJoin.test(upper) ||
		patterns.insertInto.test(upper) ||
		patterns.update.test(upper) ||
		patterns.deleteFrom.test(upper)
	) {
		return "table";
	}

	// Check column contexts
	if (
		patterns.select.test(upper) ||
		patterns.selectAfterComma.test(upper) ||
		patterns.where.test(upper) ||
		patterns.whereAfterAnd.test(upper) ||
		patterns.on.test(upper) ||
		patterns.orderBy.test(upper) ||
		patterns.orderByAfterComma.test(upper) ||
		patterns.groupBy.test(upper) ||
		patterns.groupByAfterComma.test(upper) ||
		patterns.having.test(upper) ||
		patterns.set.test(upper)
	) {
		return "column";
	}

	// If we're in the middle of typing after FROM (table name entered, space
	// after), suggest keywords like WHERE, JOIN, etc.
	if (/\bFROM\s+\w+\s+$/i.test(upper)) {
		return "keyword";
	}

	// Default: show all
	return "all";
}

/**
 * Get context-specific completions based on current text, scoped to the
 * active dialect. Pass `undefined` for ANSI-only behavior.
 */
export function getContextualCompletions(
	textUntilCursor: string,
	lineText: string,
	dialect?: DialectKey,
): SQLCompletion[] {
	const context = detectSQLContext(textUntilCursor);
	const upperLine = lineText.toUpperCase();

	const keywords = getKeywordsForDialect(dialect);
	const functions = getFunctionsForDialect(dialect);

	switch (context) {
		case "table":
			// Don't return any SQL keywords/functions: only tables should show
			return [];

		case "column":
			// Return functions (useful in SELECT) but not keywords
			return functions;

		case "keyword":
			// After FROM + table, suggest JOIN, WHERE, etc.
			if (upperLine.includes("FROM")) {
				return keywords.filter(
					(k) =>
						k.label.includes("JOIN") ||
						["WHERE", "GROUP BY", "ORDER BY", "LIMIT", "AS", "QUALIFY"].includes(
							k.label,
						),
				);
			}
			break;
	}

	// Default: return all completions (dialect-scoped keywords + functions)
	return [...keywords, ...functions];
}
