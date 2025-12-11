/**
 * useQueryOverlay Hook
 * Manages long-running query overlay state and elapsed time tracking
 */

import { useEffect, useRef, useState } from "react";
import { connectionHealthChecker } from "../utils/connectionHealthCheck";

export function useQueryOverlay(isQueryExecuting: boolean) {
	const [showLongRunningOverlay, setShowLongRunningOverlay] = useState(false);
	const [queryElapsedSeconds, setQueryElapsedSeconds] = useState(0);

	const queryStartTimeRef = useRef<number | null>(null);
	const longRunningTimerRef = useRef<NodeJS.Timeout | null>(null);
	const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Show long-running query overlay after 2 seconds and track elapsed time
	useEffect(() => {
		if (isQueryExecuting) {
			// Query is executing - start tracking
			queryStartTimeRef.current = Date.now();
			setQueryElapsedSeconds(0);

			// Pause health checks during query execution to avoid concurrent queries
			connectionHealthChecker.pause();

			// Start a timer to show the overlay after 2 seconds
			longRunningTimerRef.current = setTimeout(() => {
				setShowLongRunningOverlay(true);
			}, 2000);

			// Update elapsed time every 100ms for smooth updates
			elapsedTimerRef.current = setInterval(() => {
				if (queryStartTimeRef.current) {
					const elapsed = Math.floor(
						(Date.now() - queryStartTimeRef.current) / 1000,
					);
					setQueryElapsedSeconds(elapsed);
				}
			}, 100);
		} else {
			// Query finished - clean up everything
			if (longRunningTimerRef.current) {
				clearTimeout(longRunningTimerRef.current);
				longRunningTimerRef.current = null;
			}
			if (elapsedTimerRef.current) {
				clearInterval(elapsedTimerRef.current);
				elapsedTimerRef.current = null;
			}
			setShowLongRunningOverlay(false);
			queryStartTimeRef.current = null;
			setQueryElapsedSeconds(0);

			// Resume health checks after query completes
			connectionHealthChecker.resume();
		}

		// Cleanup on unmount
		return () => {
			if (longRunningTimerRef.current) {
				clearTimeout(longRunningTimerRef.current);
				longRunningTimerRef.current = null;
			}
			if (elapsedTimerRef.current) {
				clearInterval(elapsedTimerRef.current);
				elapsedTimerRef.current = null;
			}
		};
	}, [isQueryExecuting]);

	return {
		showLongRunningOverlay,
		queryElapsedSeconds,
	};
}
