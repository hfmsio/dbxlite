/**
 * ConfirmDialog - A better-looking confirmation modal
 */

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	onCancel: () => void;
	variant?: "danger" | "warning" | "info";
}

export function ConfirmDialog({
	isOpen,
	title,
	message,
	confirmText = "Confirm",
	cancelText = "Cancel",
	onConfirm,
	onCancel,
	variant = "warning",
}: ConfirmDialogProps) {
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const confirmButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

	// Store the previously focused element and auto-focus confirm button when dialog opens
	useEffect(() => {
		if (isOpen) {
			// Store the element that had focus before dialog opened
			previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
			// Small delay to ensure DOM is ready
			setTimeout(() => {
				confirmButtonRef.current?.focus();
			}, 0);
		} else {
			// Restore focus when dialog closes
			if (previouslyFocusedElementRef.current) {
				setTimeout(() => {
					previouslyFocusedElementRef.current?.focus();
					previouslyFocusedElementRef.current = null;
				}, 0);
			}
		}
	}, [isOpen]);

	// Handle Escape key, arrow keys for navigation, and Tab focus trap
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				e.preventDefault();
				// Toggle focus between cancel and confirm buttons
				if (document.activeElement === confirmButtonRef.current) {
					cancelButtonRef.current?.focus();
				} else {
					confirmButtonRef.current?.focus();
				}
			} else if (e.key === "Tab") {
				// Focus trap: keep Tab within the dialog
				e.preventDefault();
				if (e.shiftKey) {
					// Shift+Tab: go backwards
					if (document.activeElement === cancelButtonRef.current) {
						confirmButtonRef.current?.focus();
					} else {
						cancelButtonRef.current?.focus();
					}
				} else {
					// Tab: go forwards
					if (document.activeElement === confirmButtonRef.current) {
						cancelButtonRef.current?.focus();
					} else {
						confirmButtonRef.current?.focus();
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onCancel]);

	if (!isOpen) return null;

	const getVariantStyles = () => {
		switch (variant) {
			case "danger":
				return {
					iconBg: "rgba(239, 68, 68, 0.15)",
					icon: "🗑️",
					confirmBg: "#ef4444",
					confirmHoverBg: "#dc2626",
				};
			case "warning":
				return {
					iconBg: "rgba(251, 191, 36, 0.15)",
					icon: "⚠️",
					confirmBg: "#f59e0b",
					confirmHoverBg: "#d97706",
				};
			case "info":
				return {
					iconBg: "rgba(59, 130, 246, 0.15)",
					icon: "ℹ️",
					confirmBg: "#3b82f6",
					confirmHoverBg: "#2563eb",
				};
		}
	};

	const styles = getVariantStyles();

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
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="confirm-dialog-title"
				aria-describedby="confirm-dialog-description"
				style={{
					background: "var(--bg-secondary)",
					borderRadius: "12px",
					padding: "24px",
					maxWidth: "480px",
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
							background: styles.iconBg,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "24px",
							flexShrink: 0,
						}}
					>
						{styles.icon}
					</div>

					{/* Content */}
					<div style={{ flex: 1 }}>
						<h3
							id="confirm-dialog-title"
							style={{
								margin: "0 0 8px 0",
								color: "var(--text-primary)",
								fontSize: "18px",
								fontWeight: 600,
							}}
						>
							{title}
						</h3>
						<p
							id="confirm-dialog-description"
							style={{
								margin: 0,
								color: "var(--text-secondary)",
								fontSize: "14px",
								lineHeight: "1.5",
							}}
						>
							{message}
						</p>
					</div>
				</div>

				{/* Actions */}
				<div
					style={{
						display: "flex",
						gap: "12px",
						marginTop: "24px",
						justifyContent: "flex-end",
					}}
				>
					<button
						ref={cancelButtonRef}
						onClick={onCancel}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							padding: "10px 20px",
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
						title="Press Esc to cancel"
					>
						{cancelText}
					</button>
					<button
						ref={confirmButtonRef}
						onClick={() => {
							onConfirm();
							onCancel();
						}}
						style={{
							background: styles.confirmBg,
							color: "white",
							border: "none",
							padding: "10px 20px",
							borderRadius: "8px",
							fontSize: "14px",
							fontWeight: 500,
							cursor: "pointer",
							transition: "all 0.2s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = styles.confirmHoverBg;
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = styles.confirmBg;
						}}
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	);
}
