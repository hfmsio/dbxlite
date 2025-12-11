/**
 * Type Formatter - Parse and format complex data types for display
 *
 * Handles DuckDB, BigQuery, and Arrow type formats:
 * - DuckDB: STRUCT(field1 INT, field2 VARCHAR), LIST(INT), MAP(VARCHAR, INT)
 * - BigQuery: STRUCT<field1 INT64, field2 STRING>, ARRAY<INT64>
 * - Arrow: Struct<field1: Int32, field2: Utf8>, List<Int32>
 */

interface StructField {
	name: string;
	type: string;
}

/**
 * Check if a type string represents a complex type
 */
export function isComplexType(type: string): boolean {
	if (!type) return false;
	const normalized = type.toUpperCase().trim();
	return (
		normalized.startsWith("STRUCT") ||
		normalized.startsWith("LIST") ||
		normalized.startsWith("ARRAY") ||
		normalized.startsWith("MAP") ||
		normalized.includes("STRUCT<") ||
		normalized.includes("ARRAY<") ||
		normalized.includes("LIST<") ||
		/\[\]\s*$/.test(normalized) // DuckDB array syntax: VARCHAR[]
	);
}

/**
 * Extract inner type from LIST/ARRAY
 * Examples:
 *   LIST(INTEGER) -> INTEGER
 *   ARRAY<STRUCT<name STRING>> -> STRUCT<name STRING>
 *   List<Int32> -> Int32
 */
function extractListElementType(type: string): string {
	const normalized = type.trim();

	// Handle DuckDB array syntax: VARCHAR[]
	const arrayMatch = normalized.match(/^(.*)\[\]\s*$/);
	if (arrayMatch) {
		return arrayMatch[1].trim();
	}

	// Handle DuckDB/SQL style: LIST(...)
	if (normalized.toUpperCase().startsWith("LIST(")) {
		return extractParenthesizedContent(normalized);
	}

	// Handle BigQuery/Arrow style: ARRAY<...> or List<...>
	if (normalized.match(/^(ARRAY|LIST)</i)) {
		return extractAngleBracketContent(normalized);
	}

	return "UNKNOWN";
}

/**
 * Extract key and value types from MAP
 * Examples:
 *   MAP(VARCHAR, INTEGER) -> ['VARCHAR', 'INTEGER']
 *   MAP(STRING, STRUCT<field INT>) -> ['STRING', 'STRUCT<field INT>']
 */
function extractMapTypes(type: string): [string, string] {
	const content = extractParenthesizedContent(type);

	// Split by comma, but respect nesting
	let depth = 0;
	let keyType = "";
	let valueType = "";
	let currentPart = "";

	for (let i = 0; i < content.length; i++) {
		const char = content[i];

		if (char === "(" || char === "<") {
			depth++;
			currentPart += char;
		} else if (char === ")" || char === ">") {
			depth--;
			currentPart += char;
		} else if (char === "," && depth === 0) {
			keyType = currentPart.trim();
			currentPart = "";
		} else {
			currentPart += char;
		}
	}

	valueType = currentPart.trim();

	return [keyType || "UNKNOWN", valueType || "UNKNOWN"];
}

/**
 * Parse STRUCT fields
 * Examples:
 *   STRUCT(field1 INT, field2 VARCHAR) -> [{name: 'field1', type: 'INT'}, ...]
 *   STRUCT<field1 INT64, field2 STRING> -> [{name: 'field1', type: 'INT64'}, ...]
 */
function parseStructFields(type: string): StructField[] {
	const normalized = type.trim();
	let content = "";

	// Extract content based on format
	if (normalized.toUpperCase().startsWith("STRUCT(")) {
		content = extractParenthesizedContent(normalized);
	} else if (normalized.toUpperCase().startsWith("STRUCT<")) {
		content = extractAngleBracketContent(normalized);
	} else {
		return [];
	}

	// Split fields by comma, respecting nesting
	const fields: StructField[] = [];
	let depth = 0;
	let currentField = "";

	for (let i = 0; i < content.length; i++) {
		const char = content[i];

		if (char === "(" || char === "<") {
			depth++;
			currentField += char;
		} else if (char === ")" || char === ">") {
			depth--;
			currentField += char;
		} else if (char === "," && depth === 0) {
			fields.push(parseField(currentField.trim()));
			currentField = "";
		} else {
			currentField += char;
		}
	}

	// Don't forget the last field
	if (currentField.trim()) {
		fields.push(parseField(currentField.trim()));
	}

	return fields;
}

/**
 * Parse a single field declaration
 * Examples:
 *   "field1 INT" -> {name: 'field1', type: 'INT'}
 *   "field1: Int32" -> {name: 'field1', type: 'Int32'}
 *   "field2 STRUCT(nested STRING)" -> {name: 'field2', type: 'STRUCT(nested STRING)'}
 */
