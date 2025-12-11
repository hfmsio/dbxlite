/**
 * URL parameters for deep linking
 */
export interface URLParams {
  example?: string; // Example ID: "duckdb-community"
  sql?: string; // Direct SQL (URL-encoded)
  share?: string; // Shared query: "provider:id" (e.g., "gist:abc123")
  tab?: string; // Tab name override
  run?: string; // Auto-execute: "true" or "false"
  theme?: string; // Theme override
  explorer?: string; // Show explorer: "true" (default: "false")
}

/**
 * Parse URL search parameters
 */
export function parseURLParams(): URLParams {
  const params = new URLSearchParams(window.location.search);
  return {
    example: params.get('example') || undefined,
    sql: params.get('sql') || undefined,
    share: params.get('share') || undefined,
    tab: params.get('tab') || undefined,
    run: params.get('run') || undefined,
    theme: params.get('theme') || undefined,
    explorer: params.get('explorer') || undefined,
  };
}

/**
 * Clear URL parameters after loading (prevents reload loops)
 */
export function clearURLParams(): void {
  const url = new URL(window.location.href);
  url.search = '';
  window.history.replaceState({}, '', url);
}

/**
 * Generate URL for an example
 */
export function generateExampleURL(
  exampleId: string,
  options?: {
    baseURL?: string;
    tabName?: string;
    autoRun?: boolean;
    theme?: string;
    showExplorer?: boolean;
  },
): string {
  const base = options?.baseURL || window.location.origin;
  const params = new URLSearchParams({ example: exampleId });

  if (options?.tabName) params.set('tab', options.tabName);
  if (options?.autoRun) params.set('run', 'true');
  if (options?.theme) params.set('theme', options.theme);
  if (options?.showExplorer) params.set('explorer', 'true');

  return `${base}?${params.toString()}`;
}

/**
 * Generate URL for custom SQL (direct URL encoding)
 * WARNING: URLs have ~2000 char limit. Use sharing providers for large SQL.
 */
export function generateCustomSQLURL(
  sql: string,
  options?: {
    baseURL?: string;
    tabName?: string;
  },
): string {
  if (sql.length > 1500) {
    console.warn(
      'SQL too long for URL (>1500 chars). Consider using a sharing provider.',
    );
  }

  const base = options?.baseURL || window.location.origin;
  const params = new URLSearchParams({ sql });

  if (options?.tabName) params.set('tab', options.tabName);

  return `${base}?${params.toString()}`;
}
