/**
 * Theme System
 *
 * Modular theme definitions with dynamic CSS injection.
 * Add new themes by creating a file in definitions/ and importing here.
 */

// Theme definitions
import { ayuLight } from "./definitions/ayu-light";
import { catppuccin } from "./definitions/catppuccin";
import { dracula } from "./definitions/dracula";
import { githubLight } from "./definitions/github-light";
import { nord } from "./definitions/nord";
import { oneDark } from "./definitions/one-dark";
import { solarizedLight } from "./definitions/solarized-light";
import { tokyoNight } from "./definitions/tokyo-night";
import { vsDark } from "./definitions/vs-dark";
import { vsLight } from "./definitions/vs-light";

export interface ThemeColors {
	bgPrimary: string;
	bgSecondary: string;
	bgTertiary: string;
	bgHover: string;
	bgQuaternary?: string;

	textPrimary: string;
	textSecondary: string;
	textMuted: string;

	accent: string;
	accentHover: string;

	success: string;
	warning: string;
	error: string;

	border: string;
	borderLight: string;
}

export interface ThemeEffects {
	headerBlur: string;
	headerBgAlpha: number;
	shadowSm: string;
	shadowMd: string;
	shadowLg: string;
	headerGradientStart: string;
	headerGradientEnd: string;
	dividerColor: string;
	overlayBg: string;
}

// Monaco editor specific colors for syntax highlighting
export interface MonacoColors {
	background: string;
	foreground: string;
	lineHighlight: string;
	selection: string;
	cursor: string;
	lineNumber: string;
	lineNumberActive: string;
	// SQL syntax colors
	keyword: string;
	string: string;
	number: string;
	comment: string;
	operator: string;
	function: string;
	type: string;
	identifier: string;
}

export interface ThemeDefinition {
	id: string;
	label: string;
	type: "dark" | "light";
	colors: ThemeColors;
	effects: ThemeEffects;
	monaco: MonacoColors;
}

// All available themes (alternating dark/light for keyboard rotation)
export const themes: ThemeDefinition[] = [
	vsDark,          // dark
	vsLight,         // light
	dracula,         // dark
	solarizedLight,  // light
	oneDark,         // dark
	ayuLight,        // light
	nord,            // dark
	githubLight,     // light
	tokyoNight,      // dark
	catppuccin,      // dark
];

// Get theme by ID
export function getThemeById(id: string): ThemeDefinition | undefined {
	return themes.find((t) => t.id === id);
}

// Get default theme
export function getDefaultTheme(): ThemeDefinition {
	return vsDark;
}

// Get next theme in rotation (cycles through all themes)
export function getNextTheme(currentThemeId: string): ThemeDefinition {
	const currentIndex = themes.findIndex((t) => t.id === currentThemeId);
	const nextIndex = (currentIndex + 1) % themes.length;
	return themes[nextIndex];
}

// Convert hex to RGB values
function hexToRgb(hex: string): string {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return "0, 0, 0";
	return `${Number.parseInt(result[1], 16)}, ${Number.parseInt(result[2], 16)}, ${Number.parseInt(result[3], 16)}`;
}

// Generate CSS variables from theme
function generateCssVariables(theme: ThemeDefinition): string {
	const { colors, effects } = theme;

	return `
    --bg-primary: ${colors.bgPrimary};
    --bg-secondary: ${colors.bgSecondary};
    --bg-tertiary: ${colors.bgTertiary};
    --bg-hover: ${colors.bgHover};
    ${colors.bgQuaternary ? `--bg-quaternary: ${colors.bgQuaternary};` : ""}
    --text-primary: ${colors.textPrimary};
    --text-secondary: ${colors.textSecondary};
    --text-muted: ${colors.textMuted};
    --accent: ${colors.accent};
    --accent-hover: ${colors.accentHover};
    --success: ${colors.success};
    --warning: ${colors.warning};
    --error: ${colors.error};
    --border: ${colors.border};
    --border-light: ${colors.borderLight};
    --bg-primary-rgb: ${hexToRgb(colors.bgPrimary)};
    --bg-secondary-rgb: ${hexToRgb(colors.bgSecondary)};
    --header-blur: ${effects.headerBlur};
    --header-bg-alpha: ${effects.headerBgAlpha};
    --shadow-sm: ${effects.shadowSm};
    --shadow-md: ${effects.shadowMd};
    --shadow-lg: ${effects.shadowLg};
    --header-gradient-start: ${effects.headerGradientStart};
    --header-gradient-end: ${effects.headerGradientEnd};
    --divider-color: ${effects.dividerColor};
    --overlay-bg: ${effects.overlayBg};
  `;
}

