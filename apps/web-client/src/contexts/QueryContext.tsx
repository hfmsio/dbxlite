import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
} from "react";
import { type ConnectorType } from "../services/streaming-query-service";
import { useConnector } from "../hooks/useConnector";
import { useToast } from "../components/Toast";

export interface QueryContextType {
	// Connector state
	activeConnector: ConnectorType;
	isBigQueryConnected: boolean;
	isSnowflakeConnected: boolean;
	handleConnectorChange: (connector: ConnectorType) => void;
	switchConnector: (connector: ConnectorType) => boolean;
	isConnectorAvailable: (connector: ConnectorType) => boolean;
}

const QueryContext = createContext<QueryContextType | undefined>(undefined);

export function useQueryContext(): QueryContextType {
	const context = useContext(QueryContext);
	if (!context) {
		throw new Error("useQueryContext must be used within QueryProvider");
	}
	return context;
}

interface QueryProviderProps {
	children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
	const { showToast } = useToast();

	// Initialize connector state
	const {
		activeConnector,
		isBigQueryConnected,
		isSnowflakeConnected,
		handleConnectorChange,
		switchConnector,
		isConnectorAvailable,
	} = useConnector({ showToast });

	// Memoize context value to prevent unnecessary re-renders
	const contextValue = useMemo<QueryContextType>(
		() => ({
			activeConnector,
			isBigQueryConnected,
			isSnowflakeConnected,
			handleConnectorChange,
			switchConnector,
			isConnectorAvailable,
		}),
		[
			activeConnector,
			isBigQueryConnected,
			isSnowflakeConnected,
			handleConnectorChange,
			switchConnector,
			isConnectorAvailable,
		],
	);

	return (
		<QueryContext.Provider value={contextValue}>
			{children}
		</QueryContext.Provider>
	);
}

// Re-export ConnectorType for convenience
export type { ConnectorType };
