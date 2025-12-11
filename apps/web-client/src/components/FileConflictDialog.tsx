/**
 * FileConflictDialog - Dialog shown when a file was modified externally during editing
 */

import { useEffect } from "react";
import type { FileConflictInfo } from "../hooks/useAutoSave";

interface FileConflictDialogProps {
	conflict: FileConflictInfo | null;
	onOverwrite: () => void;
	onReload: () => void;
	onSaveAs: () => void;
	onCancel: () => void;
}

export function FileConflictDialog({
	conflict,
	onOverwrite,
	onReload,
	onSaveAs,
	onCancel,
}: FileConflictDialogProps) {
	// Handle Escape key to cancel
	useEffect(() => {
		if (!conflict) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [conflict, onCancel]);

	if (!conflict) return null;

	const formatTime = (timestamp: number) => {
		return new Date(timestamp).toLocaleTimeString();
	};

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10000,
				backdropFilter: "blur(2px)",
			}}
			onClick={onCancel}
		>
			<div
				style={{
					background: "var(--bg-secondary)",
					borderRadius: "12px",
					padding: "24px",
					maxWidth: "520px",
					width: "90%",
					border: "1px solid var(--border-light)",
					boxShadow:
						"0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
					{/* Icon */}
					<div
						style={{
							width: "48px",
							height: "48px",
							borderRadius: "12px",
							background: "rgba(251, 191, 36, 0.15)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "24px",
							flexShrink: 0,
						}}
					>
						⚠️
					</div>

					{/* Content */}
					<div style={{ flex: 1 }}>
						<h3
							style={{
								margin: "0 0 8px 0",
								color: "var(--text-primary)",
								fontSize: "18px",
								fontWeight: 600,
							}}
						>
							File Modified Externally
						</h3>
						<p
							style={{
								margin: "0 0 12px 0",
								color: "var(--text-secondary)",
								fontSize: "14px",
								lineHeight: "1.5",
							}}
						>
							<strong>{conflict.filePath}</strong> was modified by another
							application or browser window.
						</p>
						<div
							style={{
								background: "var(--bg-tertiary)",
								borderRadius: "8px",
								padding: "12px",
								fontSize: "13px",
								color: "var(--text-secondary)",
							}}
						>
							<div>
								Your version: {formatTime(conflict.ourTimestamp)}
							</div>
							<div>
								Disk version: {formatTime(conflict.diskTimestamp)}
							</div>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div
					style={{
						display: "flex",
						gap: "12px",
						marginTop: "24px",
						justifyContent: "flex-end",
						flexWrap: "wrap",
					}}
				>
					<button
						onClick={onCancel}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							padding: "10px 16px",
							borderRadius: "8px",
							fontSize: "14px",
							fontWeight: 500,
							cursor: "pointer",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--border-light)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--bg-tertiary)";
						}}
						title="Keep editing (Esc)"
					>
						Cancel
					</button>
					<button
						onClick={() => {
							onReload();
							onCancel();
						}}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							padding: "10px 16px",
							borderRadius: "8px",
							fontSize: "14px",
							fontWeight: 500,
							cursor: "pointer",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--border-light)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--bg-tertiary)";
						}}
						title="Discard your changes and load the file from disk"
					>
						Reload from Disk
					</button>
					<button
						onClick={() => {
							onSaveAs();
							onCancel();
						}}
						style={{
							background: "#3b82f6",
							color: "white",
							border: "none",
							padding: "10px 16px",
							borderRadius: "8px",
							fontSize: "14px",
							fontWeight: 500,
							cursor: "pointer",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#2563eb";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "#3b82f6";
						}}
						title="Save your changes to a new file"
					>
						Save As...
					</button>
					<button
						onClick={() => {
							onOverwrite();
							onCancel();
						}}
						style={{
							background: "#f59e0b",
							color: "white",
							border: "none",
							padding: "10px 16px",
							borderRadius: "8px",
							fontSize: "14px",
							fontWeight: 500,
							cursor: "pointer",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#d97706";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "#f59e0b";
						}}
						title="Overwrite the disk version with your changes"
					>
						Overwrite
					</button>
				</div>
			</div>
		</div>
	);
}
