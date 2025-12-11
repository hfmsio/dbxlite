import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTableSelection } from "../useTableSelection";

describe("useTableSelection", () => {
	const defaultOptions = {
		pageDataLength: 10,
		columnsLength: 5,
		showToast: vi.fn(),
		resizing: false,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("initialization", () => {
		test("should initialize with null selection", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			expect(result.current.selectedCell).toBeNull();
			expect(result.current.selectionStart).toBeNull();
			expect(result.current.selectionEnd).toBeNull();
			expect(result.current.isSelecting).toBe(false);
			expect(result.current.viewingCell).toBeNull();
		});
	});

	describe("isCellInSelection", () => {
		test("should return false when no selection", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			expect(result.current.isCellInSelection(0, 0)).toBe(false);
		});

		test("should return true for cell within selection range", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setSelectionStart({ row: 1, col: 1 });
				result.current.setSelectionEnd({ row: 3, col: 3 });
			});

			expect(result.current.isCellInSelection(2, 2)).toBe(true);
			expect(result.current.isCellInSelection(1, 1)).toBe(true);
			expect(result.current.isCellInSelection(3, 3)).toBe(true);
		});

		test("should return false for cell outside selection range", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setSelectionStart({ row: 1, col: 1 });
				result.current.setSelectionEnd({ row: 3, col: 3 });
			});

			expect(result.current.isCellInSelection(0, 0)).toBe(false);
			expect(result.current.isCellInSelection(4, 4)).toBe(false);
			expect(result.current.isCellInSelection(0, 2)).toBe(false);
		});

		test("should handle reversed selection (end before start)", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setSelectionStart({ row: 3, col: 3 });
				result.current.setSelectionEnd({ row: 1, col: 1 });
			});

			expect(result.current.isCellInSelection(2, 2)).toBe(true);
			expect(result.current.isCellInSelection(1, 1)).toBe(true);
			expect(result.current.isCellInSelection(3, 3)).toBe(true);
		});
	});

	describe("clearSelection", () => {
		test("should clear all selection state", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setSelectedCell({ row: 1, col: 1 });
				result.current.setSelectionStart({ row: 0, col: 0 });
				result.current.setSelectionEnd({ row: 2, col: 2 });
			});

			expect(result.current.selectedCell).not.toBeNull();

			act(() => {
				result.current.clearSelection();
			});

			expect(result.current.selectedCell).toBeNull();
			expect(result.current.selectionStart).toBeNull();
			expect(result.current.selectionEnd).toBeNull();
		});
	});

	describe("handleCellMouseDown", () => {
		const createMockEvent = (
			options: Partial<React.MouseEvent> = {},
		): React.MouseEvent =>
			({
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				currentTarget: { focus: vi.fn() } as unknown as HTMLElement,
				shiftKey: false,
				...options,
			}) as unknown as React.MouseEvent;

		test("should select cell on click", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.handleCellMouseDown(2, 3, createMockEvent());
			});

			expect(result.current.selectedCell).toEqual({ row: 2, col: 3 });
			expect(result.current.selectionStart).toEqual({ row: 2, col: 3 });
			expect(result.current.selectionEnd).toEqual({ row: 2, col: 3 });
		});

		test("should extend selection on shift+click", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			// First click to set initial cell
			act(() => {
				result.current.handleCellMouseDown(1, 1, createMockEvent());
			});

			// Shift+click to extend selection
			act(() => {
				result.current.handleCellMouseDown(
					3,
					4,
					createMockEvent({ shiftKey: true }),
				);
			});

			expect(result.current.selectionStart).toEqual({ row: 1, col: 1 });
			expect(result.current.selectionEnd).toEqual({ row: 3, col: 4 });
		});

		test("should not start selection when resizing", () => {
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, resizing: true }),
			);

			act(() => {
				result.current.handleCellMouseDown(1, 1, createMockEvent());
			});

			expect(result.current.selectedCell).toBeNull();
		});

		test("should prevent default and stop propagation", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));
			const mockEvent = createMockEvent();

			act(() => {
				result.current.handleCellMouseDown(0, 0, mockEvent);
			});

			expect(mockEvent.preventDefault).toHaveBeenCalled();
			expect(mockEvent.stopPropagation).toHaveBeenCalled();
		});
	});

	describe("handleCellDoubleClick", () => {
		test("should set viewingCell on double click", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));
			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleCellDoubleClick(2, 3, mockEvent);
			});

			expect(result.current.viewingCell).toEqual({ row: 2, col: 3 });
		});
	});

	describe("handleCellMouseEnter", () => {
		test("should extend selection when selecting", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			// Start selection
			act(() => {
				result.current.isSelectingRef.current = true;
				result.current.setSelectionStart({ row: 0, col: 0 });
			});

			// Mouse enter on different cell
			act(() => {
				result.current.handleCellMouseEnter(2, 3);
			});

			expect(result.current.selectionEnd).toEqual({ row: 2, col: 3 });
		});

		test("should not extend selection when not selecting", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.isSelectingRef.current = false;
				result.current.handleCellMouseEnter(2, 3);
			});

			expect(result.current.selectionEnd).toBeNull();
		});
	});

	describe("handleMouseUp", () => {
		test("should end selection", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.isSelectingRef.current = true;
			});

			expect(result.current.isSelectingRef.current).toBe(true);

			act(() => {
				result.current.handleMouseUp();
			});

			expect(result.current.isSelectingRef.current).toBe(false);
		});
	});

	describe("handleRowNumberClick", () => {
		test("should select entire row on click", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, showToast }),
			);

			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				shiftKey: false,
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleRowNumberClick(2, mockEvent);
			});

			expect(result.current.selectionStart).toEqual({ row: 2, col: 0 });
			expect(result.current.selectionEnd).toEqual({ row: 2, col: 4 }); // columnsLength - 1
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Selected row 3"),
				"info",
				2000,
			);
		});

		test("should extend row selection on shift+click", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, showToast }),
			);

			// First select a row
			act(() => {
				result.current.setSelectedCell({ row: 1, col: 0 });
			});

			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				shiftKey: true,
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleRowNumberClick(4, mockEvent);
			});

			expect(result.current.selectionStart).toEqual({ row: 1, col: 0 });
			expect(result.current.selectionEnd).toEqual({ row: 4, col: 4 });
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Selected 4 rows"),
				"info",
				2000,
			);
		});
	});

	describe("handleColumnHeaderClick", () => {
		test("should select entire column on Cmd/Ctrl+click", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, showToast }),
			);
			const handleColumnSort = vi.fn();

			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				metaKey: true,
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleColumnHeaderClick(
					2,
					mockEvent,
					"name",
					handleColumnSort,
				);
			});

			expect(result.current.selectionStart).toEqual({ row: 0, col: 2 });
			expect(result.current.selectionEnd).toEqual({ row: 9, col: 2 }); // pageDataLength - 1
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Selected column name"),
				"info",
				2000,
			);
			expect(handleColumnSort).not.toHaveBeenCalled();
		});

		test("should trigger sort on Alt+click", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, showToast }),
			);
			const handleColumnSort = vi.fn();

			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				metaKey: false,
				ctrlKey: false,
				altKey: true,
				shiftKey: false,
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleColumnHeaderClick(
					2,
					mockEvent,
					"name",
					handleColumnSort,
				);
			});

			expect(handleColumnSort).toHaveBeenCalledWith("name");
		});

		test("should extend column selection on Shift+click", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() =>
				useTableSelection({ ...defaultOptions, showToast }),
			);
			const handleColumnSort = vi.fn();

			// First select a cell
			act(() => {
				result.current.setSelectedCell({ row: 0, col: 1 });
			});

			const mockEvent = {
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				metaKey: false,
				ctrlKey: false,
				altKey: false,
				shiftKey: true,
			} as unknown as React.MouseEvent;

			act(() => {
				result.current.handleColumnHeaderClick(
					3,
					mockEvent,
					"email",
					handleColumnSort,
				);
			});

			expect(result.current.selectionStart).toEqual({ row: 0, col: 1 });
			expect(result.current.selectionEnd).toEqual({ row: 9, col: 3 });
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Selected 3 columns"),
				"info",
				2000,
			);
		});
	});

	describe("setSelectedCell", () => {
		test("should update selected cell", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setSelectedCell({ row: 5, col: 2 });
			});

			expect(result.current.selectedCell).toEqual({ row: 5, col: 2 });
		});
	});

	describe("setViewingCell", () => {
		test("should update viewing cell", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setViewingCell({ row: 3, col: 1 });
			});

			expect(result.current.viewingCell).toEqual({ row: 3, col: 1 });
		});

		test("should allow clearing viewing cell", () => {
			const { result } = renderHook(() => useTableSelection(defaultOptions));

			act(() => {
				result.current.setViewingCell({ row: 3, col: 1 });
			});

			act(() => {
				result.current.setViewingCell(null);
			});

			expect(result.current.viewingCell).toBeNull();
		});
	});
});
