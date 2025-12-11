/**
 * Comprehensive Data Formatting Utilities
 *
 * Type-aware formatters for displaying database values in a human-readable
 * and industry-standard format across all components.
 */

import type { CellValue } from "../types/table";
import { DataType, getTypeCategory, TypeCategory } from "./dataTypes";
import { createLogger } from "./logger";

const logger = createLogger("Formatters");

// Apache Arrow-like interfaces for type safety
interface ArrowVectorLike {
	toArray?: () => unknown[];
	toJSON?: () => unknown;
	data?: unknown[];
	get?: (index: number) => unknown;
	length?: number;
	[key: string]: unknown;
}

/**
 * Helpers to decode Arrow JSON-like blobs (LIST<STRUCT>) that can leak through
 * as objects with `_offsets` and `data[0].children[...]` when not pre-decoded.
 */
function toNumberArray(input: unknown): number[] | null {
	if (input === null || input === undefined) return null;
	if (Array.isArray(input)) return input.map((n) => Number(n));
	if (input instanceof Int32Array || input instanceof Uint32Array) {
		return Array.from(input);
	}
	if (typeof input === "object") {
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

/**
 * Format a large integer string with thousand separators.
 * Used for BIGINT/HUGEINT values that exceed JavaScript's safe integer range.
 */
function formatLargeIntString(value: string): string {
	// Handle negative numbers
	const isNegative = value.startsWith("-");
	const absValue = isNegative ? value.slice(1) : value;

	// Add thousand separators from right to left
	let result = "";
	for (let i = absValue.length - 1, count = 0; i >= 0; i--, count++) {
		if (count > 0 && count % 3 === 0) {
			result = "," + result;
		}
		result = absValue[i] + result;
	}

	return isNegative ? "-" + result : result;
}

function decodeUtf8FromOffsets(offsets: number[], valuesLike: unknown): string[] {
	const result: string[] = [];
	// Handle case where valuesLike is already an array (Array.values is a method, not a property)
	const rawValues = Array.isArray(valuesLike)
		? valuesLike
		: (valuesLike as Record<string, unknown>)?.values ?? valuesLike;
	const byteValues = toNumberArray(rawValues);
	if (!byteValues) return result;

	for (let i = 0; i < offsets.length - 1; i++) {
		const start = offsets[i] ?? 0;
		const end = offsets[i + 1] ?? start;
		const slice = byteValues.slice(start, end);
		result.push(new TextDecoder().decode(new Uint8Array(slice)));
	}
	return result;
}

function decodeArrowJsonListStruct(raw: unknown): unknown[] | null {
	// Shape: { _offsets: [...], data: [{ type: { children: [...] }, children: [...] }] }
	if (!raw || typeof raw !== "object") return null;
	const offsets = toNumberArray((raw as { _offsets?: unknown })._offsets);
	const data0 = Array.isArray((raw as { data?: unknown[] }).data)
		? (raw as { data: unknown[] }).data[0]
		: null;
	if (!offsets || !data0 || typeof data0 !== "object") return null;

	const children = (data0 as { children?: unknown[] }).children;
	// Case 1: LIST<primitive> encoded directly on data0
	if (!Array.isArray(children) || children.length === 0) {
		const valueOffsets = toNumberArray(
			(data0 as { valueOffsets?: unknown }).valueOffsets,
		);
		if (valueOffsets && (data0 as { values?: unknown }).values !== undefined) {
			const decoded = decodeUtf8FromOffsets(
				valueOffsets,
				(data0 as { values?: unknown }).values,
			);
			// Build rows based on outer offsets
			const rows: unknown[] = [];
			for (let row = 0; row < offsets.length - 1; row++) {
				const start = offsets[row] ?? 0;
				const end = offsets[row + 1] ?? start;
				for (let i = start; i < end; i++) {
					rows.push(decoded[i]);
				}
			}
			return rows;
		}
		return null;
	}

	const typeChildren =
		(data0 as { type?: { children?: { name?: string }[] } }).type?.children;

	const decodedChildArrays: Record<string, unknown[]> = {};

	children.forEach((child, idx) => {
		const name =
			typeChildren?.[idx]?.name ??
			(child as { name?: string }).name ??
			`col_${idx}`;
		let decoded: unknown[] = [];

		const valueOffsets = toNumberArray(
			(child as { valueOffsets?: unknown }).valueOffsets,
		);
		if (valueOffsets && (child as { values?: unknown }).values !== undefined) {
			decoded = decodeUtf8FromOffsets(
				valueOffsets,
				(child as { values?: unknown }).values,
			);
		} else if ((child as { values?: unknown }).values !== undefined) {
			decoded = toNumberArray((child as { values?: unknown }).values) ?? [];
		} else if (Array.isArray((child as { children?: unknown[] }).children)) {
			decoded = (child as { children: unknown[] }).children;
		}

		decodedChildArrays[name] = decoded;
	});

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

// Recursively decode any nested Arrow JSON blobs inside objects/arrays
function deepDecodeArrowJson(value: unknown): unknown {
	if (value === null || value === undefined) return value;

	// Direct blob detection
	if (
		typeof value === "object" &&
		(value as { _offsets?: unknown })._offsets &&
		(value as { data?: unknown }).data
	) {
		const decoded = decodeArrowJsonListStruct(value);
		if (decoded) return decoded.map((v) => deepDecodeArrowJson(v));
	}

	if (Array.isArray(value)) {
		return value.map((item) => deepDecodeArrowJson(item));
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			result[k] = deepDecodeArrowJson(v);
		}
		return result;
	}

	return value;
}

export interface FormatterOptions {
	dateFormat?: "iso" | "short" | "medium" | "long" | "full";
	timeFormat?: "12h" | "24h";
	decimalPlaces?: number;
	nullDisplay?: string;
	booleanDisplay?: "text" | "icon" | "numeric";
	timestampPrecision?:
		| "seconds"
		| "milliseconds"
		| "microseconds"
		| "nanoseconds";
}

const DEFAULT_OPTIONS: FormatterOptions = {
	dateFormat: "iso",
	timeFormat: "24h",
	decimalPlaces: 2,
	nullDisplay: "NULL",
	booleanDisplay: "text",
	timestampPrecision: "milliseconds",
};

/**
 * Main formatting function - routes to appropriate formatter based on data type
 */
export function formatValue(
	value: CellValue,
	dataType: DataType,
	options: FormatterOptions = {},
): string {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	// Handle null/undefined
	if (value === null || value === undefined) {
		return opts.nullDisplay!;
	}

	const category = getTypeCategory(dataType);

	switch (category) {
		case TypeCategory.NUMERIC:
			return formatNumeric(value, dataType, opts);
		case TypeCategory.BOOLEAN:
			return formatBoolean(value, opts);
		case TypeCategory.TEMPORAL:
			return formatTemporal(value, dataType, opts);
		case TypeCategory.BINARY:
			return formatBinary(value, opts);
		case TypeCategory.COMPLEX:
			return formatComplex(value, dataType, opts);
		case TypeCategory.SPATIAL:
			return formatSpatial(value, opts);
		case TypeCategory.STRING:
			return formatString(value);
		default:
			return String(value);
	}
}

/**
 * Format numeric values with proper precision and readability
 */
function formatNumeric(
	value: CellValue,
	dataType: DataType,
	options: FormatterOptions,
): string {
	// Handle special numeric values
	if (typeof value === "number") {
		if (Number.isNaN(value)) return "NaN";
		if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
	}

	// Handle BigInt
	if (typeof value === "bigint") {
		return value.toLocaleString();
	}

	// Note: DECIMAL values are now properly formatted in the worker with correct scale applied

	// Convert to number if it's a string
	const numValue =
		typeof value === "string" ? parseFloat(value) : Number(value);

	// For decimal/numeric types, preserve precision
	if (dataType === DataType.DECIMAL || dataType === DataType.NUMERIC) {
		// If the value is already a string from the connector, preserve precision
		if (typeof value === "string" && !Number.isNaN(parseFloat(value))) {
			// For large integers (HUGEINT), add comma formatting
			if (/^-?\d+$/.test(value)) {
				return formatLargeIntString(value);
			}
			// For decimals with fractional parts, return as-is
			return value;
		}
		// Otherwise format with decimal places
		return numValue.toLocaleString(undefined, {
			minimumFractionDigits: 0,
			maximumFractionDigits: options.decimalPlaces,
		});
	}

	// For floating point, detect scientific notation needs
	if (dataType === DataType.FLOAT || dataType === DataType.DOUBLE) {
		if (Math.abs(numValue) < 0.0001 && numValue !== 0) {
			return numValue.toExponential(4);
		}
		if (Math.abs(numValue) > 1e10) {
			return numValue.toExponential(4);
		}
		return numValue.toLocaleString(undefined, {
			minimumFractionDigits: 0,
			maximumFractionDigits: 6,
		});
	}

	// For integers, handle large values passed as strings (BIGINT/HUGEINT precision preservation)
	if (typeof value === "string" && /^-?\d+$/.test(value)) {
		return formatLargeIntString(value);
	}
	return numValue.toLocaleString();
}

/**
 * Format boolean values
 */
function formatBoolean(value: CellValue, options: FormatterOptions): string {
	const boolValue = Boolean(value);

	if (options.booleanDisplay === "icon") {
		return boolValue ? "✓" : "✗";
	} else if (options.booleanDisplay === "numeric") {
		return boolValue ? "1" : "0";
	}

	return boolValue ? "true" : "false";
}

/**
 * Format temporal values (dates, times, timestamps)
 */
function formatTemporal(
	value: CellValue,
	dataType: DataType,
	options: FormatterOptions,
): string {
	// Special case: If value is already a string in ISO date format (YYYY-MM-DD) and we want ISO format,
	// return it as-is to avoid timezone conversion issues
	if (
		dataType === DataType.DATE &&
		typeof value === "string" &&
		options.dateFormat === "iso"
	) {
		const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (isoDateRegex.test(value)) {
			return value;
		}
	}

	// Special case: TIME type with numeric value is microseconds since midnight (not a Unix timestamp)
	if (dataType === DataType.TIME && (typeof value === "number" || typeof value === "bigint")) {
		const totalMicros = typeof value === "bigint" ? Number(value) : value;
		const totalSeconds = Math.floor(totalMicros / 1_000_000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const micros = totalMicros % 1_000_000;

		const hh = String(hours).padStart(2, "0");
		const mm = String(minutes).padStart(2, "0");
		const ss = String(seconds).padStart(2, "0");

		// Include microseconds if non-zero
		if (micros > 0) {
			const us = String(micros).padStart(6, "0").replace(/0+$/, ""); // trim trailing zeros
			return `${hh}:${mm}:${ss}.${us}`;
		}
		return `${hh}:${mm}:${ss}`;
	}

	let date: Date | null = null;

	// Parse the value into a Date object
	if (value instanceof Date) {
		date = value;
	} else if (value && typeof value.valueOf === "function") {
		// Fallback: try valueOf() method for date-like objects
		try {
			const ms = value.valueOf();
			if (typeof ms === "number" && !Number.isNaN(ms)) {
				date = new Date(ms);
			}
		} catch (_e) {
			// Fall through to other parsing methods
		}
	}

	if (!date && value instanceof Date) {
		date = value;
	} else if (typeof value === "number") {
		// Handle Unix timestamps (could be seconds, milliseconds, microseconds, or nanoseconds)
		if (dataType === DataType.TIMESTAMP_S || value < 1e11) {
			// Seconds (timestamp less than year 5138)
			date = new Date(value * 1000);
		} else if (dataType === DataType.TIMESTAMP_MS || value < 1e14) {
			// Milliseconds (timestamp less than year 5138)
			date = new Date(value);
		} else if (dataType === DataType.TIMESTAMP_NS) {
			// Nanoseconds - convert to milliseconds
			date = new Date(value / 1_000_000);
		} else {
			// Microseconds
			date = new Date(value / 1000);
		}
	} else if (typeof value === "bigint") {
		// BigInt timestamps (likely nanoseconds or microseconds)
		const bigIntValue = Number(value);
		if (bigIntValue > 1e15) {
			// Nanoseconds
			date = new Date(bigIntValue / 1_000_000);
		} else {
			// Microseconds
			date = new Date(bigIntValue / 1000);
		}
	} else if (typeof value === "string") {
		// Try parsing ISO string or other formats
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) {
			date = new Date(parsed);
		} else {
			// Return as-is if we can't parse
			return value;
		}
	}

	if (!date || Number.isNaN(date.getTime())) {
		return String(value);
	}

	// Format based on data type
	switch (dataType) {
		case DataType.DATE:
			return formatDate(date, options.dateFormat);

		case DataType.TIME:
			return formatTime(date, options.timeFormat);

		case DataType.DATETIME:
			return `${formatDate(date, options.dateFormat)} ${formatTime(date, options.timeFormat)}`;

		case DataType.TIMESTAMP:
		case DataType.TIMESTAMP_S:
		case DataType.TIMESTAMP_MS:
		case DataType.TIMESTAMP_NS:
		case DataType.TIMESTAMPTZ:
			return formatTimestamp(date, options);

		case DataType.INTERVAL:
			// For intervals, display as-is (would need more complex parsing)
			return String(value);

		default:
			return date.toISOString();
	}
}

/**
 * Format date portion
 */
function formatDate(date: Date, format: string = "iso"): string {
	// ISO format: YYYY-MM-DD
	if (format === "iso") {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	// Locale-based formats
	const options: Intl.DateTimeFormatOptions = {};

	switch (format) {
		case "short":
			options.year = "2-digit";
			options.month = "numeric";
			options.day = "numeric";
			break;
		case "medium":
			options.year = "numeric";
			options.month = "short";
			options.day = "numeric";
			break;
		case "long":
			options.year = "numeric";
			options.month = "long";
			options.day = "numeric";
			break;
		case "full":
			options.weekday = "long";
			options.year = "numeric";
			options.month = "long";
			options.day = "numeric";
			break;
	}

	return date.toLocaleDateString(undefined, options);
}

/**
 * Format time portion
 */
function formatTime(date: Date, format: string = "24h"): string {
	const options: Intl.DateTimeFormatOptions = {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: format === "12h",
	};

	return date.toLocaleTimeString(undefined, options);
}

/**
 * Format timestamp with timezone
 */
function formatTimestamp(date: Date, options: FormatterOptions): string {
	const dateStr = formatDate(date, options.dateFormat);
	const timeStr = formatTime(date, options.timeFormat);

	// Add milliseconds for more precision if needed
	let precision = "";
	if (options.timestampPrecision === "milliseconds") {
		precision = `.${date.getMilliseconds().toString().padStart(3, "0")}`;
	}

	// Get timezone offset
	const tzOffset = -date.getTimezoneOffset();
	const tzHours = Math.floor(Math.abs(tzOffset) / 60);
	const tzMinutes = Math.abs(tzOffset) % 60;
	const tzSign = tzOffset >= 0 ? "+" : "-";
	const tz = `UTC${tzSign}${tzHours.toString().padStart(2, "0")}:${tzMinutes.toString().padStart(2, "0")}`;

	return `${dateStr} ${timeStr}${precision} ${tz}`;
}

/**
 * Format binary data
 */
function formatBinary(value: CellValue, _options: FormatterOptions): string {
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
		const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
		// Show first few bytes in hex
		const hexStr = Array.from(bytes.slice(0, 8))
			.filter((b): b is number => b !== undefined)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join(" ");
		const suffix = bytes.length > 8 ? "..." : "";
		return `0x${hexStr}${suffix} (${bytes.length} bytes)`;
	}

	// If it's a base64 string or hex string
	if (typeof value === "string") {
		if (value.startsWith("0x")) {
			return `${value.slice(0, 20)}... (hex)`;
		}
		return `${value.slice(0, 20)}... (${value.length} chars)`;
	}

	return String(value);
}

/**
 * Helper function to unwrap values that have been double-stringified
 * e.g., "\"0\"" becomes 0 or "0"
 *
 * Uses iterative approach to avoid stack overflow on deeply nested objects
 */
function unwrapStringifiedValues(obj: unknown, maxDepth = 10): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}

	// For primitives, return as-is
	if (typeof obj !== "object") {
		return obj;
	}

	// Use iterative approach with explicit stack to avoid stack overflow
	const isRootArray = Array.isArray(obj);
	const root: unknown[] | Record<string, unknown> = isRootArray ? [] : {};

	// Stack entries: [source, target, key, depth]
	type StackEntry = [unknown, unknown[] | Record<string, unknown>, string | number, number];
	const stack: StackEntry[] = [];

	// Initialize stack with root object's children
	if (Array.isArray(obj)) {
		for (let i = obj.length - 1; i >= 0; i--) {
			stack.push([obj[i], root as unknown[], i, 0]);
		}
	} else {
		const keys = Object.keys(obj);
		for (let i = keys.length - 1; i >= 0; i--) {
			const key = keys[i];
			stack.push([(obj as Record<string, unknown>)[key], root as Record<string, unknown>, key, 0]);
		}
	}

	while (stack.length > 0) {
		const entry = stack.pop();
		if (!entry) continue;

		const [value, target, key, depth] = entry;

		// Depth limit to prevent infinite loops
		if (depth > maxDepth) {
			if (Array.isArray(target)) {
				target[key as number] = value;
			} else {
				target[key as string] = value;
			}
			continue;
		}

		// Handle null/undefined
		if (value === null || value === undefined) {
			if (Array.isArray(target)) {
				target[key as number] = value;
			} else {
				target[key as string] = value;
			}
			continue;
		}

		// Handle primitives
		if (typeof value !== "object") {
			// Check if string looks like JSON and try to parse it
			if (typeof value === "string" && (value.startsWith('"') || value.startsWith("{"))) {
				try {
					const parsed = JSON.parse(value);
					// If successfully parsed to an object, add it to stack for further processing
					if (typeof parsed === "object" && parsed !== null) {
						const isArray = Array.isArray(parsed);
						const newTarget: unknown[] | Record<string, unknown> = isArray ? [] : {};
						if (Array.isArray(target)) {
							target[key as number] = newTarget;
						} else {
							target[key as string] = newTarget;
						}
						// Add children to stack
						if (isArray) {
							for (let i = parsed.length - 1; i >= 0; i--) {
								stack.push([parsed[i], newTarget as unknown[], i, depth + 1]);
							}
						} else {
							const parsedKeys = Object.keys(parsed);
							for (let i = parsedKeys.length - 1; i >= 0; i--) {
								const k = parsedKeys[i];
								stack.push([parsed[k], newTarget as Record<string, unknown>, k, depth + 1]);
							}
						}
					} else {
						// Parsed to primitive
						if (Array.isArray(target)) {
							target[key as number] = parsed;
						} else {
							target[key as string] = parsed;
						}
					}
				} catch {
					// Not valid JSON, keep original value
					if (Array.isArray(target)) {
						target[key as number] = value;
					} else {
						target[key as string] = value;
					}
				}
			} else {
				if (Array.isArray(target)) {
					target[key as number] = value;
				} else {
					target[key as string] = value;
				}
			}
			continue;
		}

		// Handle arrays
		if (Array.isArray(value)) {
			const newArr: unknown[] = [];
			if (Array.isArray(target)) {
				target[key as number] = newArr;
			} else {
				target[key as string] = newArr;
			}
			for (let i = value.length - 1; i >= 0; i--) {
				stack.push([value[i], newArr, i, depth + 1]);
			}
			continue;
		}

		// Handle objects
		const newObj: Record<string, unknown> = {};
		if (Array.isArray(target)) {
			target[key as number] = newObj;
		} else {
			target[key as string] = newObj;
		}
		const objKeys = Object.keys(value);
		for (let i = objKeys.length - 1; i >= 0; i--) {
			const k = objKeys[i];
			stack.push([(value as Record<string, unknown>)[k], newObj, k, depth + 1]);
		}
	}

	return root;
}

