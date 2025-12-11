import type { DataType, Vector } from 'apache-arrow';
import { FixedSizeList, List, Map_, Struct, Union } from 'apache-arrow';
import {
	uint32ArrayToNumeric,
	bigInt64ToNumeric,
	bigUint64ToNumeric,
	float32ToNumber,
	float64ToNumber,
	trackConversionError,
} from './type-converters';

function toNumberArray(
	input: unknown,
): number[] | null {
	if (input === null || input === undefined) return null;
	if (Array.isArray(input)) return input.map((n) => Number(n));
	if (input instanceof Int32Array || input instanceof Uint32Array) {
		return Array.from(input);
	}
	if (typeof input === 'object') {
		const obj = input as Record<string, unknown>;
		const keys = Object.keys(obj)
			.map((k) => Number(k))
			.filter((k) => !Number.isNaN(k))
			.sort((a, b) => a - b);
		if (keys.length > 0) {
			return keys.map((k) => Number(obj[k]));
		}
	}
	return null;
}

function decodeUtf8FromOffsets(offsets: number[], valuesLike: unknown): string[] {
	const result: string[] = [];
	const byteValues = toNumberArray(
		(valuesLike as Record<string, unknown>)?.values ?? valuesLike,
	);
	if (!byteValues) return result;

	for (let i = 0; i < offsets.length - 1; i++) {
		const start = offsets[i] ?? 0;
		const end = offsets[i + 1] ?? start;
		const slice = byteValues.slice(start, end);
		result.push(new TextDecoder().decode(new Uint8Array(slice)));
	}
	return result;
}

function decodeArrowListStructFallback(raw: unknown): unknown {
	// Handles Arrow JSON-like shapes: { _offsets: [...], data: [{ children: [...] }] }
	if (!raw || typeof raw !== 'object') return null;
	const offsets = toNumberArray((raw as { _offsets?: unknown })._offsets);
	const data0 = Array.isArray((raw as { data?: unknown[] }).data)
		? (raw as { data: unknown[] }).data[0]
		: null;
	if (!offsets || !data0 || typeof data0 !== 'object') return null;

	const children = (data0 as { children?: unknown[] }).children;
	if (!Array.isArray(children) || children.length === 0) return null;

	// Try to derive child names from type metadata if present
	const typeChildren =
		(data0 as { type?: { children?: { name?: string }[] } }).type?.children;

	const decodedChildArrays: Record<string, unknown[]> = {};

	children.forEach((child, idx) => {
		const name =
			typeChildren?.[idx]?.name ??
			(child as { name?: string }).name ??
			`col_${idx}`;
		let decoded: unknown[] = [];

		// Common string child: { valueOffsets, values }
		const valueOffsets = toNumberArray(
			(child as { valueOffsets?: unknown }).valueOffsets,
		);
		if (valueOffsets && (child as { values?: unknown }).values !== undefined) {
			decoded = decodeUtf8FromOffsets(
				valueOffsets,
				(child as { values?: unknown }).values,
			);
		} else if ((child as { values?: unknown }).values !== undefined) {
			const vals = toNumberArray((child as { values?: unknown }).values);
			decoded = vals ?? [];
		} else if (Array.isArray((child as { children?: unknown[] }).children)) {
			decoded = (child as { children: unknown[] }).children as unknown[];
		}

		decodedChildArrays[name] = decoded;
	});

	// Build rows based on offsets
	const rows: Record<string, unknown>[] = [];
	for (let row = 0; row < offsets.length - 1; row++) {
		const start = offsets[row] ?? 0;
		const end = offsets[row + 1] ?? start;
		for (let i = start; i < end; i++) {
			const obj: Record<string, unknown> = {};
			for (const key of Object.keys(decodedChildArrays)) {
				obj[key] = decodedChildArrays[key]?.[i];
			}
			rows.push(obj);
		}
	}

	return rows;
}

/**
 * Recursively decode Apache Arrow values (LIST/STRUCT/MAP/UNION) into
 * plain JavaScript objects/arrays for display and serialization.
 */
