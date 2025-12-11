import type { ConnectorType } from "../../../types/data-source";
import type { CellValue } from "../../../types/table";
import type { RowData } from "../types";
import { formatCellValue } from "../utils";

// Constants for column width calculations
const CHAR_WIDTH = 8;
const MIN_WIDTH = 80;
const MAX_WIDTH = 600;
const PADDING = 24;
const DEFAULT_WIDTH = 150;

/**
 * Calculate the Nth percentile from an array of numbers
 * Used for outlier-resistant column width calculation
 */
export function calculatePercentile(
	values: number[],
	percentile: number,
): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((percentile / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

/**
 * Calculate optimal width for a single column using P95 percentile or MAX
 * @param columnName - Name of the column
 * @param columnType - Type of the column for formatting
 * @param data - Array of row data
 * @param sampleSize - Number of rows to sample
 * @param connectorType - Database connector type for formatting
 * @param useMax - If true, uses MAX (for double-click); if false, uses P95 (for auto-sizing)
 *
 * P95 prevents outliers (e.g., 1 very long value among 99 short values) from wasting space
 * MAX guarantees everything fits (useful for double-click to show full headers)
 */
export function calculateColumnContentWidth(
	columnName: string,
	columnType: string | undefined,
	data: RowData[],
	sampleSize: number,
	connectorType: ConnectorType,
	useMax: boolean = false,
): number {
	// Collect all widths (header + content samples) for percentile calculation
	const widths: number[] = [columnName.length * CHAR_WIDTH + PADDING];

	// Measure content width for sampled rows
	const sampled = Math.min(sampleSize, data.length);
	for (let i = 0; i < sampled; i++) {
		const value = data[i]?.[columnName] as CellValue;
		if (value !== undefined && value !== null) {
			const strValue = formatCellValue(value, columnType, connectorType);
			const contentWidth = strValue.length * CHAR_WIDTH + PADDING;
			widths.push(contentWidth);
		}
	}

	// Choose calculation method based on context:
	// - Double-click (useMax=true): Use MAX to show everything including long headers
	// - Auto-sizing (useMax=false): Use P95 to handle outliers gracefully
	const calculatedWidth = useMax
		? Math.max(...widths)
		: calculatePercentile(widths, 95);

	// Apply constraints
	return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, calculatedWidth));
}

/**
 * Calculate optimal widths for all columns with compact sizing
 * - Sizes columns based on content (P95 percentile)
 * - If header is wider than content, expands up to 150% of content width
 * - If space is available, truncated headers get equal share of extra space
 */
export function calculateAutoColumnWidths(
	cols: Array<{ name: string; type?: string; width?: number }>,
	data: RowData[],
	containerWidth: number,
	connectorType: ConnectorType,
): Array<{ name: string; type?: string; width: number }> {
	if (cols.length === 0 || data.length === 0) {
		return cols.map((col) => ({ ...col, width: col.width || DEFAULT_WIDTH }));
	}

	// Smart sampling: 100 rows if <20 columns, 50 rows if >=20 columns
	const sampleSize = cols.length < 20 ? 100 : 50;

	// First pass: calculate widths with 150% cap, track truncated headers
	const columnData = cols.map((col) => {
		const contentWidth = calculateColumnContentWidth(
			col.name,
			col.type,
			data,
			sampleSize,
			connectorType,
		);

		const headerWidth = col.name.length * CHAR_WIDTH + PADDING;

		// Header accommodation: cap at 150% of content width
		let finalWidth: number;
		let isTruncated = false;
		if (headerWidth > contentWidth) {
			const cappedWidth = contentWidth * 1.5;
			if (headerWidth > cappedWidth) {
				finalWidth = cappedWidth;
				isTruncated = true;
			} else {
				finalWidth = headerWidth;
			}
		} else {
			finalWidth = contentWidth;
		}

		finalWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, finalWidth));

		return {
			name: col.name,
			type: col.type,
			width: Math.floor(finalWidth),
			headerWidth: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, headerWidth)),
			isTruncated,
		};
	});

	// Second pass: distribute available space equally to truncated headers
	const totalWidth = columnData.reduce((sum, col) => sum + col.width, 0);
	const availableSpace = containerWidth - totalWidth - 20;

	if (availableSpace > 0) {
		const truncatedCols = columnData.filter((col) => col.isTruncated);

		if (truncatedCols.length > 0) {
			// Equal share per truncated column
			const sharePerColumn = Math.floor(availableSpace / truncatedCols.length);

			for (const col of truncatedCols) {
				// Add share but don't exceed full header width
				const maxExpansion = col.headerWidth - col.width;
				col.width += Math.min(sharePerColumn, maxExpansion);
			}
		}
	}

	return columnData.map((col) => ({
		name: col.name,
		type: col.type,
		width: col.width,
	}));
}

/**
 * Get indices of selected columns (for Excel-style multi-column auto-resize)
 * Returns null if no column selection, or array of column indices if columns are selected
 */
export function getSelectedColumnIndices(
	selectionStart: { row: number; col: number } | null,
	selectionEnd: { row: number; col: number } | null,
	pageDataLength: number,
): number[] | null {
	if (!selectionStart || !selectionEnd) return null;

	// Check if this is a column selection (rows span from 0 to end)
	const isColumnSelection =
		selectionStart.row === 0 && selectionEnd.row === pageDataLength - 1;

	if (!isColumnSelection) return null;

	// Get range of selected columns
	const minCol = Math.min(selectionStart.col, selectionEnd.col);
	const maxCol = Math.max(selectionStart.col, selectionEnd.col);

	const indices: number[] = [];
	for (let i = minCol; i <= maxCol; i++) {
		indices.push(i);
	}
	return indices;
}
