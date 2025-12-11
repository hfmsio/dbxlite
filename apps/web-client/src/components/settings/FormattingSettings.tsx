import type React from "react";
import { useEffect, useState } from "react";
import {
	type FormatterSettings as FormatterSettingsType,
	type TypeAlignmentSettings,
	formatterSettings,
} from "../../services/formatter-settings";

interface FormattingSettingsProps {
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

// Shared styles for compact layout
const labelStyle: React.CSSProperties = {
	display: "block",
	marginBottom: 3,
	fontWeight: 500,
	color: "var(--text-secondary)",
	fontSize: 11,
};

const selectStyle: React.CSSProperties = {
	width: "100%",
	padding: "5px 6px",
	background: "var(--bg-primary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	color: "var(--text-primary)",
	fontSize: 11,
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "5px 6px",
	background: "var(--bg-primary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	color: "var(--text-primary)",
	fontSize: 11,
};

const sectionStyle: React.CSSProperties = {
	background: "var(--bg-secondary)",
	padding: "12px 14px",
	borderRadius: 8,
	border: "1px solid var(--border)",
};

const sectionTitleStyle: React.CSSProperties = {
	fontSize: 12,
	fontWeight: 600,
	marginBottom: 10,
	color: "var(--text-primary)",
};

export default function FormattingSettings({
	showToast,
}: FormattingSettingsProps) {
	const [formatSettings, setFormatSettings] = useState<FormatterSettingsType>(
		formatterSettings.getSettings(),
	);

	useEffect(() => {
		const unsubscribe = formatterSettings.subscribe(setFormatSettings);
		return unsubscribe;
	}, []);

	return (
		<div style={{ padding: "8px 0" }}>
			{/* Two-column layout for main sections */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "12px",
				}}
			>
				{/* Left Column: Date/Time + Numbers */}
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{/* Date & Time Formats */}
					<div style={sectionStyle}>
						<h4 style={sectionTitleStyle}>Date & Time</h4>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 8,
							}}
						>
							<div>
								<label style={labelStyle}>Date Format</label>
								<select
									value={formatSettings.dateFormat}
									onChange={(e) =>
										formatterSettings.updateSettings({
											dateFormat: e.target
												.value as FormatterSettingsType["dateFormat"],
										})
									}
									style={selectStyle}
								>
									<option value="iso">ISO (2021-05-17)</option>
									<option value="short">Short (5/17/21)</option>
									<option value="medium">Medium (May 17, 2021)</option>
									<option value="long">Long (May 17, 2021)</option>
									<option value="full">Full (Monday, May 17)</option>
								</select>
							</div>
							<div>
								<label style={labelStyle}>Time Format</label>
								<select
									value={formatSettings.timeFormat}
									onChange={(e) =>
										formatterSettings.updateSettings({
											timeFormat: e.target
												.value as FormatterSettingsType["timeFormat"],
										})
									}
									style={selectStyle}
								>
									<option value="24h">24-hour (14:30)</option>
									<option value="12h">12-hour (2:30 PM)</option>
								</select>
							</div>
							<div>
								<label style={labelStyle}>Timestamp Precision</label>
								<select
									value={formatSettings.timestampPrecision}
									onChange={(e) =>
										formatterSettings.updateSettings({
											timestampPrecision: e.target
												.value as FormatterSettingsType["timestampPrecision"],
										})
									}
									style={selectStyle}
								>
									<option value="seconds">Seconds</option>
									<option value="milliseconds">Milliseconds</option>
									<option value="microseconds">Microseconds</option>
									<option value="nanoseconds">Nanoseconds</option>
								</select>
							</div>
							<div>
								<label style={labelStyle}>Copy Delimiter</label>
								<select
									value={formatSettings.copyDelimiter}
									onChange={(e) =>
										formatterSettings.updateSettings({
											copyDelimiter: e.target
												.value as FormatterSettingsType["copyDelimiter"],
										})
									}
									style={selectStyle}
								>
									<option value="tab">Tab</option>
									<option value="comma">Comma</option>
									<option value="pipe">Pipe</option>
									<option value="space">Space</option>
								</select>
							</div>
						</div>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 11,
								fontWeight: 500,
								color: "var(--text-secondary)",
								cursor: "pointer",
								marginTop: 8,
							}}
						>
							<input
								type="checkbox"
								checked={formatSettings.copyWithHeaders}
								onChange={(e) =>
									formatterSettings.updateSettings({
										copyWithHeaders: e.target.checked,
									})
								}
								style={{ cursor: "pointer", width: 14, height: 14 }}
							/>
							Include headers when copying
						</label>
					</div>

					{/* Numbers + Boolean/Null */}
					<div style={sectionStyle}>
						<h4 style={sectionTitleStyle}>Numbers & Values</h4>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 8,
							}}
						>
							<div>
								<label style={labelStyle}>Decimal Places</label>
								<input
									type="number"
									min="0"
									max="10"
									value={formatSettings.decimalPlaces}
									onChange={(e) =>
										formatterSettings.updateSettings({
											decimalPlaces: parseInt(e.target.value, 10) || 2,
										})
									}
									style={inputStyle}
								/>
							</div>
							<div>
								<label style={labelStyle}>Boolean Display</label>
								<select
									value={formatSettings.booleanDisplay}
									onChange={(e) =>
										formatterSettings.updateSettings({
											booleanDisplay: e.target
												.value as FormatterSettingsType["booleanDisplay"],
										})
									}
									style={selectStyle}
								>
									<option value="text">Text (true/false)</option>
									<option value="icon">Icon (✓/✗)</option>
									<option value="numeric">Numeric (1/0)</option>
								</select>
							</div>
							<div>
								<label style={labelStyle}>Null Display</label>
								<input
									type="text"
									value={formatSettings.nullDisplay}
									onChange={(e) =>
										formatterSettings.updateSettings({
											nullDisplay: e.target.value,
										})
									}
									style={inputStyle}
								/>
							</div>
							<div>
								<label style={labelStyle}>Max User LIMIT</label>
								<input
									type="number"
									min="100"
									max="1000000"
									value={formatSettings.maxUserLimitRows}
									onChange={(e) => {
										const value = parseInt(e.target.value, 10) || 10000;
										const clamped = Math.max(100, Math.min(1000000, value));
										formatterSettings.updateSettings({
											maxUserLimitRows: clamped,
										});
									}}
									style={inputStyle}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Right Column: Alignment */}
				<div style={sectionStyle}>
					<h4 style={sectionTitleStyle}>Column Alignment by Type</h4>
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
					>
						{Object.entries(formatSettings.alignment).map(
							([typeCategory, alignment]) => (
								<div key={typeCategory}>
									<label style={{ ...labelStyle, textTransform: "capitalize" }}>
										{typeCategory}
									</label>
									<select
										value={alignment}
										onChange={(e) =>
											formatterSettings.updateAlignment(
												typeCategory as keyof TypeAlignmentSettings,
												e.target.value as TypeAlignmentSettings[keyof TypeAlignmentSettings],
											)
										}
										style={selectStyle}
									>
										<option value="left">Left</option>
										<option value="center">Center</option>
										<option value="right">Right</option>
									</select>
								</div>
							),
						)}
					</div>
				</div>
			</div>

			{/* Reset Button */}
			<div
				style={{
					marginTop: 12,
					display: "flex",
					justifyContent: "flex-end",
				}}
			>
				<button
					onClick={() => {
						formatterSettings.resetToDefaults();
						showToast?.("Reset to defaults", "success");
					}}
					style={{
						padding: "6px 14px",
						background: "var(--bg-tertiary)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						color: "var(--text-secondary)",
						fontSize: 11,
						cursor: "pointer",
						fontWeight: 500,
						transition: "all 0.2s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-primary)";
						e.currentTarget.style.color = "var(--text-primary)";
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "var(--bg-tertiary)";
						e.currentTarget.style.color = "var(--text-secondary)";
					}}
				>
					Reset to Defaults
				</button>
			</div>
		</div>
	);
}
