/**
 * ContextMenu - Right-click context menu component
 */

import { useEffect, useRef } from "react";

export interface ContextMenuItem {
	label: string;
	action: string;
	icon?: string;
	disabled?: boolean;
	separator?: boolean;
}

interface ContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onAction: (action: string) => void;
	onClose: () => void;
}

export function ContextMenu({
	x,
	y,
	items,
	onAction,
	onClose,
}: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	// Adjust position to keep menu within viewport
	useEffect(() => {
		if (menuRef.current) {
			const menu = menuRef.current;
			const rect = menu.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let adjustedX = x;
			let adjustedY = y;

			if (rect.right > viewportWidth) {
				adjustedX = viewportWidth - rect.width - 10;
			}

			if (rect.bottom > viewportHeight) {
				adjustedY = viewportHeight - rect.height - 10;
			}

			menu.style.left = `${Math.max(0, adjustedX)}px`;
			menu.style.top = `${Math.max(0, adjustedY)}px`;
		}
	}, [x, y]);

	const handleItemClick = (action: string, disabled?: boolean) => {
		if (disabled) return;
		onAction(action);
	};

	return (
		<div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
			{items.map((item, index) =>
				item.separator ? (
					<div key={index} className="context-menu-separator" />
				) : (
					<div
						key={index}
						className={`context-menu-item ${item.disabled ? "disabled" : ""}`}
						onClick={() => handleItemClick(item.action, item.disabled)}
					>
						{item.icon && (
							<span className="context-menu-icon">{item.icon}</span>
						)}
						<span className="context-menu-label">{item.label}</span>
					</div>
				),
			)}
		</div>
	);
}
