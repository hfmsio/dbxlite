/**
 * Centralized Data Type System
 *
 * This module provides a unified type system for handling database types
 * across different connectors (DuckDB, BigQuery, etc.) and consistent
 * type-aware formatting throughout the application.
 */

import type { ConnectorType } from "../types/data-source";
import { createLogger } from "./logger";

const logger = createLogger("DataTypes");

/**
 * Normalized data types across all database connectors
 */
export enum DataType {
	// Numeric types
	TINYINT = "TINYINT",
	SMALLINT = "SMALLINT",
	INTEGER = "INTEGER",
	BIGINT = "BIGINT",
	HUGEINT = "HUGEINT",
	UHUGEINT = "UHUGEINT", // Unsigned 128-bit integer
	VARINT = "VARINT", // Arbitrary precision integer
	UTINYINT = "UTINYINT",
	USMALLINT = "USMALLINT",
	UINTEGER = "UINTEGER",
	UBIGINT = "UBIGINT",
	FLOAT = "FLOAT",
	DOUBLE = "DOUBLE",
	DECIMAL = "DECIMAL",
	NUMERIC = "NUMERIC",

	// String types
	VARCHAR = "VARCHAR",
	TEXT = "TEXT",
	CHAR = "CHAR",
	STRING = "STRING",

	// Boolean
	BOOLEAN = "BOOLEAN",
	BOOL = "BOOL",

	// Temporal types
	DATE = "DATE",
	TIME = "TIME",
	DATETIME = "DATETIME",
	TIMESTAMP = "TIMESTAMP",
	TIMESTAMP_MS = "TIMESTAMP_MS",
	TIMESTAMP_NS = "TIMESTAMP_NS",
	TIMESTAMP_S = "TIMESTAMP_S",
	TIMESTAMPTZ = "TIMESTAMPTZ",
	INTERVAL = "INTERVAL",

	// Binary types
	BLOB = "BLOB",
	BYTES = "BYTES",
	BYTEA = "BYTEA",

	// Complex types
	ARRAY = "ARRAY",
	LIST = "LIST",
	STRUCT = "STRUCT",
	MAP = "MAP",
	JSON = "JSON",

	// Spatial types
	GEOGRAPHY = "GEOGRAPHY",
	GEOMETRY = "GEOMETRY",

	// Special types
	UUID = "UUID",
	NULL = "NULL",
	UNKNOWN = "UNKNOWN",
}

/**
 * Type category for grouping similar types
 */
export enum TypeCategory {
	NUMERIC = "NUMERIC",
	STRING = "STRING",
	BOOLEAN = "BOOLEAN",
	TEMPORAL = "TEMPORAL",
	BINARY = "BINARY",
	COMPLEX = "COMPLEX",
	SPATIAL = "SPATIAL",
	SPECIAL = "SPECIAL",
}

/**
 * Get the category for a given data type
 */
export function getTypeCategory(type: DataType): TypeCategory {
	const numericTypes = new Set([
		DataType.TINYINT,
		DataType.SMALLINT,
		DataType.INTEGER,
		DataType.BIGINT,
		DataType.HUGEINT,
		DataType.UHUGEINT,
		DataType.VARINT,
		DataType.UTINYINT,
		DataType.USMALLINT,
		DataType.UINTEGER,
		DataType.UBIGINT,
		DataType.FLOAT,
		DataType.DOUBLE,
		DataType.DECIMAL,
		DataType.NUMERIC,
	]);

	const stringTypes = new Set([
		DataType.VARCHAR,
		DataType.TEXT,
		DataType.CHAR,
		DataType.STRING,
	]);

	const booleanTypes = new Set([DataType.BOOLEAN, DataType.BOOL]);

	const temporalTypes = new Set([
		DataType.DATE,
		DataType.TIME,
		DataType.DATETIME,
		DataType.TIMESTAMP,
		DataType.TIMESTAMP_MS,
		DataType.TIMESTAMP_NS,
		DataType.TIMESTAMP_S,
		DataType.TIMESTAMPTZ,
		DataType.INTERVAL,
	]);

	const binaryTypes = new Set([DataType.BLOB, DataType.BYTES, DataType.BYTEA]);

	const complexTypes = new Set([
		DataType.ARRAY,
		DataType.LIST,
		DataType.STRUCT,
		DataType.MAP,
		DataType.JSON,
	]);

	const spatialTypes = new Set([DataType.GEOGRAPHY, DataType.GEOMETRY]);

	if (numericTypes.has(type)) return TypeCategory.NUMERIC;
	if (stringTypes.has(type)) return TypeCategory.STRING;
	if (booleanTypes.has(type)) return TypeCategory.BOOLEAN;
	if (temporalTypes.has(type)) return TypeCategory.TEMPORAL;
	if (binaryTypes.has(type)) return TypeCategory.BINARY;
	if (complexTypes.has(type)) return TypeCategory.COMPLEX;
	if (spatialTypes.has(type)) return TypeCategory.SPATIAL;
	return TypeCategory.SPECIAL;
}

