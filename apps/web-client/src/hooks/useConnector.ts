import { useCallback, useEffect, useRef, useState } from "react";
import { clearProviderState } from "../services/catalog-schema-bridge";
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
	// Previous poll's connection state, so `check` can spot the
	// connected → disconnected edge. Refs, not state: the edge is derived
	// during the poll and must not itself trigger a render.
	const prevBigQueryConnected = useRef(false);
	const prevSnowflakeConnected = useRef(false);

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

	// Check connection status periodically. isSnowflakeConnected is now
	// a public typed method on StreamingQueryService — call it directly,
	// no `as unknown as { … }` escape hatch.
	useEffect(() => {
		const check = () => {
			const bq = queryService.isBigQueryConnected();
			const sf = queryService.isSnowflakeConnected();

			// A connection ending is the one event that truly invalidates the
			// catalog metadata autocomplete has cached, so evict on the
			// connected → disconnected edge. This poll is the only place that
			// sees every such ending: the settings Disconnect button, an
			// expired token, or a dropped session all land here. The catalog
			// explorer's own unmount is not a substitute — it also fires when
			// the sidebar is merely collapsed.
			if (prevBigQueryConnected.current && !bq) clearProviderState("bigquery");
			if (prevSnowflakeConnected.current && !sf)
				clearProviderState("snowflake");
			prevBigQueryConnected.current = bq;
			prevSnowflakeConnected.current = sf;

			setIsBigQueryConnected(bq);
			setIsSnowflakeConnected(sf);
		};

		check();

		// Check every 2 seconds. Will be replaced with event subscription
		// in Phase 4.2 alongside the App.tsx context-poll retirement.
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
