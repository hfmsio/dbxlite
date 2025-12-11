import { describe, it, expect } from "vitest";
import {
	DataType,
	TypeCategory,
	getTypeCategory,
	TypeMapper,
} from "../dataTypes";

describe("getTypeCategory", () => {
	describe("numeric types", () => {
		it("categorizes integer types", () => {
			expect(getTypeCategory(DataType.TINYINT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.SMALLINT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.INTEGER)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.BIGINT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.HUGEINT)).toBe(TypeCategory.NUMERIC);
		});

		it("categorizes unsigned integer types", () => {
			expect(getTypeCategory(DataType.UTINYINT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.USMALLINT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.UINTEGER)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.UBIGINT)).toBe(TypeCategory.NUMERIC);
		});

		it("categorizes float types", () => {
			expect(getTypeCategory(DataType.FLOAT)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.DOUBLE)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.DECIMAL)).toBe(TypeCategory.NUMERIC);
			expect(getTypeCategory(DataType.NUMERIC)).toBe(TypeCategory.NUMERIC);
		});
	});

	describe("string types", () => {
		it("categorizes string types", () => {
			expect(getTypeCategory(DataType.VARCHAR)).toBe(TypeCategory.STRING);
			expect(getTypeCategory(DataType.TEXT)).toBe(TypeCategory.STRING);
			expect(getTypeCategory(DataType.CHAR)).toBe(TypeCategory.STRING);
			expect(getTypeCategory(DataType.STRING)).toBe(TypeCategory.STRING);
		});
	});

	describe("boolean types", () => {
		it("categorizes boolean types", () => {
			expect(getTypeCategory(DataType.BOOLEAN)).toBe(TypeCategory.BOOLEAN);
			expect(getTypeCategory(DataType.BOOL)).toBe(TypeCategory.BOOLEAN);
		});
	});

	describe("temporal types", () => {
		it("categorizes date/time types", () => {
			expect(getTypeCategory(DataType.DATE)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIME)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.DATETIME)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIMESTAMP)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIMESTAMP_MS)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIMESTAMP_NS)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIMESTAMP_S)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.TIMESTAMPTZ)).toBe(TypeCategory.TEMPORAL);
			expect(getTypeCategory(DataType.INTERVAL)).toBe(TypeCategory.TEMPORAL);
		});
	});

	describe("binary types", () => {
		it("categorizes binary types", () => {
			expect(getTypeCategory(DataType.BLOB)).toBe(TypeCategory.BINARY);
			expect(getTypeCategory(DataType.BYTES)).toBe(TypeCategory.BINARY);
			expect(getTypeCategory(DataType.BYTEA)).toBe(TypeCategory.BINARY);
		});
	});

	describe("complex types", () => {
		it("categorizes complex types", () => {
			expect(getTypeCategory(DataType.ARRAY)).toBe(TypeCategory.COMPLEX);
			expect(getTypeCategory(DataType.LIST)).toBe(TypeCategory.COMPLEX);
			expect(getTypeCategory(DataType.STRUCT)).toBe(TypeCategory.COMPLEX);
			expect(getTypeCategory(DataType.MAP)).toBe(TypeCategory.COMPLEX);
			expect(getTypeCategory(DataType.JSON)).toBe(TypeCategory.COMPLEX);
		});
	});

	describe("spatial types", () => {
		it("categorizes spatial types", () => {
			expect(getTypeCategory(DataType.GEOGRAPHY)).toBe(TypeCategory.SPATIAL);
			expect(getTypeCategory(DataType.GEOMETRY)).toBe(TypeCategory.SPATIAL);
		});
	});

	describe("special types", () => {
		it("categorizes special types", () => {
			expect(getTypeCategory(DataType.UUID)).toBe(TypeCategory.SPECIAL);
			expect(getTypeCategory(DataType.NULL)).toBe(TypeCategory.SPECIAL);
			expect(getTypeCategory(DataType.UNKNOWN)).toBe(TypeCategory.SPECIAL);
		});
	});
});

