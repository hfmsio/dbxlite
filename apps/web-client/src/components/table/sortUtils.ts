/**
 * Sorting utility functions for PaginatedTable
 * These are pure functions that handle SQL ordering and in-memory sorting
 */

import type { CellValue, TableRow } from "../../types/table";

export type SortDirection = "asc" | "desc";

/**
 * Compare two values for sorting, handling nulls
 * Nulls are sorted to the end regardless of direction
 */
export function compareValues(a: CellValue, b: CellValue): number {
	if (a === null || a === undefined) return 1;
	if (b === null || b === undefined) return -1;

	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Sort rows in-memory using the given column and direction
 * Returns a new sorted array (does not mutate input)
 */
export function sortRows<T extends TableRow>(
	rows: T[],
	sortColumn: string,
	sortDirection: SortDirection,
): T[] {
	const sorted = [...rows];
	sorted.sort((a, b) => {
		const comparison = compareValues(a[sortColumn], b[sortColumn]);
		return sortDirection === "asc" ? comparison : -comparison;
	});
	return sorted;
}

/**
 * Check if SQL has an ORDER BY clause (case-insensitive)
 */
export function hasOrderByClause(sql: string): boolean {
	return /\bORDER\s+BY\b/i.test(sql);
}

/**
 * Check if SQL has a LIMIT clause (case-insensitive)
 */
export function hasLimitClause(sql: string): boolean {
	return /\bLIMIT\s+\d+/i.test(sql);
}

/**
 * Remove trailing semicolons from SQL
 */
export function cleanSqlTrailingSemicolon(sql: string): string {
	return sql.trim().replace(/;+$/, "");
}

/**
 * Build SQL with ORDER BY clause for server-side sorting
 * Optimized to avoid sorting ALL rows before pagination:
 * - If has ORDER BY or LIMIT, wraps in subquery and removes LIMIT from inner query
 * - Otherwise, appends ORDER BY directly
 * The streaming service will add pagination LIMIT/OFFSET to the outer query
 */
export function buildSortedSQL(
	baseSql: string,
	sortColumn: string | null,
	sortDirection: SortDirection,
): string {
	if (!sortColumn) return baseSql;

	// Escape column name for safe SQL (double quotes for DuckDB)
	const escapedColumn = sortColumn.replace(/"/g, '""');
	const cleanBaseSql = cleanSqlTrailingSemicolon(baseSql);

	// Check if the query already has ORDER BY or LIMIT
	const hasOrderBy = hasOrderByClause(cleanBaseSql);
	const hasLimit = hasLimitClause(cleanBaseSql);

	let sortedQuery: string;
	if (hasOrderBy || hasLimit) {
		// Query has ORDER BY or LIMIT - need to wrap it
		// OPTIMIZATION: Remove LIMIT from inner query to avoid sorting ALL rows first
		// The StreamingQueryService will add pagination LIMIT/OFFSET to the outer query
		const innerQueryWithoutLimit = cleanBaseSql.replace(
			/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?/gi,
			"",
		);
		sortedQuery = `SELECT * FROM (${innerQueryWithoutLimit.trim()}) AS sorted_data ORDER BY "${escapedColumn}" ${sortDirection.toUpperCase()}`;
	} else {
		// No ORDER BY or LIMIT, just append ORDER BY
		// The streaming service will add LIMIT/OFFSET to this query
		sortedQuery = `${cleanBaseSql} ORDER BY "${escapedColumn}" ${sortDirection.toUpperCase()}`;
	}

	return sortedQuery;
}

/**
 * Get page of data from sorted rows (in-memory pagination)
 */
export function getPageFromSortedRows<T extends TableRow>(
	rows: T[],
	pageNumber: number,
	pageSize: number,
	sortColumn: string | null,
	sortDirection: SortDirection,
): T[] {
	let data = rows;

	// Apply sorting if needed
	if (sortColumn) {
		data = sortRows(rows, sortColumn, sortDirection);
	}

	const start = pageNumber * pageSize;
	const end = start + pageSize;
	return data.slice(start, end);
}
