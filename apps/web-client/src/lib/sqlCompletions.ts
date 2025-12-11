/**
 * SQL Autocomplete Definitions
 *
 * Provides comprehensive SQL keyword, function, operator, and snippet completions
 * for Monaco Editor IntelliSense.
 */

import type * as monaco from "monaco-editor";

export interface SQLCompletion {
	label: string;
	kind: monaco.languages.CompletionItemKind;
	insertText: string;
	detail?: string;
	documentation?: string;
	insertTextRules?: monaco.languages.CompletionItemInsertTextRule;
}

/**
 * SQL Keywords
 */
export const SQL_KEYWORDS: SQLCompletion[] = [
	// SELECT clause keywords
	{
		label: "SELECT",
		kind: 14,
		insertText: "SELECT ",
		detail: "Query data",
		documentation: "Retrieve data from tables",
	},
	{
		label: "DISTINCT",
		kind: 14,
		insertText: "DISTINCT ",
		detail: "Unique values",
		documentation: "Return only distinct values",
	},
	{
		label: "ALL",
		kind: 14,
		insertText: "ALL ",
		detail: "All values",
		documentation: "Return all values including duplicates",
	},

	// FROM clause
	{
		label: "FROM",
		kind: 14,
		insertText: "FROM ",
		detail: "Specify table",
		documentation: "Specify the table to query",
	},

	// JOIN types
	{
		label: "JOIN",
		kind: 14,
		insertText: "JOIN ",
		detail: "Inner join",
		documentation: "Combine rows from two or more tables",
	},
	{
		label: "INNER JOIN",
		kind: 14,
		insertText: "INNER JOIN ",
		detail: "Inner join",
		documentation: "Return matching rows from both tables",
	},
	{
		label: "LEFT JOIN",
		kind: 14,
		insertText: "LEFT JOIN ",
		detail: "Left outer join",
		documentation:
			"Return all rows from left table and matching rows from right",
	},
	{
		label: "RIGHT JOIN",
		kind: 14,
		insertText: "RIGHT JOIN ",
		detail: "Right outer join",
		documentation:
			"Return all rows from right table and matching rows from left",
	},
	{
		label: "FULL JOIN",
		kind: 14,
		insertText: "FULL JOIN ",
		detail: "Full outer join",
		documentation: "Return all rows when there is a match in either table",
	},
	{
		label: "CROSS JOIN",
		kind: 14,
		insertText: "CROSS JOIN ",
		detail: "Cartesian product",
		documentation: "Return Cartesian product of both tables",
	},
	{
		label: "ON",
		kind: 14,
		insertText: "ON ",
		detail: "Join condition",
		documentation: "Specify the condition for joining tables",
	},

	// WHERE clause
	{
		label: "WHERE",
		kind: 14,
		insertText: "WHERE ",
		detail: "Filter condition",
		documentation: "Filter rows based on a condition",
	},
	{
		label: "AND",
		kind: 14,
		insertText: "AND ",
		detail: "Logical AND",
		documentation: "Combine conditions with AND logic",
	},
	{
		label: "OR",
		kind: 14,
		insertText: "OR ",
		detail: "Logical OR",
		documentation: "Combine conditions with OR logic",
	},
	{
		label: "NOT",
		kind: 14,
		insertText: "NOT ",
		detail: "Logical NOT",
		documentation: "Negate a condition",
	},
	{
		label: "IN",
		kind: 14,
		insertText: "IN ",
		detail: "Match any value",
		documentation: "Check if value matches any in a list",
	},
	{
		label: "BETWEEN",
		kind: 14,
		insertText: "BETWEEN ",
		detail: "Range check",
		documentation: "Check if value is within a range",
	},
	{
		label: "LIKE",
		kind: 14,
		insertText: "LIKE ",
		detail: "Pattern match",
		documentation: "Match a pattern using wildcards",
	},
	{
		label: "ILIKE",
		kind: 14,
		insertText: "ILIKE ",
		detail: "Case-insensitive pattern match",
		documentation: "Case-insensitive LIKE",
	},
	{
		label: "IS NULL",
		kind: 14,
		insertText: "IS NULL",
		detail: "Check for null",
		documentation: "Check if value is NULL",
	},
	{
		label: "IS NOT NULL",
		kind: 14,
		insertText: "IS NOT NULL",
		detail: "Check not null",
		documentation: "Check if value is not NULL",
	},

	// GROUP BY clause
	{
		label: "GROUP BY",
		kind: 14,
		insertText: "GROUP BY ",
		detail: "Group rows",
		documentation: "Group rows that have the same values",
	},
	{
		label: "HAVING",
		kind: 14,
		insertText: "HAVING ",
		detail: "Group filter",
		documentation: "Filter groups after GROUP BY",
	},

	// ORDER BY clause
	{
		label: "ORDER BY",
		kind: 14,
		insertText: "ORDER BY ",
		detail: "Sort results",
		documentation: "Sort the result set",
	},
	{
		label: "ASC",
		kind: 14,
		insertText: "ASC",
		detail: "Ascending order",
		documentation: "Sort in ascending order",
	},
	{
		label: "DESC",
		kind: 14,
		insertText: "DESC",
		detail: "Descending order",
		documentation: "Sort in descending order",
	},

	// LIMIT clause
	{
		label: "LIMIT",
		kind: 14,
		insertText: "LIMIT ",
		detail: "Limit rows",
		documentation: "Limit the number of rows returned",
	},
	{
		label: "OFFSET",
		kind: 14,
		insertText: "OFFSET ",
		detail: "Skip rows",
		documentation: "Skip a number of rows",
	},

	// UNION
	{
		label: "UNION",
		kind: 14,
		insertText: "UNION\n",
		detail: "Combine queries",
		documentation: "Combine results of two or more queries",
	},
	{
		label: "UNION ALL",
		kind: 14,
		insertText: "UNION ALL\n",
		detail: "Combine all results",
		documentation: "Combine results including duplicates",
	},

	// Subqueries
	{
		label: "EXISTS",
		kind: 14,
		insertText: "EXISTS ",
		detail: "Subquery check",
		documentation: "Check if subquery returns any rows",
	},
	{
		label: "ANY",
		kind: 14,
		insertText: "ANY ",
		detail: "Compare to any",
		documentation: "Compare to any value returned by subquery",
	},
	{
		label: "SOME",
		kind: 14,
		insertText: "SOME ",
		detail: "Compare to some",
		documentation: "Synonym for ANY",
	},

	// DML statements
	{
		label: "INSERT INTO",
		kind: 14,
		insertText: "INSERT INTO ",
		detail: "Insert rows",
		documentation: "Insert new rows into a table",
	},
	{
		label: "VALUES",
		kind: 14,
		insertText: "VALUES ",
		detail: "Specify values",
		documentation: "Specify values to insert",
	},
	{
		label: "UPDATE",
		kind: 14,
		insertText: "UPDATE ",
		detail: "Update rows",
		documentation: "Update existing rows in a table",
	},
	{
		label: "SET",
		kind: 14,
		insertText: "SET ",
		detail: "Set values",
		documentation: "Set column values",
	},
	{
		label: "DELETE FROM",
		kind: 14,
		insertText: "DELETE FROM ",
		detail: "Delete rows",
		documentation: "Delete rows from a table",
	},

	// DDL statements
	{
		label: "CREATE TABLE",
		kind: 14,
		insertText: "CREATE TABLE ",
		detail: "Create table",
		documentation: "Create a new table",
	},
	{
		label: "DROP TABLE",
		kind: 14,
		insertText: "DROP TABLE ",
		detail: "Drop table",
		documentation: "Delete a table",
	},
	{
		label: "ALTER TABLE",
		kind: 14,
		insertText: "ALTER TABLE ",
		detail: "Alter table",
		documentation: "Modify an existing table",
	},
	{
		label: "CREATE INDEX",
		kind: 14,
		insertText: "CREATE INDEX ",
		detail: "Create index",
		documentation: "Create an index",
	},
	{
		label: "DROP INDEX",
		kind: 14,
		insertText: "DROP INDEX ",
		detail: "Drop index",
		documentation: "Delete an index",
	},

	// Constraints
	{
		label: "PRIMARY KEY",
		kind: 14,
		insertText: "PRIMARY KEY",
		detail: "Primary key",
		documentation: "Define primary key constraint",
	},
	{
		label: "FOREIGN KEY",
		kind: 14,
		insertText: "FOREIGN KEY",
		detail: "Foreign key",
		documentation: "Define foreign key constraint",
	},
	{
		label: "UNIQUE",
		kind: 14,
		insertText: "UNIQUE",
		detail: "Unique constraint",
		documentation: "Ensure column values are unique",
	},
	{
		label: "NOT NULL",
		kind: 14,
		insertText: "NOT NULL",
		detail: "Not null constraint",
		documentation: "Ensure column cannot contain NULL",
	},
	{
		label: "DEFAULT",
		kind: 14,
		insertText: "DEFAULT ",
		detail: "Default value",
		documentation: "Set default value for column",
	},

	// Other keywords
	{
		label: "AS",
		kind: 14,
		insertText: "AS ",
		detail: "Alias",
		documentation: "Create an alias",
	},
	{
		label: "CASE",
		kind: 14,
		insertText: "CASE ",
		detail: "Conditional expression",
		documentation: "Conditional logic",
	},
	{
		label: "WHEN",
		kind: 14,
		insertText: "WHEN ",
		detail: "Condition branch",
		documentation: "Specify condition in CASE",
	},
	{
		label: "THEN",
		kind: 14,
		insertText: "THEN ",
		detail: "Result value",
		documentation: "Specify result in CASE",
	},
	{
		label: "ELSE",
		kind: 14,
		insertText: "ELSE ",
		detail: "Default value",
		documentation: "Specify default value in CASE",
	},
	{
		label: "END",
		kind: 14,
		insertText: "END",
		detail: "End CASE",
		documentation: "End CASE expression",
	},
	{
		label: "WITH",
		kind: 14,
		insertText: "WITH ",
		detail: "Common Table Expression",
		documentation: "Define a CTE",
	},
];

