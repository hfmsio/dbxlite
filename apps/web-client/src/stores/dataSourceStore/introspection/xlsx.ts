/**
 * XLSX Sheet Introspection
 * Pure functions for introspecting XLSX sheet columns
 */

import type { Column, DataSource } from "../../../types/data-source";
import { queryService } from "../../../services/streaming-query-service";
import { createLogger } from "../../../utils/logger";
import {
	buildProbeCall,
	buildReadXlsxCall,
	detectHeaderRange,
	formatDataRange,
	type ProbeGrid,
} from "../../../utils/xlsxRange";

const logger = createLogger("XLSXIntrospection");

/**
 * Find where a sheet's data actually starts.
 *
 * Report-style sheets put a title on row 1 and a blank row under it, which
 * makes a plain `read_xlsx(file, sheet=X)` stop at the blank and return zero
 * rows. We sample the top of the sheet as raw cells and locate the header,
 * so callers can name the range explicitly.
 *
 * Returns null when the layout is ordinary (or too ambiguous to call), which
 * means "use DuckDB's defaults". Never throws: detection is an optimisation
 * over the default behaviour, and a probe failure must not block reading the
 * sheet.
 */
export async function detectSheetDataRange(
	filePath: string,
	sheetName: string,
): Promise<string | null> {
	if (!filePath) return null;

	try {
		const result = await queryService.executeQueryOnConnector(
			"duckdb",
			`SELECT * FROM ${buildProbeCall(filePath, sheetName)}`,
		);

		// header=false names the columns A, B, C... in sheet order, so the
		// object's value order is the column order.
		const grid: ProbeGrid = result.rows.map((row) =>
			Object.values(row).map((cell) =>
				cell === null || cell === undefined ? null : String(cell),
			),
		);

		const detected = detectHeaderRange(grid);
		if (!detected) return null;

		// A header already at A1 is exactly what read_xlsx assumes by default,
		// so emit no range and let the bare call run — byte-for-byte the
		// behaviour these sheets always had. A range is only needed when the
		// header is displaced (a title row, a blank spacer, an offset column),
		// which is the case DuckDB's stop_at_empty default reads as zero rows.
		if (detected.headerRow === 1 && detected.firstColumnIndex === 0) {
			return null;
		}

		const range = formatDataRange(detected);
		logger.info(
			`Sheet "${sheetName}": data starts at ${range.split(":")[0]}, using range ${range}`,
		);
		return range;
	} catch (error) {
		logger.warn(
			`Range detection failed for sheet "${sheetName}", falling back to defaults:`,
			error,
		);
		return null;
	}
}

/**
 * Pure function: Introspect XLSX sheet columns
 * Lazy loading for XLSX sheets - columns are loaded on expand
 *
 * `range` should be the sheet's detected data range when one is known;
 * without it a report-style sheet reports the title cell as its only column.
 */
export async function introspectSheetColumns(
	dataSource: DataSource,
	sheetName: string,
	range?: string | null,
): Promise<Column[]> {
	if (!dataSource.filePath || dataSource.type !== "xlsx") {
		throw new Error("Sheet introspection only works for XLSX files");
	}

	try {
		const effectiveRange =
			range ?? (await detectSheetDataRange(dataSource.filePath, sheetName));

		// Use DuckDB to introspect the specific sheet's structure
		const describeResult = await queryService.executeQueryOnConnector(
			"duckdb",
			`DESCRIBE SELECT * FROM ${buildReadXlsxCall(
				dataSource.filePath,
				sheetName,
				effectiveRange,
			)} LIMIT 1`,
		);

		const columns: Column[] = describeResult.rows.map((row) => ({
			name: String(row.column_name),
			type: String(row.column_type),
			nullable: row.null === "YES",
		}));

		return columns;
	} catch (error) {
		logger.error(`Failed to introspect sheet "${sheetName}":`, error);
		throw error;
	}
}
