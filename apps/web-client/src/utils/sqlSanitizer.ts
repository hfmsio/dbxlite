/**
 * SQL Sanitization Utilities
 *
 * Provides functions to safely escape user input for SQL queries.
 * Prevents SQL injection attacks when building dynamic SQL.
 *
 * Note: DuckDB doesn't support parameterized queries in all contexts
 * (e.g., ATTACH, DETACH, dynamic table names), so we use escaping.
 */

/**
 * Escape a SQL identifier (table, column, database, schema name).
 * Uses double-quote escaping per SQL standard.
 *
 * @example
 * escapeIdentifier('users') // '"users"'
 * escapeIdentifier('my"table') // '"my""table"'
 * escapeIdentifier('; DROP TABLE users; --') // '"; DROP TABLE users; --"'
 */
export function escapeIdentifier(identifier: string): string {
	// Double any existing double-quotes, wrap in double-quotes
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Escape a SQL string literal.
 * Uses single-quote escaping per SQL standard.
 *
 * @example
 * escapeStringLiteral("hello") // "'hello'"
 * escapeStringLiteral("O'Brien") // "'O''Brien'"
 * escapeStringLiteral("'; DROP TABLE users; --") // "'''; DROP TABLE users; --'"
 */
export function escapeStringLiteral(value: string): string {
	// Double any existing single-quotes, wrap in single-quotes
	return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build a safe ATTACH statement.
 *
 * @param filePath - Path to the database file
 * @param alias - Database alias (will be escaped as identifier)
 * @param readOnly - Whether to attach in read-only mode
 * @returns Safe SQL ATTACH statement
 */
export function buildAttachSQL(
	filePath: string,
	alias: string,
	readOnly = true,
): string {
	const escapedPath = escapeStringLiteral(filePath);
	const escapedAlias = escapeIdentifier(alias);
	const mode = readOnly ? " (READ_ONLY)" : "";
	return `ATTACH ${escapedPath} AS ${escapedAlias}${mode}`;
}

/**
 * Build a safe DETACH statement.
 *
 * @param alias - Database alias to detach
 * @returns Safe SQL DETACH statement
 */
export function buildDetachSQL(alias: string): string {
	return `DETACH ${escapeIdentifier(alias)}`;
}

/**
 * Build a safe SELECT * FROM file path query.
 *
 * @param filePath - Path to the file
 * @param limit - Optional LIMIT clause
 * @returns Safe SQL SELECT statement
 */
export function buildSelectFromFile(filePath: string, limit?: number): string {
	const escapedPath = escapeStringLiteral(filePath);
	const limitClause = typeof limit === "number" ? ` LIMIT ${limit}` : "";
	return `SELECT * FROM ${escapedPath}${limitClause}`;
}

/**
 * Build a safe WHERE clause for matching a database name.
 *
 * @param columnName - Column to match (e.g., 'database_name', 'catalog_name')
 * @param value - Value to match
 * @returns Safe WHERE clause fragment (without WHERE keyword)
 */
export function buildWhereEquals(columnName: string, value: string): string {
	return `${escapeIdentifier(columnName)} = ${escapeStringLiteral(value)}`;
}

/**
 * Build a safe WHERE clause for LIKE matching.
 *
 * @param columnName - Column to match
 * @param pattern - LIKE pattern (caller must include % wildcards if needed)
 * @returns Safe WHERE clause fragment (without WHERE keyword)
 */
export function buildWhereLike(columnName: string, pattern: string): string {
	return `${escapeIdentifier(columnName)} LIKE ${escapeStringLiteral(pattern)}`;
}

/**
 * Escape a value for use in a LIKE pattern.
 * Escapes %, _, and \ characters.
 *
 * @param value - Value to escape for LIKE
 * @returns Escaped value safe for LIKE pattern
 */
export function escapeLikePattern(value: string): string {
	return value.replace(/[%_\\]/g, "\\$&");
}
