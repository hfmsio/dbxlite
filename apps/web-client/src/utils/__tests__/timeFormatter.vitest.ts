import { describe, it, expect } from "vitest";
import { formatExecutionTime } from "../timeFormatter";

describe("formatExecutionTime", () => {
	describe("milliseconds (< 1 second)", () => {
		it("formats 0ms", () => {
			expect(formatExecutionTime(0)).toBe("0ms");
		});

		it("formats small milliseconds", () => {
			expect(formatExecutionTime(45)).toBe("45ms");
		});

		it("formats near-second values", () => {
			expect(formatExecutionTime(999)).toBe("999ms");
		});

		it("rounds milliseconds", () => {
			expect(formatExecutionTime(45.6)).toBe("46ms");
			expect(formatExecutionTime(45.4)).toBe("45ms");
		});
	});

	describe("seconds (< 1 minute)", () => {
		it("formats exactly 1 second", () => {
			expect(formatExecutionTime(1000)).toBe("1.0s");
		});

		it("formats seconds with decimal", () => {
			expect(formatExecutionTime(1234)).toBe("1.2s");
			expect(formatExecutionTime(5500)).toBe("5.5s");
		});

		it("formats near-minute values", () => {
			expect(formatExecutionTime(59999)).toBe("60.0s");
		});
	});

	describe("minutes (< 1 hour)", () => {
		it("formats exactly 1 minute", () => {
			expect(formatExecutionTime(60000)).toBe("1m");
		});

		it("formats minutes with seconds", () => {
			expect(formatExecutionTime(65000)).toBe("1m 5s");
			expect(formatExecutionTime(125000)).toBe("2m 5s");
		});

		it("formats minutes without seconds when exact", () => {
			expect(formatExecutionTime(120000)).toBe("2m");
			expect(formatExecutionTime(300000)).toBe("5m");
		});

		it("formats near-hour values", () => {
			expect(formatExecutionTime(3599000)).toBe("59m 59s");
		});
	});

	describe("hours (>= 1 hour)", () => {
		it("formats exactly 1 hour", () => {
			expect(formatExecutionTime(3600000)).toBe("1h");
		});

		it("formats hours with minutes", () => {
			expect(formatExecutionTime(3661000)).toBe("1h 1m");
			expect(formatExecutionTime(7320000)).toBe("2h 2m");
		});

		it("formats hours without minutes when exact", () => {
			expect(formatExecutionTime(7200000)).toBe("2h");
			expect(formatExecutionTime(36000000)).toBe("10h");
		});

		it("formats large hour values", () => {
			expect(formatExecutionTime(86400000)).toBe("24h"); // 24 hours
		});
	});
});