function parseField(fieldStr: string): StructField {
	const trimmed = fieldStr.trim();

	// Handle Arrow style with colon: "field1: Int32"
	if (trimmed.includes(":")) {
		const colonIndex = trimmed.indexOf(":");
		const name = trimmed.substring(0, colonIndex).trim();
		const type = trimmed.substring(colonIndex + 1).trim();
		return { name: name || "unknown", type: type || "UNKNOWN" };
	}

	// Handle SQL style with space: "field1 INT" or "field2 STRUCT(...)"
	// Find the first whitespace and split there to preserve nested type definitions
	const firstSpaceMatch = trimmed.match(/^(\S+)\s+(.+)$/);
	if (firstSpaceMatch) {
		return { name: firstSpaceMatch[1], type: firstSpaceMatch[2] };
	}

	// Fallback
	return { name: trimmed, type: "UNKNOWN" };
}

/**
 * Extract content within parentheses, handling nesting
 */
function extractParenthesizedContent(str: string): string {
	const startIdx = str.indexOf("(");
	if (startIdx === -1) return "";

	let depth = 0;
	let endIdx = -1;

	for (let i = startIdx; i < str.length; i++) {
		if (str[i] === "(") depth++;
		else if (str[i] === ")") {
			depth--;
			if (depth === 0) {
				endIdx = i;
				break;
			}
		}
	}

	return endIdx > startIdx ? str.substring(startIdx + 1, endIdx) : "";
}

/**
 * Extract content within angle brackets, handling nesting
 */
function extractAngleBracketContent(str: string): string {
	const startIdx = str.indexOf("<");
	if (startIdx === -1) return "";

	let depth = 0;
	let endIdx = -1;

	for (let i = startIdx; i < str.length; i++) {
		if (str[i] === "<") depth++;
		else if (str[i] === ">") {
			depth--;
			if (depth === 0) {
				endIdx = i;
				break;
			}
		}
	}

	return endIdx > startIdx ? str.substring(startIdx + 1, endIdx) : "";
}

/**
 * Format type for compact badge display
 * Examples:
 *   STRUCT(field1 INT, field2 VARCHAR) -> "STRUCT(2)"
 *   LIST(INTEGER) -> "LIST(INT)"
 *   MAP(VARCHAR, INTEGER) -> "MAP(STR,INT)"
 *   ARRAY<STRUCT<name STRING>> -> "ARR(OBJ)"
 */
export function formatTypeForBadge(type: string): string {
	if (!type) return "";

	const normalized = type.trim();
	const upper = normalized.toUpperCase();

	// Handle STRUCT - show field count
	if (upper.startsWith("STRUCT")) {
		const fields = parseStructFields(normalized);
		return `STRUCT(${fields.length})`;
	}

	// Handle LIST/ARRAY - show element type
	if (upper.startsWith("LIST") || upper.startsWith("ARRAY") || /\[\]\s*$/.test(upper)) {
		const elementType = extractListElementType(normalized);
		const formattedElement = formatTypeForBadge(elementType);
		const prefix = upper.startsWith("LIST") ? "LIST" : "ARR";
		return `${prefix}(${formattedElement})`;
	}

	// Handle MAP - show key and value types
	if (upper.startsWith("MAP")) {
		const [keyType, valueType] = extractMapTypes(normalized);
		const formattedKey = formatTypeForBadge(keyType);
		const formattedValue = formatTypeForBadge(valueType);
		return `MAP(${formattedKey},${formattedValue})`;
	}

	// Simple type abbreviations
	if (upper === "VARCHAR" || upper === "TEXT" || upper === "STRING")
		return "STR";
	if (upper === "INTEGER" || upper === "INT64" || upper === "INT32")
		return "INT";
	if (upper === "BIGINT") return "BINT";
	if (upper === "SMALLINT") return "SINT";
	if (upper === "TINYINT") return "TINY";
	if (upper === "DOUBLE" || upper === "FLOAT64") return "DBL";
	if (upper === "FLOAT" || upper === "FLOAT32") return "FLT";
	if (upper === "DECIMAL" || upper === "NUMERIC") return "DEC";
	if (upper === "BOOLEAN" || upper === "BOOL") return "BOOL";
	if (upper === "DATE") return "DATE";
	if (upper === "TIME") return "TIME";
	if (upper === "TIMESTAMP") return "TS";
	if (upper === "TIMESTAMPTZ" || upper === "TIMESTAMP WITH TIME ZONE")
		return "TSTZ";
	if (upper === "JSON" || upper === "JSONB") return "JSON";
	if (upper === "UUID") return "UUID";
	if (upper === "BLOB" || upper === "BYTEA") return "BLOB";

	// Fallback: truncate to 6 chars
	return normalized.length > 6
		? normalized.substring(0, 6).toUpperCase()
		: normalized.toUpperCase();
}

/**
 * Format type for tooltip display with pretty-printing and indentation
 */
