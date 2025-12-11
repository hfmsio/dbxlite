/**
 * Utility functions for PaginatedTable component
 */

import { formatterSettings } from "../../services/formatter-settings";
import type { ConnectorType } from "../../types/data-source";
import type { CellValue } from "../../types/table";
import { DataType, getTypeCategory, TypeMapper } from "../../utils/dataTypes";
import { formatValue } from "../../utils/formatters";

/**
 * Get text alignment for a column based on its data type
 */
export function getCellAlignment(
	columnType?: string,
	connectorType: ConnectorType = "duckdb",
): "left" | "center" | "right" {
	if (!columnType) return "left";

	const dataType = TypeMapper.normalizeType(columnType, connectorType);
	const category = getTypeCategory(dataType);

	const alignmentSettings = formatterSettings.getSettings().alignment;

	// Map TypeCategory to alignment setting key
	const alignmentKey = category.toLowerCase() as keyof typeof alignmentSettings;
	return alignmentSettings[alignmentKey] || "left";
}

/**
 * Format cell value using type-aware formatters
 *
 * @param value - The value to format
 * @param columnType - The database type (e.g., "TIMESTAMP", "DECIMAL", "INTEGER")
 * @param connectorType - The active connector ('duckdb' or 'bigquery')
 */
export function formatCellValue(
	value: CellValue,
	columnType?: string,
	connectorType: ConnectorType = "duckdb",
): string {
	// Get formatter settings
	const settings = formatterSettings.getFormatterOptions();

	// If no type information, use simple formatting
	if (!columnType) {
		if (value === null || value === undefined)
			return settings.nullDisplay || "NULL";
		if (typeof value === "boolean") return value ? "true" : "false";
		if (typeof value === "object") return JSON.stringify(value, null, 0);
		return String(value);
	}

	// Normalize the database type to our DataType enum
	const dataType = TypeMapper.normalizeType(columnType, connectorType);

	// Use type-aware formatter with user settings
	return formatValue(value, dataType, settings);
}

/**
 * Calculate metadata for cell content
 */
export function calculateCellMetadata(value: CellValue, columnType?: string) {
	let strValue: string;
	if (value === null || value === undefined) {
		strValue = "";
	} else if (typeof value === "object") {
		// Use JSON.stringify for objects/arrays to get accurate size
		strValue = JSON.stringify(value);
	} else {
		strValue = String(value);
	}
	const lineCount = strValue.split("\n").length;
	const charCount = strValue.length;
	const byteSize = new TextEncoder().encode(strValue).length;

	return {
		lineCount,
		charCount,
		byteSize,
		dataType: columnType || typeof value,
	};
}

/**
 * Format cell value for modal with pretty-printing option
 */
export function formatCellValueForModal(
	value: CellValue,
	columnType: string | undefined,
	connectorType: ConnectorType,
	viewMode: "raw" | "formatted",
): string {
	// Raw mode: show the value as-is
	if (viewMode === "raw") {
		if (value === null || value === undefined) return "NULL";
		if (typeof value === "object") return JSON.stringify(value);
		return String(value);
	}

	// Formatted mode: pretty-print when possible
	const settings = formatterSettings.getFormatterOptions();

	if (!columnType) {
		if (value === null || value === undefined)
			return settings.nullDisplay || "NULL";
		if (typeof value === "boolean") return value ? "true" : "false";
		if (typeof value === "object") return JSON.stringify(value, null, 2); // Pretty-print with indentation
		return String(value);
	}

	const dataType = TypeMapper.normalizeType(columnType, connectorType);

	// For JSON and complex types, try to pretty-print
	if (
		dataType === DataType.JSON ||
		dataType === DataType.STRUCT ||
		dataType === DataType.MAP ||
		dataType === DataType.LIST
	) {
		try {
			const formatted = formatValue(value, dataType, settings);
			// Try to parse and re-stringify with indentation
			const parsed = JSON.parse(formatted);
			return JSON.stringify(parsed, null, 2);
		} catch {
			// If parsing fails, use default formatter
			return formatValue(value, dataType, settings);
		}
	}

	return formatValue(value, dataType, settings);
}