export function decodeArrowValue(value: unknown, type?: DataType): unknown {
	if (value === null || value === undefined) return value;

	// Handle Uint32Array values from Decimal/HUGEINT columns
	// Arrow represents these as Uint32Array with 4 elements (128-bit) or 8 elements (256-bit)
	if (value instanceof Uint32Array) {
		const numeric = uint32ArrayToNumeric(value);
		// Convert BigInt to Number if within safe range
		if (typeof numeric === 'bigint') {
			return Number(numeric);
		}
		return numeric; // Already a string for large values
	}

	// Handle BigInt64Array (BIGINT - 64-bit signed integer)
	if (value instanceof BigInt64Array) {
		if (value.length === 1) {
			return bigInt64ToNumeric(value[0]);
		}
		// Multiple values - return as array
		return Array.from(value).map((v) => bigInt64ToNumeric(v));
	}

	// Handle BigUint64Array (UBIGINT - 64-bit unsigned integer)
	if (value instanceof BigUint64Array) {
		if (value.length === 1) {
			return bigUint64ToNumeric(value[0]);
		}
		// Multiple values - return as array
		return Array.from(value).map((v) => bigUint64ToNumeric(v));
	}

	// Handle Float32Array (FLOAT/REAL - 32-bit float)
	if (value instanceof Float32Array) {
		if (value.length === 1) {
			const num = float32ToNumber(value[0]);
			if (num === null) {
				trackConversionError('Float32_decode', value[0]);
				return null;
			}
			return num;
		}
		// Multiple values - return as array with NaN validation
		return Array.from(value).map((v) => {
			const num = float32ToNumber(v);
			if (num === null) {
				trackConversionError('Float32_decode', v);
			}
			return num;
		});
	}

	// Handle Float64Array (DOUBLE - 64-bit float)
	if (value instanceof Float64Array) {
		if (value.length === 1) {
			const num = float64ToNumber(value[0]);
			if (num === null) {
				trackConversionError('Float64_decode', value[0]);
				return null;
			}
			return num;
		}
		// Multiple values - return as array with NaN validation
		return Array.from(value).map((v) => {
			const num = float64ToNumber(v);
			if (num === null) {
				trackConversionError('Float64_decode', v);
			}
			return num;
		});
	}

	// Handle raw bigint values
	if (typeof value === 'bigint') {
		if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
			return value.toString();
		}
		return Number(value);
	}

	// Detect and decode Arrow JSON-like blobs (_offsets/data/children) often emitted by LIST<STRUCT>
	if (value && typeof value === 'object' && (value as { _offsets?: unknown })._offsets) {
		const decoded = decodeArrowListStructFallback(value);
		if (decoded !== null) return decoded;
	}

	if (!type) {
		if (Array.isArray(value)) return value.map((item) => decodeArrowValue(item));
		if (typeof value === 'object') return value;
		return value;
	}

	// LIST and FIXED_SIZE_LIST -> JS arrays, recursively decoded
	if (type instanceof List || type instanceof FixedSizeList) {
		const childType = type.children[0]?.type;
		const asArray =
			Array.isArray(value) || typeof (value as { toArray?: () => unknown[] }).toArray === 'function'
				? (Array.isArray(value) ? value : (value as { toArray: () => unknown[] }).toArray())
				: null;
		if (!asArray) return value;
		return asArray.map((item) => decodeArrowValue(item, childType));
	}

	// STRUCT -> keyed object
	if (type instanceof Struct) {
		const result: Record<string, unknown> = {};
		for (const child of type.children) {
			const childValue =
				value && typeof value === 'object'
					? (value as Record<string, unknown>)[child.name]
					: undefined;
			result[child.name] = decodeArrowValue(childValue, child.type);
		}
		return result;
	}

	// MAP -> array of { key, value }
	if (type instanceof Map_) {
		const structType = type.children[0]?.type as Struct | undefined;
		const keyType = structType?.children?.[0]?.type;
		const valueType = structType?.children?.[1]?.type;
		const entries =
			Array.isArray(value) || typeof (value as { toArray?: () => unknown[] }).toArray === 'function'
				? (Array.isArray(value) ? value : (value as { toArray: () => unknown[] }).toArray())
				: null;
		if (!entries) return value;

		return entries.map((entry) => {
			const key =
				entry && typeof entry === 'object'
					? (entry as Record<string, unknown>).key ??
					  (entry as Record<string, unknown>)[structType?.children?.[0]?.name ?? ''] ??
					  (entry as Record<string, unknown>)[0]
					: undefined;
			const val =
				entry && typeof entry === 'object'
					? (entry as Record<string, unknown>).value ??
					  (entry as Record<string, unknown>)[structType?.children?.[1]?.name ?? ''] ??
					  (entry as Record<string, unknown>)[1]
					: undefined;
			return {
				key: decodeArrowValue(key, keyType),
				value: decodeArrowValue(val, valueType),
			};
		});
	}

	// UNION -> pass through but decode nested value if present
	if (type instanceof Union) {
		if (value && typeof value === 'object') {
			const maybeUnion = value as { typeId?: number; value?: unknown };
			if ('value' in maybeUnion) {
				return {
					...maybeUnion,
					value: decodeArrowValue(maybeUnion.value),
				};
			}
		}
		return value;
	}

	// Primitive or unknown types: return as-is
	return value;
}

