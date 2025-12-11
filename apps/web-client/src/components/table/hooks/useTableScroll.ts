import { useCallback, useEffect, useRef, useState } from "react";

interface UseTableScrollOptions {
	scrollContainerRef: React.RefObject<HTMLDivElement>;
	headerScrollRef: React.RefObject<HTMLDivElement>;
	currentPage: number;
	pageDataLength: number;
}

interface UseTableScrollReturn {
	scrollTop: number;
	containerHeight: number;
	handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * Hook for handling table scroll behavior.
 *
 * Includes:
 * - Virtual scroll position tracking
 * - Header/body horizontal scroll sync
 * - Container height measurement for virtualization
 * - Scroll reset on page change
 * - Prevention of browser back/forward navigation from trackpad horizontal scrolling
 */
export function useTableScroll({
	scrollContainerRef,
	headerScrollRef,
	currentPage: _currentPage,
	pageDataLength: _pageDataLength,
}: UseTableScrollOptions): UseTableScrollReturn {
	const [scrollTop, setScrollTop] = useState(0);
	const [containerHeight, setContainerHeight] = useState(600);

	// Track if we've done initial measurement
	const hasMeasured = useRef(false);

	/**
	 * Handle scroll events for virtual scrolling and header sync
	 */
	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			const target = e.currentTarget;
			setScrollTop(target.scrollTop);

			// Sync header horizontal scroll with body
			if (headerScrollRef.current) {
				headerScrollRef.current.scrollLeft = target.scrollLeft;
			}
		},
		[headerScrollRef],
	);

	/**
	 * Measure container height on mount and resize using ResizeObserver
	 * This handles both window resize AND pane resizing via drag
	 */
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const measureContainer = () => {
			const height = container.clientHeight;
			// Only update if we get a reasonable height (at least 200px)
			// This prevents the grid from collapsing to just a few rows
			// when measured during layout transitions
			if (height >= 200) {
				setContainerHeight(height);
				hasMeasured.current = true;
			} else if (!hasMeasured.current) {
				// If we haven't measured yet and height is too small,
				// schedule a re-measurement after layout completes
				requestAnimationFrame(() => {
					const retryHeight = container.clientHeight;
					if (retryHeight >= 200) {
						setContainerHeight(retryHeight);
						hasMeasured.current = true;
					}
				});
			}
		};

		measureContainer();

		// Use ResizeObserver for accurate container resize detection
		const resizeObserver = new ResizeObserver(() => {
			measureContainer();
		});
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, [scrollContainerRef]);

	/**
	 * Reset scroll position when page changes
	 */
	useEffect(() => {
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop = 0;
			setScrollTop(0);
		}
	}, [scrollContainerRef]);

	/**
	 * Prevent browser back/forward navigation from trackpad horizontal scrolling
	 */
	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer) return;

		const handleWheel = (e: WheelEvent) => {
			// Only handle horizontal scrolling
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
				const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
				const atLeftEdge = scrollLeft === 0;
				const atRightEdge = scrollLeft + clientWidth >= scrollWidth - 1;

				// Prevent browser navigation when trying to scroll past boundaries
				if ((atLeftEdge && e.deltaX < 0) || (atRightEdge && e.deltaX > 0)) {
					e.preventDefault();
				}
			}
		};

		// Use passive: false to allow preventDefault()
		scrollContainer.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			scrollContainer.removeEventListener("wheel", handleWheel);
		};
	}, [scrollContainerRef]);

	return {
		scrollTop,
		containerHeight,
		handleScroll,
	};
}
