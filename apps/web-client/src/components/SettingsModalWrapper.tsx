import { useEffect, useRef } from "react";
import SettingsModal, { type SettingsTab } from "./SettingsModal";

interface SettingsModalWrapperProps {
	isOpen: boolean;
	onClose: () => void;
	initialTab?: SettingsTab;

	// Settings values
	fontSize: number;
	fontFamily: string;
	gridFontSize: number;
	gridRowHeight: number;
	pageSize: number;
	cacheThreshold: number;
	explorerSortOrder: "none" | "name" | "type" | "size";
	saveStrategy: "auto" | "manual" | "prompt";

	// Settings handlers
	onFontSizeChange: (size: number) => void;
	onFontFamilyChange: (family: string) => void;
	onGridFontSizeChange: (size: number) => void;
	onGridRowHeightChange: (height: number) => void;
	onPageSizeChange: (size: number) => void;
	onCacheThresholdChange: (threshold: number) => void;
	onExplorerSortOrderChange: (order: "none" | "name" | "type" | "size") => void;
	onSaveStrategyChange: (strategy: "auto" | "manual" | "prompt") => void;

	// Callbacks
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onConnectionChange?: () => void;
	onClearBigQueryCache?: () => void;
	onReloadBigQueryData?: () => Promise<void>;
}

export default function SettingsModalWrapper({
	isOpen,
	onClose,
	initialTab,
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
	showToast,
	onConnectionChange,
	onClearBigQueryCache,
	onReloadBigQueryData,
}: SettingsModalWrapperProps) {
	const modalRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	// Auto-focus close button when modal opens
	useEffect(() => {
		if (isOpen) {
			setTimeout(() => {
				closeButtonRef.current?.focus();
			}, 0);
		}
	}, [isOpen]);

	// Handle ESC key and focus trap
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			} else if (e.key === "Tab" && modalRef.current) {
				// Focus trap: keep Tab within the modal
				const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				const firstElement = focusableElements[0];
				const lastElement = focusableElements[focusableElements.length - 1];

				if (e.shiftKey) {
					// Shift+Tab: if on first element, go to last
					if (document.activeElement === firstElement) {
						e.preventDefault();
						lastElement?.focus();
					}
				} else {
					// Tab: if on last element, go to first
					if (document.activeElement === lastElement) {
						e.preventDefault();
						firstElement?.focus();
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				ref={modalRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-modal-title"
				className="modal-content"
				onClick={(e) => e.stopPropagation()}
				style={{ width: "95%", maxWidth: "1100px" }}
			>
				<div className="modal-header">
					<h2 id="settings-modal-title">Settings</h2>
					<button
						ref={closeButtonRef}
						className="modal-close"
						onClick={onClose}
						aria-label="Close settings"
					>
						<span aria-hidden="true">✕</span>
					</button>
				</div>
				<div style={{ padding: "16px 24px 24px" }}>
					<SettingsModal
						fontSize={fontSize}
						fontFamily={fontFamily}
						gridFontSize={gridFontSize}
						gridRowHeight={gridRowHeight}
						pageSize={pageSize}
						cacheThreshold={cacheThreshold}
						explorerSortOrder={explorerSortOrder}
						saveStrategy={saveStrategy}
						onFontSizeChange={onFontSizeChange}
						onFontFamilyChange={onFontFamilyChange}
						onGridFontSizeChange={onGridFontSizeChange}
						onGridRowHeightChange={onGridRowHeightChange}
						onPageSizeChange={onPageSizeChange}
						onCacheThresholdChange={onCacheThresholdChange}
						onExplorerSortOrderChange={onExplorerSortOrderChange}
						onSaveStrategyChange={onSaveStrategyChange}
						showToast={showToast}
						onConnectionChange={onConnectionChange}
						onClearBigQueryCache={onClearBigQueryCache}
						onReloadBigQueryData={onReloadBigQueryData}
						initialTab={initialTab}
					/>
				</div>
			</div>
		</div>
	);
}
