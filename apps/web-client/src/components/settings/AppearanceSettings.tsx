import type React from "react";
import {
	type EngineDetectionMode,
	useSettingsStore,
} from "../../stores/settingsStore";
import { themes } from "../../themes";

interface AppearanceSettingsProps {
	fontSize: number;
	fontFamily: string;
	gridFontSize: number;
	gridRowHeight: number;
	pageSize: number;
	cacheThreshold: number;
	explorerSortOrder: "none" | "name" | "type" | "size";
	saveStrategy: "auto" | "manual" | "prompt";
	onFontSizeChange: (size: number) => void;
	onFontFamilyChange: (family: string) => void;
	onGridFontSizeChange: (size: number) => void;
	onGridRowHeightChange: (height: number) => void;
	onPageSizeChange: (size: number) => void;
	onCacheThresholdChange: (threshold: number) => void;
	onExplorerSortOrderChange: (order: "none" | "name" | "type" | "size") => void;
	onSaveStrategyChange: (strategy: "auto" | "manual" | "prompt") => void;
}

const fontFamilies = [
	{
		label: "Monospace (Default)",
		value: 'Menlo, Monaco, "Courier New", monospace',
	},
	{ label: "Fira Code", value: '"Fira Code", monospace' },
	{ label: "Source Code Pro", value: '"Source Code Pro", monospace' },
	{ label: "Consolas", value: "Consolas, monospace" },
	{ label: "Roboto Mono", value: '"Roboto Mono", monospace' },
	{ label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
];

// themes is imported from ../../themes

// Shared styles for compact layout
const labelStyle: React.CSSProperties = {
	display: "block",
	marginBottom: 4,
	fontWeight: 500,
	color: "var(--text-secondary)",
	fontSize: 12,
};

const selectStyle: React.CSSProperties = {
	width: "100%",
	padding: "6px 8px",
	background: "var(--bg-primary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	color: "var(--text-primary)",
	fontSize: 12,
};

const controlGroupStyle: React.CSSProperties = {
	marginBottom: 10,
};

export default function AppearanceSettings({
	fontSize,
	fontFamily,
	gridFontSize,
	gridRowHeight,
	pageSize,
	cacheThreshold,
	explorerSortOrder,
	saveStrategy,
	onFontSizeChange,
	onFontFamilyChange,
	onGridFontSizeChange,
	onGridRowHeightChange,
	onPageSizeChange,
	onCacheThresholdChange,
	onExplorerSortOrderChange,
	onSaveStrategyChange,
}: AppearanceSettingsProps) {
	const theme = useSettingsStore((s) => s.editorTheme);
	const setTheme = useSettingsStore((s) => s.setEditorTheme);
	const autocompleteMode = useSettingsStore((s) => s.autocompleteMode);
	const setAutocompleteMode = useSettingsStore((s) => s.setAutocompleteMode);
	const showExamplesButton = useSettingsStore((s) => s.showExamplesButton);
	const setShowExamplesButton = useSettingsStore((s) => s.setShowExamplesButton);
	const engineDetectionMode = useSettingsStore((s) => s.engineDetectionMode);
	const setEngineDetectionMode = useSettingsStore(
		(s) => s.setEngineDetectionMode,
	);

	return (
		<div style={{ padding: "8px 0" }}>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "12px",
				}}
			>
				{/* Left Column - Editor Settings */}
				<div
					style={{
						padding: 14,
						background: "var(--bg-secondary)",
						border: "1px solid var(--border)",
						borderRadius: 8,
					}}
				>
					<h3
						style={{
							marginTop: 0,
							marginBottom: 12,
							color: "var(--text-primary)",
							fontSize: 13,
							fontWeight: 600,
						}}
					>
						Editor Settings
					</h3>

					{/* Theme Selection */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Theme</label>
						<select
							value={theme}
							onChange={(e) => setTheme(e.target.value)}
							style={selectStyle}
						>
							{themes.map((t) => (
								<option key={t.id} value={t.id}>
									{t.label}
								</option>
							))}
						</select>
					</div>

					{/* Font Size */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Font Size: {fontSize}px</label>
						<input
							type="range"
							min="10"
							max="24"
							value={fontSize}
							onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
							style={{ width: "100%" }}
						/>
					</div>

					{/* Font Family */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Font Family</label>
						<select
							value={fontFamily}
							onChange={(e) => onFontFamilyChange(e.target.value)}
							style={selectStyle}
						>
							{fontFamilies.map((f) => (
								<option key={f.value} value={f.value}>
									{f.label}
								</option>
							))}
						</select>
					</div>

					{/* Save Strategy */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>File Save Strategy</label>
						<select
							value={saveStrategy}
							onChange={(e) =>
								onSaveStrategyChange(
									e.target.value as "auto" | "manual" | "prompt",
								)
							}
							style={selectStyle}
						>
							<option value="auto">Auto-save (3s delay)</option>
							<option value="manual">Manual (Cmd+S only)</option>
							<option value="prompt">Prompt on first edit</option>
						</select>
					</div>

					{/* Autocomplete Mode */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Autocomplete</label>
						<select
							value={autocompleteMode}
							onChange={(e) =>
								setAutocompleteMode(e.target.value as AutocompleteMode)
							}
							style={selectStyle}
						>
							<option value="off">Off (disabled)</option>
							<option value="word">Word matching (lightweight)</option>
							<option value="default">Default (Monaco built-ins)</option>
							<option value="experimental">Experimental (schema-aware)</option>
						</select>
					</div>

					{/* Engine Detection Mode */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Engine Detection</label>
						<select
							value={engineDetectionMode}
							onChange={(e) =>
								setEngineDetectionMode(e.target.value as EngineDetectionMode)
							}
							style={selectStyle}
						>
							<option value="off">Off (use selected connector)</option>
							<option value="suggest">Suggest (warn on mismatch)</option>
							<option value="auto">Auto (switch automatically)</option>
						</select>
						<p
							style={{
								fontSize: 10,
								color: "var(--text-muted)",
								marginTop: 4,
								marginBottom: 0,
								lineHeight: 1.3,
							}}
						>
							Detect query engine from SQL syntax
						</p>
					</div>

					{/* Examples Button */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Examples Button</label>
						<select
							value={showExamplesButton ? "on" : "off"}
							onChange={(e) => setShowExamplesButton(e.target.value === "on")}
							style={selectStyle}
						>
							<option value="on">Show (tab bar)</option>
							<option value="off">Hide</option>
						</select>
					</div>

					{/* Preview - Compact */}
					<div style={{ marginTop: 8 }}>
						<label style={labelStyle}>Preview</label>
						<div
							style={{
								padding: 8,
								background: "var(--bg-primary)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontFamily,
								fontSize: Math.min(fontSize, 14),
								color: "var(--text-primary)",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							SELECT * FROM users;
						</div>
					</div>
				</div>

				{/* Right Column - Results Grid Settings */}
				<div
					style={{
						padding: 14,
						background: "var(--bg-secondary)",
						border: "1px solid var(--border)",
						borderRadius: 8,
					}}
				>
					<h3
						style={{
							marginTop: 0,
							marginBottom: 12,
							color: "var(--text-primary)",
							fontSize: 13,
							fontWeight: 600,
						}}
					>
						Results Grid Settings
					</h3>

					{/* Grid Font Size */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Grid Font Size: {gridFontSize}px</label>
						<input
							type="range"
							min="10"
							max="18"
							value={gridFontSize}
							onChange={(e) =>
								onGridFontSizeChange(parseInt(e.target.value, 10))
							}
							style={{ width: "100%" }}
						/>
					</div>

					{/* Grid Row Height */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>Row Height: {gridRowHeight}px</label>
						<input
							type="range"
							min="24"
							max="48"
							value={gridRowHeight}
							onChange={(e) =>
								onGridRowHeightChange(parseInt(e.target.value, 10))
							}
							style={{ width: "100%" }}
						/>
					</div>

					{/* Page Size */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>
							Page Size: {pageSize.toLocaleString()} rows
						</label>
						<input
							type="range"
							min="25"
							max="500"
							step="25"
							value={pageSize}
							onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
							style={{ width: "100%" }}
						/>
					</div>

					{/* Cache Threshold */}
					<div style={controlGroupStyle}>
						<label style={labelStyle}>
							Cache Threshold: {cacheThreshold.toLocaleString()} rows
						</label>
						<input
							type="range"
							min="1000"
							max="50000"
							step="1000"
							value={cacheThreshold}
							onChange={(e) =>
								onCacheThresholdChange(parseInt(e.target.value, 10))
							}
							style={{ width: "100%" }}
						/>
						<p
							style={{
								fontSize: 10,
								color: "var(--text-muted)",
								marginTop: 4,
								marginBottom: 0,
								lineHeight: 1.3,
							}}
						>
							Datasets under this size will be cached for instant sorting.
						</p>
					</div>

					{/* Grid Preview - Compact */}
					<div style={{ marginTop: 8 }}>
						<label style={labelStyle}>Preview</label>
						<div
							style={{
								background: "var(--bg-primary)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								overflow: "hidden",
							}}
						>
							<table style={{ width: "100%", borderCollapse: "collapse" }}>
								<thead>
									<tr style={{ background: "var(--bg-secondary)" }}>
										<th
											style={{
												padding: "4px 8px",
												textAlign: "left",
												fontSize: Math.min(gridFontSize, 12),
												color: "var(--text-muted)",
												fontWeight: 500,
											}}
										>
											Name
										</th>
										<th
											style={{
												padding: "4px 8px",
												textAlign: "left",
												fontSize: Math.min(gridFontSize, 12),
												color: "var(--text-muted)",
												fontWeight: 500,
											}}
										>
											Value
										</th>
									</tr>
								</thead>
								<tbody>
									<tr style={{ borderTop: "1px solid var(--border)" }}>
										<td
											style={{
												padding: `${Math.min(gridRowHeight / 6, 6)}px 8px`,
												fontSize: Math.min(gridFontSize, 12),
												color: "var(--text-primary)",
											}}
										>
											Row 1
										</td>
										<td
											style={{
												padding: `${Math.min(gridRowHeight / 6, 6)}px 8px`,
												fontSize: Math.min(gridFontSize, 12),
												color: "var(--text-primary)",
											}}
										>
											Data
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>

				{/* Data Explorer Settings - Full Width */}
				<div
					style={{
						padding: 14,
						background: "var(--bg-secondary)",
						border: "1px solid var(--border)",
						borderRadius: 8,
						gridColumn: "1 / -1",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<h3
							style={{
								margin: 0,
								color: "var(--text-primary)",
								fontSize: 13,
								fontWeight: 600,
								whiteSpace: "nowrap",
							}}
						>
							Data Explorer
						</h3>
						<div style={{ flex: 1, maxWidth: 250 }}>
							<label style={{ ...labelStyle, marginBottom: 2 }}>
								Sort Files By
							</label>
							<select
								value={explorerSortOrder}
								onChange={(e) =>
									onExplorerSortOrderChange(
										e.target.value as "none" | "name" | "type" | "size",
									)
								}
								style={selectStyle}
							>
								<option value="none">None (insertion order)</option>
								<option value="name">Alphabetical by name</option>
								<option value="type">Group by type</option>
								<option value="size">By size (largest first)</option>
							</select>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
