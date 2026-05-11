/**
 * Monaco completion provider factory for SQL.
 *
 * Phase 1 extraction: the ~490-line inline provider closure that lived
 * in `EditorPane.tsx` is moved here verbatim. Behavior is unchanged,
 * including known limitations (no dialect awareness, all-columns dump
 * in SELECT context, etc.). Subsequent phases address those.
 *
 * Dependencies (mode, data sources) are injected via callbacks so the
 * factory has no React/Zustand coupling. The only React-shaped piece
 * that remains is the consumer wiring in `EditorPane.tsx`.
 */

import type * as monaco from "monaco-editor";
import {
	getSchemaFromDataSources,
	getSchemaStub,
} from "../schema-service";
import type { AutocompleteMode } from "../../stores/settingsStore";
import type { DataSource } from "../../types/data-source";
import { createLogger } from "../../utils/logger";
import { parseTableAliases } from "./alias-resolver";
import {
	detectSQLContext,
	getContextualCompletions,
} from "./context-detector";
import { parseCTENames } from "./cte-extractor";
import { getDialectOnlyLabels } from "./dialect-registry";
import type { DialectKey } from "./dialects/types";
import { applyRanking } from "./ranking";

const logger = createLogger("SQLCompletion");

/**
 * Wrap an identifier in the quoting style required by the source's dialect:
 *   - BigQuery: backticks (`proj.dataset.table`)
 *   - DuckDB file sources: single quotes ('foo-bar.parquet'), because file
 *     paths routinely contain characters (hyphens, spaces, slashes) that
 *     DuckDB's bare-identifier lexer rejects. Without quoting, the user
 *     accepts a suggestion like `export_foo-bar.parquet` and DuckDB then
 *     parses the hyphen as subtraction and errors.
 *   - Everything else: bare identifier.
 *
 * `sourceType` here is the schema-service classification, not the active
 * connector dialect.
 */
function quoteIdentifier(
	name: string,
	sourceType: string | undefined,
): string {
	if (sourceType === "bigquery") return `\`${name}\``;
	if (sourceType === "file") return `'${name}'`;
	return name;
}

/**
 * Dependencies the provider needs at suggestion time. Both are
 * read-on-each-keystroke so updates to mode or data sources don't
 * require re-registering with Monaco.
 */
export interface CompletionProviderDeps {
	/** Reads the current `AutocompleteMode` from settings. */
	getMode: () => AutocompleteMode;
	/** Reads the current `DataSource[]` from the app. May be empty/null. */
	getDataSources: () => DataSource[] | null | undefined;
	/**
	 * Reads the active connector / dialect. Used to scope keyword and
	 * function suggestions to the dialect being queried.
	 */
	getDialect: () => DialectKey | undefined;
	/** Monaco namespace; passed in to avoid re-importing inside the factory. */
	monaco: typeof monaco;
}

/**
 * Build a Monaco-compatible SQL completion provider.
 */