/**
 * Type information with additional metadata
 */
export interface TypeInfo {
	type: DataType;
	category: TypeCategory;
	nullable?: boolean;
	precision?: number;
	scale?: number;
	originalType?: string; // Original type string from connector
}

/**
 * Type mapper for normalizing connector-specific types to our unified system
 */
export class TypeMapper {
	/**
	 * Normalize a DuckDB Arrow type to our DataType enum
	 *
	 * Apache Arrow type.toString() returns formats like:
	 * - "Date<Day>" or "Date<Millisecond>" for dates
	 * - "Timestamp<Microsecond, null>" for timestamps
	 * - "Utf8" for strings
	 * - "Int64", "Float64" for numbers
	 */
	static normalizeDuckDBType(arrowTypeString: string): DataType {
		const normalized = arrowTypeString.toLowerCase().trim();

		// Temporal types (check first as they might contain other keywords)
		// Apache Arrow format: Date<Day>, Date<Millisecond>, Date32<DAY>, Date64<MILLISECOND>
		if (
			normalized.startsWith("date<") ||
			normalized.startsWith("date32<") ||
			normalized.startsWith("date64<") ||
			normalized === "date" ||
			normalized === "date32" ||
			normalized === "date64"
		)
			return DataType.DATE;

		// Apache Arrow format: Time<Second>, Time<Millisecond>, Time<Microsecond>, Time<Nanosecond>
		// Also Time32<...> and Time64<...> variants
		if (
			normalized.startsWith("time<") ||
			normalized.startsWith("time32<") ||
			normalized.startsWith("time64<") ||
			normalized.startsWith("time[") ||
			normalized === "time" ||
			normalized === "time32" ||
			normalized === "time64"
		)
			return DataType.TIME;

		if (normalized === "datetime") return DataType.DATETIME;

		// Apache Arrow format: Timestamp<Millisecond, null>, Timestamp<Microsecond, UTC>, etc.
		// Also handle "tytimestamp" variant
		if (
			normalized.startsWith("timestamp<millisecond") ||
			normalized.includes("timestamp[ms]") ||
			normalized === "timestamp_ms"
		)
			return DataType.TIMESTAMP_MS;
		if (
			normalized.startsWith("timestamp<microsecond") ||
			normalized.includes("timestamp[us]") ||
			normalized === "timestamp_us"
		)
			return DataType.TIMESTAMP;
		if (
			normalized.startsWith("timestamp<nanosecond") ||
			normalized.includes("timestamp[ns]") ||
			normalized === "timestamp_ns"
		)
			return DataType.TIMESTAMP_NS;
		if (
			normalized.startsWith("timestamp<second") ||
			normalized.includes("timestamp[s]") ||
			normalized === "timestamp_s"
		)
			return DataType.TIMESTAMP_S;
		if (normalized.includes("timestamp") && normalized.includes("tz"))
			return DataType.TIMESTAMPTZ;
		if (normalized.startsWith("timestamp") || normalized === "tytimestamp")
			return DataType.TIMESTAMP;
		if (normalized.includes("interval")) return DataType.INTERVAL;

		// Complex types - CHECK FIRST before numeric types to avoid false matches
		// e.g., "Struct<{total_spent:Decimal...}>" contains "decimal" but should map to STRUCT not DECIMAL
		if (
			normalized.startsWith("list<") ||
			normalized.startsWith("list(") ||
			normalized.startsWith("array<") ||
			normalized.startsWith("array(") ||
			normalized.includes("[]")
		)
			return DataType.LIST;
		if (
			normalized.startsWith("struct<") ||
			normalized.startsWith("struct(") ||
			normalized === "record"
		)
			return DataType.STRUCT;
		if (normalized.startsWith("map<") || normalized.startsWith("map("))
			return DataType.MAP;
		if (normalized === "json") return DataType.JSON;

		// Dictionary types (ENUM in DuckDB) - map to VARCHAR since they represent categorical strings
		// Must check before numeric types since Dictionary<Uint8, Utf8> contains "uint8"
		if (normalized.startsWith("dictionary<") || normalized.startsWith("dictionary("))
			return DataType.VARCHAR;

		// Numeric types (Apache Arrow format: Int8, Int16, Int32, Int64, Float32, Float64, etc.)
		if (normalized === "int8" || normalized === "tinyint")
			return DataType.TINYINT;
		if (normalized === "int16" || normalized === "smallint")
			return DataType.SMALLINT;
		if (
			normalized === "int32" ||
			normalized === "int" ||
			normalized === "integer"
		)
			return DataType.INTEGER;
		if (normalized === "int64" || normalized === "bigint")
			return DataType.BIGINT;
		if (normalized.includes("uint8") || normalized === "utinyint")
			return DataType.UTINYINT;
		if (normalized.includes("uint16") || normalized === "usmallint")
			return DataType.USMALLINT;
		if (normalized.includes("uint32") || normalized === "uinteger")
			return DataType.UINTEGER;
		if (normalized.includes("uint64") || normalized === "ubigint")
			return DataType.UBIGINT;
		if (
			normalized === "float32" ||
			normalized === "float" ||
			normalized === "real"
		)
			return DataType.FLOAT;
		if (normalized === "float64" || normalized === "double")
			return DataType.DOUBLE;
		if (normalized.includes("decimal") || normalized.includes("numeric"))
			return DataType.DECIMAL;
		if (normalized === "uhugeint" || normalized.includes("uint128"))
			return DataType.UHUGEINT;
		if (normalized.includes("hugeint") || normalized.includes("int128"))
			return DataType.HUGEINT;
		if (normalized === "varint" || normalized.includes("arbitrary"))
			return DataType.VARINT;
		// Generic "number" might be used - map to double as a safe default for numeric display
		if (normalized === "number") return DataType.DOUBLE;

		// String types (Apache Arrow format: Utf8, LargeUtf8, Binary, etc.)
		if (
			normalized === "utf8" ||
			normalized === "largeutf8" ||
			normalized === "varchar" ||
			normalized === "string"
		)
			return DataType.VARCHAR;
		if (normalized === "text") return DataType.TEXT;

		// Boolean (Apache Arrow format: Bool)
		if (normalized === "bool" || normalized === "boolean")
			return DataType.BOOLEAN;

		// Binary types
		if (
			normalized === "binary" ||
			normalized === "largebinary" ||
			normalized === "blob" ||
			normalized === "bytes"
		)
			return DataType.BLOB;

		// Spatial types
		if (normalized === "geography" || normalized === "geometry")
			return DataType.GEOGRAPHY;

		// Special types
		if (normalized === "uuid") return DataType.UUID;
		if (normalized === "null") return DataType.NULL;

		logger.warn(`Unknown DuckDB type: ${arrowTypeString}`);
		return DataType.UNKNOWN;
	}

