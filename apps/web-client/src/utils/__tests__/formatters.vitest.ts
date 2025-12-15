import { describe, it, expect } from "vitest";
import { formatValue, inferTypeFromValue } from "../formatters";
import { DataType } from "../dataTypes";

describe("formatValue", () => {
	describe("null/undefined handling", () => {
		it("formats null as NULL", () => {
			expect(formatValue(null, DataType.VARCHAR)).toBe("NULL");
		});

		it("formats undefined as NULL", () => {
			expect(formatValue(undefined, DataType.VARCHAR)).toBe("NULL");
		});

		it("uses custom null display", () => {
			expect(
				formatValue(null, DataType.VARCHAR, { nullDisplay: "N/A" }),
			).toBe("N/A");
		});
	});

	describe("numeric formatting", () => {
		it("formats integers with locale string", () => {
			const result = formatValue(1234567, DataType.INTEGER);
			// Check it contains digits (locale-dependent separators)
			expect(result).toMatch(/1.*234.*567/);
		});

		it("formats NaN", () => {
			expect(formatValue(NaN, DataType.DOUBLE)).toBe("NaN");
		});

		it("formats positive infinity", () => {
			expect(formatValue(Infinity, DataType.DOUBLE)).toBe("∞");
		});

		it("formats negative infinity", () => {
			expect(formatValue(-Infinity, DataType.DOUBLE)).toBe("-∞");
		});

		it("formats BigInt", () => {
			const result = formatValue(BigInt(9007199254740991), DataType.BIGINT);
			expect(result).toMatch(/9.*007.*199.*254.*740.*991/);
		});

		it("preserves decimal string precision", () => {
			expect(formatValue("123.456789", DataType.DECIMAL)).toBe("123.456789");
		});

		it("formats floats with scientific notation for small values", () => {
			const result = formatValue(0.00001, DataType.DOUBLE);
			expect(result).toMatch(/1.*e-/i);
		});

		it("formats floats with scientific notation for large values", () => {
			const result = formatValue(1e15, DataType.DOUBLE);
			expect(result).toMatch(/1.*e\+/i);
		});
	});

	describe("boolean formatting", () => {
		it("formats true as text", () => {
			expect(formatValue(true, DataType.BOOLEAN)).toBe("true");
		});

		it("formats false as text", () => {
			expect(formatValue(false, DataType.BOOLEAN)).toBe("false");
		});

		it("formats boolean as icon", () => {
			expect(
				formatValue(true, DataType.BOOLEAN, { booleanDisplay: "icon" }),
			).toBe("✓");
			expect(
				formatValue(false, DataType.BOOLEAN, { booleanDisplay: "icon" }),
			).toBe("✗");
		});

		it("formats boolean as numeric", () => {
			expect(
				formatValue(true, DataType.BOOLEAN, { booleanDisplay: "numeric" }),
			).toBe("1");
			expect(
				formatValue(false, DataType.BOOLEAN, { booleanDisplay: "numeric" }),
			).toBe("0");
		});
	});

	describe("temporal formatting", () => {
		it("preserves ISO date strings", () => {
			expect(formatValue("2024-01-15", DataType.DATE)).toBe("2024-01-15");
		});

		it("formats Date object to ISO date", () => {
			const date = new Date(2024, 0, 15); // Jan 15, 2024
			const result = formatValue(date, DataType.DATE);
			expect(result).toBe("2024-01-15");
		});

		it("formats unix timestamp (seconds)", () => {
			// Jan 1, 2024 00:00:00 UTC - displayed in local timezone with short format
			const result = formatValue(1704067200, DataType.TIMESTAMP_S);
			// The result includes date/time in local timezone format with short abbreviation (e.g., "PST")
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
			expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
		});

		it("formats unix timestamp (milliseconds)", () => {
			// Jan 1, 2024 00:00:00 UTC - displayed in local timezone with short format
			const result = formatValue(1704067200000, DataType.TIMESTAMP_MS);
			// The result includes date/time in local timezone format with short abbreviation (e.g., "PST")
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
			expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
		});

		it("returns string as-is if date parsing fails", () => {
			expect(formatValue("not-a-date", DataType.DATE)).toBe("not-a-date");
		});

		it("returns interval as-is", () => {
			expect(formatValue("1 day 2 hours", DataType.INTERVAL)).toBe(
				"1 day 2 hours",
			);
		});

		it("formats TIME microseconds to HH:MM:SS", () => {
			// TIME '14:30:00' = 14*3600 + 30*60 = 52200 seconds = 52200000000 microseconds
			expect(formatValue(52200000000, DataType.TIME)).toBe("14:30:00");
		});

		it("formats TIME midnight", () => {
			// TIME '00:00:00' = 0 microseconds
			expect(formatValue(0, DataType.TIME)).toBe("00:00:00");
		});

		it("formats TIME end of day", () => {
			// TIME '23:59:59' = 23*3600 + 59*60 + 59 = 86399 seconds = 86399000000 microseconds
			expect(formatValue(86399000000, DataType.TIME)).toBe("23:59:59");
		});

		it("formats TIME with microsecond precision", () => {
			// TIME '14:30:45.123456' = 52245.123456 seconds = 52245123456 microseconds
			expect(formatValue(52245123456, DataType.TIME)).toBe("14:30:45.123456");
		});

		it("formats TIME with partial microseconds (trailing zeros trimmed)", () => {
			// TIME '14:30:45.123' = 52245.123 seconds = 52245123000 microseconds
			expect(formatValue(52245123000, DataType.TIME)).toBe("14:30:45.123");
		});

		it("formats TIME with bigint value", () => {
			// Same as above but as BigInt
			expect(formatValue(BigInt(52200000000), DataType.TIME)).toBe("14:30:00");
		});

		it("preserves TIME string as-is", () => {
			// If already formatted, return as-is
			expect(formatValue("14:30:00", DataType.TIME)).toBe("14:30:00");
		});
	});

	describe("binary formatting", () => {
		it("formats Uint8Array as hex", () => {
			const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
			const result = formatValue(bytes, DataType.BLOB);
			expect(result).toContain("48 65 6c 6c 6f");
			expect(result).toContain("5 bytes");
		});

		it("truncates large binary data", () => {
			const bytes = new Uint8Array(100);
			bytes.fill(0xff);
			const result = formatValue(bytes, DataType.BLOB);
			expect(result).toContain("...");
			expect(result).toContain("100 bytes");
		});

		it("formats hex string", () => {
			const result = formatValue("0x48656c6c6f", DataType.BLOB);
			expect(result).toContain("hex");
		});
	});

	describe("complex type formatting", () => {
		describe("JSON type", () => {
			it("formats object as JSON string", () => {
				const obj = { name: "test", value: 123 };
				const result = formatValue(obj, DataType.JSON);
				expect(result).toBe('{"name":"test","value":123}');
			});

			it("parses JSON string and re-formats", () => {
				const jsonStr = '{"name": "test"}';
				const result = formatValue(jsonStr, DataType.JSON);
				expect(result).toBe('{"name":"test"}');
			});

			it("returns invalid JSON as-is", () => {
				expect(formatValue("not json", DataType.JSON)).toBe("not json");
			});
		});

		describe("ARRAY/LIST type", () => {
			it("formats array of primitives", () => {
				expect(formatValue([1, 2, 3], DataType.ARRAY)).toBe("[1, 2, 3]");
			});

			it("formats array with nulls", () => {
				expect(formatValue([1, null, 3], DataType.ARRAY)).toBe("[1, null, 3]");
			});

			it("formats array of objects", () => {
				const result = formatValue([{ a: 1 }], DataType.ARRAY);
				expect(result).toBe('[{"a":1}]');
			});

			it("parses JSON array string", () => {
				expect(formatValue("[1, 2, 3]", DataType.LIST)).toBe("[1, 2, 3]");
			});
		});

		describe("STRUCT/MAP type", () => {
			it("formats object as JSON", () => {
				const obj = { key: "value" };
				const result = formatValue(obj, DataType.STRUCT);
				expect(result).toBe('{"key":"value"}');
			});

			it("parses JSON string and re-formats", () => {
				const result = formatValue('{"key": "value"}', DataType.STRUCT);
				expect(result).toBe('{"key":"value"}');
			});

			it("returns invalid JSON string as-is", () => {
				expect(formatValue("not json", DataType.STRUCT)).toBe("not json");
			});
		});
	});

	describe("spatial formatting", () => {
		it("formats WKT point", () => {
			const result = formatValue("POINT(1 2)", DataType.GEOGRAPHY);
			expect(result).toBe("POINT(1 2)");
		});

		it("truncates long WKT", () => {
			const longWkt =
				"POLYGON((" + Array(100).fill("1 2").join(", ") + "))";
			const result = formatValue(longWkt, DataType.GEOGRAPHY);
			expect(result.length).toBeLessThan(longWkt.length);
			expect(result).toContain("...");
		});

		it("formats GeoJSON object", () => {
			const geoJson = { type: "Point", coordinates: [1, 2] };
			const result = formatValue(geoJson, DataType.GEOGRAPHY);
			expect(result).toContain("Point");
			expect(result).toContain("coordinates");
		});
	});

	describe("string formatting", () => {
		it("returns simple strings as-is", () => {
			expect(formatValue("hello world", DataType.VARCHAR)).toBe("hello world");
		});

		it("preserves UUID format", () => {
			const uuid = "550e8400-e29b-41d4-a716-446655440000";
			expect(formatValue(uuid, DataType.VARCHAR)).toBe(uuid);
		});

		it("preserves URL format", () => {
			const url = "https://example.com/path";
			expect(formatValue(url, DataType.VARCHAR)).toBe(url);
		});

		it("preserves email format", () => {
			const email = "test@example.com";
			expect(formatValue(email, DataType.VARCHAR)).toBe(email);
		});

		it("preserves IP address format", () => {
			const ip = "192.168.1.1";
			expect(formatValue(ip, DataType.VARCHAR)).toBe(ip);
		});
	});
});

