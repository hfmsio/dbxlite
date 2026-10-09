/**
 * The arithmetic behind horizontal virtualization.
 *
 * Tested without a DOM because the header and the body both consume it: if they
 * ever disagreed about which columns are drawn, the headers would sit above the
 * wrong data, which is far worse than the slowness this fixes.
 */

import { describe, expect, it } from "vitest";
import { computeColumnOffsets, computeColumnWindow } from "../utils/columnWindow";

const widths = (n: number, w = 100) => new Array(n).fill(w);

describe("computeColumnOffsets", () => {
	it("produces running left edges plus a final total", () => {
		expect(computeColumnOffsets([100, 50, 200])).toEqual([0, 100, 150, 350]);
	});

	it("substitutes the default width for a missing or zero width", () => {
		expect(computeColumnOffsets([0, 100])).toEqual([0, 150, 250]);
	});

	it("handles no columns", () => {
		expect(computeColumnOffsets([])).toEqual([0]);
	});
});

describe("computeColumnWindow", () => {
	it("renders only the columns overlapping the viewport", () => {
		// 467 columns x 100px; a 1000px viewport shows ~10 of them.
		const offsets = computeColumnOffsets(widths(467));
		const w = computeColumnWindow(offsets, 0, 1000, 40, 2);

		expect(w.startCol).toBe(0);
		// ~10 visible + right buffer, and nowhere near all 467.
		expect(w.endCol).toBeLessThan(20);
		expect(w.totalWidth).toBe(46700);
	});

	it("moves the window as the grid scrolls right", () => {
		const offsets = computeColumnOffsets(widths(467));
		const w = computeColumnWindow(offsets, 20000, 1000, 40, 2);

		// 20000px in, minus the 40px gutter, is column ~199.
		expect(w.startCol).toBeGreaterThan(190);
		expect(w.startCol).toBeLessThan(200);
		expect(w.endCol).toBeGreaterThan(w.startCol);
		expect(w.endCol - w.startCol).toBeLessThan(25);
	});

	it("keeps spacers that sum to the untouched width", () => {
		// The scrollbar must not move when the window does, so the spacers plus
		// the rendered columns always reconstruct the full width.
		const offsets = computeColumnOffsets(widths(467));
		const w = computeColumnWindow(offsets, 12345, 900, 40, 2);
		const rendered = offsets[w.endCol] - offsets[w.startCol];

		expect(w.leftSpacer + rendered + w.rightSpacer).toBe(w.totalWidth);
	});

	it("renders everything when the columns already fit", () => {
		const offsets = computeColumnOffsets(widths(5));
		const w = computeColumnWindow(offsets, 0, 2000, 40, 2);

		expect(w.startCol).toBe(0);
		expect(w.endCol).toBe(5);
		expect(w.leftSpacer).toBe(0);
		expect(w.rightSpacer).toBe(0);
	});

	it("covers the viewport, so no visible column is left blank", () => {
		// The property that matters: every column the user can see is rendered.
		const offsets = computeColumnOffsets(widths(200, 80));
		for (const scrollLeft of [0, 137, 999, 5000, 15920]) {
			const w = computeColumnWindow(offsets, scrollLeft, 1000, 40, 0);
			const viewLeft = Math.max(0, scrollLeft - 40);
			const viewRight = scrollLeft + 1000 - 40;
			for (let i = 0; i < 200; i++) {
				const overlaps = offsets[i + 1] > viewLeft && offsets[i] < viewRight;
				if (overlaps) {
					expect(i).toBeGreaterThanOrEqual(w.startCol);
					expect(i).toBeLessThan(w.endCol);
				}
			}
		}
	});

	it("handles variable column widths", () => {
		const offsets = computeColumnOffsets([500, 50, 50, 50, 800, 100]);
		const w = computeColumnWindow(offsets, 0, 600, 0, 0);
		// 600px covers col 0 (0-500) and col 1 (500-550) and col 2 (550-600).
		expect(w.startCol).toBe(0);
		expect(w.endCol).toBeGreaterThanOrEqual(3);
	});

	it("never returns an empty window", () => {
		// A blank grid is a worse failure than drawing one extra column.
		const offsets = computeColumnOffsets(widths(10));
		const w = computeColumnWindow(offsets, 999999, 1000, 40, 0);
		expect(w.endCol).toBeGreaterThan(w.startCol);
	});

	it("falls back to a wide guess before the container is measured", () => {
		// containerWidth is 0 on the first paint. Windowing to a single column
		// there would look broken, and a resize observer that never fires would
		// leave it broken.
		const offsets = computeColumnOffsets(widths(467));
		const w = computeColumnWindow(offsets, 0, 0, 40, 2);
		expect(w.endCol).toBeGreaterThan(10);
	});

	it("handles no columns at all", () => {
		const w = computeColumnWindow(computeColumnOffsets([]), 0, 1000, 40, 2);
		expect(w).toEqual({ startCol: 0, endCol: 0, leftSpacer: 0, rightSpacer: 0, totalWidth: 0 });
	});
});
