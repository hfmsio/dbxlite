import { describe, it, expect } from 'vitest';
import {
	uint32ArrayToNumeric,
	bigInt64ToNumeric,
	bigUint64ToNumeric,
	float32ToNumber,
	float64ToNumber,
	validateNumeric,
	convertTypedArrayValue,
	isTypedArray,
	bigIntToSafeValue,
	applyDecimalScale,
} from './type-converters';

describe('uint32ArrayToNumeric', () => {
	it('should return 0n for empty array', () => {
		const result = uint32ArrayToNumeric(new Uint32Array([]));
		expect(result).toBe(0n);
	});

	it('should convert small positive values', () => {
		// 355 as Uint32Array(4) - the original NaN bug case
		const arr = new Uint32Array([355, 0, 0, 0]);
		const result = uint32ArrayToNumeric(arr);
		expect(result).toBe(355n);
	});

	it('should convert larger values within safe integer range', () => {
		// 1000000 as little-endian Uint32Array
		const arr = new Uint32Array([1000000, 0, 0, 0]);
		const result = uint32ArrayToNumeric(arr);
		expect(result).toBe(1000000n);
	});

	it('should handle negative values (two\'s complement)', () => {
		// -1 in 128-bit two's complement = all 1s
		const arr = new Uint32Array([0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF]);
		const result = uint32ArrayToNumeric(arr, true);
		expect(result).toBe(-1n);
	});

	it('should return string for values exceeding MAX_SAFE_INTEGER', () => {
		// A large 128-bit value
		const arr = new Uint32Array([0, 0, 1, 0]); // 2^64
		const result = uint32ArrayToNumeric(arr);
		expect(typeof result).toBe('string');
	});

	it('should handle unsigned mode (isSigned=false)', () => {
		// High bit set but unsigned
		const arr = new Uint32Array([0, 0, 0, 0x80000000]);
		const resultSigned = uint32ArrayToNumeric(arr, true);
		const resultUnsigned = uint32ArrayToNumeric(arr, false);
		// Signed should be negative, unsigned should be positive
		expect(resultSigned < 0n || (typeof resultSigned === 'string' && resultSigned.startsWith('-'))).toBe(true);
		expect(typeof resultUnsigned === 'bigint' ? resultUnsigned > 0n : !resultUnsigned.startsWith('-')).toBe(true);
	});
});

describe('bigInt64ToNumeric', () => {
	it('should convert small values to number', () => {
		expect(bigInt64ToNumeric(100n)).toBe(100);
		expect(bigInt64ToNumeric(-100n)).toBe(-100);
		expect(bigInt64ToNumeric(0n)).toBe(0);
	});

	it('should return string for values exceeding MAX_SAFE_INTEGER', () => {
		const large = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
		const result = bigInt64ToNumeric(large);
		expect(typeof result).toBe('string');
		expect(result).toBe(large.toString());
	});

	it('should return string for values below MIN_SAFE_INTEGER', () => {
		const small = BigInt(Number.MIN_SAFE_INTEGER) - 1n;
		const result = bigInt64ToNumeric(small);
		expect(typeof result).toBe('string');
		expect(result).toBe(small.toString());
	});

	it('should handle MAX_SAFE_INTEGER exactly', () => {
		const max = BigInt(Number.MAX_SAFE_INTEGER);
		const result = bigInt64ToNumeric(max);
		expect(result).toBe(Number.MAX_SAFE_INTEGER);
	});
});

describe('bigUint64ToNumeric', () => {
	it('should convert small values to number', () => {
		expect(bigUint64ToNumeric(100n)).toBe(100);
		expect(bigUint64ToNumeric(0n)).toBe(0);
	});

	it('should return string for values exceeding MAX_SAFE_INTEGER', () => {
		const large = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
		const result = bigUint64ToNumeric(large);
		expect(typeof result).toBe('string');
	});

	it('should handle max uint64 value', () => {
		const maxUint64 = 18446744073709551615n;
		const result = bigUint64ToNumeric(maxUint64);
		expect(typeof result).toBe('string');
		expect(result).toBe('18446744073709551615');
	});
});

describe('float32ToNumber', () => {
	it('should return valid numbers', () => {
		expect(float32ToNumber(3.14)).toBeCloseTo(3.14, 5);
		expect(float32ToNumber(0)).toBe(0);
		expect(float32ToNumber(-123.456)).toBeCloseTo(-123.456, 3);
	});

	it('should return null for NaN', () => {
		expect(float32ToNumber(NaN)).toBe(null);
	});

	it('should return null for Infinity', () => {
		expect(float32ToNumber(Infinity)).toBe(null);
		expect(float32ToNumber(-Infinity)).toBe(null);
	});
});

describe('float64ToNumber', () => {
	it('should return valid numbers', () => {
		expect(float64ToNumber(3.141592653589793)).toBe(3.141592653589793);
		expect(float64ToNumber(0)).toBe(0);
	});

	it('should return null for NaN', () => {
		expect(float64ToNumber(NaN)).toBe(null);
	});

	it('should return null for Infinity', () => {
		expect(float64ToNumber(Infinity)).toBe(null);
		expect(float64ToNumber(-Infinity)).toBe(null);
	});
});