// Maximum string length for formatted output to prevent browser crashes
const MAX_FORMAT_LENGTH = 10000;

/**
 * Safely stringify an object with size limits to prevent browser crashes
 */
function safeStringify(obj: unknown, maxLength = MAX_FORMAT_LENGTH): string {
	try {
		const result = JSON.stringify(obj, null, 0);
		if (result && result.length > maxLength) {
			return result.slice(0, maxLength - 3) + "...";
		}
		return result;
	} catch {
		return "[Object too large to display]";
	}
}

/**
 * Format complex types (arrays, structs, JSON)
 * Uses defensive coding to prevent crashes on malformed or oversized data
 */
function formatComplex(
	value: CellValue,
	dataType: DataType,
	_options: FormatterOptions,
): string {
	// Wrap everything in try-catch as a safety net
	try {
		// If we got Arrow JSON blobs (including nested), decode them before anything else
		value = deepDecodeArrowJson(value) as CellValue;

		if (dataType === DataType.JSON) {
			try {
				const obj = typeof value === "string" ? JSON.parse(value) : value;
				return safeStringify(obj);
			} catch {
				return String(value).slice(0, MAX_FORMAT_LENGTH);
			}
		}

		if (dataType === DataType.ARRAY || dataType === DataType.LIST) {
			// Check if value is already a JSON string
			if (typeof value === "string") {
				try {
					const parsed = JSON.parse(value);
					if (Array.isArray(parsed)) {
						value = parsed;
					}
				} catch {
					// Not valid JSON, keep as string
				}
			}

			// Handle Apache Arrow Vector objects that aren't plain arrays
			if (!Array.isArray(value) && typeof value === "object" && value !== null) {
				const arrowValue = value as ArrowVectorLike;
				// Try toArray() method first (Arrow Vector API)
				if (typeof arrowValue.toArray === "function") {
					try {
						value = arrowValue.toArray();
					} catch (e) {
						logger.warn("Failed to convert Arrow Vector with toArray()", e);
					}
				}
				// Try toJSON() method
				else if (typeof arrowValue.toJSON === "function") {
					try {
						value = arrowValue.toJSON();
					} catch (e) {
						logger.warn("Failed to convert with toJSON()", e);
					}
				}
				// Handle Apache Arrow Vector structure: {_offsets, data, type, stride, numChildren, length}
				else if (arrowValue.data && Array.isArray(arrowValue.data)) {
					// Extract the actual data from Arrow Vector
					const arrowData = arrowValue.data[0] as Record<string, unknown> | unknown[];

					if (Array.isArray(arrowData)) {
						value = arrowData;
					} else if (arrowData && typeof arrowData === "object") {
						// Check if data[0] has valueOffsets (VARCHAR[] structure)
						if (
							arrowData.valueOffsets &&
							arrowData.values &&
							arrowData.length !== undefined
						) {
							try {
								const arr = [];
								const len = arrowData.length;
								const offsets = arrowData.valueOffsets;
								const bytes = arrowData.values;

								// Extract each string by decoding UTF-8 bytes between offsets
								for (let i = 0; i < len; i++) {
									const startOffset = offsets[i];
									const endOffset = offsets[i + 1];
									if (startOffset !== undefined && endOffset !== undefined) {
										// Extract bytes for this string
										const strBytes = [];
										for (let j = startOffset; j < endOffset; j++) {
											if (bytes[j] !== undefined) {
												strBytes.push(bytes[j]);
											}
										}
										// Decode UTF-8 bytes to string
										const str = new TextDecoder().decode(
											new Uint8Array(strBytes),
										);
										arr.push(str);
									}
								}
								if (arr.length > 0) {
									value = arr;
								}
							} catch (e) {
								logger.warn("Failed to extract VARCHAR[] with offsets", e);
							}
						}
						// Check if data[0] has a 'values' property (nested Arrow structure)
						else if (arrowData.values) {
							if (Array.isArray(arrowData.values)) {
								value = arrowData.values;
							} else if (typeof arrowData.values === "object") {
								// values might be an object with numeric keys
								const keys = Object.keys(arrowData.values);
								if (keys.every((k) => !Number.isNaN(Number(k)))) {
									value = Object.values(arrowData.values);
								}
							}
						}
						// Otherwise check if data[0] has numeric keys
						else {
							const keys = Object.keys(arrowData);
							if (keys.every((k) => !Number.isNaN(Number(k)))) {
								value = Object.values(arrowData);
							}
						}
					}
				}
				// Try .get() method with .length property (Arrow Vector API for indexed access)
				else if (
					typeof arrowValue.get === "function" &&
					typeof arrowValue.length === "number"
				) {
					try {
						const arr = [];
						const len = arrowValue.length;
						for (let i = 0; i < len; i++) {
							arr.push(arrowValue.get(i));
						}
						value = arr;
					} catch (e) {
						logger.warn("Failed to extract with .get() method", e);
					}
				}
				// Try numeric keys as fallback (object with 0, 1, 2, ... and possibly 'length')
				else if (typeof value === "object" && value !== null) {
					const keys = Object.keys(value);
					const numericKeys = keys.filter((k) => !Number.isNaN(Number(k)));
					// If we have numeric keys, extract as array
					if (numericKeys.length > 0) {
						const arr = [];
						// Use length property if available, otherwise use max numeric key + 1
						const len =
							arrowValue.length !== undefined
								? arrowValue.length
								: numericKeys.length;
						for (let i = 0; i < len; i++) {
							if (arrowValue[i] !== undefined) {
								arr.push(arrowValue[i]);
							}
						}
						if (arr.length > 0) {
							value = arr;
						}
					}
				}
			}

			if (Array.isArray(value)) {
				// Format as compact array with size limit
				const maxItems = 100; // Limit to prevent huge arrays from crashing
				const items = value.slice(0, maxItems);
				const formatted = items.map((v) => {
					if (v === null) return "null";
					if (typeof v === "object") return safeStringify(v, 500);
					return String(v).slice(0, 500);
				});
				const suffix = value.length > maxItems ? `, ... +${value.length - maxItems} more` : "";
				return `[${formatted.join(", ")}${suffix}]`;
			}

			// If still an object after extraction attempts, try JSON.stringify as fallback
			if (typeof value === "object" && value !== null) {
				return safeStringify(value);
			}

			return String(value).slice(0, MAX_FORMAT_LENGTH);
		}

		if (dataType === DataType.STRUCT || dataType === DataType.MAP) {
			// Check if value is already a JSON string
			if (typeof value === "string") {
				try {
					// Try to parse it first to validate and then re-stringify cleanly
					const parsed = JSON.parse(value);
					return safeStringify(parsed);
				} catch {
					// Not valid JSON, return as-is
					return value.slice(0, MAX_FORMAT_LENGTH);
				}
			}

			if (typeof value === "object" && value !== null) {
				try {
					// Deep process the object to unwrap any string-wrapped values
					const unwrapped = unwrapStringifiedValues(value);
					return safeStringify(unwrapped);
				} catch (_e) {
					// If stringify fails, try to extract something useful
					try {
						// Try to convert to a plain object if it has toJSON method
						const objWithToJSON = value as ArrowVectorLike;
						if (typeof objWithToJSON.toJSON === "function") {
							const plainObj = objWithToJSON.toJSON();
							return safeStringify(plainObj);
						}
						// Try to get object keys and show as key-value pairs
						const keys = Object.keys(value);
						if (keys.length > 0) {
							const pairs = keys.slice(0, 5).map((k) => `${k}: ${(value as Record<string, unknown>)[k]}`);
							return `{${pairs.join(", ")}}${keys.length > 5 ? "..." : ""}`;
						}
					} catch {}
					// Last resort: show object type
					return `[${value.constructor?.name || "Object"}]`;
				}
			}
			return String(value).slice(0, MAX_FORMAT_LENGTH);
		}

		return String(value).slice(0, MAX_FORMAT_LENGTH);
	} catch (e) {
		// Safety net: if anything goes wrong, return a safe fallback
		logger.warn("formatComplex failed:", e);
		return "[Error formatting value]";
	}
}

