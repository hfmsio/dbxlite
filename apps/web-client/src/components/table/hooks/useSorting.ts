/**
 * Hook for handling table sorting logic
 * Extracts sorting state and operations from ResultPane
 */
import { useCallback, useEffect, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc" | null;

interface UseSortingOptions<T = Record<string, unknown>> {
	data: T[];
	onSortChange?: (column: string | null, direction: SortDirection) => void;
}

interface UseSortingReturn<T = Record<string, unknown>> {
	sortColumn: string | null;
	sortDirection: SortDirection;
	sortedData: T[];
	handleSort: (column: string) => void;
	resetSort: () => void;
}

/**
 * Manages table sorting state and data sorting
 * @param options - Configuration for sorting behavior
 * @returns Sorting state and handlers
 */
export function useSorting<T extends Record<string, unknown>>({
	data,
	onSortChange,
}: UseSortingOptions<T>): UseSortingReturn<T> {
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>(null);

	// Reset sort when data changes
	useEffect(() => {
		setSortColumn(null);
		setSortDirection(null);
	}, [data]);

	// Sort data based on current sort column and direction
	const sortedData = useMemo(() => {
		if (!sortColumn || !sortDirection) return data;

		const sorted = [...data].sort((a, b) => {
			const aVal = a[sortColumn];
			const bVal = b[sortColumn];

			// Handle null/undefined values
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return sortDirection === "asc" ? 1 : -1;
			if (bVal == null) return sortDirection === "asc" ? -1 : 1;

			// Compare values
			if (typeof aVal === "number" && typeof bVal === "number") {
				return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
			}

			const aStr = String(aVal);
			const bStr = String(bVal);
			const comparison = aStr.localeCompare(bStr);
			return sortDirection === "asc" ? comparison : -comparison;
		});

		return sorted;
	}, [data, sortColumn, sortDirection]);

	const handleSort = useCallback(
		(column: string) => {
			let newDirection: SortDirection;

			if (sortColumn === column) {
				// Cycle through: asc -> desc -> none
				if (sortDirection === "asc") {
					newDirection = "desc";
				} else if (sortDirection === "desc") {
					newDirection = null;
					setSortColumn(null);
					setSortDirection(null);
					onSortChange?.(null, null);
					return;
				} else {
					newDirection = "asc";
				}
			} else {
				newDirection = "asc";
			}

			setSortColumn(column);
			setSortDirection(newDirection);
			onSortChange?.(column, newDirection);
		},
		[sortColumn, sortDirection, onSortChange],
	);

	const resetSort = useCallback(() => {
		setSortColumn(null);
		setSortDirection(null);
		onSortChange?.(null, null);
	}, [onSortChange]);

	return {
		sortColumn,
		sortDirection,
		sortedData,
		handleSort,
		resetSort,
	};
}
