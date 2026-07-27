import { describe, expect, it } from "vitest";
import type { DataSource } from "../../types/data-source";
import { rewriteXlsxReferences } from "../xlsxQuery";

function xlsx(filePath: string): DataSource {
	return {
		id: `ds-${filePath}`,
		name: filePath,
		type: "xlsx",
		filePath,
		uploadedAt: new Date("2026-01-01T00:00:00Z"),
	} as DataSource;
}

describe("rewriteXlsxReferences", () => {
	it("rewrites a FROM reference to a registered xlsx into read_xlsx(all_varchar)", () => {
		const out = rewriteXlsxReferences(
			"SELECT * FROM 'verdicts_large-batch.xlsx'",
			[xlsx("verdicts_large-batch.xlsx")],
		);
		expect(out).toBe(
			"SELECT * FROM read_xlsx('verdicts_large-batch.xlsx', all_varchar=true)",
		);
	});

	it("keeps an alias after the rewritten source", () => {
		const out = rewriteXlsxReferences("SELECT x.a FROM 'book.xlsx' as x", [
			xlsx("book.xlsx"),
		]);
		expect(out).toBe(
			"SELECT x.a FROM read_xlsx('book.xlsx', all_varchar=true) as x",
		);
	});

	it("is a no-op when the SQL references no registered xlsx", () => {
		const sql = "SELECT * FROM 'other.parquet'";
		expect(rewriteXlsxReferences(sql, [xlsx("book.xlsx")])).toBe(sql);
	});

	it("is a no-op with no xlsx data sources", () => {
		const sql = "SELECT * FROM 'book.xlsx'";
		expect(rewriteXlsxReferences(sql, [])).toBe(sql);
	});

	it("does not double-wrap an already-explicit read_xlsx call", () => {
		const sql = "SELECT * FROM read_xlsx('book.xlsx', all_varchar=true)";
		expect(rewriteXlsxReferences(sql, [xlsx("book.xlsx")])).toBe(sql);
	});

	it("leaves an unrelated string literal equal to the filename alone", () => {
		// Not in FROM/JOIN position, so it is data, not a source.
		const sql = "SELECT 'book.xlsx' AS label FROM 'book.xlsx'";
		expect(rewriteXlsxReferences(sql, [xlsx("book.xlsx")])).toBe(
			"SELECT 'book.xlsx' AS label FROM read_xlsx('book.xlsx', all_varchar=true)",
		);
	});
});
