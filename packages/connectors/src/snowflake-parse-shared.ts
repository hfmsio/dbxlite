/**
 * Pure parsing helpers extracted from snowflake-connector.ts so the same
 * logic can run on the main thread (test/fallback path) and inside a
 * dedicated Web Worker (production hot path for large result sets).
 *
 * No imports of the connector or storage — must be safe to load in a
 * worker context.
 */

export interface SnowflakeColumnLite {
	name: string
	type: string
	scale?: number
}

/**
 * Parse a Snowflake jsonv2 value based on column metadata.
 *
 * Wire-format quirks:
 *   - Numerics arrive as strings.
 *   - FIXED is the wire name for integer/decimal; scale=0 → integer,
 *     scale>0 → keep as string for precision.
 *   - VARIANT/OBJECT/ARRAY arrive as JSON-encoded strings.
 *   - BOOLEAN may be 'true'/'false'/true/false/1/0.
 *   - TIMESTAMP_LTZ/NTZ are nanosecond-precision epoch strings.
 *   - TIMESTAMP_TZ is "epoch.frac offset_minutes".
 */
export function parseSnowflakeValue(
	value: unknown,
	col: { type: string; scale?: number },
): unknown {
	if (value === null || value === undefined) return null

	const upper = col.type.toUpperCase()

	switch (upper) {
		case "FIXED":
			return parseFixed(value, col.scale ?? 0)

		case "NUMBER":
		case "DECIMAL":
		case "NUMERIC":
			return parseFixed(value, col.scale ?? 0)

		case "INT":
		case "INTEGER":
		case "BIGINT":
		case "SMALLINT":
		case "TINYINT":
		case "BYTEINT":
			return typeof value === "string" ? parseInt(value, 10) : value

		case "FLOAT":
		case "FLOAT4":
		case "FLOAT8":
		case "DOUBLE":
		case "DOUBLE PRECISION":
		case "REAL":
			return typeof value === "string" ? parseFloat(value) : value

		case "BOOLEAN":
			return value === true || value === "true" || value === 1

		case "DATE":
			if (typeof value === "string" && /^-?\d+$/.test(value)) {
				const days = parseInt(value, 10)
				return new Date(days * 86400000)
			}
			return value

		case "TIME":
			return value

		case "DATETIME":
		case "TIMESTAMP":
		case "TIMESTAMP_LTZ":
		case "TIMESTAMP_NTZ":
		case "TIMESTAMP_TZ":
			return parseSnowflakeTimestamp(value, upper)

		case "VARIANT":
		case "OBJECT":
		case "ARRAY":
			if (typeof value === "string") {
				try {
					return JSON.parse(value)
				} catch {
					return value
				}
			}
			return value

		case "BINARY":
			return value

		default:
			return value
	}
}

export function parseFixed(value: unknown, scale: number): unknown {
	if (value === null || value === undefined) return null
	if (scale > 0) {
		return typeof value === "string" ? value : String(value)
	}
	if (typeof value === "string") return parseInt(value, 10)
	if (typeof value === "number") return value
	return value
}

export function parseSnowflakeTimestamp(value: unknown, type: string): Date {
	if (typeof value !== "string") {
		return value instanceof Date ? value : new Date(value as string)
	}

	let epochPart = value
	if (type === "TIMESTAMP_TZ") {
		const sp = value.indexOf(" ")
		if (sp !== -1) {
			epochPart = value.slice(0, sp)
		}
	}

	if (!/^-?\d+(\.\d+)?$/.test(epochPart)) {
		return new Date(value)
	}
	const num = parseFloat(epochPart)
	if (!Number.isFinite(num)) {
		return new Date(value)
	}
	return new Date(num * 1000)
}

/**
 * Convert a partition's `data` (array of row arrays) to objects keyed by
 * column name, with Snowflake-typed values. The hot loop — runs over
 * possibly millions of rows. Both worker and main-thread fallback share
 * this implementation.
 */
export function parseSnowflakeRows(
	data: unknown[][],
	rowType: SnowflakeColumnLite[],
): Record<string, unknown>[] {
	if (!data || data.length === 0) return []
	if (!rowType || rowType.length === 0) return []

	const out: Record<string, unknown>[] = new Array(data.length)
	for (let r = 0; r < data.length; r++) {
		const row = data[r]
		const obj: Record<string, unknown> = {}
		for (let c = 0; c < rowType.length; c++) {
			const col = rowType[c]
			obj[col.name] = parseSnowflakeValue(row[c], col)
		}
		out[r] = obj
	}
	return out
}
