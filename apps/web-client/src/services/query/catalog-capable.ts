/**
 * CatalogCapable — a typed narrow for connectors that expose catalog reads.
 *
 * Replaces the reflection guards in StreamingQueryService (WS-A / A9 in
 * docs/REFACTOR-PLAN.md). The service asked ten times over whether a connector
 * had a method:
 *
 *   if ("listDatasets" in connector && typeof connector.listDatasets === "function")
 *
 * That pattern costs more than its verbosity. It is a *string* test, so a
 * renamed method fails silently at runtime rather than loudly at compile time,
 * and each site had to re-cast to CloudConnector afterwards to call through —
 * a cast TypeScript could not check either.
 *
 * `CloudConnector` already declares these methods as optional, so a single
 * capability check per call gives the compiler what it needs, and the "not
 * supported" messages stay exactly as they were.
 */

import type {
	BaseConnector,
	CatalogInfo,
	CloudConnector,
	ConnectionTestResult,
	QueryCostEstimate,
	SchemaInfo,
	TableMetadata,
} from "@ide/connectors";

/** The catalog surface, with every member required rather than optional. */
export interface CatalogCapable {
	listProjects(): Promise<CatalogInfo[]>;
	listDatasets(projectId: string): Promise<SchemaInfo[]>;
	listTables(projectId: string, datasetId: string): Promise<TableMetadata[]>;
	getTableMetadata(
		projectId: string,
		datasetId: string,
		tableId: string,
	): Promise<TableMetadata>;
	estimateQueryCost(sql: string, projectId?: string): Promise<QueryCostEstimate>;
	testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Narrow to the one capability a call site needs.
 *
 * Per-method rather than all-or-nothing, because the cloud connectors
 * genuinely differ in what they implement — demanding the whole interface
 * would reject a connector over a method the caller never touches.
 */
export function supportsCatalog<K extends keyof CatalogCapable>(
	connector: BaseConnector | null,
	method: K,
): connector is BaseConnector & Pick<CatalogCapable, K> {
	return (
		connector !== null &&
		typeof (connector as unknown as Record<string, unknown>)[method] ===
			"function"
	);
}

/**
 * Resolve a connector slot to a specific catalog capability, or throw the
 * message the call site used to throw.
 *
 * `missingMethodError` is per-call because the existing messages are
 * user-facing and specific ("Project listing not supported", "Dataset listing
 * not supported"); collapsing them into one generic string would be a
 * user-visible change.
 */
export function requireCatalog<K extends keyof CatalogCapable>(
	connector: BaseConnector | null,
	method: K,
	notInitializedError: string,
	missingMethodError: string,
): Pick<CatalogCapable, K> {
	if (!connector) {
		throw new Error(notInitializedError);
	}
	if (!supportsCatalog(connector, method)) {
		throw new Error(missingMethodError);
	}
	return connector;
}

/** Optional catalog members that some connectors add beyond CloudConnector. */
export interface ProjectDefaultsCapable {
	getDefaultProject(): string | null;
	setDefaultProject(projectId: string): void;
}

export function supportsProjectDefaults(
	connector: BaseConnector | null,
): connector is BaseConnector & ProjectDefaultsCapable {
	return (
		connector !== null &&
		typeof (connector as unknown as ProjectDefaultsCapable).getDefaultProject ===
			"function"
	);
}

/** Narrow to a cloud connector's optional cache-clearing hook. */
export function supportsCacheClear(
	connector: BaseConnector | null,
): connector is BaseConnector & { clearCache(): void } {
	return (
		connector !== null &&
		typeof (connector as unknown as { clearCache?: unknown }).clearCache ===
			"function"
	);
}

export type { CloudConnector };
