/**
 * Pure parsing helpers extracted from bigquery-connector.ts so the
 * Web Worker can call them without pulling in the connector itself.
 *
 * Mirrors the snowflake-parse-shared.ts pattern. No imports of the
 * connector or storage; safe to load in a worker context.
 */

export interface BigQueryFieldLite {
	name: string;
	type: string;
	mode?: string;
	fields?: BigQueryFieldLite[];
}

export interface BigQuerySchemaLite {
	fields: BigQueryFieldLite[];
}

export interface BigQueryRowLite {
	f: { v: unknown }[];
}

/**
 * Decode a BigQuery typed value. Recursive for STRUCT / ARRAY.
 */
export function parseBigQueryValue(
	value: unknown,
	field: BigQueryFieldLite | string,
): unknown {
	if (value === null || value === undefined) return null;

	const fieldObj =
		typeof field === "string" ? { name: "", type: field } : field;
	const upperType = fieldObj.type.toUpperCase();
	const isRepeated = fieldObj.mode?.toUpperCase() === "REPEATED";

	if (isRepeated && Array.isArray(value)) {
		const elementField: BigQueryFieldLite = {
			name: fieldObj.name,
			type: fieldObj.type,
			fields: fieldObj.fields,
		};
		return value.map((item: unknown) => {
			let unwrapped = item;
			if (item && typeof item === "object") {
				const obj = item as Record<string, unknown>;
				if ("v" in obj) unwrapped = obj.v;
			}
			return parseBigQueryValue(unwrapped, elementField);
		});
	}

	if (Array.isArray(value)) {
		return value.map((item: unknown) => {
			if (item && typeof item === "object" && "v" in item) {
				return (item as { v: unknown }).v;
			}
			return item;
		});
	}

	const stringValue = String(value);

	switch (upperType) {
		case "INTEGER":
		case "INT64":
			return parseInt(stringValue, 10);

		case "FLOAT":
		case "FLOAT64":
			return parseFloat(stringValue);

		case "NUMERIC":
		case "BIGNUMERIC":
		case "DECIMAL":
			return stringValue;

		case "BOOLEAN":
		case "BOOL":
			return value === "true" || value === true;

		case "TIMESTAMP":
			return new Date(parseFloat(stringValue) * 1000);

		case "DATE":
			return value;

		case "DATETIME":
			try {
				return new Date(stringValue);
			} catch {
				return value;
			}

		case "TIME":
			return value;

		case "BYTES":
		case "STRING":
		case "GEOGRAPHY":
		case "GEOMETRY":
		case "INTERVAL":
			return value;

		case "JSON":
			try {
				return JSON.parse(stringValue);
			} catch {
				return value;
			}

		case "ARRAY":
			if (Array.isArray(value)) {
				const elementField =
					fieldObj.fields?.[0] || { name: "", type: "STRING" };
				return value.map((item: unknown) => {
					const unwrapped =
						item && typeof item === "object" && "v" in item
							? (item as { v: unknown }).v
							: item;
					return parseBigQueryValue(unwrapped, elementField);
				});
			}
			return value;

		case "STRUCT":
		case "RECORD":
			if (
				value &&
				typeof value === "object" &&
				"f" in value &&
				fieldObj.fields
			) {
				const structValue = value as { f: Array<{ v: unknown }> };
				const result: Record<string, unknown> = {};
				fieldObj.fields.forEach((subField, index) => {
					const subValue = structValue.f[index]?.v;
					result[subField.name] = parseBigQueryValue(subValue, subField);
				});
				return result;
			}
			if (typeof value === "object") return value;
			try {
				return JSON.parse(stringValue);
			} catch {
				return value;
			}

		default:
			return value;
	}
}

/**
 * Map an array of BigQuery wire-format rows + schema → object rows
 * keyed by column name with typed values. Hot loop; called per chunk
 * in the streaming pagination path.
 */
export function parseBigQueryRows(
	rows: BigQueryRowLite[],
	schema: BigQuerySchemaLite,
): Record<string, unknown>[] {
	if (!rows || rows.length === 0) return [];
	if (!schema?.fields) return rows as unknown as Record<string, unknown>[];

	const out: Record<string, unknown>[] = new Array(rows.length);
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		const obj: Record<string, unknown> = {};
		const values = row.f || [];
		for (let i = 0; i < schema.fields.length; i++) {
			const field = schema.fields[i];
			const value = values[i]?.v;
			obj[field.name] = parseBigQueryValue(value, field);
		}
		out[r] = obj;
	}
	return out;
}
