/**
 * Tests for getDuckDBFormatOption — the DuckDB COPY format clause, including
 * the Parquet compression codec.
 */
import { describe, expect, it } from "vitest";
import { getDuckDBFormatOption } from "../exportUtils";

describe("getDuckDBFormatOption", () => {
	it("appends the zstd codec to Parquet", () => {
		expect(getDuckDBFormatOption("parquet", "zstd")).toBe(
			"PARQUET, COMPRESSION 'zstd'",
		);
	});

	it("leaves Parquet bare for snappy (default)", () => {
		expect(getDuckDBFormatOption("parquet", "snappy")).toBe("PARQUET");
	});

	it("leaves Parquet bare when no codec is given", () => {
		expect(getDuckDBFormatOption("parquet")).toBe("PARQUET");
	});

	it("ignores compression for CSV and JSON", () => {
		expect(getDuckDBFormatOption("csv", "zstd")).toBe("CSV, HEADER TRUE");
		expect(getDuckDBFormatOption("json", "zstd")).toBe("JSON");
	});
});
