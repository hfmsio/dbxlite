/**
 * Formatters Tests
 * Tests for date, timestamp, and temporal value formatting
 */

import { describe, expect, it } from "vitest";
import { DataType } from "./dataTypes";
import { formatValue } from "./formatters";

describe("formatters", () => {
	describe("DATE formatting", () => {
		// DuckDB sends DATE values as milliseconds since Unix epoch

		it("formats DATE 2024-12-10 correctly (ISO format)", () => {
			// DATE '2024-12-10' = 1733788800000 ms since epoch
			const ms = Date.UTC(2024, 11, 10); // Month is 0-indexed
			expect(formatValue(ms, DataType.DATE)).toBe("2024-12-10");
		});

		it("formats DATE 2024-12-10 correctly (short format)", () => {
			const ms = Date.UTC(2024, 11, 10);
			const result = formatValue(ms, DataType.DATE, { dateFormat: "short" });
			// Short format varies by locale (e.g., "12/10/24" in US)
			expect(result).toMatch(/12.*10|10.*12/); // Month and day present
		});

		it("formats DATE 2024-12-10 correctly (medium format)", () => {
			const ms = Date.UTC(2024, 11, 10);
			const result = formatValue(ms, DataType.DATE, { dateFormat: "medium" });
			// Should contain Dec and 10 and 2024
			expect(result).toMatch(/Dec/);
			expect(result).toMatch(/10/);
			expect(result).toMatch(/2024/);
		});

		it("does not shift date by timezone (boundary test: midnight UTC)", () => {
			// This is the critical test: DATE '2024-12-10' at midnight UTC
			// Should display as 2024-12-10 regardless of local timezone
			const ms = Date.UTC(2024, 11, 10, 0, 0, 0, 0);
			expect(formatValue(ms, DataType.DATE)).toBe("2024-12-10");
		});

		it("handles end-of-day boundary correctly", () => {
			// 23:59:59.999 UTC on 2024-12-10 should still show as 2024-12-10
			const ms = Date.UTC(2024, 11, 10, 23, 59, 59, 999);
			expect(formatValue(ms, DataType.DATE)).toBe("2024-12-10");
		});

		describe("pre-1970 dates (negative milliseconds)", () => {
			it("formats DATE 1900-01-01 correctly", () => {
				// DATE '1900-01-01' = -2208988800000 ms since epoch
				const ms = Date.UTC(1900, 0, 1);
				expect(ms).toBe(-2208988800000); // Verify the value
				expect(formatValue(ms, DataType.DATE)).toBe("1900-01-01");
			});

			it("formats DATE 1969-12-31 correctly (day before epoch)", () => {
				const ms = Date.UTC(1969, 11, 31);
				expect(formatValue(ms, DataType.DATE)).toBe("1969-12-31");
			});

			it("formats DATE 1800-06-15 correctly", () => {
				const ms = Date.UTC(1800, 5, 15);
				expect(formatValue(ms, DataType.DATE)).toBe("1800-06-15");
			});

			it("formats DATE 0001-01-01 correctly (year 1 AD)", () => {
				// Very old date - should still work
				const ms = Date.UTC(1, 0, 1);
				const result = formatValue(ms, DataType.DATE);
				// Note: JavaScript Date year 1 is 0001
				expect(result).toMatch(/0001-01-01|1-01-01/);
			});
		});

		describe("far future dates", () => {
			it("formats DATE 2100-12-31 correctly", () => {
				const ms = Date.UTC(2100, 11, 31);
				expect(formatValue(ms, DataType.DATE)).toBe("2100-12-31");
			});

			it("formats DATE 3000-01-01 correctly", () => {
				const ms = Date.UTC(3000, 0, 1);
				expect(formatValue(ms, DataType.DATE)).toBe("3000-01-01");
			});
		});
	});

	describe("TIMESTAMP formatting", () => {
		// Note: TIMESTAMP displays in local timezone (expected UX behavior)
		// Tests verify date and time components are present

		it("formats TIMESTAMP correctly (milliseconds input)", () => {
			const ms = Date.UTC(2024, 11, 10, 14, 30, 0);
			const result = formatValue(ms, DataType.TIMESTAMP);
			// Should contain date and time (local timezone adjusted)
			expect(result).toMatch(/2024-12-10/);
			expect(result).toMatch(/\d{2}:\d{2}/); // Contains time
		});

		it("formats TIMESTAMP_MS correctly", () => {
			const ms = Date.UTC(2024, 11, 10, 14, 30, 0);
			const result = formatValue(ms, DataType.TIMESTAMP_MS);
			expect(result).toMatch(/2024-12-10/);
			expect(result).toMatch(/\d{2}:\d{2}/);
		});

		it("formats TIMESTAMP_S correctly (seconds input)", () => {
			const seconds = Math.floor(Date.UTC(2024, 11, 10, 14, 30, 0) / 1000);
			const result = formatValue(seconds, DataType.TIMESTAMP_S);
			expect(result).toMatch(/2024-12-10/);
			expect(result).toMatch(/\d{2}:\d{2}/);
		});

		describe("pre-1970 timestamps", () => {
			it("formats TIMESTAMP 1960-06-15 correctly (milliseconds)", () => {
				const ms = Date.UTC(1960, 5, 15, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP);
				expect(result).toMatch(/1960-06-15/);
				expect(result).toMatch(/\d{2}:\d{2}/);
			});

			it("formats TIMESTAMP_S 1960-06-15 correctly (seconds)", () => {
				const seconds = Math.floor(Date.UTC(1960, 5, 15, 12, 0, 0) / 1000);
				const result = formatValue(seconds, DataType.TIMESTAMP_S);
				expect(result).toMatch(/1960-06-15/);
				expect(result).toMatch(/\d{2}:\d{2}/);
			});

			it("formats TIMESTAMP_MS 1900-01-01 correctly", () => {
				const ms = Date.UTC(1900, 0, 1, 0, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP_MS);
				expect(result).toMatch(/1900-01-01/);
			});
		});
	});

	describe("threshold detection (seconds vs milliseconds)", () => {
		// These tests verify the Math.abs() fix for threshold checks

		it("correctly identifies large positive milliseconds", () => {
			// 2024-12-10 = 1733788800000 ms (> 1e11, so should be treated as ms)
			const ms = Date.UTC(2024, 11, 10);
			expect(ms).toBeGreaterThan(1e11);
			expect(formatValue(ms, DataType.TIMESTAMP)).toMatch(/2024-12-10/);
		});

		it("correctly identifies small positive seconds", () => {
			// Small value like 86400 (1 day in seconds) should be treated as seconds
			const seconds = 86400; // 1 day
			const result = formatValue(seconds, DataType.TIMESTAMP);
			expect(result).toMatch(/1970-01-02/);
		});

		it("correctly identifies large negative milliseconds (pre-1970)", () => {
			// -2208988800000 (1900-01-01 in ms) - abs value > 1e11, so milliseconds
			const ms = Date.UTC(1900, 0, 1);
			expect(Math.abs(ms)).toBeGreaterThan(1e11);
			expect(formatValue(ms, DataType.TIMESTAMP)).toMatch(/1900-01-01/);
		});

		it("correctly identifies small negative seconds (pre-1970)", () => {
			// -86400 seconds = 1969-12-31
			const seconds = -86400;
			const result = formatValue(seconds, DataType.TIMESTAMP);
			expect(result).toMatch(/1969-12-31/);
		});
	});

	describe("Date object input", () => {
		it("accepts Date object for DATE type", () => {
			const date = new Date(Date.UTC(2024, 11, 10));
			expect(formatValue(date, DataType.DATE)).toBe("2024-12-10");
		});

		it("accepts Date object for TIMESTAMP type", () => {
			const date = new Date(Date.UTC(2024, 11, 10, 14, 30, 0));
			const result = formatValue(date, DataType.TIMESTAMP);
			expect(result).toMatch(/2024-12-10/);
		});
	});

	describe("String date input", () => {
		it("parses ISO date string for DATE type", () => {
			const result = formatValue("2024-12-10", DataType.DATE);
			expect(result).toBe("2024-12-10");
		});

		it("parses ISO timestamp string for TIMESTAMP type", () => {
			const result = formatValue("2024-12-10T14:30:00Z", DataType.TIMESTAMP);
			expect(result).toMatch(/2024-12-10/);
			expect(result).toMatch(/\d{2}:\d{2}/); // Contains time (local tz)
		});
	});

	describe("null handling", () => {
		it("returns NULL for null value", () => {
			expect(formatValue(null, DataType.DATE)).toBe("NULL");
		});

		it("returns custom null display", () => {
			expect(formatValue(null, DataType.DATE, { nullDisplay: "-" })).toBe("-");
		});
	});

	describe("BigQuery compatibility", () => {
		// BigQuery returns DATE as string, TIMESTAMP as Date object

		it("handles BigQuery DATE format (string YYYY-MM-DD)", () => {
			// BigQuery connector returns DATE as "2024-12-10" string
			expect(formatValue("2024-12-10", DataType.DATE)).toBe("2024-12-10");
		});

		it("handles BigQuery pre-1970 DATE (string)", () => {
			expect(formatValue("1900-01-01", DataType.DATE)).toBe("1900-01-01");
		});

		it("handles BigQuery TIMESTAMP (Date object from Unix seconds)", () => {
			// BigQuery connector: new Date(parseFloat(value) * 1000)
			const unixSeconds = 1733839800; // 2024-12-10 14:30:00 UTC
			const dateObj = new Date(unixSeconds * 1000);
			const result = formatValue(dateObj, DataType.TIMESTAMP);
			expect(result).toMatch(/2024-12-10/);
			expect(result).toMatch(/\d{2}:\d{2}/);
		});

		it("handles BigQuery DATETIME (Date object)", () => {
			// BigQuery connector: new Date("2024-12-10T14:30:00")
			const dateObj = new Date("2024-12-10T14:30:00Z");
			const result = formatValue(dateObj, DataType.DATETIME);
			expect(result).toMatch(/2024-12-10/);
		});
	});
});
