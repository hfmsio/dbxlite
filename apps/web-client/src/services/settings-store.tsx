/**
 * Settings Store (Compatibility Layer)
 *
 * This file provides backwards compatibility with the old Context-based API
 * while using Zustand under the hood. The Provider is now a no-op wrapper.
 *
 * Migration path:
 * 1. Components using useSettings() will continue to work unchanged
 * 2. New code should import directly from '../stores/settingsStore'
 * 3. Eventually, remove this file and update all imports
 */

import type { ReactNode } from "react";
import { useSettingsStore } from "../stores/settingsStore";

// Re-export types for backwards compatibility
export type { ExplorerSortOrder, SaveStrategy } from "../stores/settingsStore";

/**
 * @deprecated Use useSettingsStore from '../stores/settingsStore' instead
 * This hook is kept for backwards compatibility
 */
export function useSettings() {
	// Use Zustand store directly - no Context needed
	const store = useSettingsStore();
	return store;
}

interface SettingsProviderProps {
	children: ReactNode;
}

/**
 * @deprecated No longer needed - Zustand handles state globally
 * Kept for backwards compatibility, this is now a pass-through wrapper
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
	// No-op wrapper - Zustand handles everything
	return <>{children}</>;
}
