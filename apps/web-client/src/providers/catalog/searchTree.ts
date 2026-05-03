/**
 * searchTree — pure function that filters the loaded catalog tree to nodes
 * matching a query string. Auto-expands parents of matches and returns
 * match-span info for highlighting.
 *
 * This is the client-side filter (Phase A). Operates only on already-loaded
 * data. For provider-side full-text search across uncached schemas, the
 * CatalogProvider exposes an optional `searchCatalog(query)` method (Phase B,
 * deferred).
 */

import type { CatalogInfo, SchemaInfo, TableMetadata } from "@ide/connectors"

type LoadState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "loaded"; data: T }
	| { status: "error"; error: string }

export interface CatalogTreeNode {
	info: CatalogInfo
	expanded: boolean
	schemas: LoadState<SchemaTreeNode[]>
}

export interface SchemaTreeNode {
	info: SchemaInfo
	expanded: boolean
	tables: LoadState<TableMetadata[]>
}

export interface MatchSpan {
	start: number
	end: number
}

/**
 * Filtered output preserves the same shape as the input but:
 *   - Catalogs without matches in their subtree are dropped
 *   - All ancestors of a match are forced to `expanded: true`
 *   - Each matched node gets a `_matchSpan` field for the UI to highlight
 *
 * Returns `null` for "no match" so callers can render an empty state.
 */
export function searchTree(
	tree: CatalogTreeNode[],
	rawQuery: string,
): CatalogTreeNode[] {
	const query = rawQuery.trim().toLowerCase()
	if (!query) return tree

	const out: CatalogTreeNode[] = []
	for (const cat of tree) {
		const catMatch = matchSpan(cat.info.name, query)
		const matchedSchemas: SchemaTreeNode[] = []

		if (cat.schemas.status === "loaded") {
			for (const schema of cat.schemas.data) {
				const schemaMatch = matchSpan(schema.info.name, query)
				const matchedTables: TableMetadata[] = []
				if (schema.tables.status === "loaded") {
					for (const table of schema.tables.data) {
						if (matchSpan(table.name, query)) {
							matchedTables.push({
								...table,
								// attach the match for the UI; cast to any-ish via a marker
								_matchSpan: matchSpan(table.name, query) ?? undefined,
							} as TableMetadata & { _matchSpan?: MatchSpan })
						}
					}
				}

				if (schemaMatch || matchedTables.length > 0) {
					matchedSchemas.push({
						info: { ...schema.info } as SchemaInfo & { _matchSpan?: MatchSpan },
						expanded: true,
						tables:
							schema.tables.status === "loaded"
								? {
										status: "loaded",
										data:
											matchedTables.length > 0
												? matchedTables
												: schema.tables.data, // schema name matched; show all tables
									}
								: schema.tables,
					})
					// attach the match span for highlighting
					;(
						matchedSchemas[matchedSchemas.length - 1].info as SchemaInfo & {
							_matchSpan?: MatchSpan
						}
					)._matchSpan = schemaMatch ?? undefined
				}
			}
		}

		if (catMatch || matchedSchemas.length > 0) {
			out.push({
				info: {
					...cat.info,
					_matchSpan: catMatch ?? undefined,
				} as CatalogInfo & { _matchSpan?: MatchSpan },
				expanded: true,
				schemas:
					cat.schemas.status === "loaded"
						? {
								status: "loaded",
								data:
									matchedSchemas.length > 0
										? matchedSchemas
										: cat.schemas.data, // catalog name matched; show all schemas
							}
						: cat.schemas,
			})
		}
	}
	return out
}

/**
 * Find the index of the first match of `query` in `text` (case-insensitive).
 * Returns null if not found.
 */
export function matchSpan(text: string, query: string): MatchSpan | null {
	const lower = text.toLowerCase()
	const idx = lower.indexOf(query)
	if (idx < 0) return null
	return { start: idx, end: idx + query.length }
}

/**
 * Render a string with the matched substring wrapped. Returns an array of
 * { text, highlight } segments for the UI to render.
 */
export function highlightSpans(
	text: string,
	span: MatchSpan | undefined,
): Array<{ text: string; highlight: boolean }> {
	if (!span) return [{ text, highlight: false }]
	return [
		{ text: text.slice(0, span.start), highlight: false },
		{ text: text.slice(span.start, span.end), highlight: true },
		{ text: text.slice(span.end), highlight: false },
	]
}
