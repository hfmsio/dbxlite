/**
 * Catalog → SQL-autocomplete bridge.
 *
 * The catalog explorer (Snowflake, future BigQuery via the
 * CatalogProvider system) fetches databases / schemas / tables /
 * columns on user expand and holds the result in React component
 * state. The SQL autocomplete subsystem reads schemas only from
 * `dataSourceStore.dataSources` via `schema-service`. The two never
 * connect, so a user with a Snowflake explorer full of tables gets
 * zero column suggestions when typing `c.` after `JOIN ... CUSTOMER c`.
 *
 * This module is the bridge. The catalog explorer calls
 * `notifyTablesLoaded` / `notifyColumnsLoaded` / `notifyCatalogsLoaded`
 * each time it materialises new data; `getCatalogProviderSchemas()`
 * projects that state into a `SchemaForCompletion`-shaped snapshot the
 * autocomplete provider can merge with the data-source store.
 *
 * Design properties:
 *   - No React. The bridge is module-level state callable from
 *     anywhere. Subscribers can opt in via `subscribeToBridge()` for
 *     reactive use cases (Phase 3a will route this through Zustand).
 *   - Additive. Catalog providers don't have to use this; explorers
 *     that haven't been instrumented simply don't show up in the
 *     bridge's snapshot.
 *   - Lazy columns are honest. If a table has been listed but not
 *     expanded by the user, the bridge emits the table with an empty
 *     column list. Autocomplete shows the table name; the columns
 *     appear after the user expands it in the explorer.
 *
 * State eviction model: providers can call `clearProviderState` on
 * refresh or disconnect to drop everything they registered.
 */

import type {
	CatalogInfo,
	ColumnInfo,
	TableMetadata,
} from "../../../../packages/connectors/src/base";

/** Stable identifier the provider uses to namespace its data in this module. */
export type ProviderId = string;
type CatalogId = string;
type SchemaId = string;

/**
 * The shape this module produces. Mirrors `SchemaForCompletion` from
 * `schema-service.ts` but kept here so a future move of the bridge
 * doesn't have to chase a circular import.
 */
export interface CatalogBridgeSchema {
	topLevelSources: Array<{
		name: string;
		sourceType: "snowflake" | "bigquery";
		displayName?: string;
	}>;
	tables: Array<{
		name: string;
		columns: string[];
		databaseName?: string;
		schemaName?: string;
		sourceType: "snowflake" | "bigquery";
	}>;
}

/** Per-provider metadata held by the bridge. */
interface ProviderEntry {
	sourceType: "snowflake" | "bigquery";
	catalogs: CatalogInfo[];
	/** Key: `${catalogId}:${schemaId}` → tables in that schema. */
	tablesPerSchema: Map<string, TableMetadata[]>;
	/** Key: `${catalogId}:${schemaId}:${tableId}` → columns for that table. */
	columnsPerTable: Map<string, ColumnInfo[]>;
}

/** Module-level state. Bridge is a singleton; no class needed. */
const providers = new Map<ProviderId, ProviderEntry>();
const subscribers = new Set<() => void>();

function require_(providerId: ProviderId): ProviderEntry {
	const existing = providers.get(providerId);
	if (existing) return existing;
	// Defensive default: treat as snowflake. In practice callers should
	// register first via `registerCatalogProvider`; this fallback exists
	// so a missing-registration bug doesn't crash the bridge.
	const created: ProviderEntry = {
		sourceType: "snowflake",
		catalogs: [],
		tablesPerSchema: new Map(),
		columnsPerTable: new Map(),
	};
	providers.set(providerId, created);
	return created;
}

function notify(): void {
	for (const cb of subscribers) cb();
}

// ---------------------------------------------------------------------
// Registration + state mutations (called from CatalogExplorer)
// ---------------------------------------------------------------------

/**
 * Declare a provider's existence and the sourceType its data should
 * be tagged with for downstream completion / quoting. Idempotent;
 * subsequent calls update the sourceType if it changes (unusual).
 *
 * Call this once when the explorer mounts a provider, before any
 * `notify*` call. If a notify lands without a prior registration the
 * bridge still works (defensive fallback) but the sourceType may be
 * wrong for the first frame.
 */
export function registerCatalogProvider(
	providerId: ProviderId,
	sourceType: "snowflake" | "bigquery",
): void {
	const existing = providers.get(providerId);
	if (existing) {
		existing.sourceType = sourceType;
		return;
	}
	providers.set(providerId, {
		sourceType,
		catalogs: [],
		tablesPerSchema: new Map(),
		columnsPerTable: new Map(),
	});
}

