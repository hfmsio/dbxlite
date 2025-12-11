import * as monaco from "monaco-editor";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { format } from "sql-formatter";
import {
	detectSQLContext,
	getContextualCompletions,
	parseCTENames,
	parseTableAliases,
} from "../lib/sqlCompletions";
import {
	getSchemaFromDataSources,
	getSchemaStub,
} from "../services/schema-service";
import type { AutocompleteMode } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getMonacoTheme, getNextTheme, registerMonacoThemes } from "../themes";
import type { DataSource } from "../types/data-source";
import { createLogger } from "../utils/logger";

const logger = createLogger("EditorPane");

/**
 * Get Monaco editor options based on autocomplete mode
 */
function getAutocompleteOptions(mode: AutocompleteMode, fontSize: number) {
	// Smart defaults applied to all modes
	const baseOptions = {
		suggestSelection: "recentlyUsed" as const,
		acceptSuggestionOnEnter: "smart" as const,
		suggestFontSize: fontSize,
	};

	switch (mode) {
		case "off":
			return {
				...baseOptions,
				quickSuggestions: false,
				suggestOnTriggerCharacters: false,
				wordBasedSuggestions: "off" as const,
				parameterHints: { enabled: false },
				snippetSuggestions: "none" as const,
				inlineSuggest: { enabled: false },
				tabCompletion: "off" as const,
				acceptSuggestionOnCommitCharacter: false,
			};
		case "default":
			return {
				...baseOptions,
				quickSuggestions: { other: true, comments: false, strings: false },
				suggestOnTriggerCharacters: true,
				wordBasedSuggestions: "currentDocument" as const,
				parameterHints: { enabled: true },
				snippetSuggestions: "inline" as const,
				inlineSuggest: { enabled: false },
				tabCompletion: "on" as const,
				acceptSuggestionOnCommitCharacter: true,
			};
		case "experimental":
		default:
			return {
				...baseOptions,
				quickSuggestions: { other: true, comments: false, strings: false },
				suggestOnTriggerCharacters: true,
				wordBasedSuggestions: "allDocuments" as const,
				parameterHints: { enabled: true },
				snippetSuggestions: "inline" as const,
				inlineSuggest: { enabled: false },
				tabCompletion: "on" as const,
				acceptSuggestionOnCommitCharacter: true,
			};
	}
}

interface EditorPaneProps {
	onRunQuery?: () => void;
	onSaveFile?: () => void;
	disabled?: boolean;
	height?: number;
	onChange?: (value: string) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	theme?: string;
	fontSize?: number;
	fontFamily?: string;
	dataSources?: DataSource[];
}

export interface EditorPaneHandle {
	getValue: () => string;
	setValue: (value: string) => void;
	getSelection: () => string;
	getCursorPosition: () => number;
	setCursorPosition: (offset: number) => void;
	focus: () => void;
}

