import { useEffect } from "react";

interface KeyboardShortcutsOptions {
	onNewTab: () => void;
	onCloseTab: () => void;
	onSave: () => void;
	onOpen: () => void;
	onToggleExplorer: () => void;
	onNextTab?: () => void;
	onPrevTab?: () => void;
	onRotateTheme?: () => void;
	canCloseTab: boolean;
}

export function useKeyboardShortcuts({
	onNewTab,
	onCloseTab,
	onSave,
	onOpen,
	onToggleExplorer,
	onNextTab,
	onPrevTab,
	onRotateTheme,
	canCloseTab,
}: KeyboardShortcutsOptions) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
			const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

			// Cmd/Ctrl+S: Save
			if (cmdOrCtrl && e.key === "s") {
				e.preventDefault();
				onSave();
			}

			// Cmd/Ctrl+O: Open
			if (cmdOrCtrl && e.key === "o") {
				e.preventDefault();
				onOpen();
			}

			// Cmd/Ctrl+Shift+E: Toggle Explorer (Cmd+E conflicts with browser search)
			if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "e") {
				e.preventDefault();
				onToggleExplorer();
			}

			// Cmd/Ctrl+Alt+T: New tab (Cmd+T and Cmd+Shift+N conflict with browser)
			if (cmdOrCtrl && e.altKey && e.code === "KeyT") {
				e.preventDefault();
				onNewTab();
			}

			// Cmd/Ctrl+Alt+W: Close tab (Cmd+W and Cmd+Shift+W conflict with browser)
			if (cmdOrCtrl && e.altKey && e.code === "KeyW" && canCloseTab) {
				e.preventDefault();
				onCloseTab();
			}

			// Option+] (Alt+]): Next tab - use e.code for physical key (Option produces special chars)
			if (e.altKey && !cmdOrCtrl && !e.shiftKey && e.code === "BracketRight" && onNextTab) {
				e.preventDefault();
				onNextTab();
			}

			// Option+[ (Alt+[): Previous tab
			if (e.altKey && !cmdOrCtrl && !e.shiftKey && e.code === "BracketLeft" && onPrevTab) {
				e.preventDefault();
				onPrevTab();
			}

			// Cmd/Ctrl+Shift+K: Rotate theme
			if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "k" && onRotateTheme) {
				e.preventDefault();
				onRotateTheme();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onNewTab, onCloseTab, onSave, onOpen, onToggleExplorer, onNextTab, onPrevTab, onRotateTheme, canCloseTab]);
}
