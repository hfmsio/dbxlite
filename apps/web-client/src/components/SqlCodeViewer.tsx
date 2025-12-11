import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { getMonacoTheme } from "../themes";
import { useSettingsStore } from "../stores/settingsStore";

interface SqlCodeViewerProps {
	value: string;
	height?: number | string;
	fontSize?: number;
	borderColor?: string;
}

/**
 * Lightweight read-only Monaco editor for SQL syntax highlighting.
 * Uses the same theme as the main editor.
 */
export function SqlCodeViewer({
	value,
	height = 200,
	fontSize = 12,
	borderColor,
}: SqlCodeViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const editorTheme = useSettingsStore((s) => s.editorTheme);

	// Initialize editor
	useEffect(() => {
		if (!containerRef.current) return;

		const monacoTheme = getMonacoTheme(editorTheme);

		editorRef.current = monaco.editor.create(containerRef.current, {
			value,
			language: "sql",
			theme: monacoTheme,
			readOnly: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: "on",
			lineNumbersMinChars: 3,
			glyphMargin: false,
			folding: true,
			foldingHighlight: true,
			renderLineHighlight: "none",
			scrollbar: {
				vertical: "auto",
				horizontal: "auto",
				verticalScrollbarSize: 8,
				horizontalScrollbarSize: 8,
			},
			overviewRulerLanes: 0,
			hideCursorInOverviewRuler: true,
			overviewRulerBorder: false,
			fontSize,
			fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace",
			padding: { top: 8, bottom: 8 },
			wordWrap: "on",
			contextmenu: false,
			selectionHighlight: false,
			occurrencesHighlight: "off",
			renderWhitespace: "none",
			guides: {
				indentation: false,
			},
			domReadOnly: true,
		});

		return () => {
			editorRef.current?.dispose();
			editorRef.current = null;
		};
	}, []); // Only run once on mount

	// Update value when it changes
	useEffect(() => {
		if (editorRef.current) {
			const model = editorRef.current.getModel();
			if (model && model.getValue() !== value) {
				model.setValue(value);
			}
		}
	}, [value]);

	// Update theme when it changes
	useEffect(() => {
		if (editorRef.current) {
			const monacoTheme = getMonacoTheme(editorTheme);
			monaco.editor.setTheme(monacoTheme);
		}
	}, [editorTheme]);

	// Update font size
	useEffect(() => {
		if (editorRef.current) {
			editorRef.current.updateOptions({ fontSize });
		}
	}, [fontSize]);

	return (
		<div
			ref={containerRef}
			style={{
				height: typeof height === "number" ? `${height}px` : height,
				width: "100%",
				borderLeft: borderColor ? `3px solid ${borderColor}` : undefined,
				overflow: "hidden",
			}}
		/>
	);
}
