/**
 * Hook for handling table pagination logic
 * Extracts pagination state and operations from ResultPane
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UsePaginationOptions<T = unknown> {
	data: T[];
	initialPageSize?: number;
	onPageChange?: (page: number, pageSize: number) => void;
}

interface UsePaginationReturn<T = unknown> {
	currentPage: number;
	pageSize: number;
	totalPages: number;
	startRow: number;
	endRow: number;
	paginatedData: T[];
	customPageSize: string;
	showCustomInput: boolean;
	customPageInputRef: React.RefObject<HTMLInputElement>;
	setCurrentPage: (page: number) => void;
	setPageSize: (size: number) => void;
	setCustomPageSize: (value: string) => void;
	setShowCustomInput: (show: boolean) => void;
	handleCustomPageSizeSubmit: () => void;
	goToNextPage: () => void;
	goToPreviousPage: () => void;
	resetPage: () => void;
}

/**
 * Manages table pagination state and page slicing
 * @param options - Configuration for pagination behavior
 * @returns Pagination state and handlers
 */
export function usePagination<T = unknown>({
	data,
	initialPageSize = 100,
	onPageChange,
}: UsePaginationOptions<T>): UsePaginationReturn<T> {
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(initialPageSize);
	const [customPageSize, setCustomPageSize] = useState("");
	const [showCustomInput, setShowCustomInput] = useState(false);
	const customPageInputRef = useRef<HTMLInputElement>(null);

	// Calculate pagination values
	const totalRows = data.length;
	const totalPages = Math.ceil(totalRows / pageSize);
	const startRow = (currentPage - 1) * pageSize;
	const endRow = Math.min(startRow + pageSize, totalRows);
	const paginatedData = useMemo(
		() => data.slice(startRow, endRow),
		[data, startRow, endRow],
	);

	// Reset to page 1 when data changes
	useEffect(() => {
		setCurrentPage(1);
	}, [data]);

	// Reset to page 1 when page size changes
	useEffect(() => {
		setCurrentPage(1);
		onPageChange?.(1, pageSize);
	}, [pageSize, onPageChange]);

	// Auto-focus custom page size input when it appears
	useEffect(() => {
		if (showCustomInput && customPageInputRef.current) {
			customPageInputRef.current.focus();
		}
	}, [showCustomInput]);

	const handleCustomPageSizeSubmit = useCallback(() => {
		const value = parseInt(customPageSize, 10);
		if (!Number.isNaN(value) && value > 0) {
			setPageSize(value);
			setCustomPageSize("");
			setShowCustomInput(false);
		}
	}, [customPageSize]);

	const goToNextPage = useCallback(() => {
		setCurrentPage((prev) => {
			const next = Math.min(totalPages, prev + 1);
			onPageChange?.(next, pageSize);
			return next;
		});
	}, [totalPages, pageSize, onPageChange]);

	const goToPreviousPage = useCallback(() => {
		setCurrentPage((prev) => {
			const previous = Math.max(1, prev - 1);
			onPageChange?.(previous, pageSize);
			return previous;
		});
	}, [pageSize, onPageChange]);

	const resetPage = useCallback(() => {
		setCurrentPage(1);
		onPageChange?.(1, pageSize);
	}, [pageSize, onPageChange]);

	return {
		currentPage,
		pageSize,
		totalPages,
		startRow,
		endRow,
		paginatedData,
		customPageSize,
		showCustomInput,
		customPageInputRef,
		setCurrentPage,
		setPageSize,
		setCustomPageSize,
		setShowCustomInput,
		handleCustomPageSizeSubmit,
		goToNextPage,
		goToPreviousPage,
		resetPage,
	};
}