	/**
	 * Normalize a BigQuery type to our DataType enum
	 */
	static normalizeBigQueryType(bqType: string): DataType {
		const normalized = bqType.toUpperCase().trim();

		// Apache Arrow types (BigQuery may return Arrow format types)
		if (normalized === "UTF8" || normalized === "LARGEUTF8")
			return DataType.STRING;
		if (normalized.startsWith("DATE32")) return DataType.DATE;
		if (normalized.startsWith("TIME32") || normalized.startsWith("TIME64"))
			return DataType.TIME;
		if (normalized.startsWith("TIMESTAMP")) return DataType.TIMESTAMPTZ;
		if (normalized === "BOOL") return DataType.BOOLEAN;
		if (
			normalized === "INT8" ||
			normalized === "INT16" ||
			normalized === "INT32"
		)
			return DataType.INTEGER;
		if (normalized === "INT64") return DataType.BIGINT;
		if (normalized === "FLOAT" || normalized === "FLOAT32")
			return DataType.FLOAT;
		if (normalized === "DOUBLE" || normalized === "FLOAT64")
			return DataType.DOUBLE;
		if (normalized === "BINARY" || normalized === "LARGEBINARY")
			return DataType.BYTES;

		// BigQuery SQL types
		if (normalized === "INTEGER") return DataType.BIGINT;
		if (normalized === "NUMERIC" || normalized === "DECIMAL")
			return DataType.DECIMAL;
		if (normalized === "BIGNUMERIC" || normalized === "BIGDECIMAL")
			return DataType.DECIMAL;

		// String types
		if (normalized === "STRING") return DataType.STRING;
		if (normalized === "BYTES") return DataType.BYTES;

		// Boolean
		if (normalized === "BOOLEAN") return DataType.BOOLEAN;

		// Temporal types
		if (normalized === "DATE") return DataType.DATE;
		if (normalized === "TIME") return DataType.TIME;
		if (normalized === "DATETIME") return DataType.DATETIME;
		if (normalized === "INTERVAL") return DataType.INTERVAL;

		// Complex types
		if (normalized.startsWith("ARRAY") || normalized.startsWith("LIST"))
			return DataType.ARRAY;
		if (normalized.startsWith("STRUCT") || normalized === "RECORD")
			return DataType.STRUCT;
		if (normalized === "JSON") return DataType.JSON;

		// Spatial types
		if (normalized === "GEOGRAPHY") return DataType.GEOGRAPHY;

		logger.warn(`Unknown BigQuery type: ${bqType}`);
		return DataType.UNKNOWN;
	}

