import { describe, expect, it } from "vitest";
import {
	buildProbeCall,
	buildReadXlsxCall,
	columnIndexToLetter,
	detectHeaderRange,
	formatDataRange,
	probeRange,
	SHEET_MAX_ROW,
	type ProbeGrid,
} from "../xlsxRange";

/** Build a grid row: `cells` at the front, padded with nulls to `width`. */
const row = (cells: (string | null)[], width = 11): (string | null)[] => [
	...cells,
	...Array(Math.max(0, width - cells.length)).fill(null),
];
const blank = (width = 11): (string | null)[] => Array(width).fill(null);

const HEADER = ["account_id", "name", "segment", "business_type", "owner"];
const data = (n: number) => row([`v${n}A`, `v${n}B`, `v${n}C`, `v${n}D`, `v${n}E`]);

describe("columnIndexToLetter", () => {
	it("maps the bijective base-26 sequence", () => {
		expect(columnIndexToLetter(0)).toBe("A");
		expect(columnIndexToLetter(8)).toBe("I");
		expect(columnIndexToLetter(25)).toBe("Z");
		expect(columnIndexToLetter(26)).toBe("AA");
		expect(columnIndexToLetter(51)).toBe("AZ");
		expect(columnIndexToLetter(52)).toBe("BA");
		expect(columnIndexToLetter(77)).toBe("BZ");
	});

	it("rejects nonsense indices rather than emitting a broken range", () => {
		expect(() => columnIndexToLetter(-1)).toThrow(RangeError);
		expect(() => columnIndexToLetter(1.5)).toThrow(RangeError);
	});
});

describe("detectHeaderRange", () => {
	it("finds the header under a title + blank spacer (the reported bug)", () => {
		// Exactly the grid DuckDB returns for account_segmentation's MASTER
		// sheet: single-cell title, blank spacer, real header on row 3.
		const grid: ProbeGrid = [
			row(["Account Segmentation 2026-07-15"]),
			blank(),
			row(HEADER),
			data(4),
			data(5),
		];
		expect(detectHeaderRange(grid)).toEqual({
			headerRow: 3,
			firstColumnIndex: 0,
			lastColumnIndex: 4,
		});
	});

	it("returns row 1 for an ordinary sheet, so nothing regresses", () => {
		const grid: ProbeGrid = [row(HEADER), data(2), data(3)];
		expect(detectHeaderRange(grid)).toEqual({
			headerRow: 1,
			firstColumnIndex: 0,
			lastColumnIndex: 4,
		});
	});

	it("skips a multi-cell title that is still narrower than the header", () => {
		// "Report:" / "2026-07-15" is 2 cells — a naive >=2 rule would take it.
		const grid: ProbeGrid = [
			row(["Report:", "2026-07-15"]),
			blank(),
			row(HEADER),
			data(4),
		];
		expect(detectHeaderRange(grid)?.headerRow).toBe(3);
	});

	it("handles data that does not start at column A", () => {
		const grid: ProbeGrid = [
			blank(),
			row([null, null, "id", "name", "segment"]),
			row([null, null, "1", "acme", "SMB"]),
		];
		expect(detectHeaderRange(grid)).toEqual({
			headerRow: 2,
			firstColumnIndex: 2,
			lastColumnIndex: 4,
		});
	});

	it("ignores whitespace-only cells", () => {
		const grid: ProbeGrid = [row(["   "]), row(["  ", " "]), row(HEADER), data(4)];
		expect(detectHeaderRange(grid)?.headerRow).toBe(3);
	});

	it("declines to guess on an empty sheet or a single-column sheet", () => {
		expect(detectHeaderRange([blank(), blank()])).toBeNull();
		expect(detectHeaderRange([])).toBeNull();
		// One column gives no way to tell a title from a header — caller keeps
		// DuckDB's default rather than acting on a coin flip.
		expect(detectHeaderRange([row(["total"]), row(["1"]), row(["2"])])).toBeNull();
	});

	it("tolerates a ragged header row with internal gaps", () => {
		const grid: ProbeGrid = [
			row(["id", null, "segment", null, "owner"]),
			data(2),
		];
		expect(detectHeaderRange(grid)).toEqual({
			headerRow: 1,
			firstColumnIndex: 0,
			lastColumnIndex: 4,
		});
	});
});

describe("formatDataRange", () => {
	it("spans the header's columns down to the sheet ceiling", () => {
		// The ceiling is safe only because callers pair it with
		// stop_at_empty=true, which trims the tail at the first blank row.
		expect(
			formatDataRange({ headerRow: 3, firstColumnIndex: 0, lastColumnIndex: 8 }),
		).toBe(`A3:I${SHEET_MAX_ROW}`);
		expect(
			formatDataRange({ headerRow: 1, firstColumnIndex: 2, lastColumnIndex: 27 }),
		).toBe(`C1:AB${SHEET_MAX_ROW}`);
	});
});

describe("probeRange", () => {
	it("samples a bounded block off the top of the sheet", () => {
		expect(probeRange()).toBe("A1:BZ30");
	});
});

describe("buildReadXlsxCall", () => {
	it("pairs a range with stop_at_empty=true", () => {
		// Both are required together: stop_at_empty defaults to true only when
		// no range is given, so a range alone pads to the sheet ceiling.
		expect(buildReadXlsxCall("report.xlsx", "MASTER (Business Type Led)", "A3:I1048576")).toBe(
			"read_xlsx('report.xlsx', sheet='MASTER (Business Type Led)', range='A3:I1048576', stop_at_empty=true, all_varchar=true)",
		);
	});

	it("omits range/stop_at_empty when no range was detected", () => {
		expect(buildReadXlsxCall("data.xlsx", "Sheet1")).toBe(
			"read_xlsx('data.xlsx', sheet='Sheet1', all_varchar=true)",
		);
		expect(buildReadXlsxCall("data.xlsx", "Sheet1", null)).toBe(
			"read_xlsx('data.xlsx', sheet='Sheet1', all_varchar=true)",
		);
	});

	it("always reads as text, so a mixed column cannot abort the read", () => {
		// A single text cell in an otherwise-numeric column makes DuckDB fail
		// the whole read: "Could not convert string ... to DOUBLE".
		for (const sql of [
			buildReadXlsxCall("f.xlsx", "S"),
			buildReadXlsxCall("f.xlsx", "S", "A3:I1048576"),
		]) {
			expect(sql).toContain("all_varchar=true");
			// ignore_errors would NULL the offending cells instead — data loss.
			expect(sql).not.toContain("ignore_errors");
		}
	});

	it("escapes apostrophes in sheet names and paths", () => {
		expect(buildReadXlsxCall("Q1 O'Brien.xlsx", "Bob's Sheet")).toBe(
			"read_xlsx('Q1 O''Brien.xlsx', sheet='Bob''s Sheet', all_varchar=true)",
		);
	});
});

describe("buildProbeCall", () => {
	it("reads raw cells with no header interpretation", () => {
		expect(buildProbeCall("report.xlsx", "MASTER")).toBe(
			"read_xlsx('report.xlsx', sheet='MASTER', range='A1:BZ30', header=false, all_varchar=true, stop_at_empty=false)",
		);
	});
});