export function formatTypeForTooltip(type: string, indent: number = 0): string {
	if (!type) return "";

	const normalized = type.trim();
	const upper = normalized.toUpperCase();
	const spacing = "  ".repeat(indent);

	// Handle STRUCT - show all fields with indentation
	if (upper.startsWith("STRUCT")) {
		const fields = parseStructFields(normalized);

		if (fields.length === 0) {
			return "STRUCT()";
		}

		if (fields.length === 1 && !isComplexType(fields[0].type)) {
			// Simple one-field struct - keep on one line
			return `STRUCT(${fields[0].name}: ${fields[0].type})`;
		}

		// Multi-field or nested struct - use multiple lines
		const fieldLines = fields.map((field) => {
			const fieldType = formatTypeForTooltip(field.type, indent + 1);
			return `${spacing}  ${field.name}: ${fieldType}`;
		});

		return `STRUCT(\n${fieldLines.join(",\n")}\n${spacing})`;
	}

	// Handle LIST/ARRAY
	if (upper.startsWith("LIST") || upper.startsWith("ARRAY") || /\[\]\s*$/.test(upper)) {
		const elementType = extractListElementType(normalized);
		const formattedElement = formatTypeForTooltip(elementType, indent);
		const prefix = upper.startsWith("LIST") ? "LIST" : "ARRAY";

		// If element is complex, show on separate line
		if (isComplexType(elementType)) {
			return `${prefix}(\n${spacing}  ${formattedElement}\n${spacing})`;
		}

		return `${prefix}(${formattedElement})`;
	}

	// Handle MAP
	if (upper.startsWith("MAP")) {
		const [keyType, valueType] = extractMapTypes(normalized);
		const formattedKey = formatTypeForTooltip(keyType, indent);
		const formattedValue = formatTypeForTooltip(valueType, indent);

		// If value is complex, show on separate lines
		if (isComplexType(valueType)) {
			return `MAP(\n${spacing}  key: ${formattedKey},\n${spacing}  value: ${formattedValue}\n${spacing})`;
		}

		return `MAP(${formattedKey}, ${formattedValue})`;
	}

	// Simple types - return as-is
	return normalized;
}

/**
 * Extract nested fields from complex types for tree node expansion
 * Returns an array of {name, type} objects for each nested field
 */
export function extractNestedFields(type: string): StructField[] {
	if (!type) return [];

	const normalized = type.trim();
	const upper = normalized.toUpperCase();

	// Handle STRUCT - return all fields
	if (upper.startsWith("STRUCT")) {
		return parseStructFields(normalized);
	}

	// Handle LIST/ARRAY - return a single "element" field
	if (upper.startsWith("LIST") || upper.startsWith("ARRAY") || /\[\]\s*$/.test(upper)) {
		const elementType = extractListElementType(normalized);
		return [{ name: "element", type: elementType }];
	}

	// Handle MAP - return key and value fields
	if (upper.startsWith("MAP")) {
		const [keyType, valueType] = extractMapTypes(normalized);
		return [
			{ name: "key", type: keyType },
			{ name: "value", type: valueType },
		];
	}

	return [];
}

/**
 * Normalize Arrow/DuckDB type strings to SQL-ish names for UI display.
 * Examples:
 *   Utf8 -> VARCHAR
 *   Int64 -> BIGINT
 *   Float64 -> DOUBLE
 *   Bool -> BOOLEAN
 *   Struct<{...}> -> STRUCT<...>
 *   List<INT64> -> LIST<INT64>
 *   Decimal[5e+2] -> DECIMAL[5e+2]
 */
export function normalizeArrowType(type: string): string {
	if (!type) return "";
	let t = type.trim();

	// Basic replacements for common Arrow names
	t = t.replace(/\bUtf8\b/gi, "VARCHAR");
	t = t.replace(/\bLargeUtf8\b/gi, "VARCHAR");
	t = t.replace(/\bBool\b/gi, "BOOLEAN");
	t = t.replace(/\bInt8\b/gi, "TINYINT");
	t = t.replace(/\bInt16\b/gi, "SMALLINT");
	t = t.replace(/\bInt32\b/gi, "INTEGER");
	t = t.replace(/\bInt64\b/gi, "BIGINT");
	t = t.replace(/\bFloat32\b/gi, "FLOAT");
	t = t.replace(/\bFloat64\b/gi, "DOUBLE");
	t = t.replace(/\bDecimal\[/gi, "DECIMAL[");
	t = t.replace(/\bDate32<DAY>\b/gi, "DATE");
	t = t.replace(/\bTimestamp<[^>]+>\b/gi, "TIMESTAMP");

	// Normalize STRUCT/List casing/braces to a consistent form
	t = t.replace(/\bStruct<\{/gi, "STRUCT<");
	t = t.replace(/\bStruct\{/gi, "STRUCT<");
	t = t.replace(/\}>/g, ">");
	t = t.replace(/\}$/g, ">");
	t = t.replace(/\bList</gi, "LIST<");
	t = t.replace(/\bArray</gi, "LIST<");

	return t;
}
