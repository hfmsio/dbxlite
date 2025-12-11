import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { QueryResult } from "../../services/streaming-query-service";
import ResultPane from "../ResultPane";

// Mock navigator.clipboard
beforeEach(() => {
	Object.assign(navigator, {
		clipboard: {
			writeText: vi.fn().mockResolvedValue(undefined),
		},
	});
});

// Ensure cleanup after each test
afterEach(() => {
	cleanup();
});

describe("ResultPane Pagination", () => {
	// Helper to create mock result with N rows
	const createMockResult = (rowCount: number): QueryResult => {
		const rows = Array.from({ length: rowCount }, (_, i) => ({
			id: i + 1,
			name: `Row ${i + 1}`,
			value: (i + 1) * 10,
		}));

		return {
			columns: ["id", "name", "value"],
			rows,
			totalRows: rowCount,
			executionTime: 42,
		};
	};

	test("should show pagination controls when rows exceed page size", () => {
		const result = createMockResult(150);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const footer = container.querySelector(".result-stats-footer");
		expect(footer).toBeTruthy();
		expect(footer?.textContent).toContain("Showing:");
		expect(footer?.textContent).toContain("1-100 of 150 rows");
		expect(screen.queryByText("← Prev")).toBeTruthy();
		expect(screen.queryByText("Next →")).toBeTruthy();
		expect(footer?.textContent).toContain("Page 1 / 2");
	});

	test("should not show pagination controls when rows fit in one page", () => {
		const result = createMockResult(50);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("Showing:");
		expect(footer?.textContent).toContain("1-50 of 50 rows");
		expect(screen.queryByText("← Prev")).toBeNull();
		expect(screen.queryByText("Next →")).toBeNull();
	});

	test("should navigate to next page", () => {
		const result = createMockResult(150);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		let footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("1-100 of 150 rows");
		expect(footer?.textContent).toContain("Page 1 / 2");

		const nextButton = screen.getByText("Next →");
		fireEvent.click(nextButton);

		footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("101-150 of 150 rows");
		expect(footer?.textContent).toContain("Page 2 / 2");
	});

	test("should navigate to previous page", () => {
		const result = createMockResult(150);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const nextButton = screen.getByText("Next →");
		fireEvent.click(nextButton);

		let footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("Page 2 / 2");

		const prevButton = screen.getByText("← Prev");
		fireEvent.click(prevButton);

		footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("1-100 of 150 rows");
		expect(footer?.textContent).toContain("Page 1 / 2");
	});

	test("should disable Prev button on first page", () => {
		const result = createMockResult(150);

		const { unmount: _unmount } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const prevButton = screen.getByText("← Prev");
		expect(prevButton.hasAttribute("disabled")).toBe(true);
	});

	test("should disable Next button on last page", () => {
		const result = createMockResult(150);

		const { unmount: _unmount } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const nextButton = screen.getByText("Next →");
		fireEvent.click(nextButton);

		expect(nextButton.hasAttribute("disabled")).toBe(true);
	});

	// Note: Page size selector tests removed - page size is now controlled via Settings, not ResultPane

	test("should display correct row numbers on paginated pages", () => {
		const result = createMockResult(250);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const tbody = container.querySelector("tbody");
		expect(tbody).toBeTruthy();

		let firstRowNumber = tbody?.querySelector(
			"tr:first-child .row-number-cell",
		);
		expect(firstRowNumber?.textContent).toBe("1");

		const nextButton = screen.getByText("Next →");
		fireEvent.click(nextButton);

		firstRowNumber = tbody?.querySelector("tr:first-child .row-number-cell");
		expect(firstRowNumber?.textContent).toBe("101");
	});

	test("should handle empty results", () => {
		const result = createMockResult(0);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		expect(screen.getByText("No results")).toBeTruthy();

		const footer = container.querySelector(".result-stats-footer");
		expect(footer?.textContent).toContain("0-0 of 0 rows");
	});

	test("should calculate total pages correctly for various row counts", () => {
		const testCases = [
			{ rows: 100, expectedText: "Page 1 / 1", hasPagination: false },
			{ rows: 101, expectedText: "Page 1 / 2", hasPagination: true },
			{ rows: 200, expectedText: "Page 1 / 2", hasPagination: true },
			{ rows: 250, expectedText: "Page 1 / 3", hasPagination: true },
		];

		testCases.forEach(({ rows, expectedText, hasPagination }) => {
			const result = createMockResult(rows);
			const { container } = render(
				<ResultPane result={result} loading={false} error={null} />,
			);

			const footer = container.querySelector(".result-stats-footer");
			if (hasPagination) {
				expect(footer?.textContent).toContain(expectedText);
			}
		});
	});

	test("should clear selection when changing pages", () => {
		const result = createMockResult(150);

		const { container } = render(
			<ResultPane result={result} loading={false} error={null} />,
		);

		const firstCell = container.querySelector(
			"tbody tr:first-child td.data-cell",
		);
		expect(firstCell).toBeTruthy();

		if (firstCell) {
			fireEvent.click(firstCell);
			expect(firstCell.className).toContain("selected-cell");
		}

		const nextButton = screen.getByText("Next →");
		fireEvent.click(nextButton);

		const cellsOnPage2 = container.querySelectorAll(".selected-cell");
		expect(cellsOnPage2.length).toBe(0);
	});
});
