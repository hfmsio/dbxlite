import { describe, expect, it } from "vitest";
import { detectQueryEngine } from "../engineDetectors";

describe("queryEngineDetector", () => {
	describe("BigQuery detection", () => {
		it("detects backtick project.dataset.table with HIGH confidence (definitive)", () => {
			// DuckDB/Snowflake can't parse backtick FQNs, so a single match is
			// definitive → high, which is what lets auto-switch fire.
			const result = detectQueryEngine(
				"SELECT * FROM `myproject.mydataset.mytable`",
			);
			expect(result.engine).toBe("bigquery");
			expect(result.confidence).toBe("high");
			expect(result.signals).toContain("backtick project.dataset.table");
		});

		it("treats the hyphenated-project backtick FQN as high too", () => {
			// The exact shape from the bug report.
			const result = detectQueryEngine(
				"SELECT * FROM `s1project-272120.bqtest.flights` LIMIT 100",
			);
			expect(result.engine).toBe("bigquery");
			expect(result.confidence).toBe("high");
		});

		it("detects backtick dataset.table pattern", () => {
			const result = detectQueryEngine("SELECT * FROM `mydataset.mytable`");
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("backtick dataset.table");
		});

		it("detects SAFE_DIVIDE function", () => {
			const result = detectQueryEngine("SELECT SAFE_DIVIDE(a, b) FROM t");
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("SAFE_DIVIDE function");
		});

		it("detects SAFE_CAST function", () => {
			const result = detectQueryEngine("SELECT SAFE_CAST(x AS INT64) FROM t");
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("SAFE_CAST function");
		});

		it("detects GENERATE_ARRAY function", () => {
			const result = detectQueryEngine("SELECT GENERATE_ARRAY(1, 10) AS arr");
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("GENERATE_ARRAY function");
		});

		it("detects _TABLE_SUFFIX wildcard", () => {
			const result = detectQueryEngine(
				"SELECT * FROM `project.dataset.table_*` WHERE _TABLE_SUFFIX = '2023'",
			);
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("_TABLE_SUFFIX wildcard table");
		});

		it("detects CREATE MODEL (BQML)", () => {
			const result = detectQueryEngine(
				"CREATE OR REPLACE MODEL mymodel OPTIONS(model_type='linear_reg')",
			);
			expect(result.engine).toBe("bigquery");
			expect(result.signals).toContain("CREATE MODEL (BQML)");
		});
	});

	describe("DuckDB detection", () => {
		it("detects read_csv function with HIGH confidence (definitive)", () => {
			// read_* is DuckDB-exclusive, so a single match is definitive.
			const result = detectQueryEngine("SELECT * FROM read_csv('data.csv')");
			expect(result.engine).toBe("duckdb");
			expect(result.confidence).toBe("high");
			expect(result.signals).toContain("read_csv() function");
		});

		it("treats a local file path as high (the mirror of the BigQuery bug)", () => {
			const result = detectQueryEngine("SELECT * FROM 'bqflights100k.parquet'");
			expect(result.engine).toBe("duckdb");
			expect(result.confidence).toBe("high");
		});

		it("detects read_parquet function", () => {
			const result = detectQueryEngine(
				"SELECT * FROM read_parquet('data.parquet')",
			);
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("read_parquet() function");
		});

		it("detects read_json function", () => {
			const result = detectQueryEngine("SELECT * FROM read_json('data.json')");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("read_json() function");
		});

		it("detects file path in FROM clause", () => {
			const result = detectQueryEngine("SELECT * FROM 'data/myfile.csv'");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("file path reference");
		});

		it("detects S3 path", () => {
			const result = detectQueryEngine(
				"SELECT * FROM 's3://bucket/path/file.parquet'",
			);
			expect(result.engine).toBe("duckdb");
			// s3/gs/http/... FROM-clause URLs are one consolidated signal now.
			expect(result.signals).toContain("URL source reference");
		});

		it("detects ATTACH statement", () => {
			const result = detectQueryEngine("ATTACH 'mydb.duckdb' AS mydb");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("ATTACH statement");
		});

		it("detects EXCLUDE column modifier", () => {
			const result = detectQueryEngine("SELECT * EXCLUDE (column1) FROM t");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("EXCLUDE column modifier");
		});

		it("detects COLUMNS expression", () => {
			const result = detectQueryEngine(
				"SELECT COLUMNS('price_.*') FROM products",
			);
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("COLUMNS() expression");
		});

		it("detects list_* functions", () => {
			const result = detectQueryEngine(
				"SELECT list_aggregate([1,2,3], 'sum') AS total",
			);
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("list_* function");
		});

		it("detects glob pattern in FROM", () => {
			const result = detectQueryEngine("SELECT * FROM 'data/*.csv'");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("glob pattern in FROM");
		});

		it("detects INSTALL extension", () => {
			const result = detectQueryEngine("INSTALL httpfs");
			expect(result.engine).toBe("duckdb");
			expect(result.signals).toContain("INSTALL extension");
		});
	});

	describe("Unknown detection", () => {
		it("returns unknown for standard SQL without distinctive patterns", () => {
			const result = detectQueryEngine("SELECT * FROM users WHERE id = 1");
			expect(result.engine).toBe("unknown");
		});

		it("returns unknown for empty SQL", () => {
			const result = detectQueryEngine("");
			expect(result.engine).toBe("unknown");
		});

		it("returns unknown for simple aggregation", () => {
			const result = detectQueryEngine(
				"SELECT COUNT(*) FROM orders GROUP BY customer_id",
			);
			expect(result.engine).toBe("unknown");
		});
	});

	describe("Confidence levels", () => {
		it("returns high confidence for multiple strong signals", () => {
			const result = detectQueryEngine(`
				SELECT * FROM read_csv('data.csv')
				WHERE name IN (SELECT name FROM read_parquet('users.parquet'))
			`);
			expect(result.engine).toBe("duckdb");
			expect(result.confidence).toBe("high");
		});

		it("returns medium confidence for single moderate signal", () => {
			const result = detectQueryEngine("SELECT DATE_TRUNC('month', date) FROM t");
			// DATE_TRUNC has weight 6, which falls into medium confidence
			expect(result.engine).toBe("bigquery");
			expect(result.confidence).toBe("low");
		});
	});
});

