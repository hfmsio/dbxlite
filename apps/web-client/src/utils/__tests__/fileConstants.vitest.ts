import { describe, expect, it } from "vitest";
import {
	chooseRegistrationMode,
	requiresFullBuffer,
	shouldUseZeroCopy,
	ZERO_COPY_THRESHOLD,
} from "../fileConstants";

describe("requiresFullBuffer", () => {
	// The regression this guards: XLSX registered via the File handle path
	// reads ~3-10x slower, because DuckDB's ZIP reader seeks all over the
	// archive and each seek costs a slice + sync read through FileReader.
	it("is true for Excel workbooks, by bare extension or filename", () => {
		expect(requiresFullBuffer("xlsx")).toBe(true);
		expect(requiresFullBuffer("xls")).toBe(true);
		expect(requiresFullBuffer("account_segmentation_2026-07-15.xlsx")).toBe(
			true,
		);
		expect(requiresFullBuffer("legacy.xls")).toBe(true);
	});

	it("is false for streaming formats, which are faster via a File handle", () => {
		for (const f of ["parquet", "csv", "tsv", "json", "jsonl", "arrow"]) {
			expect(requiresFullBuffer(f)).toBe(false);
		}
		expect(requiresFullBuffer("events.parquet")).toBe(false);
		expect(requiresFullBuffer("data.csv")).toBe(false);
	});

	it("ignores case", () => {
		expect(requiresFullBuffer("XLSX")).toBe(true);
		expect(requiresFullBuffer("Report.XLSX")).toBe(true);
		expect(requiresFullBuffer("DATA.CSV")).toBe(false);
	});

	it("does not treat a name merely containing xls as a workbook", () => {
		expect(requiresFullBuffer("xlsx_export_notes.txt")).toBe(false);
		expect(requiresFullBuffer("csv")).toBe(false);
	});
});

describe("shouldUseZeroCopy", () => {
	it("only kicks in above the threshold", () => {
		expect(shouldUseZeroCopy(ZERO_COPY_THRESHOLD + 1)).toBe(true);
		expect(shouldUseZeroCopy(ZERO_COPY_THRESHOLD)).toBe(false);
		expect(shouldUseZeroCopy(1024)).toBe(false);
	});
});

describe("chooseRegistrationMode", () => {
	it("always buffers XLSX, even when large enough to earn a handle", () => {
		expect(chooseRegistrationMode("report.xlsx", 10)).toBe("buffer");
		expect(chooseRegistrationMode("huge.xlsx", ZERO_COPY_THRESHOLD + 1)).toBe(
			"buffer",
		);
		expect(chooseRegistrationMode("legacy.xls", ZERO_COPY_THRESHOLD * 2)).toBe(
			"buffer",
		);
	});

	it("buffers small non-XLSX files and hands large ones a File handle", () => {
		expect(chooseRegistrationMode("events.parquet", 1024)).toBe("buffer");
		expect(
			chooseRegistrationMode("events.parquet", ZERO_COPY_THRESHOLD + 1),
		).toBe("handle");
		expect(chooseRegistrationMode("data.csv", ZERO_COPY_THRESHOLD + 1)).toBe(
			"handle",
		);
	});
});
