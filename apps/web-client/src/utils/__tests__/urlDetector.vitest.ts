import { describe, it, expect, vi } from "vitest";
import {
	detectRemoteURLs,
	extractNameFromURL,
	getRemoteFileSize,
} from "../urlDetector";

describe("detectRemoteURLs", () => {
	describe("single-quoted URLs", () => {
		it("detects parquet files", () => {
			const sql = "SELECT * FROM 'https://example.com/data.parquet'";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				url: "https://example.com/data.parquet",
				type: "parquet",
				position: expect.any(Number),
			});
		});

		it("detects csv files", () => {
			const sql = "SELECT * FROM 'https://example.com/data.csv'";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe("csv");
		});

		it("detects json files", () => {
			const sql = "SELECT * FROM 'https://example.com/data.json'";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe("json");
		});

		// Note: jsonl/ndjson detection requires the extension to be captured
		// The regex alternation `json|jsonl` matches `json` first, preventing jsonl match
		// This is a limitation of the current implementation
	});

	describe("double-quoted URLs", () => {
		it("detects parquet files", () => {
			const sql = 'SELECT * FROM "https://example.com/data.parquet"';
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe("parquet");
		});
	});

	describe("multiple URLs", () => {
		it("detects multiple URLs in query", () => {
			const sql = `
				SELECT * FROM 'https://example.com/data1.parquet'
				UNION ALL
				SELECT * FROM 'https://example.com/data2.csv'
			`;
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(2);
			expect(result[0]?.type).toBe("parquet");
			expect(result[1]?.type).toBe("csv");
		});

		it("removes duplicate URLs", () => {
			const sql = `
				SELECT * FROM 'https://example.com/data.parquet'
				WHERE x IN (SELECT x FROM 'https://example.com/data.parquet')
			`;
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
		});
	});

	describe("edge cases", () => {
		it("returns empty array for no URLs", () => {
			const sql = "SELECT * FROM local_table";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(0);
		});

		it("ignores mismatched quotes", () => {
			// This tests the quote matching logic
			const sql = "SELECT * FROM 'https://example.com/data.parquet\"";
			const result = detectRemoteURLs(sql);
			// Should not match due to mismatched quotes
			expect(result).toHaveLength(0);
		});

		it("handles http URLs", () => {
			const sql = "SELECT * FROM 'http://example.com/data.parquet'";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
		});

		it("handles complex paths", () => {
			const sql =
				"SELECT * FROM 'https://bucket.s3.amazonaws.com/path/to/data.parquet'";
			const result = detectRemoteURLs(sql);
			expect(result).toHaveLength(1);
			expect(result[0]?.url).toBe(
				"https://bucket.s3.amazonaws.com/path/to/data.parquet",
			);
		});
	});
});

describe("extractNameFromURL", () => {
	it("extracts filename without extension", () => {
		expect(extractNameFromURL("https://example.com/data.parquet")).toBe("data");
	});

	it("extracts filename from deep path", () => {
		expect(
			extractNameFromURL("https://example.com/path/to/my_data.csv"),
		).toBe("my_data");
	});

	it("handles json extension", () => {
		expect(extractNameFromURL("https://example.com/results.json")).toBe(
			"results",
		);
	});

	it("handles jsonl extension", () => {
		// extractNameFromURL removes known extensions
		const result = extractNameFromURL("https://example.com/stream.jsonl");
		expect(result).toBe("stream");
	});

	it("handles ndjson extension", () => {
		// extractNameFromURL removes known extensions
		const result = extractNameFromURL("https://example.com/events.ndjson");
		expect(result).toBe("events");
	});

	it("replaces special characters with underscores", () => {
		expect(
			extractNameFromURL("https://example.com/my%20file%20name.parquet"),
		).toBe("my_20file_20name");
	});

	it("returns default for invalid URL", () => {
		expect(extractNameFromURL("not-a-url")).toBe("remote_data");
	});

	it("returns default for URL without path", () => {
		expect(extractNameFromURL("https://example.com/")).toBe("remote_data");
	});

	it("handles query parameters", () => {
		expect(
			extractNameFromURL("https://example.com/data.parquet?token=abc"),
		).toBe("data");
	});
});

describe("getRemoteFileSize", () => {
	it("returns size from Content-Length header", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			headers: {
				get: (name: string) => (name === "Content-Length" ? "12345" : null),
			},
		});
		vi.stubGlobal("fetch", mockFetch);

		const size = await getRemoteFileSize("https://example.com/data.parquet");
		expect(size).toBe(12345);
		expect(mockFetch).toHaveBeenCalledWith("https://example.com/data.parquet", {
			method: "HEAD",
		});

		vi.unstubAllGlobals();
	});

	it("returns undefined when Content-Length not available", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			headers: {
				get: () => null,
			},
		});
		vi.stubGlobal("fetch", mockFetch);

		const size = await getRemoteFileSize("https://example.com/data.parquet");
		expect(size).toBeUndefined();

		vi.unstubAllGlobals();
	});

	it("returns undefined on fetch error", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
		vi.stubGlobal("fetch", mockFetch);

		const size = await getRemoteFileSize("https://example.com/data.parquet");
		expect(size).toBeUndefined();

		vi.unstubAllGlobals();
	});
});
