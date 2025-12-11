import { describe, expect, it } from "vitest";
import { detectQueryEngine } from "../engineDetectors";

describe("queryEngineDetector", () => {
	describe("BigQuery detection", () => {
		it("detects backtick project.dataset.table pattern", () => {
			const result = detectQueryEngine(
				"SELECT * FROM `myproject.mydataset.mytable`",
			);
			expect(result.engine).toBe("bigquery");
			expect(result.confidence).toBe("medium"); // weight 10 = medium
			expect(result.signals).toContain("backtick project.dataset.table");
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
		it("detects read_csv function", () => {
			const result = detectQueryEngine("SELECT * FROM read_csv('data.csv')");
			expect(result.engine).toBe("duckdb");
			expect(result.confidence).toBe("medium"); // weight 10 = medium
			expect(result.signals).toContain("read_csv() function");
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
			expect(result.signals).toContain("S3 path reference");
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
