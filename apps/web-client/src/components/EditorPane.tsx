import * as monaco from "monaco-editor";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { format } from "sql-formatter";
import { createCompletionProvider } from "../services/sql-completion";
import { queryService } from "../services/streaming-query-service";
import type { AutocompleteMode } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getMonacoTheme, getNextTheme, registerMonacoThemes } from "../themes";
import type { ConnectorType, DataSource } from "../types/data-source";
import { useQueryContext } from "../contexts/QueryContext";
import { createLogger } from "../utils/logger";
import { escapeStringLiteral } from "../utils/sqlSanitizer";

// Inline DuckDB sources that live outside the introspected schema: a URL, or a
// path ending in a recognised data-file extension. Matching these gates the
// on-demand DESCRIBE so we never run one for an ordinary mistyped identifier.
const INLINE_FILE_SOURCE_RE =
	/:\/\/|\.(parquet|csv|tsv|json|jsonl|ndjson|xlsx|xls|arrow|feather)$/i;

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
		case "lite":
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
		case "full":
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
	insertAtCursor: (text: string) => void;
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
		const { activeConnector } = useQueryContext();
		const activeConnectorRef = useRef<ConnectorType>(activeConnector);
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
		// Client-side cache for lazily-fetched cloud column lists, keyed by
		// dialect+project+dataset+table, plus the set of fetches in flight so a
		// second `x.` while the first is loading doesn't fire a duplicate call.
		const columnCacheRef = useRef(new Map<string, string[]>());
		const columnFetchInFlightRef = useRef(new Set<string>());

		useEffect(() => {
			activeConnectorRef.current = activeConnector;
		}, [activeConnector]);

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
			insertAtCursor: (text: string) => {
				const editor = editorInstanceRef.current;
				if (!editor) return;
				const position = editor.getPosition();
				if (!position) return;
				editor.executeEdits("ai-insert", [
					{
						range: new monaco.Range(
							position.lineNumber,
							position.column,
							position.lineNumber,
							position.column,
						),
						text,
					},
				]);
				// Move cursor to end of inserted text
				const model = editor.getModel();
				if (model) {
					const newPosition = model.getPositionAt(
						model.getOffsetAt(position) + text.length,
					);
					editor.setPosition(newPosition);
				}
				editor.focus();
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
						// Map active connector to sql-formatter dialect. Snowflake and
						// BigQuery have dedicated dialects (preserve quoted identifiers,
						// dialect-specific keywords); DuckDB falls back to generic 'sql'.
						const dialectByConnector: Record<ConnectorType, string> = {
							duckdb: "sql",
							bigquery: "bigquery",
							snowflake: "snowflake",
						};
						const language =
							dialectByConnector[activeConnectorRef.current] ?? "sql";
						const formatted = format(currentValue, {
							language: language as "sql",
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

			// Register the SQL completion provider. Suggestion logic lives in
			// services/sql-completion; we wire it to React refs here.
			const provider = monaco.languages.registerCompletionItemProvider(
				"sql",
				createCompletionProvider({
					getMode: () => useSettingsStore.getState().autocompleteMode,
					getDataSources: () => dataSourcesRef.current,
					getDialect: () => activeConnectorRef.current,
					// Cloud sources load table columns lazily, and BigQuery keeps
					// its explorer tree in component state that never reaches the
					// completion schema — so `x.` on a cloud table finds no columns
					// to offer. Resolve them from the connector on demand, without
					// blocking the completion: return cached columns synchronously,
					// or a `loading` marker while a one-time background fetch runs.
					// When it lands we re-open the suggestion widget so the columns
					// replace the "Loading columns…" placeholder.
					lookupColumns: ({ tableName, databaseName, schemaName }) => {
						const dialect = activeConnectorRef.current;

						// Pick a cache key and a fetch strategy for the alias target.
						// Anything already in the introspected schema is resolved
						// before we get here, so this only fires for lazily-loaded
						// sources: cloud tables and inline DuckDB file/URL sources.
						let key: string;
						let fetch: () => Promise<string[]>;

						if (dialect === "bigquery" || dialect === "snowflake") {
							// Both cloud paths need the project/dataset (or db/schema)
							// qualifier to name the table.
							if (!databaseName || !schemaName) return null;
							key = `${dialect}:${databaseName}:${schemaName}:${tableName}`;
							fetch = async () => {
								const meta =
									dialect === "bigquery"
										? await queryService.getBigQueryTableMetadata(
												databaseName,
												schemaName,
												tableName,
											)
										: await queryService.getSnowflakeTableMetadata(
												databaseName,
												schemaName,
												tableName,
											);
								return (meta.columns ?? []).map((c) => c.name);
							};
						} else if (dialect === "duckdb") {
							// Inline `FROM 'foo.parquet'` / URL sources aren't in the
							// schema. A qualifier means it's a real (attached) table,
							// which is already introspected — skip. Otherwise describe
							// the source lazily (parquet only reads the footer).
							if (databaseName || schemaName) return null;
							if (!INLINE_FILE_SOURCE_RE.test(tableName)) return null;
							key = `duckdb-file:${tableName}`;
							fetch = async () => {
								const res = await queryService.executeQueryOnConnector(
									"duckdb",
									`DESCRIBE SELECT * FROM ${escapeStringLiteral(tableName)}`,
								);
								return res.rows.map((r) => String(r.column_name));
							};
						} else {
							return null;
						}

						const cached = columnCacheRef.current.get(key);
						if (cached) return { columns: cached };
						if (columnFetchInFlightRef.current.has(key)) return { loading: true };

						columnFetchInFlightRef.current.add(key);
						void (async () => {
							try {
								columnCacheRef.current.set(key, await fetch());
							} catch {
								// Leave uncached; a later trigger retries.
							} finally {
								columnFetchInFlightRef.current.delete(key);
								// Re-open the suggestion widget so freshly loaded
								// columns replace the placeholder without retyping.
								editorInstanceRef.current?.trigger(
									"dbxlite-column-fetch",
									"editor.action.triggerSuggest",
									{},
								);
							}
						})();
						return { loading: true };
					},
					monaco,
				}),
			);

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
