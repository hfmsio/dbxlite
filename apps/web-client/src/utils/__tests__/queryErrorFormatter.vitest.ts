import { describe, expect, test } from "vitest";
import type { DataSource } from "../../types/data-source";
import { formatQueryError } from "../queryErrorFormatter";

describe("queryErrorFormatter", () => {
	const createContext = (
		overrides: Partial<Parameters<typeof formatQueryError>[0]> = {},
	) => ({
		errorMessage: "Generic error",
		sql: "SELECT * FROM test",
		connectorType: "duckdb" as const,
		dataSources: [] as DataSource[],
		...overrides,
	});

	describe("DuckDB catalog errors", () => {
		test("should format catalog not found error with helpful message", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: 'Catalog "mydb" does not exist',
					sql: "SELECT * FROM mydb.users",
					connectorType: "duckdb",
				}),
			);

			expect(result.userMessage).toContain(
				'Database catalog "mydb" is not attached',
			);
			expect(result.userMessage).toContain("ATTACH");
			expect(result.userMessage).toContain("mydb.duckdb");
			expect(result.catalogName).toBe("mydb");
		});

		test("should extract catalog name with single quotes", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Catalog 'analytics' does not exist",
					connectorType: "duckdb",
				}),
			);

			expect(result.catalogName).toBe("analytics");
		});

		test("should provide solutions for catalog errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: 'Catalog "sales" does not exist',
					connectorType: "duckdb",
				}),
			);

			expect(result.userMessage).toContain("Re-upload");
			expect(result.userMessage).toContain("Manual");
			expect(result.userMessage).toContain("remove");
		});
	});

	describe("BigQuery errors", () => {
		test("should suggest connector check for BigQuery catalog errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Catalog does not exist",
					connectorType: "bigquery",
				}),
			);

			expect(result.userMessage).toContain("BigQuery");
			expect(result.userMessage).toContain("DuckDB instead of BigQuery");
			expect(result.userMessage).toContain("Settings");
		});
	});

	describe("File access errors", () => {
		test("should detect file access issues from vague errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Error",
					sql: "SELECT * FROM 'data.csv'",
					dataSources: [
						{
							id: "1",
							name: "data.csv",
							filePath: "data.csv",
							type: "csv",
							size: 1000,
							permissionStatus: "prompt",
							uploadedAt: new Date(),
						},
					],
				}),
			);

			expect(result.userMessage).toContain("Cannot access file");
			expect(result.userMessage).toContain("data.csv");
			expect(result.userMessage).toContain("Re-upload");
		});

		test("should handle Arrow IPC failure", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "send() with Arrow IPC failed",
					sql: "SELECT * FROM 'users.csv'",
				}),
			);

			expect(result.userMessage).toContain("file access error");
			expect(result.userMessage).toContain("users.csv");
		});

		test("should handle Exception errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Exception: something went wrong",
					sql: "SELECT * FROM 'sales.csv'",
				}),
			);

			expect(result.userMessage).toContain("file access error");
		});

		test("should handle file not found error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "No files found matching 'missing.csv'",
				}),
			);

			expect(result.userMessage).toContain("File not found");
			expect(result.userMessage).toContain("upload");
		});

		test("should handle permission denied", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Permission denied: cannot read file",
				}),
			);

			expect(result.userMessage).toContain("Permission denied");
			expect(result.userMessage).toContain("uploading again");
		});
	});

	describe("Network/Remote file errors", () => {
		test("should format CORS error with solutions", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "CORS policy blocked the request",
				}),
			);

			expect(result.userMessage).toContain("CORS");
			expect(result.userMessage).toContain("Download the file");
			expect(result.userMessage).toContain("proxy");
		});

		test("should handle Access-Control-Allow-Origin error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "No 'Access-Control-Allow-Origin' header",
				}),
			);

			expect(result.userMessage).toContain("CORS");
		});

		test("should format 404 error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "HTTP 404: File not found",
				}),
			);

			expect(result.userMessage).toContain("404");
			expect(result.userMessage).toContain("not found");
			expect(result.userMessage).toContain("typos");
		});

		test("should format Not Found error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Not Found: the resource does not exist",
				}),
			);

			expect(result.userMessage).toContain("404");
		});

		test("should format 403 Forbidden error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "HTTP 403 Forbidden",
				}),
			);

			expect(result.userMessage).toContain("403");
			expect(result.userMessage).toContain("Access denied");
			expect(result.userMessage).toContain("authentication");
		});

		test("should format network/timeout errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Failed to fetch: network error",
				}),
			);

			expect(result.userMessage).toContain("Network error");
			expect(result.userMessage).toContain("internet connection");
		});

		test("should handle timeout error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Request timeout after 30s",
				}),
			);

			expect(result.userMessage).toContain("Network error");
		});

		test("should handle NetworkError", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "NetworkError when attempting to fetch",
				}),
			);

			expect(result.userMessage).toContain("Network error");
		});
	});

	describe("Other errors", () => {
		test("should handle stack overflow error", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "RangeError: maximum call stack size exceeded",
				}),
			);

			expect(result.userMessage).toContain("Query too large");
			expect(result.userMessage).toContain("LIMIT");
		});

		test("should pass through unknown errors", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Syntax error near SELECT",
				}),
			);

			expect(result.userMessage).toBe("Syntax error near SELECT");
			expect(result.catalogName).toBeUndefined();
		});

		test("should handle empty error message", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "",
				}),
			);

			expect(result.userMessage).toBe("Query execution failed");
		});
	});

	describe("DataSource permission checking", () => {
		test("should identify files with denied permission", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Error",
					sql: "SELECT * FROM 'blocked.csv'",
					dataSources: [
						{
							id: "1",
							name: "blocked.csv",
							filePath: "blocked.csv",
							type: "csv",
							size: 500,
							permissionStatus: "denied",
							uploadedAt: new Date(),
						},
					],
				}),
			);

			expect(result.userMessage).toContain("Cannot access file");
			expect(result.userMessage).toContain("blocked.csv");
		});

		test("should not flag files with granted permission", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Error",
					sql: "SELECT * FROM 'good.csv'",
					dataSources: [
						{
							id: "1",
							name: "good.csv",
							filePath: "good.csv",
							type: "csv",
							size: 500,
							permissionStatus: "granted",
							uploadedAt: new Date(),
						},
					],
				}),
			);

			// Should be generic file error, not specifically about this file's permission
			expect(result.userMessage).toContain("file access error");
			expect(result.userMessage).toContain("good.csv");
		});

		test("should handle multiple files with mixed permissions", () => {
			const result = formatQueryError(
				createContext({
					errorMessage: "Error",
					sql: "SELECT * FROM 'a.csv' JOIN 'b.csv'",
					dataSources: [
						{
							id: "1",
							name: "a.csv",
							filePath: "a.csv",
							type: "csv",
							size: 100,
							permissionStatus: "granted",
							uploadedAt: new Date(),
						},
						{
							id: "2",
							name: "b.csv",
							filePath: "b.csv",
							type: "csv",
							size: 200,
							permissionStatus: "prompt",
							uploadedAt: new Date(),
						},
					],
				}),
			);

			expect(result.userMessage).toContain("Cannot access file");
			expect(result.userMessage).toContain("b.csv");
		});
	});
});