/**
 * Record the set of catalogs (databases) the provider has loaded.
 * Replaces any previous catalog list for this provider; partial
 * additions are not supported because `listCatalogs` always returns
 * the full set from the source.
 */
export function notifyCatalogsLoaded(
	providerId: ProviderId,
	catalogs: CatalogInfo[],
): void {
	const entry = require_(providerId);
	entry.catalogs = catalogs;
	notify();
}

/**
 * Record the tables loaded for a given catalog/schema. Replaces any
 * previous table list for that schema. Columns on the TableMetadata
 * may be absent (Snowflake's `listTables` does not populate them).
 */
export function notifyTablesLoaded(
	providerId: ProviderId,
	catalogId: CatalogId,
	schemaId: SchemaId,
	tables: TableMetadata[],
): void {
	const entry = require_(providerId);
	entry.tablesPerSchema.set(`${catalogId}:${schemaId}`, tables);
	notify();
}

/**
 * Record the columns introspected for a specific table. Called when
 * the user expands a table row in the explorer (the only moment when
 * column data becomes available for Snowflake).
 */
export function notifyColumnsLoaded(
	providerId: ProviderId,
	catalogId: CatalogId,
	schemaId: SchemaId,
	tableId: string,
	columns: ColumnInfo[],
): void {
	const entry = require_(providerId);
	entry.columnsPerTable.set(`${catalogId}:${schemaId}:${tableId}`, columns);
	notify();
}

/**
 * Drop everything registered under `providerId`, registration included.
 * This is the disconnect path: the source is gone, so its sourceType is
 * no longer meaningful either. Driven by the connection poll in
 * `useConnector`, which is the only signal that catches every way a
 * connection can end (explicit disconnect, expired token, lost session).
 */
export function clearProviderState(providerId: ProviderId): void {
	if (providers.delete(providerId)) notify();
}

/**
 * Drop a provider's loaded catalogs/tables/columns but KEEP its
 * registration, and therefore its sourceType.
 *
 * This is the refresh path. The explorer's tree collapses back to
 * `idle` on refresh, so nothing the bridge cached is backed by the UI
 * any more; holding on to it would let autocomplete keep suggesting
 * tables the refresh may have dropped from the source. Registration
 * survives because the provider itself is still connected — re-deriving
 * its sourceType at the call site would just duplicate that knowledge.
 */
export function resetProviderData(providerId: ProviderId): void {
	const entry = providers.get(providerId);
	if (!entry) return;
	entry.catalogs = [];
	entry.tablesPerSchema.clear();
	entry.columnsPerTable.clear();
	notify();
}

/** Drop ALL state. Test helper; not used in production. */
export function __resetCatalogBridgeForTests(): void {
	providers.clear();
	subscribers.clear();
}

// ---------------------------------------------------------------------
// Read API (called from schema-service)
// ---------------------------------------------------------------------

/**
 * Project the bridge's accumulated state into a single
 * `CatalogBridgeSchema` snapshot. Tables with no known columns
 * (the user hasn't expanded them yet) appear with `columns: []`.
 */
export function getCatalogProviderSchemas(): CatalogBridgeSchema {
	const topLevelSources: CatalogBridgeSchema["topLevelSources"] = [];
	const tables: CatalogBridgeSchema["tables"] = [];

	for (const entry of providers.values()) {
		// Each catalog (Snowflake database, BQ project) is a top-level source.
		for (const cat of entry.catalogs) {
			topLevelSources.push({
				name: cat.name,
				sourceType: entry.sourceType,
			});
		}
		// Flatten every loaded schema's tables.
		for (const [key, tableList] of entry.tablesPerSchema) {
			const [catalogId, schemaId] = key.split(":");
			for (const t of tableList) {
				const colKey = `${catalogId}:${schemaId}:${t.id}`;
				const knownColumns = entry.columnsPerTable.get(colKey);
				const cols = knownColumns ?? t.columns ?? [];
				tables.push({
					name: t.name,
					columns: cols.map((c) => c.name),
					databaseName: catalogId,
					schemaName: schemaId,
					sourceType: entry.sourceType,
				});
			}
		}
	}

	return { topLevelSources, tables };
}

/**
 * Subscribe to changes. Returns an unsubscribe handle. Used by
 * future reactive layers (Phase 3a Zustand selector); the keystroke-
 * polled completion provider doesn't need it because it re-reads
 * `getCatalogProviderSchemas` on every suggestion request.
 */
export function subscribeToBridge(cb: () => void): () => void {
	subscribers.add(cb);
	return () => {
		subscribers.delete(cb);
	};
}
