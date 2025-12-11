import { ExportCompletionStatus } from "./exportUtils";

export interface ExportOverlayProps {
	exportComplete: ExportCompletionStatus;
	onDismiss: () => void;
}

/**
 * Overlay displayed after export completes (success, cancelled, or error)
 */
export function ExportOverlay({
	exportComplete,
	onDismiss,
}: ExportOverlayProps) {
	return (
		<div
			onClick={onDismiss}
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "var(--overlay-bg)",
				backdropFilter: "blur(4px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
				cursor: "pointer",
				animation: "fadeIn 0.2s ease-in",
			}}
		>
			<div
				style={{
					padding: "32px",
					borderRadius: "12px",
					backgroundColor: "var(--bg-secondary)",
					border: `2px solid ${exportComplete.status === "success" ? "var(--success)" : exportComplete.status === "cancelled" ? "var(--warning)" : "var(--danger)"}`,
					boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
					maxWidth: "500px",
					textAlign: "center",
				}}
			>
				<div
					style={{
						fontSize: "48px",
						marginBottom: "16px",
					}}
				>
					{exportComplete.status === "success"
						? "✓"
						: exportComplete.status === "cancelled"
							? "⊘"
							: "✗"}
				</div>
				<h3
					style={{
						margin: 0,
						marginBottom: "8px",
						fontSize: "18px",
						fontWeight: 600,
						color:
							exportComplete.status === "success"
								? "var(--success)"
								: exportComplete.status === "cancelled"
									? "var(--warning)"
									: "var(--danger)",
					}}
				>
					{exportComplete.status === "success"
						? "Export Complete"
						: exportComplete.status === "cancelled"
							? "Export Cancelled"
							: "Export Failed"}
				</h3>
				{exportComplete.status === "success" ? (
					<>
						<p
							style={{
								margin: 0,
								marginBottom: "4px",
								fontSize: "14px",
								color: "var(--text-primary)",
							}}
						>
							<strong>{exportComplete.rowCount.toLocaleString()}</strong> rows
							exported to
						</p>
						<p
							style={{
								margin: 0,
								marginBottom: "16px",
								fontSize: "13px",
								color: "var(--text-secondary)",
								fontFamily: "monospace",
								wordBreak: "break-all",
							}}
						>
							{exportComplete.fileName}
						</p>
					</>
				) : exportComplete.status === "cancelled" ? (
					<p
						style={{
							margin: 0,
							marginBottom: "16px",
							fontSize: "14px",
							color: "var(--text-primary)",
						}}
					>
						Export was cancelled by user
					</p>
				) : (
					<>
						<p
							style={{
								margin: 0,
								marginBottom: "8px",
								fontSize: "14px",
								color: "var(--text-primary)",
							}}
						>
							An error occurred during export
						</p>
						{exportComplete.errorMessage && (
							<p
								style={{
									margin: 0,
									marginBottom: "16px",
									fontSize: "12px",
									color: "var(--danger)",
									fontFamily: "monospace",
									wordBreak: "break-word",
									backgroundColor: "rgba(239, 68, 68, 0.1)",
									padding: "8px",
									borderRadius: "4px",
								}}
							>
								{exportComplete.errorMessage}
							</p>
						)}
					</>
				)}
				<p
					style={{
						margin: 0,
						fontSize: "11px",
						color: "var(--text-muted)",
						fontStyle: "italic",
					}}
				>
					Click anywhere, move cursor, or press any key to continue
				</p>
			</div>
		</div>
	);
}
