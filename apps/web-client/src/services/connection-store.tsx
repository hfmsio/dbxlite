/**
 * Connection Store
 *
 * React context for managing multi-source data connections (BigQuery, Snowflake, Databricks).
 * Follows the same pattern as DataSourceStore.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type {
	Connection,
	ConnectionConfig,
	ConnectionType,
} from "../types/materialization";
import { createLogger } from "../utils/logger";
import { credentialStore } from "./credential-store";
import { persistenceMetadataStore } from "./persistence-metadata-store";

const logger = createLogger("ConnectionStore");

// ==========================================================================
// Context Type
// ==========================================================================

interface ConnectionStoreType {
	/**
	 * All connections
	 */
	connections: Connection[];

	/**
	 * Active connection ID (for query execution)
	 */
	activeConnectionId: string | null;

	/**
	 * Add a new connection
	 */
	addConnection: (
		name: string,
		type: ConnectionType,
		duckdbSchema: string,
		config: ConnectionConfig,
	) => Promise<Connection>;

	/**
	 * Update a connection
	 */
	updateConnection: (id: string, updates: Partial<Connection>) => Promise<void>;

	/**
	 * Remove a connection
	 */
	removeConnection: (id: string) => Promise<void>;

	/**
	 * Set active connection
	 */
	setActiveConnection: (id: string | null) => void;

	/**
	 * Get connection by ID
	 */
	getConnection: (id: string) => Connection | undefined;

	/**
	 * Test connection
	 */
	testConnection: (id: string) => Promise<boolean>;

	/**
	 * Update connection status
	 */
	updateConnectionStatus: (
		id: string,
		status: Connection["status"],
		error?: string,
	) => Promise<void>;
}

// ==========================================================================
// Context
// ==========================================================================

const ConnectionContext = createContext<ConnectionStoreType | null>(null);

// ==========================================================================
// Provider
// ==========================================================================