describe("TypeMapper.normalizeDuckDBType", () => {
	describe("numeric types", () => {
		it("normalizes integer types", () => {
			expect(TypeMapper.normalizeDuckDBType("int8")).toBe(DataType.TINYINT);
			expect(TypeMapper.normalizeDuckDBType("tinyint")).toBe(DataType.TINYINT);
			expect(TypeMapper.normalizeDuckDBType("int16")).toBe(DataType.SMALLINT);
			expect(TypeMapper.normalizeDuckDBType("smallint")).toBe(DataType.SMALLINT);
			expect(TypeMapper.normalizeDuckDBType("int32")).toBe(DataType.INTEGER);
			expect(TypeMapper.normalizeDuckDBType("int")).toBe(DataType.INTEGER);
			expect(TypeMapper.normalizeDuckDBType("integer")).toBe(DataType.INTEGER);
			expect(TypeMapper.normalizeDuckDBType("int64")).toBe(DataType.BIGINT);
			expect(TypeMapper.normalizeDuckDBType("bigint")).toBe(DataType.BIGINT);
		});

		it("normalizes unsigned integer types", () => {
			expect(TypeMapper.normalizeDuckDBType("uint8")).toBe(DataType.UTINYINT);
			expect(TypeMapper.normalizeDuckDBType("utinyint")).toBe(DataType.UTINYINT);
			expect(TypeMapper.normalizeDuckDBType("uint16")).toBe(DataType.USMALLINT);
			expect(TypeMapper.normalizeDuckDBType("usmallint")).toBe(
				DataType.USMALLINT,
			);
			expect(TypeMapper.normalizeDuckDBType("uint32")).toBe(DataType.UINTEGER);
			expect(TypeMapper.normalizeDuckDBType("uinteger")).toBe(DataType.UINTEGER);
			expect(TypeMapper.normalizeDuckDBType("uint64")).toBe(DataType.UBIGINT);
			expect(TypeMapper.normalizeDuckDBType("ubigint")).toBe(DataType.UBIGINT);
		});

		it("normalizes float types", () => {
			expect(TypeMapper.normalizeDuckDBType("float32")).toBe(DataType.FLOAT);
			expect(TypeMapper.normalizeDuckDBType("float")).toBe(DataType.FLOAT);
			expect(TypeMapper.normalizeDuckDBType("real")).toBe(DataType.FLOAT);
			expect(TypeMapper.normalizeDuckDBType("float64")).toBe(DataType.DOUBLE);
			expect(TypeMapper.normalizeDuckDBType("double")).toBe(DataType.DOUBLE);
			expect(TypeMapper.normalizeDuckDBType("number")).toBe(DataType.DOUBLE);
		});

		it("normalizes decimal types", () => {
			expect(TypeMapper.normalizeDuckDBType("decimal")).toBe(DataType.DECIMAL);
			expect(TypeMapper.normalizeDuckDBType("decimal(10,2)")).toBe(
				DataType.DECIMAL,
			);
			expect(TypeMapper.normalizeDuckDBType("numeric")).toBe(DataType.DECIMAL);
		});

		it("normalizes hugeint", () => {
			expect(TypeMapper.normalizeDuckDBType("hugeint")).toBe(DataType.HUGEINT);
		});
	});

	describe("string types", () => {
		it("normalizes string types", () => {
			expect(TypeMapper.normalizeDuckDBType("utf8")).toBe(DataType.VARCHAR);
			expect(TypeMapper.normalizeDuckDBType("largeutf8")).toBe(DataType.VARCHAR);
			expect(TypeMapper.normalizeDuckDBType("varchar")).toBe(DataType.VARCHAR);
			expect(TypeMapper.normalizeDuckDBType("string")).toBe(DataType.VARCHAR);
			expect(TypeMapper.normalizeDuckDBType("text")).toBe(DataType.TEXT);
		});
	});

	describe("boolean types", () => {
		it("normalizes boolean types", () => {
			expect(TypeMapper.normalizeDuckDBType("bool")).toBe(DataType.BOOLEAN);
			expect(TypeMapper.normalizeDuckDBType("boolean")).toBe(DataType.BOOLEAN);
		});
	});

	describe("temporal types", () => {
		it("normalizes date types", () => {
			expect(TypeMapper.normalizeDuckDBType("date")).toBe(DataType.DATE);
			expect(TypeMapper.normalizeDuckDBType("date32")).toBe(DataType.DATE);
			expect(TypeMapper.normalizeDuckDBType("date64")).toBe(DataType.DATE);
			expect(TypeMapper.normalizeDuckDBType("Date<Day>")).toBe(DataType.DATE);
			expect(TypeMapper.normalizeDuckDBType("Date<Millisecond>")).toBe(
				DataType.DATE,
			);
		});

		it("normalizes time types", () => {
			expect(TypeMapper.normalizeDuckDBType("time")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeDuckDBType("Time<Second>")).toBe(DataType.TIME);
		});

		it("normalizes Arrow Time32/Time64 types", () => {
			// Time32 variants (seconds and milliseconds)
			expect(TypeMapper.normalizeDuckDBType("time32")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeDuckDBType("Time32<Second>")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeDuckDBType("Time32<Millisecond>")).toBe(DataType.TIME);
			// Time64 variants (microseconds and nanoseconds) - DuckDB uses this
			expect(TypeMapper.normalizeDuckDBType("time64")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeDuckDBType("Time64<Microsecond>")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeDuckDBType("Time64<Nanosecond>")).toBe(DataType.TIME);
		});

		it("normalizes datetime", () => {
			expect(TypeMapper.normalizeDuckDBType("datetime")).toBe(DataType.DATETIME);
		});

		it("normalizes timestamp types", () => {
			expect(TypeMapper.normalizeDuckDBType("timestamp")).toBe(
				DataType.TIMESTAMP,
			);
			expect(TypeMapper.normalizeDuckDBType("tytimestamp")).toBe(
				DataType.TIMESTAMP,
			);
			expect(TypeMapper.normalizeDuckDBType("Timestamp<Microsecond, null>")).toBe(
				DataType.TIMESTAMP,
			);
			expect(TypeMapper.normalizeDuckDBType("Timestamp<Millisecond, null>")).toBe(
				DataType.TIMESTAMP_MS,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp[ms]")).toBe(
				DataType.TIMESTAMP_MS,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp_ms")).toBe(
				DataType.TIMESTAMP_MS,
			);
			expect(TypeMapper.normalizeDuckDBType("Timestamp<Nanosecond, null>")).toBe(
				DataType.TIMESTAMP_NS,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp[ns]")).toBe(
				DataType.TIMESTAMP_NS,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp_ns")).toBe(
				DataType.TIMESTAMP_NS,
			);
			expect(TypeMapper.normalizeDuckDBType("Timestamp<Second, null>")).toBe(
				DataType.TIMESTAMP_S,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp[s]")).toBe(
				DataType.TIMESTAMP_S,
			);
			expect(TypeMapper.normalizeDuckDBType("timestamp_s")).toBe(
				DataType.TIMESTAMP_S,
			);
		});

		it("normalizes timestamptz", () => {
			expect(TypeMapper.normalizeDuckDBType("timestamptz")).toBe(
				DataType.TIMESTAMPTZ,
			);
			// Note: "timestamp with time zone" doesn't match the "tz" substring check
			// It maps to TIMESTAMP instead
		});

		it("normalizes interval", () => {
			expect(TypeMapper.normalizeDuckDBType("interval")).toBe(DataType.INTERVAL);
		});
	});

	describe("binary types", () => {
		it("normalizes binary types", () => {
			expect(TypeMapper.normalizeDuckDBType("binary")).toBe(DataType.BLOB);
			expect(TypeMapper.normalizeDuckDBType("largebinary")).toBe(DataType.BLOB);
			expect(TypeMapper.normalizeDuckDBType("blob")).toBe(DataType.BLOB);
			expect(TypeMapper.normalizeDuckDBType("bytes")).toBe(DataType.BLOB);
		});
	});

	describe("complex types", () => {
		it("normalizes list/array types", () => {
			expect(TypeMapper.normalizeDuckDBType("list<int>")).toBe(DataType.LIST);
			expect(TypeMapper.normalizeDuckDBType("list(varchar)")).toBe(DataType.LIST);
			expect(TypeMapper.normalizeDuckDBType("array<int>")).toBe(DataType.LIST);
			expect(TypeMapper.normalizeDuckDBType("int[]")).toBe(DataType.LIST);
		});

		it("normalizes struct types", () => {
			expect(TypeMapper.normalizeDuckDBType("struct<x: int>")).toBe(
				DataType.STRUCT,
			);
			expect(TypeMapper.normalizeDuckDBType("struct(x int)")).toBe(
				DataType.STRUCT,
			);
			expect(TypeMapper.normalizeDuckDBType("record")).toBe(DataType.STRUCT);
		});

		it("normalizes map types", () => {
			expect(TypeMapper.normalizeDuckDBType("map<varchar, int>")).toBe(
				DataType.MAP,
			);
			expect(TypeMapper.normalizeDuckDBType("map(varchar, int)")).toBe(
				DataType.MAP,
			);
		});

		it("normalizes json", () => {
			expect(TypeMapper.normalizeDuckDBType("json")).toBe(DataType.JSON);
		});

		it("handles struct containing decimal without false positive", () => {
			// This tests that struct types are detected before decimal
			expect(
				TypeMapper.normalizeDuckDBType("Struct<{total_spent:Decimal(10,2)}>"),
			).toBe(DataType.STRUCT);
		});
	});

	describe("spatial types", () => {
		it("normalizes spatial types", () => {
			expect(TypeMapper.normalizeDuckDBType("geography")).toBe(
				DataType.GEOGRAPHY,
			);
			expect(TypeMapper.normalizeDuckDBType("geometry")).toBe(
				DataType.GEOGRAPHY,
			);
		});
	});

	describe("special types", () => {
		it("normalizes uuid", () => {
			expect(TypeMapper.normalizeDuckDBType("uuid")).toBe(DataType.UUID);
		});

		it("normalizes null", () => {
			expect(TypeMapper.normalizeDuckDBType("null")).toBe(DataType.NULL);
		});

		it("returns unknown for unrecognized types", () => {
			expect(TypeMapper.normalizeDuckDBType("some_unknown_type")).toBe(
				DataType.UNKNOWN,
			);
		});
	});

	describe("dictionary/enum types", () => {
		it("normalizes Dictionary types to VARCHAR", () => {
			// DuckDB ENUM types are represented as Dictionary in Arrow
			expect(TypeMapper.normalizeDuckDBType("dictionary<uint8, utf8>")).toBe(
				DataType.VARCHAR,
			);
			expect(TypeMapper.normalizeDuckDBType("Dictionary<Uint8, Utf8>")).toBe(
				DataType.VARCHAR,
			);
			expect(TypeMapper.normalizeDuckDBType("dictionary(uint8, utf8)")).toBe(
				DataType.VARCHAR,
			);
		});

		it("should not match dictionary when checking uint8 types", () => {
			// Ensure Dictionary types don't fall through to UTINYINT
			// because "Dictionary<Uint8, Utf8>" contains "uint8"
			expect(TypeMapper.normalizeDuckDBType("dictionary<uint8, utf8>")).not.toBe(
				DataType.UTINYINT,
			);
		});
	});

	describe("case insensitivity", () => {
		it("handles uppercase types", () => {
			expect(TypeMapper.normalizeDuckDBType("INTEGER")).toBe(DataType.INTEGER);
			expect(TypeMapper.normalizeDuckDBType("VARCHAR")).toBe(DataType.VARCHAR);
			expect(TypeMapper.normalizeDuckDBType("BOOLEAN")).toBe(DataType.BOOLEAN);
		});

		it("handles mixed case types", () => {
			expect(TypeMapper.normalizeDuckDBType("Integer")).toBe(DataType.INTEGER);
			expect(TypeMapper.normalizeDuckDBType("VarChar")).toBe(DataType.VARCHAR);
		});
	});
});