/**
 * SQL Functions
 */
export const SQL_FUNCTIONS: SQLCompletion[] = [
	// Aggregate functions
	{
		label: "COUNT",
		kind: 1,
		insertText: "COUNT(${1:column})",
		detail: "Count rows",
		documentation: "Count the number of rows",
		insertTextRules: 4,
	},
	{
		label: "SUM",
		kind: 1,
		insertText: "SUM(${1:column})",
		detail: "Sum values",
		documentation: "Calculate sum of values",
		insertTextRules: 4,
	},
	{
		label: "AVG",
		kind: 1,
		insertText: "AVG(${1:column})",
		detail: "Average",
		documentation: "Calculate average of values",
		insertTextRules: 4,
	},
	{
		label: "MIN",
		kind: 1,
		insertText: "MIN(${1:column})",
		detail: "Minimum value",
		documentation: "Find minimum value",
		insertTextRules: 4,
	},
	{
		label: "MAX",
		kind: 1,
		insertText: "MAX(${1:column})",
		detail: "Maximum value",
		documentation: "Find maximum value",
		insertTextRules: 4,
	},
	{
		label: "COUNT_DISTINCT",
		kind: 1,
		insertText: "COUNT(DISTINCT ${1:column})",
		detail: "Count distinct",
		documentation: "Count distinct values",
		insertTextRules: 4,
	},

	// String functions
	{
		label: "CONCAT",
		kind: 1,
		insertText: "CONCAT(${1:str1}, ${2:str2})",
		detail: "Concatenate strings",
		documentation: "Concatenate two or more strings",
		insertTextRules: 4,
	},
	{
		label: "UPPER",
		kind: 1,
		insertText: "UPPER(${1:string})",
		detail: "Convert to uppercase",
		documentation: "Convert string to uppercase",
		insertTextRules: 4,
	},
	{
		label: "LOWER",
		kind: 1,
		insertText: "LOWER(${1:string})",
		detail: "Convert to lowercase",
		documentation: "Convert string to lowercase",
		insertTextRules: 4,
	},
	{
		label: "TRIM",
		kind: 1,
		insertText: "TRIM(${1:string})",
		detail: "Remove whitespace",
		documentation: "Remove leading and trailing whitespace",
		insertTextRules: 4,
	},
	{
		label: "SUBSTRING",
		kind: 1,
		insertText: "SUBSTRING(${1:string}, ${2:start}, ${3:length})",
		detail: "Extract substring",
		documentation: "Extract substring from string",
		insertTextRules: 4,
	},
	{
		label: "LENGTH",
		kind: 1,
		insertText: "LENGTH(${1:string})",
		detail: "String length",
		documentation: "Get length of string",
		insertTextRules: 4,
	},
	{
		label: "REPLACE",
		kind: 1,
		insertText: "REPLACE(${1:string}, ${2:from}, ${3:to})",
		detail: "Replace substring",
		documentation: "Replace substring in string",
		insertTextRules: 4,
	},

	// Date/Time functions
	{
		label: "NOW",
		kind: 1,
		insertText: "NOW()",
		detail: "Current timestamp",
		documentation: "Get current timestamp",
	},
	{
		label: "CURRENT_DATE",
		kind: 1,
		insertText: "CURRENT_DATE",
		detail: "Current date",
		documentation: "Get current date",
	},
	{
		label: "CURRENT_TIME",
		kind: 1,
		insertText: "CURRENT_TIME",
		detail: "Current time",
		documentation: "Get current time",
	},
	{
		label: "DATE_TRUNC",
		kind: 1,
		insertText: "DATE_TRUNC(${1:'day'}, ${2:timestamp})",
		detail: "Truncate date",
		documentation: "Truncate timestamp to specified precision",
		insertTextRules: 4,
	},
	{
		label: "DATE_PART",
		kind: 1,
		insertText: "DATE_PART(${1:'year'}, ${2:timestamp})",
		detail: "Extract date part",
		documentation: "Extract part of a date",
		insertTextRules: 4,
	},
	{
		label: "DATE_DIFF",
		kind: 1,
		insertText: "DATE_DIFF(${1:'day'}, ${2:start}, ${3:end})",
		detail: "Date difference",
		documentation: "Calculate difference between dates",
		insertTextRules: 4,
	},
	{
		label: "EXTRACT",
		kind: 1,
		insertText: "EXTRACT(${1:YEAR} FROM ${2:date})",
		detail: "Extract date component",
		documentation: "Extract component from date",
		insertTextRules: 4,
	},

	// Math functions
	{
		label: "ROUND",
		kind: 1,
		insertText: "ROUND(${1:number}, ${2:decimals})",
		detail: "Round number",
		documentation: "Round number to specified decimals",
		insertTextRules: 4,
	},
	{
		label: "FLOOR",
		kind: 1,
		insertText: "FLOOR(${1:number})",
		detail: "Round down",
		documentation: "Round down to nearest integer",
		insertTextRules: 4,
	},
	{
		label: "CEIL",
		kind: 1,
		insertText: "CEIL(${1:number})",
		detail: "Round up",
		documentation: "Round up to nearest integer",
		insertTextRules: 4,
	},
	{
		label: "ABS",
		kind: 1,
		insertText: "ABS(${1:number})",
		detail: "Absolute value",
		documentation: "Get absolute value",
		insertTextRules: 4,
	},
	{
		label: "POWER",
		kind: 1,
		insertText: "POWER(${1:base}, ${2:exponent})",
		detail: "Exponentiation",
		documentation: "Raise number to power",
		insertTextRules: 4,
	},
	{
		label: "SQRT",
		kind: 1,
		insertText: "SQRT(${1:number})",
		detail: "Square root",
		documentation: "Calculate square root",
		insertTextRules: 4,
	},

	// Type conversion
	{
		label: "CAST",
		kind: 1,
		insertText: "CAST(${1:value} AS ${2:type})",
		detail: "Type conversion",
		documentation: "Convert value to specified type",
		insertTextRules: 4,
	},
	{
		label: "COALESCE",
		kind: 1,
		insertText: "COALESCE(${1:value1}, ${2:value2})",
		detail: "First non-null",
		documentation: "Return first non-null value",
		insertTextRules: 4,
	},
	{
		label: "NULLIF",
		kind: 1,
		insertText: "NULLIF(${1:value1}, ${2:value2})",
		detail: "NULL if equal",
		documentation: "Return NULL if values are equal",
		insertTextRules: 4,
	},

	// Window functions
	{
		label: "ROW_NUMBER",
		kind: 1,
		insertText: "ROW_NUMBER() OVER (${1:ORDER BY column})",
		detail: "Row number",
		documentation: "Assign sequential row number",
		insertTextRules: 4,
	},
	{
		label: "RANK",
		kind: 1,
		insertText: "RANK() OVER (${1:ORDER BY column})",
		detail: "Rank with gaps",
		documentation: "Assign rank with gaps for ties",
		insertTextRules: 4,
	},
	{
		label: "DENSE_RANK",
		kind: 1,
		insertText: "DENSE_RANK() OVER (${1:ORDER BY column})",
		detail: "Dense rank",
		documentation: "Assign rank without gaps",
		insertTextRules: 4,
	},
	{
		label: "LAG",
		kind: 1,
		insertText: "LAG(${1:column}, ${2:offset}) OVER (${3:ORDER BY column})",
		detail: "Previous row value",
		documentation: "Access value from previous row",
		insertTextRules: 4,
	},
	{
		label: "LEAD",
		kind: 1,
		insertText: "LEAD(${1:column}, ${2:offset}) OVER (${3:ORDER BY column})",
		detail: "Next row value",
		documentation: "Access value from next row",
		insertTextRules: 4,
	},
];

