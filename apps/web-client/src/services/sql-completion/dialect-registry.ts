/**
 * Dialect registry: merges ANSI base catalogs with per-dialect additions.
 *
 * Phase 2 of the autocomplete redesign. The provider asks for keywords
 * or functions by dialect; this module returns the merged set.
 * Dialect-only items carry a `dialectOnly: true` marker (via the
 * `documentation` field) so the ranking layer can boost them in
 * dialect-aware suggestions.
 */

import {
	SQL_FUNCTIONS,
	SQL_KEYWORDS,
	type SQLCompletion,
} from "./static-completions";
import { BIGQUERY_DIALECT } from "./dialects/bigquery";
import { DUCKDB_DIALECT } from "./dialects/duckdb";
import { SNOWFLAKE_DIALECT } from "./dialects/snowflake";
import type { DialectKey, DialectSpec } from "./dialects/types";

const DIALECT_MAP: Record<DialectKey, DialectSpec> = {
	duckdb: DUCKDB_DIALECT,
	bigquery: BIGQUERY_DIALECT,
	snowflake: SNOWFLAKE_DIALECT,
};

/**
 * Merge ANSI keywords with the active dialect's keyword additions.
 * Items already in the ANSI list under the same label are not duplicated:
 * the ANSI entry wins (avoids surprising "two SELECTs" suggestions).
 */
export function getKeywordsForDialect(
	dialect: DialectKey | undefined,
): SQLCompletion[] {
	if (!dialect) return SQL_KEYWORDS;
	const dialectKeywords = DIALECT_MAP[dialect].keywords;
	const ansiLabels = new Set(SQL_KEYWORDS.map((k) => k.label.toUpperCase()));
	const additions = dialectKeywords.filter(
		(k) => !ansiLabels.has(k.label.toUpperCase()),
	);
	return [...SQL_KEYWORDS, ...additions];
}

/**
 * Merge ANSI functions with the active dialect's function additions.
 * Same dedup rule as keywords.
 */
export function getFunctionsForDialect(
	dialect: DialectKey | undefined,
): SQLCompletion[] {
	if (!dialect) return SQL_FUNCTIONS;
	const dialectFunctions = DIALECT_MAP[dialect].functions;
	const ansiLabels = new Set(SQL_FUNCTIONS.map((f) => f.label.toUpperCase()));
	const additions = dialectFunctions.filter(
		(f) => !ansiLabels.has(f.label.toUpperCase()),
	);
	return [...SQL_FUNCTIONS, ...additions];
}

/**
 * Return the labels of all dialect-only additions. Used by the ranker
 * to identify which suggestions get the dialect-relevance bonus.
 */
export function getDialectOnlyLabels(
	dialect: DialectKey | undefined,
): Set<string> {
	if (!dialect) return new Set();
	const spec = DIALECT_MAP[dialect];
	const labels = new Set<string>();
	for (const k of spec.keywords) labels.add(k.label.toUpperCase());
	for (const f of spec.functions) labels.add(f.label.toUpperCase());
	return labels;
}