const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
	(
		{
			onRunQuery,
			onSaveFile,
			disabled = false,
			onChange,
			onFocus,
			onBlur,
			theme = "vs-dark",
			fontSize = 14,
			fontFamily = 'Menlo, Monaco, "Courier New", monospace',
			dataSources,
		},
		ref,
	) => {
		const containerRef = useRef<HTMLDivElement | null>(null);
		const editorInstanceRef =
			useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
		const lastEscTimeRef = useRef<number | null>(null);
		const editorFocusedRef = useRef<boolean>(false);
		const disabledRef = useRef(disabled);
		const onRunQueryRef = useRef(onRunQuery);
		const onSaveFileRef = useRef(onSaveFile);
		const onChangeRef = useRef(onChange);
		const onFocusRef = useRef(onFocus);
		const onBlurRef = useRef(onBlur);
		const dataSourcesRef = useRef(dataSources);

		// Keep refs in sync
		useEffect(() => {
			disabledRef.current = disabled;
			onRunQueryRef.current = onRunQuery;
			onSaveFileRef.current = onSaveFile;
			onChangeRef.current = onChange;
			onFocusRef.current = onFocus;
			onBlurRef.current = onBlur;
			dataSourcesRef.current = dataSources;
		}, [disabled, onRunQuery, onSaveFile, onChange, onFocus, onBlur, dataSources]);

		// Update editor theme when theme prop changes
		useEffect(() => {
			if (editorInstanceRef.current) {
				const monacoTheme = getMonacoTheme(theme);
				monaco.editor.setTheme(monacoTheme);
			}
		}, [theme]);

		// Update editor font settings when they change
		useEffect(() => {
			if (editorInstanceRef.current) {
				editorInstanceRef.current.updateOptions({
					fontSize,
					fontFamily,
				});
			}
		}, [fontSize, fontFamily]);

		// Subscribe to autocomplete mode changes and update editor options
		useEffect(() => {
			let previousMode = useSettingsStore.getState().autocompleteMode;
			const unsubscribe = useSettingsStore.subscribe((state) => {
				if (state.autocompleteMode !== previousMode) {
					previousMode = state.autocompleteMode;
					if (editorInstanceRef.current) {
						const options = getAutocompleteOptions(state.autocompleteMode, fontSize);
						editorInstanceRef.current.updateOptions(options);
						logger.debug("Autocomplete mode changed:", state.autocompleteMode);
					}
				}
			});
			return unsubscribe;
		}, [fontSize]);

		// Update editor read-only state when disabled prop changes
		useEffect(() => {
			if (editorInstanceRef.current) {
				editorInstanceRef.current.updateOptions({
					readOnly: disabled,
				});
			}
		}, [disabled]);

		useImperativeHandle(ref, () => ({
			getValue: () => {
				return editorInstanceRef.current?.getValue() || "";
			},
			setValue: (value: string) => {
				const editor = editorInstanceRef.current;
				if (!editor) return;

				// Reset scroll and cursor BEFORE setValue to prevent "Illegal lineNumber" errors
				// Monaco's viewport can have stale line information after content changes
				editor.setScrollTop(0);
				editor.setScrollLeft(0);
				editor.setPosition({ lineNumber: 1, column: 1 });

				// Now set the new value
				editor.setValue(value);

				// Force layout update to ensure view state is synchronized
				editor.layout();
			},
			getSelection: () => {
				const editor = editorInstanceRef.current;
				if (!editor) return "";
				const selection = editor.getSelection();
				if (!selection) return "";
				return editor.getModel()?.getValueInRange(selection) || "";
			},
			getCursorPosition: () => {
				const editor = editorInstanceRef.current;
				if (!editor) return 0;
				const position = editor.getPosition();
				if (!position) return 0;
				const model = editor.getModel();
				if (!model) return 0;
				return model.getOffsetAt(position);
			},
			setCursorPosition: (offset: number) => {
				const editor = editorInstanceRef.current;
				if (!editor) return;
				const model = editor.getModel();
				if (!model) return;
				const position = model.getPositionAt(offset);
				editor.setPosition(position);
				editor.revealPositionInCenterIfOutsideViewport(position, monaco.editor.ScrollType.Smooth);
			},
			focus: () => {
				if (!editorInstanceRef.current) return;

				try {
					// Force layout update before focusing (fixes issues with editor in wrong state)
					editorInstanceRef.current.layout();
					editorInstanceRef.current.focus();

					// Verify focus was successful and retry if needed
					setTimeout(() => {
						if (
							editorInstanceRef.current &&
							!editorInstanceRef.current.hasTextFocus()
						) {
							editorInstanceRef.current.focus();
						}
					}, 50);
				} catch (error) {
					logger.error("Error focusing editor:", error);
				}
			},
		}));

		useEffect(() => {
			if (!containerRef.current) return;
			// Only create editor if it doesn't exist
			if (editorInstanceRef.current) return;

			// Get initial autocomplete options from store
			const initialAutocompleteMode = useSettingsStore.getState().autocompleteMode;
			const autocompleteOptions = getAutocompleteOptions(initialAutocompleteMode, fontSize);

			// Register custom Monaco themes (only runs once)
			registerMonacoThemes(monaco);

			// Create editor with custom theme matching the app theme
			const editor = monaco.editor.create(containerRef.current, {
				value:
					"-- Write SQL here\n-- Press Cmd/Ctrl+Enter to run\nSELECT 1 as result;",
				language: "sql",
				minimap: { enabled: false },
				fontSize,
				fontFamily,
				lineNumbers: "on",
				roundedSelection: false,
				scrollBeyondLastLine: false,
				automaticLayout: true,
				fixedOverflowWidgets: true, // Render suggest widget outside editor container
				theme: getMonacoTheme(theme),
				hover: {
					enabled: true,
					delay: 500,
					sticky: false,
				},
				suggest: {
					showIcons: true,
					showStatusBar: true,
					preview: true,
					showInlineDetails: true,
				},
				// Apply autocomplete options based on mode
				...autocompleteOptions,
			});
			editorInstanceRef.current = editor;

			// Add keyboard shortcut for running queries (Cmd/Ctrl+Enter)
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
				if (onRunQueryRef.current && !disabledRef.current) {
					logger.debug("Running query via Cmd/Ctrl+Enter");
					onRunQueryRef.current();
				}
			});

			// Also add as action for better visibility
			editor.addAction({
				id: "run-query",
				label: "Run Query",
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
				run: () => {
					if (onRunQueryRef.current && !disabledRef.current) {
						logger.debug("Running query via action");
						onRunQueryRef.current();
					}
				},
			});

			// Add format query action (Cmd/Ctrl+Shift+F)
			editor.addAction({
				id: "format-query",
				label: "Format SQL Query",
				keybindings: [
					monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
				],
				run: (editor) => {
					const model = editor.getModel();
					if (!model) return;

					try {
						const currentValue = model.getValue();
						const formatted = format(currentValue, {
							language: "sql",
							tabWidth: 2,
							keywordCase: "upper",
							linesBetweenQueries: 2,
						});

						// Get current cursor position to restore after formatting
						const position = editor.getPosition();

						// Replace content
						editor.executeEdits("format", [
							{
								range: model.getFullModelRange(),
								text: formatted,
							},
						]);

						// Try to restore cursor position (approximate)
						if (position) {
							editor.setPosition(position);
						}

						logger.debug("Query formatted");
					} catch (error) {
						logger.error("Failed to format query:", error);
					}
				},
			});

			// Removed Shift+Tab explorer focus - conflicts with editor outdent functionality

			// Add Cmd+S to save file
			editor.addAction({
				id: "save-file",
				label: "Save File",
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
				run: () => {
					if (onSaveFileRef.current) {
						logger.debug("Saving file via Cmd/Ctrl+S");
						onSaveFileRef.current();
					}
				},
			});

			// Add Cmd+Shift+K to rotate theme (overrides default "delete line")
			editor.addAction({
				id: "rotate-theme",
				label: "Rotate Theme",
				keybindings: [
					monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK,
				],
				run: () => {
					const currentTheme = useSettingsStore.getState().editorTheme;
					const nextTheme = getNextTheme(currentTheme);
					useSettingsStore.getState().setEditorTheme(nextTheme.id);
					logger.debug("Theme rotated to:", nextTheme.label);
				},
			});

			// Global Esc handler while editor has focus (double-Esc to blur)
			const handleGlobalEsc = (e: KeyboardEvent) => {
				if (e.key !== "Escape" && e.key !== "Esc") return;

				const hasFocus =
					editorFocusedRef.current || editor.hasTextFocus();
				if (!hasFocus) return;

				const now = Date.now();
				const last = lastEscTimeRef.current;

				if (last && now - last < 700) {
					e.preventDefault();
					e.stopPropagation();
					lastEscTimeRef.current = null;
					// Focus first tab if present, otherwise body
					const tabButton = document.querySelector(
						".tab-bar .tab-list .tab",
					) as HTMLElement | null;
					(document.activeElement as HTMLElement | null)?.blur();
					if (tabButton) {
						tabButton.focus();
					} else {
						(document.body as HTMLElement).focus();
					}
					return;
				}

				// Record first Esc and clear after timeout
				lastEscTimeRef.current = now;
				window.setTimeout(() => {
					if (
						lastEscTimeRef.current &&
						Date.now() - lastEscTimeRef.current >= 700
					) {
						lastEscTimeRef.current = null;
					}
				}, 750);
			};

			document.addEventListener("keydown", handleGlobalEsc, true);

			// Listen for content changes
			editor.onDidChangeModelContent(() => {
				if (onChangeRef.current) {
					onChangeRef.current(editor.getValue());
				}
			});

			// Listen for focus events
			const focusDisposable = editor.onDidFocusEditorWidget(() => {
				editorFocusedRef.current = true;
				if (onFocusRef.current) {
					onFocusRef.current();
				}
			});

			// Listen for blur events
			const blurDisposable = editor.onDidBlurEditorWidget(() => {
				editorFocusedRef.current = false;
				lastEscTimeRef.current = null;
				if (onBlurRef.current) {
					onBlurRef.current();
				}
			});

			// Handle drag-and-drop from explorer
			const containerElement = containerRef.current;
			if (containerElement) {
				const handleDragOver = (e: DragEvent) => {
					e.preventDefault();
					e.stopPropagation();
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = "copy";
					}
				};

				const handleDrop = (e: DragEvent) => {
					e.preventDefault();
					e.stopPropagation();

					const sql = e.dataTransfer?.getData("text/plain");
					if (!sql) return;

					// Insert SQL at cursor position
					const position = editor.getPosition();
					if (position) {
						editor.executeEdits("drop", [
							{
								range: new monaco.Range(
									position.lineNumber,
									position.column,
									position.lineNumber,
									position.column,
								),
								text: sql,
							},
						]);

						// Move cursor to end of inserted text
						const model = editor.getModel();
						if (model) {
							const newPosition = model.getPositionAt(
								model.getOffsetAt(position) + sql.length,
							);
							editor.setPosition(newPosition);
						}

						editor.focus();
					}
				};

				containerElement.addEventListener("dragover", handleDragOver);
				containerElement.addEventListener("drop", handleDrop);
			}

			// Register completion provider with SQL keywords, functions, and schema
			const provider = monaco.languages.registerCompletionItemProvider("sql", {
				triggerCharacters: [" ", ".", "("],
				provideCompletionItems: async (model, position, context) => {
					// Only provide suggestions in experimental mode
					const mode = useSettingsStore.getState().autocompleteMode;
					if (mode !== "experimental") {
						return { suggestions: [] };
					}

					logger.debug("Completion context:", {
						triggerKind: context.triggerKind,
						triggerCharacter: context.triggerCharacter,
					});
					// Use actual data sources if available, fallback to stub
					const schema =
						dataSourcesRef.current && dataSourcesRef.current.length > 0
							? getSchemaFromDataSources(dataSourcesRef.current)
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

					// Parse CTE names and table aliases from the SQL query
					const cteNames = parseCTENames(textUntilPosition);
					const aliases = parseTableAliases(textUntilPosition, cteNames);
					const aliasMap = new Map(aliases.map((a) => [a.alias, a]));

					// Build sets of known names for matching
					const topLevelSourceNames = new Set(
						(schema.topLevelSources || []).map((s) => s.name),
					);
					const databaseNames = new Set(
						schema.tables
							.filter((t) => t.databaseName)
							.map((t) => t.databaseName),
					);
					const _schemaNames = new Set(
						schema.tables
							.filter((t) => t.schemaName)
							.map((t) => t.schemaName),
					);
					const tableNames = new Set(schema.tables.map((t) => t.name));

					// Check for dot notation FIRST - before adding any other suggestions
					const textBeforeCursor = lineContent.substring(0, position.column - 1);
					// Match qualified identifier with dot: "data.", "data.m", "data.main.", "data.main.t"
					// Group 1: prefix with trailing dot (e.g., "archforge_ui." or "archforge_ui.main.")
					// Group 2: partial word being typed (e.g., "" or "m")
					const dotMatch = textBeforeCursor.match(/((?:\w+\.)+)(\w*)$/);
					const word = wordInfo.word;

					// Also check if completion was triggered by typing "." - this is a strong signal for dot notation
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
					if (dotMatch) {
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
								// If alias points to a CTE, we don't have column info - return empty
								if (aliasInfo.isCTE) {
									logger.debug("Alias points to CTE, no column info available:", {
										alias: prefix,
										cteName: aliasInfo.tableName,
									});
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
											kind: monaco.languages.CompletionItemKind.Field,
											insertText: c,
											detail: `Column (${aliasInfo.tableName})`,
											documentation: `Column from ${aliasInfo.tableName} (alias: ${prefix})`,
											range,
										});
									}
									return { suggestions };
								}
								// Alias found but table not in schema - return empty (don't show keywords)
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
									// Database has schemas - show schema names
									for (const schemaName of schemasInDb) {
										suggestions.push({
											label: schemaName,
											kind: monaco.languages.CompletionItemKind.Module,
											insertText: schemaName,
											detail: `Schema (${prefix})`,
											documentation: `Schema: ${prefix}.${schemaName}`,
											range,
										});
									}
								} else {
									// No schemas - show tables directly
									for (const t of schema.tables) {
										if (t.databaseName === prefix) {
											const insertText =
												t.sourceType === "bigquery"
													? `\`${t.name}\``
													: t.name;
											suggestions.push({
												label: t.name,
												kind: monaco.languages.CompletionItemKind.Class,
												insertText,
												detail: `Table (${prefix})`,
												documentation: `Table: ${prefix}.${t.name}`,
												range,
											});
										}
									}
								}
								return { suggestions };
							}

							// 3. Check if prefix is a table name (show columns)
							if (tableNames.has(prefix)) {
								const table = schema.tables.find((x) => x.name === prefix);
								if (table) {
									for (const c of table.columns) {
										suggestions.push({
											label: c,
											kind: monaco.languages.CompletionItemKind.Field,
											insertText: c,
											detail: "Column",
											documentation: `Column: ${prefix}.${c}`,
											range,
										});
									}
								}
								return { suggestions };
							}
						}

						// Two parts: database.schema -> show tables in that schema
						if (parts.length === 2) {
							const [dbName, schemaName] = parts;
							for (const t of schema.tables) {
								if (t.databaseName === dbName && t.schemaName === schemaName) {
									const insertText =
										t.sourceType === "bigquery" ? `\`${t.name}\`` : t.name;
									suggestions.push({
										label: t.name,
										kind: monaco.languages.CompletionItemKind.Class,
										insertText,
										detail: `Table (${dbName}.${schemaName})`,
										documentation: `Table: ${dbName}.${schemaName}.${t.name}`,
										range,
									});
								}
							}
							return { suggestions };
						}

						// Three parts: database.schema.table -> show columns
						if (parts.length === 3) {
							const [dbName, schemaName, tableName] = parts;
							const table = findTable(tableName, dbName, schemaName);
							if (table) {
								for (const c of table.columns) {
									suggestions.push({
										label: c,
										kind: monaco.languages.CompletionItemKind.Field,
										insertText: c,
										detail: `Column (${tableName})`,
										documentation: `Column: ${dbName}.${schemaName}.${tableName}.${c}`,
										range,
									});
								}
							}
							return { suggestions };
						}

						// Dot notation detected but prefix not recognized
						// Return empty suggestions - don't fall through to SQL keywords
						return { suggestions };
					} else if (word.includes(".")) {
						// Handle case where user is typing after the dot (e.g., "data.us|", "data.main.tab|")
						const parts = word.split(".");
						// Remove the last part (what user is typing) to get the prefix parts
						const prefixParts = parts.slice(0, -1);

						// Single prefix part: data.us| -> prefix is "data"
						if (prefixParts.length === 1) {
							const prefix = prefixParts[0];

							// Check alias first
							const aliasInfo = aliasMap.get(prefix);
							if (aliasInfo) {
								// If alias points to a CTE, no column info - return empty
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
											kind: monaco.languages.CompletionItemKind.Field,
											insertText: c,
											detail: `Column (${aliasInfo.tableName})`,
											documentation: `Column from ${aliasInfo.tableName}`,
											range,
										});
									}
									return { suggestions };
								}
								// Alias found but table not in schema - return empty
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
											kind: monaco.languages.CompletionItemKind.Module,
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
												t.sourceType === "bigquery"
													? `\`${t.name}\``
													: t.name;
											suggestions.push({
												label: t.name,
												kind: monaco.languages.CompletionItemKind.Class,
												insertText,
												detail: `Table (${prefix})`,
												documentation: `Table: ${prefix}.${t.name}`,
												range,
											});
										}
									}
								}
								return { suggestions };
							}
						}

						// Two prefix parts: data.main.tab| -> prefix is "data.main"
						if (prefixParts.length === 2) {
							const [dbName, schemaName] = prefixParts;
							for (const t of schema.tables) {
								if (t.databaseName === dbName && t.schemaName === schemaName) {
									const insertText =
										t.sourceType === "bigquery" ? `\`${t.name}\`` : t.name;
									suggestions.push({
										label: t.name,
										kind: monaco.languages.CompletionItemKind.Class,
										insertText,
										detail: `Table (${dbName}.${schemaName})`,
										documentation: `Table: ${dbName}.${schemaName}.${t.name}`,
										range,
									});
								}
							}
							return { suggestions };
						}

						// Three prefix parts: data.main.table.col| -> show columns
						if (prefixParts.length === 3) {
							const [dbName, schemaName, tableName] = prefixParts;
							const table = findTable(tableName, dbName, schemaName);
							if (table) {
								for (const c of table.columns) {
									suggestions.push({
										label: c,
										kind: monaco.languages.CompletionItemKind.Field,
										insertText: c,
										detail: `Column (${tableName})`,
										documentation: `Column: ${dbName}.${schemaName}.${tableName}.${c}`,
										range,
									});
								}
							}
							return { suggestions };
						}

						// Word contains dot but prefix not recognized
						// Return empty suggestions - don't fall through to SQL keywords
						return { suggestions };
					}

					// If triggered by dot but no dot match, suppress SQL keywords
					// This prevents showing ABS, ALL, etc. when user types "data."
					if (triggeredByDot) {
						logger.debug("Triggered by dot but no match found - returning empty suggestions");
						return { suggestions };
					}

					// No dot notation - detect SQL context
					logger.debug("No dot notation detected, falling through to SQL context. dotMatch was:", dotMatch);
					const sqlContext = detectSQLContext(textUntilPosition);
					logger.debug("SQL context detected:", sqlContext);

					// Get contextual SQL completions (keywords, functions, snippets)
					const sqlCompletions = getContextualCompletions(
						textUntilPosition,
						lineContent,
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
						// After FROM/JOIN - show top-level sources (databases, files)
						const topLevelSources = schema.topLevelSources || [];
						for (const src of topLevelSources) {
							// For BigQuery, use backticks
							const insertText =
								src.sourceType === "bigquery" ? `\`${src.name}\`` : src.name;
							suggestions.push({
								label: src.displayName || src.name,
								kind: monaco.languages.CompletionItemKind.Module,
								insertText,
								detail: `Data source (${src.sourceType})`,
								documentation: `${src.sourceType} data source: ${src.name}`,
								range,
							});
						}
					} else if (sqlContext === "column") {
						// After SELECT, WHERE, etc. - show columns
						for (const t of schema.tables) {
							for (const c of t.columns) {
								suggestions.push({
									label: c,
									kind: monaco.languages.CompletionItemKind.Field,
									insertText: c,
									detail: `Column from ${t.name}`,
									documentation: `Column: ${t.name}.${c}`,
									range,
								});
							}
						}
					} else if (sqlContext === "all") {
						// Show both top-level sources and tables
						const topLevelSources = schema.topLevelSources || [];
						for (const src of topLevelSources) {
							const insertText =
								src.sourceType === "bigquery" ? `\`${src.name}\`` : src.name;
							suggestions.push({
								label: src.displayName || src.name,
								kind: monaco.languages.CompletionItemKind.Module,
								insertText,
								detail: `Data source (${src.sourceType})`,
								documentation: `${src.sourceType} data source: ${src.name}`,
								range,
							});
						}
						// Also show columns in 'all' context
						for (const t of schema.tables) {
							for (const c of t.columns) {
								suggestions.push({
									label: c,
									kind: monaco.languages.CompletionItemKind.Field,
									insertText: c,
									detail: `Column from ${t.name}`,
									documentation: `Column: ${t.name}.${c}`,
									range,
								});
							}
						}
					}

					return { suggestions };
				},
			});

			return () => {
				document.removeEventListener("keydown", handleGlobalEsc, true);
				focusDisposable.dispose();
				blurDisposable.dispose();
				provider.dispose();
				editor.dispose();
				editorInstanceRef.current = null;
			};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Empty deps: editor created once. Theme/font changes handled by separate useEffects

		return (
			<div className="editor-pane-compact">
				<div
					ref={containerRef}
					onClick={() => {
						// Ensure editor gets focus when container is clicked
						if (editorInstanceRef.current && !disabled) {
							try {
								// Force layout update before focusing (fixes focus issues)
								editorInstanceRef.current.layout();
								editorInstanceRef.current.focus();
							} catch (error) {
								logger.error("Error focusing editor on click:", error);
							}
						}
					}}
					style={{
						height: "100%",
						border: "1px solid var(--border)",
						borderRadius: "8px",
						boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.05)",
						cursor: disabled ? "not-allowed" : "text",
					}}
				/>
			</div>
		);
	},
);

EditorPane.displayName = "EditorPane";

export default EditorPane;