/**
 * SQL Snippets
 */
export const SQL_SNIPPETS: SQLCompletion[] = [
	{
		label: "select-basic",
		kind: 27,
		insertText: "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition}",
		detail: "Basic SELECT statement",
		documentation: "Template for basic SELECT query",
		insertTextRules: 4,
	},
	{
		label: "select-join",
		kind: 27,
		insertText:
			"SELECT ${1:a}.*, ${2:b}.*\nFROM ${3:table1} ${1:a}\nJOIN ${4:table2} ${2:b} ON ${1:a}.${5:id} = ${2:b}.${6:id}\nWHERE ${7:condition}",
		detail: "SELECT with JOIN",
		documentation: "Template for SELECT with JOIN",
		insertTextRules: 4,
	},
	{
		label: "select-group",
		kind: 27,
		insertText:
			"SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table}\nGROUP BY ${1:column}\nORDER BY count DESC",
		detail: "SELECT with GROUP BY",
		documentation: "Template for SELECT with GROUP BY and aggregate",
		insertTextRules: 4,
	},
	{
		label: "select-cte",
		kind: 27,
		insertText:
			"WITH ${1:cte_name} AS (\n  SELECT ${2:*}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name}",
		detail: "SELECT with CTE",
		documentation: "Template for Common Table Expression",
		insertTextRules: 4,
	},
	{
		label: "select-window",
		kind: 27,
		insertText:
			"SELECT\n  ${1:column},\n  ROW_NUMBER() OVER (ORDER BY ${2:column}) as row_num\nFROM ${3:table}",
		detail: "SELECT with window function",
		documentation: "Template for SELECT with window function",
		insertTextRules: 4,
	},
	{
		label: "insert",
		kind: 27,
		insertText:
			"INSERT INTO ${1:table} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2})",
		detail: "INSERT statement",
		documentation: "Template for INSERT",
		insertTextRules: 4,
	},
	{
		label: "update",
		kind: 27,
		insertText:
			"UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition}",
		detail: "UPDATE statement",
		documentation: "Template for UPDATE",
		insertTextRules: 4,
	},
	{
		label: "delete",
		kind: 27,
		insertText: "DELETE FROM ${1:table}\nWHERE ${2:condition}",
		detail: "DELETE statement",
		documentation: "Template for DELETE",
		insertTextRules: 4,
	},
	{
		label: "case-when",
		kind: 27,
		insertText:
			"CASE\n  WHEN ${1:condition1} THEN ${2:value1}\n  WHEN ${3:condition2} THEN ${4:value2}\n  ELSE ${5:default_value}\nEND",
		detail: "CASE WHEN expression",
		documentation: "Template for CASE WHEN",
		insertTextRules: 4,
	},
];