describe('validateNumeric', () => {
	it('should return valid numbers unchanged', () => {
		expect(validateNumeric(42)).toBe(42);
		expect(validateNumeric(0)).toBe(0);
		expect(validateNumeric(-123.456)).toBe(-123.456);
	});

	it('should return null for NaN', () => {
		expect(validateNumeric(NaN)).toBe(null);
	});

	it('should return null for Infinity', () => {
		expect(validateNumeric(Infinity)).toBe(null);
		expect(validateNumeric(-Infinity)).toBe(null);
	});
});

describe('convertTypedArrayValue', () => {
	it('should handle Uint32Array', () => {
		const arr = new Uint32Array([100, 0, 0, 0]);
		const result = convertTypedArrayValue(arr);
		expect(result).toBe(100);
	});

	it('should handle BigInt64Array', () => {
		const arr = new BigInt64Array([100n]);
		const result = convertTypedArrayValue(arr, 0);
		expect(result).toBe(100);
	});

	it('should handle BigUint64Array', () => {
		const arr = new BigUint64Array([100n]);
		const result = convertTypedArrayValue(arr, 0);
		expect(result).toBe(100);
	});

	it('should handle Float32Array', () => {
		const arr = new Float32Array([3.14]);
		const result = convertTypedArrayValue(arr, 0);
		expect(result).toBeCloseTo(3.14, 5);
	});

	it('should handle Float64Array', () => {
		const arr = new Float64Array([3.141592653589793]);
		const result = convertTypedArrayValue(arr, 0);
		expect(result).toBe(3.141592653589793);
	});

	it('should handle Int32Array', () => {
		const arr = new Int32Array([42, -42]);
		expect(convertTypedArrayValue(arr, 0)).toBe(42);
		expect(convertTypedArrayValue(arr, 1)).toBe(-42);
	});

	it('should return null for out of bounds index', () => {
		const arr = new Int32Array([42]);
		expect(convertTypedArrayValue(arr, 10)).toBe(null);
	});

	it('should handle raw bigint', () => {
		expect(convertTypedArrayValue(100n)).toBe(100);
		expect(convertTypedArrayValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe('9007199254740992');
	});

	it('should return null for null/undefined', () => {
		expect(convertTypedArrayValue(null)).toBe(null);
		expect(convertTypedArrayValue(undefined)).toBe(null);
	});
});

describe('isTypedArray', () => {
	it('should return true for TypedArrays', () => {
		expect(isTypedArray(new Uint32Array([1]))).toBe(true);
		expect(isTypedArray(new BigInt64Array([1n]))).toBe(true);
		expect(isTypedArray(new Float64Array([1]))).toBe(true);
		expect(isTypedArray(new Int32Array([1]))).toBe(true);
		expect(isTypedArray(new Uint8Array([1]))).toBe(true);
	});

	it('should return false for non-TypedArrays', () => {
		expect(isTypedArray([1, 2, 3])).toBe(false);
		expect(isTypedArray({ length: 1 })).toBe(false);
		expect(isTypedArray(null)).toBe(false);
		expect(isTypedArray(undefined)).toBe(false);
		expect(isTypedArray(42)).toBe(false);
		expect(isTypedArray('string')).toBe(false);
	});
});

describe('bigIntToSafeValue', () => {
	it('should convert safe values to number', () => {
		expect(bigIntToSafeValue(100n)).toBe(100);
		expect(bigIntToSafeValue(-100n)).toBe(-100);
	});

	it('should convert unsafe values to string', () => {
		const large = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
		expect(bigIntToSafeValue(large)).toBe(large.toString());
	});
});

describe('applyDecimalScale', () => {
	it('should apply scale correctly', () => {
		// 1999 with scale 2 = 19.99
		expect(applyDecimalScale(1999, 2)).toBe(19.99);
		expect(applyDecimalScale('1999', 2)).toBe(19.99);
	});

	it('should handle zero scale', () => {
		expect(applyDecimalScale(100, 0)).toBe(100);
	});

	it('should handle negative scale (no effect)', () => {
		expect(applyDecimalScale(100, -1)).toBe(100);
	});

	it('should return null for invalid input', () => {
		expect(applyDecimalScale('not a number', 2)).toBe(null);
	});
});

describe('SUM aggregation bug (original issue)', () => {
	it('should correctly convert SUM result from Uint32Array', () => {
		// Simulating what Arrow returns for SUM(100, 200, 55) = 355
		// DuckDB returns HUGEINT for SUM, which Arrow represents as Uint32Array(4)
		const sumResult = new Uint32Array([355, 0, 0, 0]);
		const converted = uint32ArrayToNumeric(sumResult);

		// This was the bug - it was returning NaN
		expect(converted).toBe(355n);
		expect(Number(converted)).toBe(355);
		expect(Number.isNaN(Number(converted))).toBe(false);
	});

	it('should handle SUM with larger values', () => {
		// SUM that results in a larger number
		const sumResult = new Uint32Array([1000000, 0, 0, 0]);
		const converted = uint32ArrayToNumeric(sumResult);
		expect(converted).toBe(1000000n);
	});

	it('should handle SUM with negative result', () => {
		// Negative sum result in two's complement
		// -100 in 128-bit two's complement
		const sumResult = new Uint32Array([0xFFFFFF9C, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF]);
		const converted = uint32ArrayToNumeric(sumResult, true);
		expect(converted).toBe(-100n);
	});
});