export function createCompletionProvider(
	deps: CompletionProviderDeps,
): monaco.languages.CompletionItemProvider {
	const { getMode, getDataSources, getDialect, monaco: m } = deps;

	return {
		triggerCharacters: [" ", ".", "("],
		provideCompletionItems: async (model, position, context) => {
			// Mode gates depth (off / lite / full). See SQL_AUTOCOMPLETE_PLAN.md
			// Axis 5 for the semantics. Lite is the new default for fresh users
			// and the migration target for legacy "word"/"default" values.
			const mode = getMode();
			if (mode === "off") {
				return { suggestions: [] };
			}
			// `lite` skips the heavier paths (column dumps, dot-completion deep
			// schema walks) but still surfaces dialect keywords and top-level
			// table names. `full` enables everything.
			const isFullMode = mode === "full";

			logger.debug("Completion context:", {
				triggerKind: context.triggerKind,
				triggerCharacter: context.triggerCharacter,
			});

			// Use actual data sources if available, fallback to stub.
			const dataSources = getDataSources();
			const schema =
				dataSources && dataSources.length > 0
					? getSchemaFromDataSources(dataSources)
					: await getSchemaStub();

			// Debug: Log the actual schema object
			logger.debug("Schema object:", {
				tablesCount: schema.tables.length,
				topLevelSourcesCount: schema.topLevelSources?.length ?? 0,
				topLevelSourceNames: schema.topLevelSources?.map((s) => s.name) ?? [],
				firstFewTables: schema.tables.slice(0, 3).map((t) => ({
					name: t.name,
					databaseName: t.databaseName,
				})),
			});

			const suggestions: monaco.languages.CompletionItem[] = [];

			// Get word range for completion item range
			const wordInfo = model.getWordUntilPosition(position);
			const range = {
				startLineNumber: position.lineNumber,
				endLineNumber: position.lineNumber,
				startColumn: wordInfo.startColumn,
				endColumn: wordInfo.endColumn,
			};

			// Get current line and full text for context
			const lineContent = model.getLineContent(position.lineNumber);
			const textUntilPosition = model.getValueInRange({
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: position.lineNumber,
				endColumn: position.column,
			});

			// Pre-compute the active dialect and its dialect-only label set so the
			// rank helper below can run cheaply at each return point.
			const activeDialect = getDialect();
			const dialectOnlyLabels = getDialectOnlyLabels(activeDialect);

			// Helper: apply ranking + sortText to a suggestion list right before
			// returning to Monaco. Centralised so the 18+ return points all rank
			// consistently. Empty arrays are returned as-is.
			const rank = (
				items: monaco.languages.CompletionItem[],
			): monaco.languages.CompletionItem[] => {
				if (items.length === 0) return items;
				const sqlContext = detectSQLContext(textUntilPosition);
				const ranked = applyRanking(items, {
					sqlContext,
					dialectOnlyLabels,
				});
				// applyRanking adds `score` and `sortText` fields. Monaco only
				// cares about sortText; score is for tests/debugging.
				return ranked as unknown as monaco.languages.CompletionItem[];
			};

			// Parse CTE names and table aliases from the SQL query
			const cteNames = parseCTENames(textUntilPosition);
			const aliases = parseTableAliases(textUntilPosition, cteNames);
			const aliasMap = new Map(aliases.map((a) => [a.alias, a]));

			// Build sets of known names for matching
			const topLevelSourceNames = new Set(
				(schema.topLevelSources || []).map((s) => s.name),
			);
			const databaseNames = new Set(
				schema.tables.filter((t) => t.databaseName).map((t) => t.databaseName),
			);
			const tableNames = new Set(schema.tables.map((t) => t.name));

			// Check for dot notation FIRST: before adding any other suggestions
			const textBeforeCursor = lineContent.substring(0, position.column - 1);
			// Match qualified identifier with dot: "data.", "data.m", "data.main.", "data.main.t"
			// Group 1: prefix with trailing dot (e.g., "archforge_ui." or "archforge_ui.main.")
			// Group 2: partial word being typed (e.g., "" or "m")
			const dotMatch = textBeforeCursor.match(/((?:\w+\.)+)(\w*)$/);
			const word = wordInfo.word;

			// Also check if completion was triggered by typing ".": this is a strong signal for dot notation
			const triggeredByDot = context.triggerCharacter === ".";

			// Debug logging for autocomplete
			logger.debug("Completion triggered:", {
				textBeforeCursor,
				lineContent,
				column: position.column,
				dotMatch: dotMatch ? dotMatch[0] : null,
				dotPrefix: dotMatch ? dotMatch[1] : null,
				dotPartial: dotMatch ? dotMatch[2] : null,
				word,
				triggeredByDot,
				topLevelSourceNames: Array.from(topLevelSourceNames),
				databaseNames: Array.from(databaseNames),
			});

			// Helper to find table by name (handles database-qualified names)
			const findTable = (
				tableName: string,
				dbName?: string,
				schemaName?: string,
			) => {
				return schema.tables.find((t) => {
					if (t.name !== tableName) return false;
					if (dbName && t.databaseName !== dbName) return false;
					if (schemaName && t.schemaName !== schemaName) return false;
					return true;
				});
			};

			// Handle dot notation (e.g., "x." for alias, "data." for database, "data.main." for schema)
			// Lite mode skips dot resolution entirely; it's a "full"-mode feature.
			if (dotMatch && isFullMode) {
				// Strip trailing dot from prefix: "archforge_ui." -> "archforge_ui"
				const fullPrefix = dotMatch[1].replace(/\.$/, "");
				const parts = fullPrefix.split(".");
				logger.debug("Dot match found:", { fullPrefix, parts });

				// Single part: could be alias, database, schema, or table name
				if (parts.length === 1) {
					const prefix = parts[0];
					logger.debug("Checking single part:", {
						prefix,
						inDatabaseNames: databaseNames.has(prefix),
						inTopLevelSourceNames: topLevelSourceNames.has(prefix),
						inTableNames: tableNames.has(prefix),
					});

					// 1. Check if prefix is a table alias
					const aliasInfo = aliasMap.get(prefix);
					if (aliasInfo) {
						// If alias points to a CTE, we don't have column info: return empty
						if (aliasInfo.isCTE) {
							logger.debug(
								"Alias points to CTE, no column info available:",
								{
									alias: prefix,
									cteName: aliasInfo.tableName,
								},
							);
							return { suggestions: [] };
						}
						const table = findTable(
							aliasInfo.tableName,
							aliasInfo.databaseName,
							aliasInfo.schemaName,
						);
						if (table) {
							for (const c of table.columns) {
								suggestions.push({
									label: c,
									kind: m.languages.CompletionItemKind.Field,
									insertText: c,
									detail: `Column (${aliasInfo.tableName})`,
									documentation: `Column from ${aliasInfo.tableName} (alias: ${prefix})`,
									range,
								});
							}
							return { suggestions: rank(suggestions) };
						}
						// Alias found but table not in schema: return empty (don't show keywords)
						logger.debug("Alias found but table not in schema:", {
							alias: prefix,
							tableName: aliasInfo.tableName,
						});
						return { suggestions: [] };
					}

					// 2. Check if prefix is a database/data source name -> show schemas or tables
					if (
						databaseNames.has(prefix) ||
						topLevelSourceNames.has(prefix)
					) {
						// First try to show schemas within this database
						const schemasInDb = new Set<string>();
						for (const t of schema.tables) {
							if (t.databaseName === prefix && t.schemaName) {
								schemasInDb.add(t.schemaName);
							}
						}

						if (schemasInDb.size > 0) {
							// Database has schemas: show schema names
							for (const schemaName of schemasInDb) {
								suggestions.push({
									label: schemaName,
									kind: m.languages.CompletionItemKind.Module,
									insertText: schemaName,
									detail: `Schema (${prefix})`,
									documentation: `Schema: ${prefix}.${schemaName}`,
									range,
								});
							}
						} else {
							// No schemas: show tables directly
							for (const t of schema.tables) {
								if (t.databaseName === prefix) {
									const insertText =
										quoteIdentifier(t.name, t.sourceType);
									suggestions.push({
										label: t.name,
										kind: m.languages.CompletionItemKind.Class,
										insertText,
										detail: `Table (${prefix})`,
										documentation: `Table: ${prefix}.${t.name}`,
										range,
									});
								}
							}
						}
						return { suggestions: rank(suggestions) };
					}

					// 3. Check if prefix is a table name (show columns)
					if (tableNames.has(prefix)) {
						const table = schema.tables.find((x) => x.name === prefix);
						if (table) {
							for (const c of table.columns) {
								suggestions.push({
									label: c,
									kind: m.languages.CompletionItemKind.Field,
									insertText: c,
									detail: "Column",
									documentation: `Column: ${prefix}.${c}`,
									range,
								});
							}
						}
						return { suggestions: rank(suggestions) };
					}
				}

				// Two parts: database.schema -> show tables in that schema
				if (parts.length === 2) {
					const [dbName, schemaName] = parts;
					for (const t of schema.tables) {
						if (t.databaseName === dbName && t.schemaName === schemaName) {
							const insertText =
								quoteIdentifier(t.name, t.sourceType);
							suggestions.push({
								label: t.name,
								kind: m.languages.CompletionItemKind.Class,
								insertText,
								detail: `Table (${dbName}.${schemaName})`,
								documentation: `Table: ${dbName}.${schemaName}.${t.name}`,
								range,
							});
						}
					}
					return { suggestions: rank(suggestions) };
				}

				// Three parts: database.schema.table -> show columns
				if (parts.length === 3) {
					const [dbName, schemaName, tableName] = parts;
					const table = findTable(tableName, dbName, schemaName);
					if (table) {
						for (const c of table.columns) {
							suggestions.push({
								label: c,
								kind: m.languages.CompletionItemKind.Field,
								insertText: c,
								detail: `Column (${tableName})`,
								documentation: `Column: ${dbName}.${schemaName}.${tableName}.${c}`,
								range,
							});
						}
					}
					return { suggestions: rank(suggestions) };
				}

				// Dot notation detected but prefix not recognized.
				// Return empty suggestions: don't fall through to SQL keywords.
				return { suggestions: rank(suggestions) };
			} else if (word.includes(".") && isFullMode) {
				// Handle case where user is typing after the dot (e.g., "data.us|", "data.main.tab|")
				// Lite mode skips this drilling-through-schema path.
				const parts = word.split(".");
				// Remove the last part (what user is typing) to get the prefix parts
				const prefixParts = parts.slice(0, -1);

				// Single prefix part: data.us| -> prefix is "data"
				if (prefixParts.length === 1) {
					const prefix = prefixParts[0];

					// Check alias first
					const aliasInfo = aliasMap.get(prefix);
					if (aliasInfo) {
						// If alias points to a CTE, no column info: return empty
						if (aliasInfo.isCTE) {
							return { suggestions: [] };
						}
						const table = findTable(
							aliasInfo.tableName,
							aliasInfo.databaseName,
						);
						if (table) {
							for (const c of table.columns) {
								suggestions.push({
									label: c,
									kind: m.languages.CompletionItemKind.Field,
									insertText: c,
									detail: `Column (${aliasInfo.tableName})`,
									documentation: `Column from ${aliasInfo.tableName}`,
									range,
								});
							}
							return { suggestions: rank(suggestions) };
						}
						// Alias found but table not in schema: return empty
						return { suggestions: [] };
					}

					if (
						databaseNames.has(prefix) ||
						topLevelSourceNames.has(prefix)
					) {
						// Check if database has schemas
						const schemasInDb = new Set<string>();
						for (const t of schema.tables) {
							if (t.databaseName === prefix && t.schemaName) {
								schemasInDb.add(t.schemaName);
							}
						}

						if (schemasInDb.size > 0) {
							// Show schemas
							for (const schemaName of schemasInDb) {
								suggestions.push({
									label: schemaName,
									kind: m.languages.CompletionItemKind.Module,
									insertText: schemaName,
									detail: `Schema (${prefix})`,
									documentation: `Schema: ${prefix}.${schemaName}`,
									range,
								});
							}
						} else {
							// Show tables
							for (const t of schema.tables) {
								if (t.databaseName === prefix) {
									const insertText =
										quoteIdentifier(t.name, t.sourceType);
									suggestions.push({
										label: t.name,
										kind: m.languages.CompletionItemKind.Class,
										insertText,
										detail: `Table (${prefix})`,
										documentation: `Table: ${prefix}.${t.name}`,
										range,
									});
								}
							}
						}
						return { suggestions: rank(suggestions) };
					}
				}

				// Two prefix parts: data.main.tab| -> prefix is "data.main"
				if (prefixParts.length === 2) {
					const [dbName, schemaName] = prefixParts;
					for (const t of schema.tables) {
						if (t.databaseName === dbName && t.schemaName === schemaName) {
							const insertText =
								quoteIdentifier(t.name, t.sourceType);
							suggestions.push({
								label: t.name,
								kind: m.languages.CompletionItemKind.Class,
								insertText,
								detail: `Table (${dbName}.${schemaName})`,
								documentation: `Table: ${dbName}.${schemaName}.${t.name}`,
								range,
							});
						}
					}
					return { suggestions: rank(suggestions) };
				}

				// Three prefix parts: data.main.table.col| -> show columns
				if (prefixParts.length === 3) {
					const [dbName, schemaName, tableName] = prefixParts;
					const table = findTable(tableName, dbName, schemaName);
					if (table) {
						for (const c of table.columns) {
							suggestions.push({
								label: c,
								kind: m.languages.CompletionItemKind.Field,
								insertText: c,
								detail: `Column (${tableName})`,
								documentation: `Column: ${dbName}.${schemaName}.${tableName}.${c}`,
								range,
							});
						}
					}
					return { suggestions: rank(suggestions) };
				}

				// Word contains dot but prefix not recognized.
				// Return empty suggestions: don't fall through to SQL keywords.
				return { suggestions: rank(suggestions) };
			}

			// If triggered by dot but no dot match, suppress SQL keywords.
			// This prevents showing ABS, ALL, etc. when user types "data."
			if (triggeredByDot) {
				logger.debug(
					"Triggered by dot but no match found: returning empty suggestions",
				);
				return { suggestions: rank(suggestions) };
			}

			// No dot notation: detect SQL context
			logger.debug(
				"No dot notation detected, falling through to SQL context. dotMatch was:",
				dotMatch,
			);
			const sqlContext = detectSQLContext(textUntilPosition);
			logger.debug("SQL context detected:", sqlContext);

			// Get contextual SQL completions (keywords, functions, snippets)
			// scoped to the active dialect (so Snowflake users get QUALIFY,
			// BigQuery users get ARRAY_AGG WITH OFFSET, etc.).
			const sqlCompletions = getContextualCompletions(
				textUntilPosition,
				lineContent,
				activeDialect,
			);

			// Add SQL completions
			for (const comp of sqlCompletions) {
				suggestions.push({
					label: comp.label,
					kind: comp.kind,
					insertText: comp.insertText,
					insertTextRules: comp.insertTextRules,
					detail: comp.detail,
					documentation: comp.documentation,
					range,
				});
			}

			// Context-based schema suggestions
			if (sqlContext === "table") {
				// After FROM/JOIN: show top-level sources (databases, files)
				const topLevelSources = schema.topLevelSources || [];
				for (const src of topLevelSources) {
					// For BigQuery, use backticks
					const insertText =
						quoteIdentifier(src.name, src.sourceType);
					suggestions.push({
						label: src.displayName || src.name,
						kind: m.languages.CompletionItemKind.Module,
						insertText,
						detail: `Data source (${src.sourceType})`,
						documentation: `${src.sourceType} data source: ${src.name}`,
						range,
					});
				}
			} else if (sqlContext === "column" && isFullMode) {
				// After SELECT, WHERE, etc.: show columns.
				// Lite mode skips the all-columns-from-all-tables dump: it's
				// noisy when there are many tables and Phase 3b will replace
				// it with FROM-clause-aware filtering.
				for (const t of schema.tables) {
					for (const c of t.columns) {
						suggestions.push({
							label: c,
							kind: m.languages.CompletionItemKind.Field,
							insertText: c,
							detail: `Column from ${t.name}`,
							documentation: `Column: ${t.name}.${c}`,
							range,
						});
					}
				}
			} else if (sqlContext === "all") {
				// Show top-level sources in both modes; columns only in full.
				const topLevelSources = schema.topLevelSources || [];
				for (const src of topLevelSources) {
					const insertText =
						quoteIdentifier(src.name, src.sourceType);
					suggestions.push({
						label: src.displayName || src.name,
						kind: m.languages.CompletionItemKind.Module,
						insertText,
						detail: `Data source (${src.sourceType})`,
						documentation: `${src.sourceType} data source: ${src.name}`,
						range,
					});
				}
				// Also show columns in 'all' context (full mode only)
				if (isFullMode) for (const t of schema.tables) {
					for (const c of t.columns) {
						suggestions.push({
							label: c,
							kind: m.languages.CompletionItemKind.Field,
							insertText: c,
							detail: `Column from ${t.name}`,
							documentation: `Column: ${t.name}.${c}`,
							range,
						});
					}
				}
			}

			return { suggestions: rank(suggestions) };
		},
	};
}
