/**
 * Arrow-key navigation across a page boundary.
 *
 * The grid loads one page at a time, and vertical navigation used to stop dead
 * at the last row: the key did nothing, focus drifted off the grid, and it read
 * as a frozen cursor rather than as the end of a page. These pin the crossing
 * in both directions, and pin the one case that must NOT cross.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTableKeyboard } from "../useTableKeyboard";

const PAGE_SIZE = 100;

function setup(over: Record<string, unknown> = {}) {
	const loadPage = vi.fn();
	const setSelectedCell = vi.fn();
	const setSelectionStart = vi.fn();
	const setSelectionEnd = vi.fn();
	const scrollContainerRef = { current: { scrollTop: 0, scrollHeight: 3200, clientHeight: 400 } };

	const { result } = renderHook(() =>
		useTableKeyboard({
			columns: [{ name: "a", type: "INTEGER", width: 100 }],
			pageData: Array.from({ length: PAGE_SIZE }, (_, i) => ({ a: i })),
			connectorType: "duckdb",
			startRow: 0,
			selectedCell: null,
			selectionStart: null,
			selectionEnd: null,
			viewingCell: null,
			cellModal: null,
			showSchemaModal: false,
			setSelectedCell,
			setSelectionStart,
			setSelectionEnd,
			setViewingCell: vi.fn(),
			setCellModal: vi.fn(),
			setShowSchemaModal: vi.fn(),
			cellRefs: { current: new Map() },
			scrollContainerRef,
			editInputRef: { current: null },
			focusTimeoutRef: { current: null },
			currentPage: 0,
			totalPages: 4,
			pageSize: PAGE_SIZE,
			loadPage,
			scrollToColumn: vi.fn(),
			closeModalAndRestoreFocus: vi.fn(),
			showToast: vi.fn(),
			...over,
		} as never),
	);

	const press = (key: string, row: number, col = 0, mods: Record<string, boolean> = {}) => {
		result.current.handleKeyDown(
			{ key, preventDefault: vi.fn(), stopPropagation: vi.fn(),
				shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods } as never,
			row, col,
		);
	};
	return { press, loadPage, setSelectedCell, scrollContainerRef };
}

describe("arrow navigation across page boundaries", () => {
	it("ArrowDown on the last row advances to the next page, landing on its first row", () => {
		const { press, loadPage, setSelectedCell } = setup();
		press("ArrowDown", PAGE_SIZE - 1);

		expect(loadPage).toHaveBeenCalledWith(1);
		expect(setSelectedCell).toHaveBeenCalledWith({ row: 0, col: 0 });
	});

	it("ArrowUp on the first row goes back, landing on the previous page's last row", () => {
		const { press, loadPage, setSelectedCell } = setup({ currentPage: 2 });
		press("ArrowUp", 0);

		expect(loadPage).toHaveBeenCalledWith(1);
		// Earlier pages are always full, so the last row is pageSize - 1.
		expect(setSelectedCell).toHaveBeenCalledWith({ row: PAGE_SIZE - 1, col: 0 });
	});

	it("does not advance past the last page", () => {
		const { press, loadPage } = setup({ currentPage: 3, totalPages: 4 });
		press("ArrowDown", PAGE_SIZE - 1);
		expect(loadPage).not.toHaveBeenCalled();
	});

	it("does not go back before the first page", () => {
		const { press, loadPage } = setup({ currentPage: 0 });
		press("ArrowUp", 0);
		expect(loadPage).not.toHaveBeenCalled();
	});

	it("Shift+ArrowDown does not cross, because a selection cannot span pages", () => {
		// Only one page is loaded, so extending across the boundary would
		// silently drop every row in between.
		const { press, loadPage } = setup();
		press("ArrowDown", PAGE_SIZE - 1, 0, { shiftKey: true });
		expect(loadPage).not.toHaveBeenCalled();
	});

	it("still moves normally within a page", () => {
		const { press, loadPage, setSelectedCell } = setup();
		press("ArrowDown", 5);
		expect(loadPage).not.toHaveBeenCalled();
		expect(setSelectedCell).toHaveBeenCalledWith({ row: 6, col: 0 });
	});
});