/**
 * Format spatial types
 */
function formatSpatial(value: CellValue, _options: FormatterOptions): string {
	// Spatial types are usually stored as WKT (Well-Known Text) or GeoJSON
	if (typeof value === "string") {
		// If it's WKT, show abbreviated version
		if (
			value.startsWith("POINT") ||
			value.startsWith("LINESTRING") ||
			value.startsWith("POLYGON")
		) {
			return value.length > 50 ? `${value.slice(0, 50)}...` : value;
		}
	}

	if (typeof value === "object") {
		try {
			// If it's GeoJSON, stringify
			return JSON.stringify(value, null, 0);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

/**
 * Format string values
 */
function formatString(value: CellValue): string {
	const str = String(value);

	// Detect and format special string types

	// UUID
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (uuidRegex.test(str)) {
		return str;
	}

	// URL
	try {
		new URL(str);
		return str; // Could add link styling in the future
	} catch {
		// Not a URL
	}

	// Email
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (emailRegex.test(str)) {
		return str;
	}

	// IP address
	const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
	if (ipRegex.test(str)) {
		return str;
	}

	return str;
}

/**
 * Format a number in compact notation for display
 * - Numbers < 10,000: show actual number with locale formatting
 * - Numbers >= 10,000: show as K (thousands)
 * - Numbers >= 1,000,000: show as M (millions)
 * - Numbers >= 1,000,000,000: show as B (billions)
 */
export function formatCompactNumber(num: number): string {
	if (num < 10_000) {
		return num.toLocaleString();
	}
	if (num < 1_000_000) {
		const k = num / 1_000;
		return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
	}
	if (num < 1_000_000_000) {
		const m = num / 1_000_000;
		return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
	}
	const b = num / 1_000_000_000;
	return `${b >= 100 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, "")}B`;
}

/**
 * Attempt to infer data type from value when type info is missing
 * This is a fallback and should not be relied upon as the primary type detection
 */
export function inferTypeFromValue(value: CellValue): DataType {
	if (value === null || value === undefined) {
		return DataType.NULL;
	}

	const jsType = typeof value;

	if (jsType === "boolean") {
		return DataType.BOOLEAN;
	}

	if (jsType === "number") {
		if (Number.isInteger(value)) {
			return DataType.INTEGER;
		}
		return DataType.DOUBLE;
	}

	if (jsType === "bigint") {
		return DataType.BIGINT;
	}

	if (jsType === "string") {
		const strValue = value as string;
		// Try to detect timestamps (ISO 8601)
		const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
		if (isoRegex.test(strValue)) {
			return DataType.TIMESTAMP;
		}

		// Try to detect dates (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (dateRegex.test(strValue)) {
			return DataType.DATE;
		}

		// Try to detect time (HH:MM:SS)
		const timeRegex = /^\d{2}:\d{2}:\d{2}/;
		if (timeRegex.test(strValue)) {
			return DataType.TIME;
		}

		return DataType.VARCHAR;
	}

	if (value instanceof Date) {
		return DataType.TIMESTAMP;
	}

	if (Array.isArray(value)) {
		return DataType.ARRAY;
	}

	if (jsType === "object") {
		if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
			return DataType.BLOB;
		}
		return DataType.JSON;
	}

	return DataType.UNKNOWN;
}