describe("inferTypeFromValue", () => {
	it("infers null type", () => {
		expect(inferTypeFromValue(null)).toBe(DataType.NULL);
		expect(inferTypeFromValue(undefined)).toBe(DataType.NULL);
	});

	it("infers boolean type", () => {
		expect(inferTypeFromValue(true)).toBe(DataType.BOOLEAN);
		expect(inferTypeFromValue(false)).toBe(DataType.BOOLEAN);
	});

	it("infers integer type", () => {
		expect(inferTypeFromValue(42)).toBe(DataType.INTEGER);
		expect(inferTypeFromValue(-100)).toBe(DataType.INTEGER);
	});

	it("infers double type for floats", () => {
		expect(inferTypeFromValue(3.14)).toBe(DataType.DOUBLE);
		expect(inferTypeFromValue(-2.5)).toBe(DataType.DOUBLE);
	});

	it("infers bigint type", () => {
		expect(inferTypeFromValue(BigInt(9007199254740991))).toBe(DataType.BIGINT);
	});

	it("infers timestamp from ISO string", () => {
		expect(inferTypeFromValue("2024-01-15T10:30:00Z")).toBe(DataType.TIMESTAMP);
	});

	it("infers date from date string", () => {
		expect(inferTypeFromValue("2024-01-15")).toBe(DataType.DATE);
	});

	it("infers time from time string", () => {
		expect(inferTypeFromValue("10:30:00")).toBe(DataType.TIME);
	});

	it("infers varchar for regular strings", () => {
		expect(inferTypeFromValue("hello world")).toBe(DataType.VARCHAR);
	});

	it("infers timestamp from Date object", () => {
		expect(inferTypeFromValue(new Date())).toBe(DataType.TIMESTAMP);
	});

	it("infers array type", () => {
		expect(inferTypeFromValue([1, 2, 3])).toBe(DataType.ARRAY);
		expect(inferTypeFromValue([])).toBe(DataType.ARRAY);
	});

	it("infers blob type from Uint8Array", () => {
		expect(inferTypeFromValue(new Uint8Array([1, 2, 3]))).toBe(DataType.BLOB);
	});

	it("infers blob type from ArrayBuffer", () => {
		expect(inferTypeFromValue(new ArrayBuffer(8))).toBe(DataType.BLOB);
	});

	it("infers JSON type for plain objects", () => {
		expect(inferTypeFromValue({ key: "value" })).toBe(DataType.JSON);
	});
});
