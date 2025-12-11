/**
 * Centralized type conversion utilities for DuckDB WASM adapter.
 * Handles TypedArray to numeric conversion, NaN validation, and error tracking.
 */

// Error tracking - only in development, completely skipped in production
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const loggedErrors = new Set<string>();

/**
 * Track type conversion errors (development only).
 * No-op in production for maximum performance.
 */
export function trackConversionError(type: string, _value: unknown): void {
	if (!isDev) return;
	if (loggedErrors.has(type)) return;
	loggedErrors.add(type);
	// Just log to console in dev - no localStorage
	console.warn(`[dbxlite] Type conversion issue: ${type}`);
}

/**
 * Validate that a numeric value is not NaN/Infinity.
 * Returns null instead of NaN to allow callers to handle gracefully.
 */
export function validateNumeric(value: number): number | null {
	if (Number.isNaN(value) || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

/**
 * Safe Number() conversion with NaN tracking.
 * Returns null if the result would be NaN or Infinity.
 */
export function safeNumber(value: unknown, fieldType?: string): number | null {
	const result = Number(value);
	if (Number.isNaN(result) || !Number.isFinite(result)) {
		trackConversionError(fieldType || 'unknown_number', value);
		return null;
	}
	return result;
}

/**
 * Convert Uint32Array (128-bit or 256-bit integer representation) to a numeric value.
 * Arrow represents Decimal/HUGEINT as Uint32Array with 4 elements (128-bit) or 8 elements (256-bit).
 *
 * @param arr - The Uint32Array containing little-endian Uint32 chunks
 * @param isSigned - Whether to interpret as signed (two's complement). Default true for HUGEINT.
 * @returns bigint for safe values, string for values exceeding MAX_SAFE_INTEGER
 */
export function uint32ArrayToNumeric(arr: Uint32Array, isSigned = true): bigint | string {
	if (arr.length === 0) return 0n;

	// Reconstruct the value from little-endian Uint32 chunks
	let result = 0n;
	for (let i = arr.length - 1; i >= 0; i--) {
		result = (result << 32n) | BigInt(arr[i] >>> 0);
	}

	// Handle signed values (check if high bit is set)
	// For 128-bit: check bit 127, for 256-bit: check bit 255
	if (isSigned) {
		const bitWidth = arr.length * 32;
		const signBit = 1n << BigInt(bitWidth - 1);
		if (result >= signBit) {
			// Negative number in two's complement
			const maxVal = 1n << BigInt(bitWidth);
			result = result - maxVal;
		}
	}

	// Return as string if too large for safe JavaScript number
	if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
		return result.toString();
	}
	return result;
}

/**
 * Convert BigInt64Array element to number or string.
 * BigInt64Array is used for BIGINT (64-bit signed integer) columns.
 */
export function bigInt64ToNumeric(value: bigint): number | string {
	if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
		return value.toString();
	}
	return Number(value);
}

/**
 * Convert BigUint64Array element to number or string.
 * BigUint64Array is used for UBIGINT (64-bit unsigned integer) columns.
 */
export function bigUint64ToNumeric(value: bigint): number | string {
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
		return value.toString();
	}
	return Number(value);
}

/**
 * Convert Float32Array element to number with NaN validation.
 */
export function float32ToNumber(value: number): number | null {
	if (Number.isNaN(value) || !Number.isFinite(value)) {
		trackConversionError('Float32', value);
		return null;
	}
	return value;
}

/**
 * Convert Float64Array element to number with NaN validation.
 */
export function float64ToNumber(value: number): number | null {
	if (Number.isNaN(value) || !Number.isFinite(value)) {
		trackConversionError('Float64', value);
		return null;
	}
	return value;
}

/**
 * Convert any TypedArray value to an appropriate JavaScript value.
 * Handles all common TypedArray types from Arrow IPC data.
 *
 * @param value - The value to convert (may be a TypedArray or single element)
 * @param index - Optional index for array access
 * @param isSigned - For Uint32Array, whether to interpret as signed (default true)
 * @returns Converted value: number, string (for large integers), or null (for invalid)
 */
export function convertTypedArrayValue(
	value: unknown,
	index?: number,
	isSigned = true
): number | string | null {
	if (value === null || value === undefined) return null;

	// Handle Uint32Array (HUGEINT, DECIMAL - 128-bit or 256-bit)
	if (value instanceof Uint32Array) {
		const numeric = uint32ArrayToNumeric(value, isSigned);
		if (typeof numeric === 'bigint') {
			return Number(numeric);
		}
		return numeric; // string for large values
	}

	// Handle BigInt64Array (BIGINT - 64-bit signed)
	if (value instanceof BigInt64Array) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return bigInt64ToNumeric(value[idx]);
		}
		return null;
	}

	// Handle BigUint64Array (UBIGINT - 64-bit unsigned)
	if (value instanceof BigUint64Array) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return bigUint64ToNumeric(value[idx]);
		}
		return null;
	}

	// Handle Float32Array (FLOAT/REAL - 32-bit float)
	if (value instanceof Float32Array) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return float32ToNumber(value[idx]);
		}
		return null;
	}

	// Handle Float64Array (DOUBLE - 64-bit float)
	if (value instanceof Float64Array) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return float64ToNumber(value[idx]);
		}
		return null;
	}

	// Handle Int32Array, Int16Array, Int8Array (safe to convert directly)
	if (
		value instanceof Int32Array ||
		value instanceof Int16Array ||
		value instanceof Int8Array
	) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return value[idx];
		}
		return null;
	}

	// Handle Uint16Array, Uint8Array (safe to convert directly)
	if (value instanceof Uint16Array || value instanceof Uint8Array) {
		const idx = index ?? 0;
		if (idx < value.length) {
			return value[idx];
		}
		return null;
	}

	// Handle raw bigint
	if (typeof value === 'bigint') {
		if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
			return value.toString();
		}
		return Number(value);
	}

	// Not a TypedArray - return as-is if number, null otherwise
	if (typeof value === 'number') {
		return validateNumeric(value);
	}

	return null;
}

/**
 * Check if a value is any kind of TypedArray.
 */
export function isTypedArray(value: unknown): boolean {
	return (
		value instanceof Uint32Array ||
		value instanceof BigInt64Array ||
		value instanceof BigUint64Array ||
		value instanceof Float32Array ||
		value instanceof Float64Array ||
		value instanceof Int32Array ||
		value instanceof Int16Array ||
		value instanceof Int8Array ||
		value instanceof Uint16Array ||
		value instanceof Uint8Array ||
		value instanceof Uint8ClampedArray
	);
}

/**
 * Convert BigInt to Number safely, preserving precision for large values as strings.
 */
export function bigIntToSafeValue(value: bigint): number | string {
	if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
		return value.toString();
	}
	return Number(value);
}

/**
 * Apply decimal scale to an unscaled integer value.
 *
 * @param unscaledValue - The unscaled integer (as string or number)
 * @param scale - The decimal scale (number of decimal places)
 * @returns The scaled number value
 */
export function applyDecimalScale(unscaledValue: string | number, scale: number): number | null {
	if (scale <= 0) {
		const num = typeof unscaledValue === 'string' ? Number(unscaledValue) : unscaledValue;
		return validateNumeric(num);
	}

	const divisor = Math.pow(10, scale);
	const unscaled = typeof unscaledValue === 'string' ? Number(unscaledValue) : unscaledValue;
	const result = unscaled / divisor;

	if (Number.isNaN(result) || !Number.isFinite(result)) {
		trackConversionError('Decimal_scale', { unscaledValue, scale });
		return null;
	}

	return result;
}