// Style element ID for dynamic theme injection
const THEME_STYLE_ID = "dynamic-theme-styles";

// LocalStorage key for settings (must match Zustand persist key)
const SETTINGS_STORAGE_KEY = "dbxlite-settings";

// Get stored theme from localStorage synchronously
function getStoredThemeId(): string | null {
	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return parsed?.state?.editorTheme || null;
		}
	} catch {
		// Ignore parse errors
	}
	return null;
}

// Apply theme to document
export function applyTheme(themeId: string): void {
	const theme = getThemeById(themeId) || getDefaultTheme();

	// Set data-theme attribute for any remaining CSS selectors
	document.documentElement.setAttribute("data-theme", themeId);

	// Generate and inject CSS variables
	const cssVariables = generateCssVariables(theme);

	// Find or create style element
	let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement;
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = THEME_STYLE_ID;
		document.head.appendChild(styleEl);
	}

	// Inject theme CSS
	styleEl.textContent = `:root { ${cssVariables} }`;
}

// Get Monaco editor theme name for a given app theme
export function getMonacoTheme(themeId: string): string {
	const theme = getThemeById(themeId);
	// Return custom theme name (matches the id we use when registering)
	return theme ? `custom-${theme.id}` : "vs-dark";
}

// Monaco theme data type for defineTheme
interface MonacoThemeData {
	base: "vs" | "vs-dark";
	inherit: boolean;
	rules: Array<{ token: string; foreground?: string; fontStyle?: string }>;
	colors: Record<string, string>;
}

// Generate Monaco theme data from ThemeDefinition
function generateMonacoThemeData(theme: ThemeDefinition): MonacoThemeData {
	const { monaco: m } = theme;
	const base = theme.type === "light" ? "vs" : "vs-dark";

	// Remove # prefix for token colors (Monaco expects hex without #)
	const stripHash = (color: string) => color.replace("#", "");

	return {
		base,
		inherit: true,
		rules: [
			// SQL Keywords (SELECT, FROM, WHERE, etc.)
			{ token: "keyword", foreground: stripHash(m.keyword) },
			{ token: "keyword.sql", foreground: stripHash(m.keyword) },
			// Strings
			{ token: "string", foreground: stripHash(m.string) },
			{ token: "string.sql", foreground: stripHash(m.string) },
			// Numbers
			{ token: "number", foreground: stripHash(m.number) },
			{ token: "number.sql", foreground: stripHash(m.number) },
			// Comments
			{ token: "comment", foreground: stripHash(m.comment), fontStyle: "italic" },
			{ token: "comment.sql", foreground: stripHash(m.comment), fontStyle: "italic" },
			// Operators
			{ token: "operator", foreground: stripHash(m.operator) },
			{ token: "operator.sql", foreground: stripHash(m.operator) },
			// Functions
			{ token: "predefined", foreground: stripHash(m.function) },
			{ token: "predefined.sql", foreground: stripHash(m.function) },
			// Types
			{ token: "type", foreground: stripHash(m.type) },
			// Identifiers (table names, column names)
			{ token: "identifier", foreground: stripHash(m.identifier) },
			{ token: "identifier.sql", foreground: stripHash(m.identifier) },
		],
		colors: {
			"editor.background": m.background,
			"editor.foreground": m.foreground,
			"editor.lineHighlightBackground": m.lineHighlight,
			"editor.selectionBackground": m.selection,
			"editorCursor.foreground": m.cursor,
			"editorLineNumber.foreground": m.lineNumber,
			"editorLineNumber.activeForeground": m.lineNumberActive,
			"editor.selectionHighlightBackground": m.selection + "55",
			"editorIndentGuide.background": m.lineNumber + "33",
			"editorIndentGuide.activeBackground": m.lineNumber + "66",
			"editorWidget.background": m.background,
			"editorWidget.border": theme.colors.border,
			"editorSuggestWidget.background": m.background,
			"editorSuggestWidget.border": theme.colors.border,
			"editorSuggestWidget.foreground": m.foreground,
			"editorSuggestWidget.selectedBackground": m.selection,
			"editorSuggestWidget.highlightForeground": theme.colors.accent,
		},
	};
}

// Register all custom Monaco themes
// Must be called after Monaco is loaded
export function registerMonacoThemes(monaco: typeof import("monaco-editor")): void {
	for (const theme of themes) {
		const themeData = generateMonacoThemeData(theme);
		monaco.editor.defineTheme(`custom-${theme.id}`, themeData);
	}
}

// Apply theme immediately on module load (before React renders)
// This prevents flash of unstyled content
const initialThemeId = getStoredThemeId() || getDefaultTheme().id;
applyTheme(initialThemeId);
