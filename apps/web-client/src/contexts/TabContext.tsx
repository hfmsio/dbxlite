import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
} from "react";
import {
	type TabState,
	type UseTabManagerReturn,
	useTabManager,
} from "../hooks/useTabManager";
import type { EditorPaneHandle } from "../components/EditorPane";
import type { PaginatedTableHandle } from "../components/table/types";
import { useToast } from "../components/Toast";

export interface TabContextType extends UseTabManagerReturn {
	// Shared refs - eliminates prop drilling
	editorRef: React.MutableRefObject<EditorPaneHandle | null>;
	gridRef: React.MutableRefObject<PaginatedTableHandle | null>;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

export function useTabContext(): TabContextType {
	const context = useContext(TabContext);
	if (!context) {
		throw new Error("useTabContext must be used within TabProvider");
	}
	return context;
}

interface TabProviderProps {
	children: ReactNode;
}

export function TabProvider({ children }: TabProviderProps) {
	const { showToast } = useToast();

	// Initialize tab manager
	const tabManager = useTabManager({ showToast });

	// Shared refs for cross-component communication
	const editorRef = useRef<EditorPaneHandle | null>(null);
	const gridRef = useRef<PaginatedTableHandle | null>(null);

	// Memoize context value to prevent unnecessary re-renders
	const contextValue = useMemo<TabContextType>(
		() => ({
			...tabManager,
			editorRef,
			gridRef,
		}),
		[tabManager],
	);

	return (
		<TabContext.Provider value={contextValue}>{children}</TabContext.Provider>
	);
}

// Re-export TabState for convenience
export type { TabState };