export function ConnectionStoreProvider({ children }: { children: ReactNode }) {
	const [connections, setConnections] = useState<Connection[]>([]);
	const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
		null,
	);

	/**
	 * Load connections from IndexedDB
	 */
	const loadConnections = useCallback(async () => {
		try {
			await persistenceMetadataStore.initialize();
			const loaded = await persistenceMetadataStore.getAllConnections();

			setConnections(loaded);

			// Restore active connection from localStorage
			const savedActiveId = localStorage.getItem("active-connection-id");
			if (savedActiveId && loaded.some((c) => c.id === savedActiveId)) {
				setActiveConnectionId(savedActiveId);
			}

			logger.info(`Loaded ${loaded.length} connections`);
		} catch (error) {
			logger.error("Failed to load connections:", error);
		}
	}, []);

	/**
	 * Save connections to IndexedDB
	 */
	const saveConnections = useCallback(async () => {
		try {
			// Save each connection
			for (const connection of connections) {
				await persistenceMetadataStore.saveConnection(connection);
			}
		} catch (error) {
			logger.error("Failed to save connections:", error);
		}
	}, [connections]);

	// Load connections from persistence on mount
	useEffect(() => {
		loadConnections();
	}, [loadConnections]);

	// Save connections to persistence when they change
	useEffect(() => {
		if (connections.length > 0) {
			saveConnections();
		}
	}, [connections, saveConnections]);

	/**
	 * Add a new connection
	 */
	const addConnection = async (
		name: string,
		type: ConnectionType,
		duckdbSchema: string,
		config: ConnectionConfig,
	): Promise<Connection> => {
		// Generate credential key
		const credentialKey = `conn_${type}_${Date.now()}`;

		// Store credentials
		await credentialStore.set(credentialKey, config);

		// Create connection
		const connection: Connection = {
			id: generateId(),
			name,
			type,
			icon: getIconForType(type),
			color: getColorForType(type),
			duckdbSchema,
			credentialKey,
			costLimits: {
				warnThresholdUSD: 1.0,
				blockThresholdUSD: 10.0,
				maxImportSizeGB: 5,
				trackMonthlySpend: true,
			},
			status: "disconnected",
			createdAt: new Date(),
		};

		// Save to IndexedDB
		await persistenceMetadataStore.saveConnection(connection);

		// Add to state
		setConnections((prev) => [...prev, connection]);

		logger.info(`Added connection: ${name} (${type})`);

		return connection;
	};

	/**
	 * Update a connection
	 */
	const updateConnection = async (
		id: string,
		updates: Partial<Connection>,
	): Promise<void> => {
		setConnections((prev) =>
			prev.map((conn) => (conn.id === id ? { ...conn, ...updates } : conn)),
		);

		// Update in IndexedDB
		const connection = connections.find((c) => c.id === id);
		if (connection) {
			const updated = { ...connection, ...updates };
			await persistenceMetadataStore.saveConnection(updated);
		}
	};

	/**
	 * Remove a connection
	 */
	const removeConnection = async (id: string): Promise<void> => {
		const connection = connections.find((c) => c.id === id);
		if (!connection) return;

		// Remove from state
		setConnections((prev) => prev.filter((c) => c.id !== id));

		// Clear active connection if this was it
		if (activeConnectionId === id) {
			setActiveConnectionId(null);
			localStorage.removeItem("active-connection-id");
		}

		// Delete from IndexedDB (also deletes associated tables)
		await persistenceMetadataStore.deleteConnection(id);

		// Delete credentials
		await credentialStore.delete(connection.credentialKey);

		logger.info(`Removed connection: ${id}`);
	};

	/**
	 * Set active connection
	 */
	const setActiveConnection = (id: string | null) => {
		setActiveConnectionId(id);

		if (id) {
			localStorage.setItem("active-connection-id", id);

			// Update last used timestamp
			updateConnection(id, { lastUsedAt: new Date() });
		} else {
			localStorage.removeItem("active-connection-id");
		}
	};

	/**
	 * Get connection by ID
	 */
	const getConnection = (id: string): Connection | undefined => {
		return connections.find((c) => c.id === id);
	};

	/**
	 * Test connection
	 */
	const testConnection = async (id: string): Promise<boolean> => {
		const connection = connections.find((c) => c.id === id);
		if (!connection) {
			throw new Error(`Connection not found: ${id}`);
		}

		try {
			// Update status
			await updateConnectionStatus(id, "connecting");

			// TODO: Implement actual connection test based on type
			// For now, simulate success
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Update status
			await updateConnectionStatus(id, "connected");

			logger.info(`Connection test successful: ${id}`);
			return true;
		} catch (error: unknown) {
			// Update status with error
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await updateConnectionStatus(id, "error", errorMessage);

			logger.error(`Connection test failed: ${id}`, error);
			return false;
		}
	};

	/**
	 * Update connection status
	 */
	const updateConnectionStatus = async (
		id: string,
		status: Connection["status"],
		error?: string,
	): Promise<void> => {
		await updateConnection(id, {
			status,
			lastError: error,
			lastUsedAt: new Date(),
		});
	};

	// Context value
	const value: ConnectionStoreType = {
		connections,
		activeConnectionId,
		addConnection,
		updateConnection,
		removeConnection,
		setActiveConnection,
		getConnection,
		testConnection,
		updateConnectionStatus,
	};

	return (
		<ConnectionContext.Provider value={value}>
			{children}
		</ConnectionContext.Provider>
	);
}

// ==========================================================================
// Hook
// ==========================================================================

export function useConnections(): ConnectionStoreType {
	const context = useContext(ConnectionContext);

	if (!context) {
		throw new Error(
			"useConnections must be used within ConnectionStoreProvider",
		);
	}

	return context;
}

// ==========================================================================
// Utilities
// ==========================================================================

function generateId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getIconForType(type: ConnectionType): string {
	const icons: Record<ConnectionType, string> = {
		bigquery: "🔵",
		snowflake: "❄️",
		databricks: "🧱",
		postgres: "🐘",
	};
	return icons[type] || "🔌";
}

function getColorForType(type: ConnectionType): string {
	const colors: Record<ConnectionType, string> = {
		bigquery: "#4285F4", // Google Blue
		snowflake: "#29B5E8", // Snowflake Blue
		databricks: "#FF3621", // Databricks Red
		postgres: "#336791", // PostgreSQL Blue
	};
	return colors[type] || "#666666";
}
