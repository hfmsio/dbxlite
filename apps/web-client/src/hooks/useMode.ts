/**
 * useMode hook - Provides mode awareness throughout the application.
 *
 * Returns the current execution mode (WASM or HTTP) and associated feature flags.
 * Use this hook in components that need to adapt behavior based on mode.
 */

import { useMemo, useState, useEffect } from "react";
import {
	type DbxliteMode,
	getModeFeatures,
	isHttpModeAvailable,
} from "@ide/connectors";
import { queryService } from "../services/streaming-query-service";

export interface ModeInfo {
	/** Current execution mode */
	mode: DbxliteMode;
	/** Display label for the mode */
	label: string;
	/** Whether running in HTTP mode (connected to DuckDB server) */
	isHttpMode: boolean;
	/** Whether running in WASM mode (browser-based) */
	isWasmMode: boolean;
	/** Feature flags for current mode */
	features: {
		/** Can use File System Access API for zero-copy file access */
		supportsFileHandles: boolean;
		/** Can use browser BigQuery connector */
		supportsBigQuery: boolean;
		/** Has access to all native DuckDB extensions */
		supportsAllExtensions: boolean;
		/** Has direct filesystem access */
		supportsFilesystem: boolean;
		/** Is WASM-based (browser) instance */
		isWasmBased: boolean;
	};
	/** Whether a DuckDB server is available (for mode switching) */
	serverAvailable: boolean | null;
	/** Check if server is available */
	checkServerAvailability: () => Promise<boolean>;
}

/**
 * Hook to get current execution mode and features.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { mode, isHttpMode, features } = useMode();
 *
 *   if (!features.supportsBigQuery) {
 *     return <div>BigQuery not available in {mode} mode</div>;
 *   }
 *
 *   return <BigQueryExplorer />;
 * }
 * ```
 */
export function useMode(): ModeInfo {
	const mode = queryService.getMode();
	const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

	const features = useMemo(() => getModeFeatures(mode), [mode]);

	const isHttpMode = mode === "http";
	const isWasmMode = mode === "wasm";
	const label = isHttpMode ? "Server" : "WASM";

	// Check server availability on mount (only in WASM mode)
	useEffect(() => {
		if (isWasmMode) {
			isHttpModeAvailable().then(setServerAvailable);
		} else {
			setServerAvailable(true); // Already in HTTP mode, server is available
		}
	}, [isWasmMode]);

	const checkServerAvailability = async (): Promise<boolean> => {
		const available = await isHttpModeAvailable();
		setServerAvailable(available);
		return available;
	};

	return {
		mode,
		label,
		isHttpMode,
		isWasmMode,
		features,
		serverAvailable,
		checkServerAvailability,
	};
}

/**
 * Get mode-specific tooltip content for the mode badge.
 */
export function getModeTooltip(mode: DbxliteMode): string {
	if (mode === "http") {
		return `Server Mode
Connected to local DuckDB server (port 4213)

Capabilities:
- Full native DuckDB engine
- All extensions available
- Direct filesystem access
- No memory limits

Use native BigQuery extension for cloud data.`;
	}

	return `WASM Mode
Running DuckDB in browser via WebAssembly

Capabilities:
- Zero-copy file handles (Chrome)
- BigQuery browser connector
- Works offline

Limitations:
- ~2-4GB memory limit
- Limited extensions
- No filesystem access`;
}

/**
 * Get URL to switch modes.
 */
export function getModeSwitchUrl(targetMode: DbxliteMode): string {
	if (targetMode === "http") {
		// Switch to HTTP mode - go to port 4213
		return "http://localhost:4213";
	}
	// Switch to WASM mode - add mode=wasm param or go to hosted version
	const url = new URL(window.location.href);
	url.searchParams.set("mode", "wasm");
	return url.toString();
}
