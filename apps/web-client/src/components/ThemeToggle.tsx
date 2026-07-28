import { getNextTheme, themes } from "../themes";
import { MoonIcon, SunIcon } from "./Icons";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Compact theme control for the header: a single icon button that cycles to the
 * next theme (sun when the current theme is light, moon when dark). The full
 * theme list lives in Settings > Appearance, so the header stays uncluttered.
 */
export default function ThemeToggle() {
	const editorTheme = useSettingsStore((s) => s.editorTheme);
	const setEditorTheme = useSettingsStore((s) => s.setEditorTheme);

	const current = themes.find((t) => t.id === editorTheme);
	const isLight = current?.type === "light";
	const next = getNextTheme(editorTheme);

	return (
		<button
			type="button"
			className="file-button icon-only"
			onClick={() => setEditorTheme(next.id)}
			title={`Theme: ${current?.label ?? "Dark"}. Click to switch to ${next.label} (Cmd/Ctrl+Shift+K). Choose any theme in Settings.`}
			aria-label={`Switch theme, currently ${current?.label ?? editorTheme}`}
		>
			{isLight ? (
				<SunIcon size={16} aria-hidden="true" />
			) : (
				<MoonIcon size={16} aria-hidden="true" />
			)}
		</button>
	);
}
