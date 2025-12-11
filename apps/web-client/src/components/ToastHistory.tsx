import React from "react";
import {
	AlertCircleIcon,
	AlertTriangleIcon,
	CheckIcon,
	HistoryIcon,
	InfoIcon,
	XIcon,
} from "./Icons";
import type { ToastHistoryEntry, ToastType } from "./Toast";

interface ToastHistoryProps {
	history: ToastHistoryEntry[];
	onClose: () => void;
	onClear: () => void;
}

export function ToastHistory({ history, onClose, onClear }: ToastHistoryProps) {
	const panelRef = React.useRef<HTMLDivElement>(null);

	// Close on click outside
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				panelRef.current &&
				!panelRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		// Add event listener with a small delay to avoid closing immediately on open
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	const getIcon = (type: ToastType) => {
		const iconProps = { size: 14, color: "currentColor" };
		switch (type) {
			case "success":
				return <CheckIcon {...iconProps} />;
			case "error":
				return <AlertCircleIcon {...iconProps} />;
			case "warning":
				return <AlertTriangleIcon {...iconProps} />;
			case "info":
				return <InfoIcon {...iconProps} />;
		}
	};

	const getColors = (type: ToastType) => {
		switch (type) {
			case "success":
				return { bg: "#10b981", text: "#d1fae5" };
			case "error":
				return { bg: "#ef4444", text: "#fee2e2" };
			case "warning":
				return { bg: "#f59e0b", text: "#fef3c7" };
			case "info":
				return { bg: "#3b82f6", text: "#dbeafe" };
		}
	};

	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	};

	return (
		<div
			ref={panelRef}
			style={{
				position: "fixed",
				top: 0,
				right: 0,
				bottom: 0,
				width: "450px",
				background: "var(--bg-primary)",
				borderLeft: "1px solid var(--border-light)",
				boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.15)",
				zIndex: 10000,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "16px 20px",
					borderBottom: "1px solid var(--border-light)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background: "var(--bg-secondary)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
					<HistoryIcon size={20} />
					<h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
						Message History
					</h3>
					<span
						style={{
							fontSize: "12px",
							color: "var(--text-muted)",
							background: "var(--bg-tertiary)",
							padding: "2px 8px",
							borderRadius: "10px",
						}}
					>
						{history.length} {history.length === 1 ? "message" : "messages"}
					</span>
				</div>
				<div style={{ display: "flex", gap: "8px" }}>
					{history.length > 0 && (
						<button
							onClick={onClear}
							style={{
								background: "var(--bg-tertiary)",
								border: "1px solid var(--border-light)",
								color: "var(--text-muted)",
								padding: "6px 12px",
								borderRadius: "6px",
								fontSize: "13px",
								cursor: "pointer",
								transition: "all 0.2s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "var(--bg-quaternary)";
								e.currentTarget.style.color = "var(--text-primary)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "var(--bg-tertiary)";
								e.currentTarget.style.color = "var(--text-muted)";
							}}
						>
							Clear All
						</button>
					)}
					<button
						onClick={onClose}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							padding: "6px",
							width: "32px",
							height: "32px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: "6px",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--bg-tertiary)";
							e.currentTarget.style.color = "var(--text-primary)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
							e.currentTarget.style.color = "var(--text-muted)";
						}}
					>
						<XIcon size={18} />
					</button>
				</div>
			</div>

			{/* Message List */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "12px",
				}}
			>
				{history.length === 0 ? (
					<div
						style={{
							textAlign: "center",
							padding: "60px 20px",
							color: "var(--text-muted)",
						}}
					>
						<div
							style={{
								marginBottom: "16px",
								opacity: 0.3,
								display: "flex",
								justifyContent: "center",
							}}
						>
							<HistoryIcon size={64} />
						</div>
						<div style={{ fontSize: "14px" }}>No messages yet</div>
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{[...history].reverse().map((entry) => {
							const colors = getColors(entry.type);
							return (
								<div
									key={entry.id}
									style={{
										background: entry.dismissed
											? "var(--bg-secondary)"
											: "var(--bg-tertiary)",
										borderTop: `1px solid ${entry.dismissed ? "var(--border-light)" : colors.bg}`,
										borderRight: `1px solid ${entry.dismissed ? "var(--border-light)" : colors.bg}`,
										borderBottom: `1px solid ${entry.dismissed ? "var(--border-light)" : colors.bg}`,
										borderLeft: `4px solid ${colors.bg}`,
										borderRadius: "6px",
										padding: "12px",
										opacity: entry.dismissed ? 0.6 : 1,
										transition: "all 0.2s",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "flex-start",
											gap: "10px",
										}}
									>
										<div
											style={{
												width: "24px",
												height: "24px",
												borderRadius: "50%",
												background: colors.bg,
												color: colors.text,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0,
												marginTop: "2px",
											}}
										>
											{getIcon(entry.type)}
										</div>
										<div style={{ flex: 1 }}>
											<div
												style={{
													fontSize: "13px",
													lineHeight: "1.5",
													color: "var(--text-primary)",
													marginBottom: "6px",
													wordBreak: "break-word",
												}}
											>
												{entry.message}
											</div>
											<div
												style={{
													fontSize: "11px",
													color: "var(--text-muted)",
													fontFamily: "monospace",
												}}
											>
												{formatTime(entry.timestamp)}
												{entry.dismissed && (
													<span style={{ marginLeft: "8px", opacity: 0.7 }}>
														• dismissed
													</span>
												)}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