/**
 * Convenience helper: decode a value from an Arrow column at rowIndex.
 */
export function decodeArrowColumnValue(
	column: Vector | null,
	rowIndex: number,
): unknown {
	if (!column) return null;
	const type = column.type;

	// Fast paths for structured vectors using offsets/children to avoid Arrow internals leaking through
	if (type instanceof List || type instanceof FixedSizeList) {
		const child = column.getChildAt(0);
		if (!child) return null;

		let start: number | undefined;
		let end: number | undefined;

		if (type instanceof FixedSizeList) {
			start = rowIndex * type.listSize;
			end = start + type.listSize;
		} else {
			// ListVector exposes valueOffsets array
			const offsets = (column as unknown as { valueOffsets?: Int32Array }).valueOffsets;
			if (offsets) {
				start = offsets[rowIndex];
				end = offsets[rowIndex + 1];
			}
		}

		if (start !== undefined && end !== undefined) {
			const arr = [];
			for (let i = start; i < end; i++) {
				arr.push(decodeArrowColumnValue(child, i));
			}
			return arr;
		}

		// Fallback: use column.toArray() if offsets aren't available
		if (typeof (column as { toArray?: () => unknown[] }).toArray === 'function') {
			const all = (column as { toArray: () => unknown[] }).toArray();
			const v = all?.[rowIndex];
			return decodeArrowValue(v, type);
		}
	}

	if (type instanceof Map_) {
		const childStruct = column.getChildAt(0);
		if (!childStruct || !(childStruct.type instanceof Struct)) {
			return decodeArrowValue(column.get(rowIndex), type);
		}

		const offsets = (column as unknown as { valueOffsets?: Int32Array }).valueOffsets;
		if (offsets) {
			const start = offsets[rowIndex];
			const end = offsets[rowIndex + 1];
			const entries = [];
			for (let i = start; i < end; i++) {
				const keyChild = childStruct.getChildAt(0);
				const valueChild = childStruct.getChildAt(1);
				const key = decodeArrowColumnValue(keyChild, i);
				const value = decodeArrowColumnValue(valueChild, i);
				entries.push({ key, value });
			}
			return entries;
		}

		if (typeof (column as { toArray?: () => unknown[] }).toArray === 'function') {
			const all = (column as { toArray: () => unknown[] }).toArray();
			const v = all?.[rowIndex];
			return decodeArrowValue(v, type);
		}
	}

	if (type instanceof Struct) {
		const obj: Record<string, unknown> = {};
		for (let i = 0; i < type.children.length; i++) {
			const child = column.getChildAt(i);
			const name = type.children[i]?.name ?? `col_${i}`;
			obj[name] = decodeArrowColumnValue(child, rowIndex);
		}
		return obj;
	}

	// Try full column materialization as a last resort for other complex cases
	if (typeof (column as { toArray?: () => unknown[] }).toArray === 'function') {
		const all = (column as { toArray: () => unknown[] }).toArray();
		const v = all?.[rowIndex];
		const decoded = decodeArrowValue(v, type);
		if (decoded !== v) return decoded;
	}

	// Fallback: decode the raw value
	const raw = column.get(rowIndex);
	return decodeArrowValue(raw, type);
}
