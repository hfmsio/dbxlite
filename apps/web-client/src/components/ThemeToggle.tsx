import { useEffect, useRef, useState } from "react";
import { MoonIcon, SunIcon } from "./Icons";
import { themes } from "../themes";
import { useSettingsStore } from "../stores/settingsStore";

export default function ThemeToggle() {
	const editorTheme = useSettingsStore((s) => s.editorTheme);
	const setEditorTheme = useSettingsStore((s) => s.setEditorTheme);
	const [isAnimating, setIsAnimating] = useState(false);
	const prevThemeRef = useRef(editorTheme);

	const currentTheme = themes.find((t) => t.id === editorTheme);
	const isLight = currentTheme?.type === "light";

	// Trigger animation when theme changes
	useEffect(() => {
		if (prevThemeRef.current !== editorTheme) {
			setIsAnimating(true);
			const timer = setTimeout(() => setIsAnimating(false), 400);
			prevThemeRef.current = editorTheme;
			return () => clearTimeout(timer);
		}
	}, [editorTheme]);

	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setEditorTheme(e.target.value);
	};

	return (
		<div className={`theme-toggle ${isAnimating ? "theme-changing" : ""}`}>
			<span
				className={`theme-icon ${isAnimating ? "icon-spin" : ""}`}
				style={{
					display: "flex",
					alignItems: "center",
					color: isLight ? "var(--warning)" : "var(--accent)",
					transition: "color 0.3s ease, transform 0.3s ease",
				}}
			>
				{isLight ? <SunIcon size={14} /> : <MoonIcon size={14} />}
			</span>
			<select
				value={editorTheme}
				onChange={handleChange}
				className="theme-select"
				title="Select theme (Cmd/Ctrl+Shift+K to rotate)"
			>
				{themes.map((t) => (
					<option key={t.id} value={t.id}>
						{t.label}
					</option>
				))}
			</select>
			{/* Accent color indicator */}
			<span
				className="theme-accent-dot"
				style={{
					width: "8px",
					height: "8px",
					borderRadius: "50%",
					background: "var(--accent)",
					boxShadow: isAnimating
						? "0 0 8px var(--accent), 0 0 12px var(--accent)"
						: "0 0 4px color-mix(in srgb, var(--accent) 50%, transparent)",
					transition: "box-shadow 0.3s ease, transform 0.3s ease",
					transform: isAnimating ? "scale(1.5)" : "scale(1)",
				}}
			/>
		</div>
	);
}
