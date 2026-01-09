/**
 * Mode detection for dbxlite.
 *
 * Detects whether dbxlite is running:
 * - 'wasm': Standalone mode with DuckDB WASM (default)
 * - 'http': As UI for `duckdb -ui` via HTTP connector
 */
import type { BaseConnector } from './base'
import { DuckDBConnector } from './duckdb-connector'
import { DuckDBHttpConnector } from './duckdb-http-connector'

/** Default DuckDB UI server port */
const DUCKDB_UI_PORT = '4213'

/** Operating modes for dbxlite */
export type DbxliteMode = 'wasm' | 'http'

/**
 * Detect which mode dbxlite should run in.
 *
 * Detection logic:
 * 1. If running on port 4213, assume served by DuckDB's HTTP server -> 'http'
 * 2. If URL param `mode=http` is present -> 'http'
 * 3. Otherwise -> 'wasm' (standalone)
 */
export function detectMode(): DbxliteMode {
  // Server-side rendering or non-browser environment
  if (typeof window === 'undefined') {
    return 'wasm'
  }

  // Check if served from DuckDB's HTTP server (port 4213)
  if (window.location.port === DUCKDB_UI_PORT) {
    return 'http'
  }

  // Check for explicit mode override via URL parameter
  const params = new URLSearchParams(window.location.search)
  const modeParam = params.get('mode')

  if (modeParam === 'http') {
    return 'http'
  }

  // Default to WASM for standalone use
  return 'wasm'
}

/**
 * Get the appropriate connector for the detected mode.
 *
 * @param mode - Operating mode ('wasm' or 'http')
 * @param httpBaseUrl - Optional base URL for HTTP connector (defaults to auto-detect)
 * @returns Connector instance for the specified mode
 */
export function getConnectorForMode(
  mode: DbxliteMode,
  httpBaseUrl?: string
): BaseConnector {
  if (mode === 'http') {
    return new DuckDBHttpConnector(httpBaseUrl)
  }
  return new DuckDBConnector()
}

/**
 * Check if HTTP mode is available by testing the DuckDB server.
 * Useful for development when you want to test HTTP mode on a different port.
 *
 * @param baseUrl - URL to test (defaults to localhost:4213)
 * @returns True if DuckDB HTTP server is reachable
 */
export async function isHttpModeAvailable(
  baseUrl = `http://localhost:${DUCKDB_UI_PORT}`
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/info`, {
      method: 'GET',
      // Short timeout to fail fast
      signal: AbortSignal.timeout(1000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get mode-specific feature flags.
 * Some features are only available in certain modes.
 */
export function getModeFeatures(mode: DbxliteMode): {
  /** Can register local files via File System Access API */
  supportsFileHandles: boolean
  /** Can use BigQuery connector */
  supportsBigQuery: boolean
  /** Full native DuckDB with all extensions */
  supportsAllExtensions: boolean
  /** Direct filesystem access */
  supportsFilesystem: boolean
  /** Browser-only WASM instance */
  isWasmBased: boolean
} {
  if (mode === 'http') {
    return {
      supportsFileHandles: false, // CLI has its own filesystem
      supportsBigQuery: false, // Use CLI's connectors instead
      supportsAllExtensions: true, // Native DuckDB has full extension support
      supportsFilesystem: true, // CLI can access host filesystem
      isWasmBased: false,
    }
  }

  // WASM mode
  return {
    supportsFileHandles: true, // File System Access API
    supportsBigQuery: true, // Browser BigQuery connector
    supportsAllExtensions: false, // WASM has limited extensions
    supportsFilesystem: false, // No direct filesystem access
    isWasmBased: true,
  }
}