	/**
	 * Normalize any connector type to our DataType enum
	 */
	static normalizeType(
		connectorType: string,
		connector: ConnectorType,
	): DataType {
		if (connector === "duckdb") {
			return TypeMapper.normalizeDuckDBType(connectorType);
		} else if (connector === "bigquery") {
			return TypeMapper.normalizeBigQueryType(connectorType);
		}
		return DataType.UNKNOWN;
	}

	/**
	 * Get display name for a data type
	 */
	static getDisplayName(type: DataType): string {
		// Return more user-friendly names
		const displayNames: Partial<Record<DataType, string>> = {
			[DataType.INTEGER]: "Integer",
			[DataType.BIGINT]: "Big Integer",
			[DataType.HUGEINT]: "Huge Integer (128-bit)",
			[DataType.UHUGEINT]: "Unsigned Huge Integer (128-bit)",
			[DataType.VARINT]: "Variable Integer",
			[DataType.FLOAT]: "Float",
			[DataType.DOUBLE]: "Double",
			[DataType.DECIMAL]: "Decimal",
			[DataType.VARCHAR]: "Text",
			[DataType.STRING]: "Text",
			[DataType.TEXT]: "Text",
			[DataType.BOOLEAN]: "Boolean",
			[DataType.DATE]: "Date",
			[DataType.TIME]: "Time",
			[DataType.DATETIME]: "Date Time",
			[DataType.TIMESTAMP]: "Timestamp",
			[DataType.TIMESTAMPTZ]: "Timestamp (with timezone)",
			[DataType.ARRAY]: "Array",
			[DataType.LIST]: "List",
			[DataType.STRUCT]: "Struct",
			[DataType.JSON]: "JSON",
			[DataType.BLOB]: "Binary",
			[DataType.BYTES]: "Bytes",
		};

		return displayNames[type] || type.toString();
	}
}
