import { useCallback, useEffect, useState } from "react";
import {
	type ConnectorType,
	queryService,
} from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("Connector");

interface UseConnectorOptions {
	showToast: (
		msg: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

interface UseConnectorReturn {
	activeConnector: ConnectorType;
	isBigQueryConnected: boolean;
	isSnowflakeConnected: boolean;
	handleConnectorChange: (type: ConnectorType) => void;
	/**
	 * Programmatically switch connector. Returns true if switch was successful.
	 * Used by engine detection to auto-switch or switch after user confirmation.
	 */
	switchConnector: (type: ConnectorType) => boolean;
	/**
	 * Check if a connector is available for switching
	 */
	isConnectorAvailable: (type: ConnectorType) => boolean;
}

/**
 * Hook for managing connector state (DuckDB vs BigQuery)
 * Handles persistence to localStorage and BigQuery status checking
 */
export function useConnector({
	showToast,
}: UseConnectorOptions): UseConnectorReturn {
	const [activeConnector, setActiveConnector] =
		useState<ConnectorType>("duckdb");
	const [isBigQueryConnected, setIsBigQueryConnected] = useState(false);
	const [isSnowflakeConnected, setIsSnowflakeConnected] = useState(false);

	// Load connector from localStorage on mount
	useEffect(() => {
		try {
			const savedConnector = localStorage.getItem("dbxlite-connector");
			if (
				savedConnector === "duckdb" ||
				savedConnector === "bigquery" ||
				savedConnector === "snowflake"
			) {
				setActiveConnector(savedConnector);
			}
		} catch (err) {
			logger.error("Failed to load connector from localStorage", err);
		}
	}, []);

	// Save active connector to localStorage
	useEffect(() => {
		try {
			localStorage.setItem("dbxlite-connector", activeConnector);
		} catch (err) {
			logger.error("Failed to save connector", err);
		}
	}, [activeConnector]);

	// Check connection status periodically
	useEffect(() => {
		const check = () => {
			setIsBigQueryConnected(queryService.isBigQueryConnected());
			// Snowflake is optional on queryService until Phase 2 wires it.
			const sfCheck = (
				queryService as unknown as {
					isSnowflakeConnected?: () => boolean;
				}
			).isSnowflakeConnected;
			setIsSnowflakeConnected(typeof sfCheck === "function" ? sfCheck.call(queryService) : false);
		};

		check();

		// Check every 2 seconds
		const interval = setInterval(check, 2000);
		return () => clearInterval(interval);
	}, []);

	// Check if a connector is available for use
	const isConnectorAvailable = useCallback(
		(type: ConnectorType): boolean => {
			if (type === "duckdb") return true;
			if (type === "bigquery") return isBigQueryConnected;
			if (type === "snowflake") return isSnowflakeConnected;
			return false;
		},
		[isBigQueryConnected, isSnowflakeConnected],
	);

	// Handle connector change with validation (for UI dropdown)
	const handleConnectorChange = useCallback(
		(type: ConnectorType) => {
			if (type === "bigquery" && !isBigQueryConnected) {
				showToast(
					"BigQuery is not connected. Please configure BigQuery in Settings first.",
					"warning",
					4000,
				);
				setTimeout(() => {
					setActiveConnector(activeConnector);
				}, 0);
				return;
			}
			if (type === "snowflake" && !isSnowflakeConnected) {
				showToast(
					"Snowflake is not connected. Please configure Snowflake in Settings first.",
					"warning",
					4000,
				);
				setTimeout(() => {
					setActiveConnector(activeConnector);
				}, 0);
				return;
			}

			queryService.setActiveConnector(type);
			setActiveConnector(type);
		},
		[isBigQueryConnected, isSnowflakeConnected, activeConnector, showToast],
	);

	// Programmatic connector switch (for engine detection)
	const switchConnector = useCallback(
		(type: ConnectorType): boolean => {
			// Already on this connector
			if (type === activeConnector) return true;

			// Check availability
			if (!isConnectorAvailable(type)) {
				logger.warn(`Cannot switch to ${type}: not available`);
				return false;
			}

			// Perform the switch
			queryService.setActiveConnector(type);
			setActiveConnector(type);
			logger.info(`Switched connector to ${type}`);
			return true;
		},
		[activeConnector, isConnectorAvailable],
	);

	return {
		activeConnector,
		isBigQueryConnected,
		isSnowflakeConnected,
		handleConnectorChange,
		switchConnector,
		isConnectorAvailable,
	};
}