describe("false-positive hardening (definitive patterns)", () => {
	it("does NOT read an email literal as a Snowflake @stage", () => {
		const result = detectQueryEngine(
			"SELECT * FROM users WHERE email = 'alice@example.com'",
		);
		// Must not force a Snowflake auto-switch off an email in the data.
		expect(result.engine).not.toBe("snowflake");
	});

	it("still detects a real @stage as Snowflake (high)", () => {
		const result = detectQueryEngine("SELECT * FROM @my_stage/data/");
		expect(result.engine).toBe("snowflake");
		expect(result.confidence).toBe("high");
	});

	it("detects @%table stage", () => {
		const result = detectQueryEngine("LIST @%mytable");
		expect(result.engine).toBe("snowflake");
	});

	it("ignores a DuckDB token inside a line comment", () => {
		const result = detectQueryEngine(
			"SELECT 1 -- example using read_parquet('x.parquet')",
		);
		expect(result.engine).not.toBe("duckdb");
	});

	it("ignores a backtick FQN inside a block comment", () => {
		const result = detectQueryEngine(
			"SELECT 1 /* was `proj.ds.tbl` */ FROM t",
		);
		expect(result.engine).not.toBe("bigquery");
	});

	it("still detects read_parquet in live SQL", () => {
		const result = detectQueryEngine(
			"SELECT 1 -- note\nFROM read_parquet('x.parquet')",
		);
		expect(result.engine).toBe("duckdb");
		expect(result.confidence).toBe("high");
	});
});

describe("DuckDB file-source detection", () => {
	it.each([
		["FROM 'data.csv'", "csv"],
		["FROM 'data.parquet'", "parquet"],
		["FROM 'data.jsonl'", "jsonl"],
		["FROM 'sales.xlsx'", "xlsx"],
		["FROM 'events.ndjson'", "ndjson"],
		["FROM 'part.parquet.gz'", "compressed parquet"],
	])("treats %s as DuckDB (high)", (frag) => {
		const result = detectQueryEngine(`SELECT * ${frag}`);
		expect(result.engine).toBe("duckdb");
		expect(result.confidence).toBe("high");
	});

	it("treats a glob parquet path as DuckDB (high)", () => {
		const result = detectQueryEngine("SELECT * FROM 'data/*.parquet'");
		expect(result.engine).toBe("duckdb");
		expect(result.confidence).toBe("high");
	});

	it("treats a URL source as DuckDB (high)", () => {
		for (const url of [
			"s3://bucket/x.parquet",
			"gs://bucket/x.parquet",
			"https://example.com/x.parquet",
		]) {
			const result = detectQueryEngine(`SELECT * FROM '${url}'`);
			expect(result.engine).toBe("duckdb");
			expect(result.confidence).toBe("high");
		}
	});

	it("treats a bare glob (no extension) as a weaker DuckDB lean", () => {
		const result = detectQueryEngine("SELECT * FROM 'data/*'");
		expect(result.engine).toBe("duckdb");
	});
});
