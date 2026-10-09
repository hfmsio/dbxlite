/**
 * Horizontal virtualization: which columns are worth rendering.
 *
 * The grid has always windowed rows and never columns, so every rendered row
 * built a cell for every column. At 467 columns that is ~8,400 cells for ~18
 * visible rows, and since a single ArrowDown re-renders the body, each keypress
 * rebuilt all of them: ~120ms of scripting per key, against ~16ms at 20
 * columns. The DOM size is the smaller half of that cost, but it is the half
 * this module removes; memoising the rows removes the other half.
 *
 * Kept pure and separate from the components so the arithmetic can be tested
 * without a DOM, and so the header and the body cannot disagree about which
 * columns they are drawing.
 */

/** What to render, and how much empty space to leave on either side. */
export interface ColumnWindow {
	/** First rendered column, inclusive. */
	startCol: number;
	/** Last rendered column, exclusive. */
	endCol: number;
	/** Width of the spacer standing in for columns before `startCol`. */
	leftSpacer: number;
	/** Width of the spacer standing in for columns after `endCol`. */
	rightSpacer: number;
	/** Total width of all columns, so the scrollbar keeps its true range. */
	totalWidth: number;
}

/** Fallback width, matching the one used elsewhere for a column with none. */
const DEFAULT_COLUMN_WIDTH = 150;

/**
 * Assumed viewport before the container has been measured.
 *
 * Zero would be the honest value but a bad default: it would window down to a
 * single column on first paint, and a resize observer that never fires would
 * leave it there. A wide guess errs toward drawing too much for one frame,
 * which is the recoverable direction.
 */
const UNMEASURED_VIEWPORT_WIDTH = 1600;

/**
 * Running left edge of each column, relative to the start of the column area.
 * `offsets[i]` is where column `i` begins; `offsets[n]` is the total width.
 *
 * Separated from {@link computeColumnWindow} because it depends only on the
 * columns: callers memoise it against the column list and recompute the window
 * alone while scrolling.
 */
export function computeColumnOffsets(widths: readonly number[]): number[] {
	const offsets = new Array<number>(widths.length + 1);
	offsets[0] = 0;
	for (let i = 0; i < widths.length; i++) {
		const w = widths[i];
		offsets[i + 1] = offsets[i] + (w > 0 ? w : DEFAULT_COLUMN_WIDTH);
	}
	return offsets;
}

/**
 * The columns overlapping the viewport, padded by `buffer` on each side.
 *
 * `rowNumWidth` matters because the row-number gutter scrolls with the content
 * rather than being pinned, so the column area starts that far into the
 * scrollable width.
 */
export function computeColumnWindow(
	offsets: readonly number[],
	scrollLeft: number,
	viewportWidth: number,
	rowNumWidth: number,
	buffer = 2,
): ColumnWindow {
	const columnCount = Math.max(0, offsets.length - 1);
	const totalWidth = columnCount > 0 ? offsets[columnCount] : 0;

	if (columnCount === 0) {
		return { startCol: 0, endCol: 0, leftSpacer: 0, rightSpacer: 0, totalWidth: 0 };
	}

	const width = viewportWidth > 0 ? viewportWidth : UNMEASURED_VIEWPORT_WIDTH;
	// Viewport in column-area coordinates. The gutter occupies the first
	// `rowNumWidth` pixels of the scrollable content, so subtract it.
	const viewLeft = Math.max(0, scrollLeft - rowNumWidth);
	const viewRight = Math.max(0, scrollLeft + width - rowNumWidth);

	// First column whose right edge is past the viewport's left edge.
	let start = lowerBound(offsets, viewLeft, columnCount);
	// First column whose left edge is at or past the viewport's right edge.
	let end = lowerBound(offsets, viewRight, columnCount);
	if (end < columnCount && offsets[end] < viewRight) end += 1;
	end = Math.min(columnCount, end + 1);

	start = Math.max(0, start - buffer);
	end = Math.min(columnCount, end + buffer);
	// A window that renders nothing would leave the grid blank. Reachable when
	// scrollLeft runs past the content, which happens transiently while columns
	// are being resized narrower.
	if (end <= start) {
		start = Math.max(0, Math.min(start, columnCount - 1));
		end = start + 1;
	}

	return {
		startCol: start,
		endCol: end,
		leftSpacer: offsets[start],
		rightSpacer: totalWidth - offsets[end],
		totalWidth,
	};
}

/**
 * Index of the first column whose RIGHT edge exceeds `x`, by binary search.
 * Linear scanning would be fine at 467 columns but this runs on every scroll
 * event, and the cost is the point of the exercise.
 */
function lowerBound(
	offsets: readonly number[],
	x: number,
	columnCount: number,
): number {
	let lo = 0;
	let hi = columnCount;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (offsets[mid + 1] <= x) lo = mid + 1;
		else hi = mid;
	}
	return Math.min(lo, columnCount);
}
