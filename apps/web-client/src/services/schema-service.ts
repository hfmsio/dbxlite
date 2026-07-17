import type { DataSource } from "../types/data-source";
import { createLogger } from "../utils/logger";
import { getCatalogProviderSchemas } from "./catalog-schema-bridge";

// Lightweight in-memory schema cache. Was @ide/schema-cache (an
// over-engineered standalone package); the only consumer was
// getSchemaStub here. The shared in-memory cache is sufficient and
// removes the package dependency.
type SchemaForCompletionLike = unknown;
interface CacheEntry {
	value: SchemaForCompletionLike;
	expiresAt: number;
}
const schemaCache = new Map<string, CacheEntry>();

function makeCacheKey(...parts: (string | number)[]): string {
	return parts.join(":");
}
async function getCachedSchema(key: string): Promise<SchemaForCompletionLike | null> {
	const entry = schemaCache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		schemaCache.delete(key);
		return null;
	}
	return entry.value;
}
async function setCachedSchema(
	key: string,
	value: SchemaForCompletionLike,
	ttlMs: number,
): Promise<void> {
	schemaCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const logger = createLogger("SchemaService");

/** Source type for connector-specific formatting */
export type SourceType = "duckdb" | "bigquery" | "snowflake" | "file";

/** Top-level data source for FROM autocomplete */
export interface TopLevelSource {
	name: string;
	sourceType: SourceType;
	displayName?: string; // For display (e.g., with backticks for BigQuery)
}

/** Schema format for Monaco autocomplete */
export interface SchemaForCompletion {
	tables: {
		name: string;
		columns: string[];
		databaseName?: string; // DuckDB database name (e.g., "data", "archforge_ui")
		schemaName?: string; // Schema name within database (e.g., "main", "config")
		sourceType?: SourceType; // Connector type for formatting
	}[];
	/** Top-level sources for FROM autocomplete */
	topLevelSources: TopLevelSource[];
}

/**
 * Determine source type from DataSource type
 */
function getSourceType(dsType: DataSource["type"]): SourceType {
	if (dsType === "duckdb") return "duckdb";
	if (dsType === "connection") return "bigquery"; // Currently only BigQuery uses connection
	return "file";
}

/**
 * Extract schema from data sources for Monaco autocomplete.
 * Combines schemas from all data sources (databases + files).
 */
export function getSchemaFromDataSources(
	dataSources: DataSource[],
): SchemaForCompletion {
	const tables: SchemaForCompletion["tables"] = [];
	const topLevelSources: TopLevelSource[] = [];

	logger.debug("getSchemaFromDataSources called with", dataSources.length, "data sources");

	for (const ds of dataSources) {
		const sourceType = getSourceType(ds.type);
		// Use attachedAs (SQL identifier) for DuckDB databases, fallback to name
		// This is the actual identifier users type in SQL (e.g., "data" not "data (database)")
		const sqlIdentifier = ds.attachedAs || ds.name;

		logger.debug("Processing data source:", ds.name, "type:", ds.type, "sourceType:", sourceType,
			"attachedAs:", ds.attachedAs, "sqlIdentifier:", sqlIdentifier,
			"hasSchemas:", !!ds.schemas, "schemasLength:", ds.schemas?.length,
			"hasColumns:", !!ds.columns, "columnsLength:", ds.columns?.length,
			"hasSheets:", !!ds.sheets, "sheetsLength:", ds.sheets?.length);

		// Add to top-level sources (for FROM autocomplete)
		// Use sqlIdentifier so autocomplete matches what users type
		topLevelSources.push({
			name: sqlIdentifier,
			sourceType,
			displayName: sourceType === "bigquery" ? `\`${sqlIdentifier}\`` : sqlIdentifier,
		});

		// DuckDB databases - full schema hierarchy
		if (ds.schemas && ds.schemas.length > 0) {
			for (const schema of ds.schemas) {
				for (const table of schema.tables) {
					tables.push({
						name: table.name,
						columns: table.columns.map((c) => c.name),
						databaseName: sqlIdentifier, // Use sqlIdentifier for matching
						schemaName: schema.name,
						sourceType,
					});
				}
			}
		}
		// File-based sources (CSV, Parquet, JSON, etc.)
		else if (ds.columns && ds.columns.length > 0) {
			const tableName = ds.tableName || ds.name;
			tables.push({
				name: tableName,
				columns: ds.columns.map((c) => c.name),
				sourceType,
			});
		}
		// XLSX files with sheets
		else if (ds.sheets && ds.sheets.length > 0) {
			for (const sheet of ds.sheets) {
				if (sheet.columns && sheet.columns.length > 0) {
					tables.push({
						name: `${ds.name}_${sheet.name}`,
						columns: sheet.columns.map((c) => c.name),
						sourceType,
					});
				}
			}
		}
	}

	logger.debug("getSchemaFromDataSources returning", tables.length, "tables,", topLevelSources.length, "top-level sources");

	return { tables, topLevelSources };
}

/**
 * Merge the data-source store's view with anything the catalog
 * explorer has loaded into the catalog-schema bridge. The bridge
 * holds Snowflake (and eventually BigQuery via CatalogProvider)
 * tables that aren't represented in `DataSource[]`.
 *
 * Tables / top-level sources contributed by the bridge are appended;
 * a name collision with an existing entry favours the data-source
 * entry (it was registered via the canonical explicit path).
 */
export function getSchemaFromAllSources(
	dataSources: DataSource[],
): SchemaForCompletion {
	const fromStore = getSchemaFromDataSources(dataSources);
	const fromBridge = getCatalogProviderSchemas();

	// Append bridge top-level sources that aren't already present.
	const existingTopLevel = new Set(fromStore.topLevelSources.map((s) => s.name));
	for (const src of fromBridge.topLevelSources) {
		if (existingTopLevel.has(src.name)) continue;
		fromStore.topLevelSources.push({
			name: src.name,
			sourceType: src.sourceType,
			displayName: src.displayName,
		});
	}

	// Append bridge tables. Compose a "fully-qualified" key (db.schema.table)
	// so a Snowflake CUSTOMER in one database doesn't shadow another with the
	// same name in a different database/schema.
	const existingTables = new Set(
		fromStore.tables.map(
			(t) => `${t.databaseName ?? ""}::${t.schemaName ?? ""}::${t.name}`,
		),
	);
	for (const t of fromBridge.tables) {
		const key = `${t.databaseName ?? ""}::${t.schemaName ?? ""}::${t.name}`;
		if (existingTables.has(key)) continue;
		fromStore.tables.push({
			name: t.name,
			columns: t.columns,
			databaseName: t.databaseName,
			schemaName: t.schemaName,
			sourceType: t.sourceType,
		});
	}

	return fromStore;
}

// Stubbed schema service. Now uses cache and a simple connector-stub.
export async function getSchemaStub(
	connId = "local",
): Promise<SchemaForCompletion> {
	const key = makeCacheKey(connId);
	const cached = await getCachedSchema(key);
	if (cached) return cached as SchemaForCompletion;
	// simulate fetching schema (in production call connector.getSchema())
	const schema: SchemaForCompletion = {
		tables: [
			{ name: "users", columns: ["id", "email", "created_at"] },
			{ name: "orders", columns: ["id", "user_id", "amount", "created_at"] },
		],
		topLevelSources: [{ name: "local", sourceType: "duckdb" }],
	};
	await setCachedSchema(key, schema, 1000 * 60 * 60); // 1 hour
	return schema;
}
