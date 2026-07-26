/**
 * Decide the SQL an export should re-run to produce the FULL result set.
 *
 * The results grid is only ever a preview — a single page, capped (BigQuery
 * fetches ~10K). So an export must re-run the query to get everything, and use
 * the in-memory rows only when we can prove they're already complete.
 *
 * This is the fix for "BigQuery SELECT * exports only 10K rows": BigQuery
 * results are non-virtual, so no query reached the export and it dumped the
 * page buffer. Now the export re-runs unless `serverTotalRows` (or the row
 * estimate) shows the buffer holds every row.
 */

export interface ExportSqlInput {
	useVirtualTable?: boolean;
	executedSql?: string;
	result:
		| {
				rows: unknown[];
				serverTotalRows?: number;
		  }
		| null;
	estimatedRowCount?: number;
}

export function computeExportSql(tab: ExportSqlInput): string | undefined {
	// Virtual results keep no in-memory rows; the export always re-runs.
	if (tab.useVirtualTable) return tab.executedSql;

	const result = tab.result;
	if (!result) return tab.executedSql;

	const knownTotal = result.serverTotalRows ?? tab.estimatedRowCount;
	// Complete only when we know the total AND the buffer holds all of it.
	// Unknown total → treat as possibly truncated and re-run, so rows are never
	// silently dropped.
	const complete = knownTotal != null && result.rows.length >= knownTotal;
	return complete ? undefined : tab.executedSql;
}
