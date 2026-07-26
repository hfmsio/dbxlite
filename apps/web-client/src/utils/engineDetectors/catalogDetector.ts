/**
 * Catalog-aware engine detection.
 *
 * A bare three-part name like `hits.main.hits100k` is syntactically identical
 * for DuckDB (`database.schema.table`) and BigQuery (`project.dataset.table`),
 * so pure-syntax detection can't tell them apart. But the app knows what's
 * actually attached: if `hits` is a loaded DuckDB database (or a file table),
 * the query is DuckDB, full stop.
 *
 * This resolves the sticky-connector failure: run a BigQuery query, then query
 * a DuckDB table — without this, the DuckDB query goes to BigQuery and errors
 * ("project hits has not enabled BigQuery").
 */

import type { DataSource } from "../../types/data-source";
import { stripSqlComments } from "../queryEngineDetector";

/**
 * Names the DuckDB engine can resolve: attached database names, their schema
 * and table names, and file-backed virtual table names. Lowercased for
 * case-insensitive matching (DuckDB folds unquoted identifiers).
 */
export function duckdbCatalogNames(dataSources: DataSource[]): Set<string> {
	const names = new Set<string>();
	for (const ds of dataSources) {
		// "connection" is BigQuery/Snowflake; everything else is DuckDB-backed.
		if (ds.type === "connection") continue;

		if (ds.type === "duckdb") {
			const db = (ds.attachedAs || ds.name || "").toLowerCase();
			if (db) names.add(db);
			for (const schema of ds.schemas ?? []) {
				if (schema.name) names.add(schema.name.toLowerCase());
				for (const table of schema.tables ?? []) {
					if (table.name) names.add(table.name.toLowerCase());
				}
			}
		} else {
			// File source registered as a virtual table.
			const table = (ds.tableName || ds.name || "").toLowerCase();
			if (table) names.add(table);
		}
	}
	return names;
}

/**
 * Does the query's FROM/JOIN target a known DuckDB object? Matches either the
 * leading qualifier (`hits` in `hits.main.hits100k`) or an unqualified table
 * name against the catalog.
 */
export function referencesKnownDuckDB(
	sql: string,
	duckdbNames: Set<string>,
): boolean {
	if (duckdbNames.size === 0) return false;
	const stripped = stripSqlComments(sql);
	const refPattern = /\b(?:FROM|JOIN)\s+([`"']?[\w.$-]+[`"']?)/gi;
	let match: RegExpExecArray | null;
	while ((match = refPattern.exec(stripped)) !== null) {
		const raw = match[1].replace(/[`"']/g, "").toLowerCase();
		if (!raw) continue;
		const parts = raw.split(".");
		// Leading qualifier (the database), the bare table name, or the exact
		// reference all count as a hit.
		if (duckdbNames.has(parts[0])) return true;
		if (duckdbNames.has(parts[parts.length - 1])) return true;
		if (duckdbNames.has(raw)) return true;
	}
	return false;
}
