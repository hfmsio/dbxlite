/**
 * XLSX data-range detection.
 *
 * Why this exists: `read_xlsx(file, sheet=X)` with no range defaults to
 * `stop_at_empty=true`, so it halts at the first blank row. The common
 * report layout — a single-cell title on row 1, a blank spacer on row 2,
 * the real header on row 3 — therefore returns ZERO ROWS, with no error.
 * The user just sees an empty grid.
 *
 * Neither default rescues it: `stop_at_empty=false` reads the title row as
 * the header and collapses the sheet to one column. The only fix is to find
 * where the data actually starts and say so explicitly via `range=`.
 *
 * The approach is to ask DuckDB for a small raw grid off the top of the
 * sheet (see PROBE_* below, `header=false` so nothing is interpreted), then
 * pick the header row out of it here. Splitting it this way keeps the
 * judgement call in a pure function that can be tested without a database.
 */

/** Rows off the top of the sheet to inspect when locating the header. */
export const PROBE_ROW_COUNT = 30;

/**
 * Right edge of the probe. Sheets wider than this still work — only the
 * header search is bounded, and 78 columns is far past any real report.
 */
export const PROBE_LAST_COLUMN = "BZ";

/** Excel's hard row ceiling; the tail is trimmed by stop_at_empty, not this. */
export const SHEET_MAX_ROW = 1048576;

/** A row of raw cells, nulls for blanks, as returned by the probe query. */
export type ProbeGrid = ReadonlyArray<ReadonlyArray<string | null>>;

export interface DetectedRange {
	/** 1-based sheet row holding the column names. */
	headerRow: number;
	/** 0-based index of the leftmost column with data. */
	firstColumnIndex: number;
	/** 0-based index of the rightmost column with data. */
	lastColumnIndex: number;
}

/**
 * Convert a 0-based column index to its spreadsheet letter (0 -> A, 25 -> Z,
 * 26 -> AA). Bijective base-26, which is why the -1 is inside the loop.
 */
export function columnIndexToLetter(index: number): string {
	if (!Number.isInteger(index) || index < 0) {
		throw new RangeError(`Column index must be a non-negative integer: ${index}`);
	}
	let letter = "";
	let n = index;
	while (n >= 0) {
		letter = String.fromCharCode((n % 26) + 65) + letter;
		n = Math.floor(n / 26) - 1;
	}
	return letter;
}

function isBlank(cell: string | null | undefined): boolean {
	return cell === null || cell === undefined || cell.trim() === "";
}

/**
 * Locate the header row in a raw grid.
 *
 * A header row is the first row that is "dense" — carrying at least half as
 * many populated cells as the widest row in the probe. That single rule
 * disposes of both decorations we care about: a blank spacer has no cells,
 * and a title (even a merged one, which OOXML stores as a single top-left
 * cell) has far fewer than the header it sits above.
 *
 * Returns null when the sheet is empty, or when the widest row holds one
 * cell. A single-column sheet gives us nothing to separate a title from a
 * header, so we decline to guess and let the caller keep DuckDB's default.
 */
export function detectHeaderRange(grid: ProbeGrid): DetectedRange | null {
	const counts = grid.map((row) => row.filter((c) => !isBlank(c)).length);
	const widest = counts.reduce((max, c) => (c > max ? c : max), 0);

	if (widest < 2) return null;

	const threshold = Math.max(2, Math.ceil(widest / 2));
	const headerIndex = counts.findIndex((c) => c >= threshold);
	if (headerIndex === -1) return null;

	const headerCells = grid[headerIndex];
	const firstColumnIndex = headerCells.findIndex((c) => !isBlank(c));
	let lastColumnIndex = firstColumnIndex;
	for (let i = headerCells.length - 1; i >= 0; i--) {
		if (!isBlank(headerCells[i])) {
			lastColumnIndex = i;
			break;
		}
	}

	return { headerRow: headerIndex + 1, firstColumnIndex, lastColumnIndex };
}

/**
 * Render a detected range as the `range=` argument for read_xlsx, e.g.
 * "A3:I1048576". The bottom is deliberately the sheet ceiling: the caller
 * pairs this with `stop_at_empty=true`, which trims the tail at the first
 * blank row. Naming a real last row would mean scanning the whole sheet.
 */
export function formatDataRange(detected: DetectedRange): string {
	const first = columnIndexToLetter(detected.firstColumnIndex);
	const last = columnIndexToLetter(detected.lastColumnIndex);
	return `${first}${detected.headerRow}:${last}${SHEET_MAX_ROW}`;
}

/** The probe range to hand read_xlsx when sampling the top of a sheet. */
export function probeRange(): string {
	return `A1:${PROBE_LAST_COLUMN}${PROBE_ROW_COUNT}`;
}

/** Escape a string for use inside a single-quoted SQL literal. */
export function sqlLiteral(value: string): string {
	return value.replace(/'/g, "''");
}

/**
 * Build the `read_xlsx(...)` call for a sheet.
 *
 * Every site that reads a sheet goes through here so the fixes land in one
 * place rather than drifting apart across three call sites.
 *
 * With a detected range we also pass `stop_at_empty=true`: that flag defaults
 * to true only when NO range is given, so specifying a range silently flips
 * it off and pads the result out to the sheet ceiling. Passing both is what
 * trims the tail back to the real data.
 *
 * `all_varchar=true` is always on. DuckDB infers a column's type from its
 * first data rows, so one text cell further down a numeric column aborts the
 * whole read ("Could not convert string ... to DOUBLE") — routine in real
 * spreadsheets, where a column of numbers ends in a note. Reading everything
 * as text always succeeds and never loses a cell, and callers cast what they
 * need. The alternative, `ignore_errors=true`, keeps the inferred type and
 * silently NULLs the cells that don't fit: a clean-looking result with the
 * data quietly gone. This flag is visible in the generated SQL, so anyone
 * with a clean sheet can delete it and get real types back.
 */
export function buildReadXlsxCall(
	filePath: string,
	sheetName: string,
	range?: string | null,
): string {
	const file = sqlLiteral(filePath);
	const sheet = sqlLiteral(sheetName);
	const parts = [`'${file}'`, `sheet='${sheet}'`];
	if (range) {
		parts.push(`range='${sqlLiteral(range)}'`, "stop_at_empty=true");
	}
	parts.push("all_varchar=true");
	return `read_xlsx(${parts.join(", ")})`;
}

/**
 * Build the probe call used to sample the top of a sheet. `header=false`
 * stops DuckDB naming columns off whatever happens to sit in the first row,
 * and `all_varchar=true` keeps a stray type from failing the probe.
 */
export function buildProbeCall(filePath: string, sheetName: string): string {
	return (
		`read_xlsx('${sqlLiteral(filePath)}', sheet='${sqlLiteral(sheetName)}', ` +
		`range='${probeRange()}', header=false, all_varchar=true, stop_at_empty=false)`
	);
}