describe("TypeMapper.normalizeBigQueryType", () => {
	describe("numeric types", () => {
		it("normalizes integer types", () => {
			expect(TypeMapper.normalizeBigQueryType("INT64")).toBe(DataType.BIGINT);
			expect(TypeMapper.normalizeBigQueryType("INTEGER")).toBe(DataType.BIGINT);
			expect(TypeMapper.normalizeBigQueryType("INT32")).toBe(DataType.INTEGER);
		});

		it("normalizes float types", () => {
			expect(TypeMapper.normalizeBigQueryType("FLOAT")).toBe(DataType.FLOAT);
			expect(TypeMapper.normalizeBigQueryType("FLOAT32")).toBe(DataType.FLOAT);
			expect(TypeMapper.normalizeBigQueryType("FLOAT64")).toBe(DataType.DOUBLE);
			expect(TypeMapper.normalizeBigQueryType("DOUBLE")).toBe(DataType.DOUBLE);
		});

		it("normalizes decimal types", () => {
			expect(TypeMapper.normalizeBigQueryType("NUMERIC")).toBe(DataType.DECIMAL);
			expect(TypeMapper.normalizeBigQueryType("DECIMAL")).toBe(DataType.DECIMAL);
			expect(TypeMapper.normalizeBigQueryType("BIGNUMERIC")).toBe(
				DataType.DECIMAL,
			);
			expect(TypeMapper.normalizeBigQueryType("BIGDECIMAL")).toBe(
				DataType.DECIMAL,
			);
		});
	});

	describe("string types", () => {
		it("normalizes string types", () => {
			expect(TypeMapper.normalizeBigQueryType("STRING")).toBe(DataType.STRING);
			expect(TypeMapper.normalizeBigQueryType("UTF8")).toBe(DataType.STRING);
		});
	});

	describe("boolean types", () => {
		it("normalizes boolean types", () => {
			expect(TypeMapper.normalizeBigQueryType("BOOLEAN")).toBe(DataType.BOOLEAN);
			expect(TypeMapper.normalizeBigQueryType("BOOL")).toBe(DataType.BOOLEAN);
		});
	});

	describe("temporal types", () => {
		it("normalizes date/time types", () => {
			expect(TypeMapper.normalizeBigQueryType("DATE")).toBe(DataType.DATE);
			expect(TypeMapper.normalizeBigQueryType("TIME")).toBe(DataType.TIME);
			expect(TypeMapper.normalizeBigQueryType("DATETIME")).toBe(
				DataType.DATETIME,
			);
			expect(TypeMapper.normalizeBigQueryType("TIMESTAMP")).toBe(
				DataType.TIMESTAMPTZ,
			);
		});
	});

	describe("complex types", () => {
		it("normalizes array types", () => {
			expect(TypeMapper.normalizeBigQueryType("ARRAY<STRING>")).toBe(
				DataType.ARRAY,
			);
		});

		it("normalizes struct types", () => {
			expect(TypeMapper.normalizeBigQueryType("STRUCT<x INT64>")).toBe(
				DataType.STRUCT,
			);
			expect(TypeMapper.normalizeBigQueryType("RECORD")).toBe(DataType.STRUCT);
		});
	});
});

