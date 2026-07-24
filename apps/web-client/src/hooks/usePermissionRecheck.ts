/**
 * usePermissionRecheck - re-run a File System Access permission check when it
 * can actually have changed.
 *
 * `navigator.permissions` exposes no change event for FS handles, so the only
 * way to notice a grant or a revocation is to ask again. Asking every few
 * seconds is wasteful: a permission can only realistically flip while the user
 * is away from the tab, dealing with the browser's own permission UI. So we
 * re-check on the two signals that mark a return to the page —
 * `visibilitychange` and window `focus` — plus a slow safety poll.
 *
 * Known parity gap (accepted): a revocation performed while the tab stays
 * focused is noticed by the safety poll rather than immediately. That is what
 * the safety poll is for; do not remove it.
 *
 * `recheck` is treated as a dependency: pass a `useCallback`-stable function,
 * and the check re-runs whenever its identity changes (same semantics as
 * listing those values in the caller's own effect deps).
 */

import { useEffect } from "react";

/** Backstop cadence for changes that produce no visibility/focus signal. */
export const PERMISSION_SAFETY_POLL_MS = 60_000;

export function usePermissionRecheck(
	recheck: () => void | Promise<void>,
	safetyPollMs: number = PERMISSION_SAFETY_POLL_MS,
): void {
	useEffect(() => {
		let cancelled = false;

		const run = () => {
			if (cancelled) return;
			void recheck();
		};

		// Check immediately, exactly as the previous interval-based effect did.
		run();

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") run();
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("focus", run);
		const safetyPoll = setInterval(run, safetyPollMs);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("focus", run);
			clearInterval(safetyPoll);
		};
	}, [recheck, safetyPollMs]);
}
