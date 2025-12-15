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
				// Use UTC timezone to get predictable output regardless of local timezone
				const result = formatValue(ms, DataType.TIMESTAMP_MS, { timestampTimezone: "utc" });
				expect(result).toMatch(/1900-01-01/);
			});
		});
	});

	describe("threshold detection (seconds vs milliseconds)", () => {
		// These tests verify the Math.abs() fix for threshold checks
		// Use UTC timezone for predictable output regardless of local timezone

		it("correctly identifies large positive milliseconds", () => {
			// 2024-12-10 = 1733788800000 ms (> 1e11, so should be treated as ms)
			const ms = Date.UTC(2024, 11, 10);
			expect(ms).toBeGreaterThan(1e11);
			expect(formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "utc" })).toMatch(/2024-12-10/);
		});

		it("correctly identifies small positive seconds", () => {
			// Small value like 86400 (1 day in seconds) should be treated as seconds
			const seconds = 86400; // 1 day
			const result = formatValue(seconds, DataType.TIMESTAMP, { timestampTimezone: "utc" });
			expect(result).toMatch(/1970-01-02/);
		});

		it("correctly identifies large negative milliseconds (pre-1970)", () => {
			// -2208988800000 (1900-01-01 in ms) - abs value > 1e11, so milliseconds
			const ms = Date.UTC(1900, 0, 1);
			expect(Math.abs(ms)).toBeGreaterThan(1e11);
			expect(formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "utc" })).toMatch(/1900-01-01/);
		});

		it("correctly identifies small negative seconds (pre-1970)", () => {
			// -86400 seconds = 1969-12-31
			const seconds = -86400;
			const result = formatValue(seconds, DataType.TIMESTAMP, { timestampTimezone: "utc" });
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

	describe("timezone settings", () => {
		describe("DATE always uses UTC", () => {
			it("DATE displays as-is regardless of local timezone", () => {
				// DATE '2024-12-10' should always show as 2024-12-10
				const ms = Date.UTC(2024, 11, 10);
				expect(formatValue(ms, DataType.DATE)).toBe("2024-12-10");
			});

			it("DATE with different formats still uses UTC", () => {
				const ms = Date.UTC(2024, 11, 10);
				const result = formatValue(ms, DataType.DATE, { dateFormat: "medium" });
				expect(result).toMatch(/Dec/);
				expect(result).toMatch(/10/);
				expect(result).toMatch(/2024/);
			});
		});

		describe("timestampTimezone option", () => {
			it("TIMESTAMP uses local timezone by default with short format", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP);
				// Default is local with short format (e.g., "PST", "EST")
				expect(result).toMatch(/2024-12-10/);
				expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
			});

			it("TIMESTAMP with timestampTimezone: utc shows UTC", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "utc" });
				expect(result).toMatch(/2024-12-10/);
				expect(result).toMatch(/12:00:00/);
				expect(result).toMatch(/UTC$/); // Should end with just "UTC", not offset
			});

			it("TIMESTAMP with timezoneFormat: offset shows offset", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "local", timezoneFormat: "offset" });
				// Shows offset (e.g., "-08:00")
				expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
			});

			it("TIMESTAMP with timezoneFormat: short shows abbreviation", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "local", timezoneFormat: "short" });
				// Shows short timezone name (e.g., "PST", "EST")
				expect(result).toMatch(/2024-12-10/);
				expect(result).not.toMatch(/[+-]\d{2}:\d{2}$/);
			});

			it("TIMESTAMP with timezoneFormat: none hides timezone", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, { timestampTimezone: "local", timezoneFormat: "none" });
				// No timezone indicator, ends with seconds (default precision is now "seconds")
				expect(result).toMatch(/2024-12-10/);
				expect(result).toMatch(/\d{2}:\d{2}:\d{2}$/);
			});
		});

		describe("DATETIME handling", () => {
			it("DATETIME date part uses UTC, time part uses local", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.DATETIME);
				// Date should be 2024-12-10 (UTC)
				expect(result).toMatch(/2024-12-10/);
			});
		});

		describe("timestamp precision options", () => {
			it("timestampPrecision: seconds shows no decimal", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 30, 45, 123);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(result).toMatch(/12:30:45 UTC$/);
				expect(result).not.toContain(".");
			});

			it("timestampPrecision: milliseconds shows 3 decimal places", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 30, 45, 123);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "milliseconds",
				});
				expect(result).toMatch(/12:30:45\.123 UTC$/);
			});

			it("timestampPrecision: microseconds shows 6 decimal places", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 30, 45, 123);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "microseconds",
				});
				expect(result).toMatch(/12:30:45\.123000 UTC$/);
			});

			it("timestampPrecision: nanoseconds shows 9 decimal places", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 30, 45, 123);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "nanoseconds",
				});
				expect(result).toMatch(/12:30:45\.123000000 UTC$/);
			});
		});

		describe("timezone consistency (date and time in same timezone)", () => {
			it("UTC timestamps show both date and time in UTC", () => {
				// 2:00 AM UTC on Dec 10 - should show Dec 10 02:00 UTC
				const ms = Date.UTC(2024, 11, 10, 2, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(result).toBe("2024-12-10 02:00:00 UTC");
			});

			it("local timestamps show both date and time in local timezone", () => {
				// This test verifies date/time consistency by checking format structure
				// The actual values depend on the test machine's timezone
				const ms = Date.UTC(2024, 11, 10, 2, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timestampPrecision: "seconds",
					timezoneFormat: "none",
				});
				// Should have consistent date and time (both local)
				expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
			});

			it("midnight UTC crossing shows correct local date", () => {
				// Midnight UTC on Dec 10 = different date in most Western timezones
				const ms = Date.UTC(2024, 11, 10, 0, 0, 0);
				const utcResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(utcResult).toBe("2024-12-10 00:00:00 UTC");

				// In local timezone (if behind UTC), date should be Dec 9
				// We can't test the exact value but we can verify format
				const localResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timestampPrecision: "seconds",
					timezoneFormat: "none",
				});
				expect(localResult).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
			});
		});

		describe("timezoneFormat options", () => {
			it("timezoneFormat: short shows abbreviation (e.g., PST)", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timezoneFormat: "short",
					timestampPrecision: "seconds",
				});
				// Should have a short timezone name (letters, not offset numbers)
				expect(result).toMatch(/\d{2}:\d{2}:\d{2} [A-Z]{2,5}$/);
			});

			it("timezoneFormat: long shows full name", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timezoneFormat: "long",
					timestampPrecision: "seconds",
				});
				// Should have a long timezone name (contains spaces/words)
				expect(result).toMatch(/\d{2}:\d{2}:\d{2} .+/);
				expect(result.length).toBeGreaterThan(25); // Long names are longer
			});

			it("timezoneFormat: offset shows numeric offset", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timezoneFormat: "offset",
					timestampPrecision: "seconds",
				});
				// Should end with offset like -08:00 or +05:30
				expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
			});

			it("timezoneFormat: none hides timezone completely", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "local",
					timezoneFormat: "none",
					timestampPrecision: "seconds",
				});
				// Should end with just time, no timezone
				expect(result).toMatch(/\d{2}:\d{2}:\d{2}$/);
				expect(result).not.toMatch(/[A-Z]{2,5}$/);
				expect(result).not.toMatch(/[+-]\d{2}:\d{2}$/);
			});

			it("UTC timezone always shows 'UTC' regardless of format", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);

				const shortResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timezoneFormat: "short",
					timestampPrecision: "seconds",
				});
				expect(shortResult).toMatch(/UTC$/);

				const longResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timezoneFormat: "long",
					timestampPrecision: "seconds",
				});
				expect(longResult).toMatch(/UTC$/);

				const offsetResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timezoneFormat: "offset",
					timestampPrecision: "seconds",
				});
				expect(offsetResult).toMatch(/UTC$/);
			});
		});

		describe("dateFormat options with timestamps", () => {
			it("dateFormat: iso shows YYYY-MM-DD", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					dateFormat: "iso",
					timestampPrecision: "seconds",
				});
				expect(result).toMatch(/^2024-12-10/);
			});

			it("dateFormat: short shows compact date", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					dateFormat: "short",
					timestampPrecision: "seconds",
				});
				// Short format varies by locale, but should contain 10 and 24
				expect(result).toMatch(/10/);
			});

			it("dateFormat: medium shows month name", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					dateFormat: "medium",
					timestampPrecision: "seconds",
				});
				// Medium format should include month name
				expect(result).toMatch(/Dec|December/i);
			});
		});

		describe("timeFormat options", () => {
			it("timeFormat: 24h shows 24-hour time", () => {
				const ms = Date.UTC(2024, 11, 10, 14, 30, 0); // 2:30 PM UTC
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timeFormat: "24h",
					timestampPrecision: "seconds",
				});
				expect(result).toMatch(/14:30:00/);
			});

			it("timeFormat: 12h shows 12-hour time with AM/PM", () => {
				const ms = Date.UTC(2024, 11, 10, 14, 30, 0); // 2:30 PM UTC
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timeFormat: "12h",
					timestampPrecision: "seconds",
				});
				expect(result).toMatch(/2:30:00|02:30:00/);
				expect(result).toMatch(/PM/i);
			});
		});

		describe("edge cases", () => {
			it("handles year boundary correctly", () => {
				// Dec 31, 2024 23:00 UTC = Jan 1, 2025 in some timezones
				const ms = Date.UTC(2024, 11, 31, 23, 0, 0);
				const utcResult = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(utcResult).toBe("2024-12-31 23:00:00 UTC");
			});

			it("handles leap year date", () => {
				const ms = Date.UTC(2024, 1, 29, 12, 0, 0); // Feb 29, 2024
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(result).toBe("2024-02-29 12:00:00 UTC");
			});

			it("handles pre-1970 timestamps", () => {
				// Use a Date object directly for pre-1970 to avoid threshold detection issues
				const date = new Date(Date.UTC(1969, 6, 20, 20, 17, 0)); // Apollo 11 landing
				const result = formatValue(date, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "seconds",
				});
				expect(result).toBe("1969-07-20 20:17:00 UTC");
			});

			it("handles millisecond precision edge case (999ms)", () => {
				const ms = Date.UTC(2024, 11, 10, 12, 0, 0, 999);
				const result = formatValue(ms, DataType.TIMESTAMP, {
					timestampTimezone: "utc",
					timestampPrecision: "milliseconds",
				});
				expect(result).toMatch(/12:00:00\.999 UTC$/);
			});
		});
	});
});
