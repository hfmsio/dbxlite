/**
 * useServerInfo - Fetches DuckDB server information
 *
 * Queries system functions to get extensions, secrets, settings, and variables.
 * Only active in HTTP mode - returns empty state in WASM mode.
 */

import { useCallback, useState } from "react";
import type {
	DuckDBExtension,
	DuckDBSecret,
	DuckDBSetting,
	DuckDBVariable,
	ExtensionAction,
	ServerInfo,
	ServerInfoState,
} from "../types/server-info";
import { queryService } from "../services/streaming-query-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("useServerInfo");

export function useServerInfo(isHttpMode: boolean) {
	const [state, setState] = useState<ServerInfoState>({
		data: null,
		isLoading: false,
		error: null,
		lastRefreshed: null,
	});

	const [actionInProgress, setActionInProgress] = useState<string | null>(null);

	/**
	 * Fetch all server information
	 */
	const fetchServerInfo = useCallback(async () => {
		if (!isHttpMode) {
			logger.debug("Not in HTTP mode, skipping server info fetch");
			return;
		}

		if (!queryService.isConnectorReady("duckdb")) {
			logger.debug("DuckDB connector not ready");
			return;
		}

		setState((prev) => ({ ...prev, isLoading: true, error: null }));

		try {
			// Execute queries sequentially for HTTP compatibility
			// (DuckDB HTTP doesn't handle concurrent queries well)

			// 1. Extensions (always available)
			const extensionsResult = await queryService.executeQuery(`
				SELECT
					extension_name,
					loaded,
					installed,
					install_path,
					description
				FROM duckdb_extensions()
				ORDER BY extension_name
			`);

			const extensions: DuckDBExtension[] = extensionsResult.rows.map(
				(row) => ({
					extension_name: String(row.extension_name),
					loaded: Boolean(row.loaded),
					installed: Boolean(row.installed),
					install_path: row.install_path ? String(row.install_path) : null,
					description: row.description ? String(row.description) : null,
				}),
			);

			// 2. Secrets (may fail if no secrets configured or permission denied)
			let secrets: DuckDBSecret[] = [];
			try {
				const secretsResult = await queryService.executeQuery(`
					SELECT name, type, provider, scope, persistent
					FROM duckdb_secrets()
					ORDER BY name
				`);
				secrets = secretsResult.rows.map((row) => ({
					name: String(row.name),
					type: String(row.type),
					provider: String(row.provider),
					scope: row.scope ? String(row.scope) : "",
					persistent: Boolean(row.persistent),
				}));
			} catch (e) {
				logger.debug("No secrets or secrets query failed:", e);
			}

			// 3. Settings (filtered for key ones)
			const settingsResult = await queryService.executeQuery(`
				SELECT name, value, description, input_type
				FROM duckdb_settings()
				WHERE name IN (
					'threads', 'memory_limit', 'temp_directory',
					'max_memory', 'worker_threads', 'external_threads',
					'default_order', 'enable_progress_bar', 'enable_object_cache'
				)
				ORDER BY name
			`);

			const settings: DuckDBSetting[] = settingsResult.rows.map((row) => ({
				name: String(row.name),
				value: String(row.value),
				description: row.description ? String(row.description) : null,
				inputType: row.input_type ? String(row.input_type) : null,
			}));

			// 4. Variables (may be empty)
			let variables: DuckDBVariable[] = [];
			try {
				const variablesResult = await queryService.executeQuery(`
					SELECT name, value, type
					FROM duckdb_variables()
					ORDER BY name
				`);
				variables = variablesResult.rows.map((row) => ({
					name: String(row.name),
					value: row.value,
					type: String(row.type),
				}));
			} catch (e) {
				logger.debug("No variables or variables query failed:", e);
			}

			const data: ServerInfo = {
				extensions,
				secrets,
				settings,
				variables,
			};

			setState({
				data,
				isLoading: false,
				error: null,
				lastRefreshed: new Date(),
			});

			logger.info("Server info fetched", {
				extensions: data.extensions.length,
				secrets: data.secrets.length,
				settings: data.settings.length,
				variables: data.variables.length,
			});
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("Failed to fetch server info:", err);
			setState((prev) => ({
				...prev,
				isLoading: false,
				error: errorMsg,
			}));
		}
	}, [isHttpMode]);

	/**
	 * Load or install an extension
	 */
	const performExtensionAction = useCallback(
		async (
			extensionName: string,
			action: ExtensionAction,
		): Promise<{ success: boolean; error?: string }> => {
			if (!isHttpMode) {
				return { success: false, error: "Only available in Server mode" };
			}

			setActionInProgress(`${action}:${extensionName}`);

			try {
				const sql =
					action === "load"
						? `LOAD ${extensionName}`
						: `INSTALL ${extensionName}`;

				await queryService.executeQuery(sql);

				// Refresh data after action
				await fetchServerInfo();

				return { success: true };
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logger.error(`Failed to ${action} extension ${extensionName}:`, err);
				return { success: false, error: errorMsg };
			} finally {
				setActionInProgress(null);
			}
		},
		[isHttpMode, fetchServerInfo],
	);

	/**
	 * Update a DuckDB setting
	 */
	const updateSetting = useCallback(
		async (
			settingName: string,
			value: string,
		): Promise<{ success: boolean; error?: string }> => {
			if (!isHttpMode) {
				return { success: false, error: "Only available in Server mode" };
			}

			setActionInProgress(`setting:${settingName}`);

			try {
				// Quote string values, leave numbers/booleans unquoted
				const isNumeric = /^-?\d+(\.\d+)?$/.test(value);
				const isBoolean = value === "true" || value === "false";
				const isMemoryValue = /^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i.test(value);

				const quotedValue = (isNumeric || isBoolean || isMemoryValue)
					? value
					: `'${value.replace(/'/g, "''")}'`;

				const sql = `SET ${settingName} = ${quotedValue}`;
				logger.debug("Updating setting:", sql);

				await queryService.executeQuery(sql);

				// Refresh data after update
				await fetchServerInfo();

				return { success: true };
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logger.error(`Failed to update setting ${settingName}:`, err);
				return { success: false, error: errorMsg };
			} finally {
				setActionInProgress(null);
			}
		},
		[isHttpMode, fetchServerInfo],
	);

	return {
		...state,
		actionInProgress,
		fetchServerInfo,
		performExtensionAction,
		updateSetting,
		hasContent: state.data !== null,
	};
}
