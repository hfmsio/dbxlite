import {
	getCachedSchema,
	makeCacheKey,
	setCachedSchema,
} from "@ide/schema-cache";
import type { DataSource } from "../types/data-source";
import { createLogger } from "../utils/logger";

const logger = createLogger("SchemaService");

/** Source type for connector-specific formatting */
export type SourceType = "duckdb" | "bigquery" | "file";

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