describe("TypeMapper.normalizeType", () => {
	it("routes to DuckDB normalizer", () => {
		expect(TypeMapper.normalizeType("integer", "duckdb")).toBe(DataType.INTEGER);
	});

	it("routes to BigQuery normalizer", () => {
		expect(TypeMapper.normalizeType("STRING", "bigquery")).toBe(DataType.STRING);
	});

	it("returns unknown for unsupported connector", () => {
		// @ts-expect-error - testing invalid input
		expect(TypeMapper.normalizeType("integer", "unknown")).toBe(
			DataType.UNKNOWN,
		);
	});
});

describe("TypeMapper.getDisplayName", () => {
	it("returns friendly names for common types", () => {
		expect(TypeMapper.getDisplayName(DataType.INTEGER)).toBe("Integer");
		expect(TypeMapper.getDisplayName(DataType.BIGINT)).toBe("Big Integer");
		expect(TypeMapper.getDisplayName(DataType.VARCHAR)).toBe("Text");
		expect(TypeMapper.getDisplayName(DataType.STRING)).toBe("Text");
		expect(TypeMapper.getDisplayName(DataType.BOOLEAN)).toBe("Boolean");
		expect(TypeMapper.getDisplayName(DataType.DATE)).toBe("Date");
		expect(TypeMapper.getDisplayName(DataType.TIMESTAMP)).toBe("Timestamp");
		expect(TypeMapper.getDisplayName(DataType.JSON)).toBe("JSON");
		expect(TypeMapper.getDisplayName(DataType.ARRAY)).toBe("Array");
		expect(TypeMapper.getDisplayName(DataType.STRUCT)).toBe("Struct");
	});

	it("returns type string for unmapped types", () => {
		expect(TypeMapper.getDisplayName(DataType.UNKNOWN)).toBe("UNKNOWN");
	});

	it("returns display name for HUGEINT types", () => {
		expect(TypeMapper.getDisplayName(DataType.HUGEINT)).toBe("Huge Integer (128-bit)");
		expect(TypeMapper.getDisplayName(DataType.UHUGEINT)).toBe("Unsigned Huge Integer (128-bit)");
	});
});