/**
 * Get all SQL completions (keywords + functions + snippets)
 */
export function getAllSQLCompletions(): SQLCompletion[] {
	return [...SQL_KEYWORDS, ...SQL_FUNCTIONS, ...SQL_SNIPPETS];
}

/**
 * SQL completion context types
 */
export type SQLContext =
	| "table" // After FROM, JOIN - suggest table names
	| "column" // After SELECT, WHERE, ON, ORDER BY, GROUP BY - suggest columns
	| "keyword" // After complete clause - suggest next keywords
	| "all"; // Start of query or unknown context

/**
 * Detect the SQL context from the text before cursor
 * Uses the full text up to cursor position for accurate detection
 */
export function detectSQLContext(textUntilCursor: string): SQLContext {
	const upper = textUntilCursor.toUpperCase().trim();

	// Check what the last significant keyword is
	// Pattern: find the last occurrence of key SQL keywords

	// Regex to find last keyword position
	const patterns = {
		// Table contexts - immediately after these keywords, expect table name
		fromJoin:
			/\b(FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN)\s+$/i,
		// Column contexts - after these, expect column names
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
		// Values context - after table name in UPDATE/INSERT
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

	// If we're in the middle of typing after FROM (table name entered, space after)
	// suggest keywords like WHERE, JOIN, etc.
	if (/\bFROM\s+\w+\s+$/i.test(upper)) {
		return "keyword";
	}

	// Default: show all
	return "all";
}

/**
 * Get context-specific completions based on current text
 */
export function getContextualCompletions(
	textUntilCursor: string,
	lineText: string,
): SQLCompletion[] {
	const context = detectSQLContext(textUntilCursor);
	const upperLine = lineText.toUpperCase();

	switch (context) {
		case "table":
			// Don't return any SQL keywords/functions - only tables should show
			return [];

		case "column":
			// Return functions (useful in SELECT) but not keywords
			return SQL_FUNCTIONS;

		case "keyword":
			// After FROM + table, suggest JOIN, WHERE, etc.
			if (upperLine.includes("FROM")) {
				return SQL_KEYWORDS.filter(
					(k) =>
						k.label.includes("JOIN") ||
						["WHERE", "GROUP BY", "ORDER BY", "LIMIT", "AS"].includes(k.label),
				);
			}
			break;
	}

	// Default: return all completions
	return getAllSQLCompletions();
}

/**
 * Table alias mapping from SQL query
 */
export interface TableAlias {
	alias: string;
	tableName: string;
	databaseName?: string;
	schemaName?: string;
	/** True if this alias references a CTE (no schema available) */
	isCTE?: boolean;
}

/**
 * Parse CTE (Common Table Expression) names from SQL query
 * Matches: WITH name AS (...), name2 AS (...)
 * Returns set of CTE names defined in the query
 */
export function parseCTENames(sql: string): Set<string> {
	const cteNames = new Set<string>();

	// Match WITH clause and extract CTE names
	// Pattern: WITH name AS (...), name2 AS (...)
	// Need to handle nested parentheses in CTE body
	const withMatch = sql.match(/\bWITH\s+(?:RECURSIVE\s+)?(.+?)(?=\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/is);

	if (!withMatch) return cteNames;

	const withClause = withMatch[1];

	// Extract CTE names: "name AS (" pattern
	// We look for identifier followed by AS and opening paren
	const ctePattern = /(\w+)\s+AS\s*\(/gi;
	let match: RegExpExecArray | null;

	while ((match = ctePattern.exec(withClause)) !== null) {
		const cteName = match[1];
		// Skip if it looks like a SQL keyword
		const upperName = cteName.toUpperCase();
		if (!['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'FROM', 'WHERE'].includes(upperName)) {
			cteNames.add(cteName);
		}
	}

	return cteNames;
}

/**
 * Parse table aliases from SQL query
 * Matches patterns:
 * - FROM table AS alias
 * - FROM table alias
 * - FROM db.table AS alias
 * - FROM db.schema.table alias
 * - JOIN table AS alias ON ...
 * - , table AS alias (comma-separated in FROM clause)
 *
 * @param sql The SQL query to parse
 * @param cteNames Optional set of CTE names to mark aliases as CTE references
 */
export function parseTableAliases(sql: string, cteNames?: Set<string>): TableAlias[] {
	const aliases: TableAlias[] = [];

	// Pattern to match table references with optional aliases
	// Matches: FROM/JOIN/comma [db.][schema.]table [AS] alias
	// Also handles backticks for BigQuery: `project.dataset.table`
	const tableRefPattern =
		/(?:\b(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN)\s+|,\s*)(`[^`]+`|[\w.]+)(?:\s+(?:AS\s+)?(\w+))?/gi;

	let match: RegExpExecArray | null;

	while ((match = tableRefPattern.exec(sql)) !== null) {
		const fullTableRef = match[1];
		const alias = match[2];

		// Skip if no alias provided
		if (!alias) continue;

		// Skip SQL keywords that might match as aliases
		const upperAlias = alias.toUpperCase();
		if (
			[
				"WHERE",
				"JOIN",
				"INNER",
				"LEFT",
				"RIGHT",
				"FULL",
				"CROSS",
				"ON",
				"AND",
				"OR",
				"ORDER",
				"GROUP",
				"HAVING",
				"LIMIT",
				"OFFSET",
				"UNION",
				"EXCEPT",
				"INTERSECT",
			].includes(upperAlias)
		) {
			continue;
		}

		// Parse the table reference (could be db.schema.table or just table)
		// Remove backticks for parsing
		const cleanRef = fullTableRef.replace(/`/g, "");
		const parts = cleanRef.split(".");

		const tableName = parts[parts.length - 1];
		const result: TableAlias = {
			alias,
			tableName,
			// Mark as CTE if the table name matches a CTE definition
			isCTE: cteNames?.has(tableName) ?? false,
		};

		if (parts.length === 2) {
			// db.table or schema.table
			result.databaseName = parts[0];
		} else if (parts.length >= 3) {
			// db.schema.table (or project.dataset.table for BigQuery)
			result.databaseName = parts[0];
			result.schemaName = parts[1];
		}

		aliases.push(result);
	}

	return aliases;
}
