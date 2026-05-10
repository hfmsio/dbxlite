import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "../utils/logger";
import { queryService } from "../services/streaming-query-service";
import { useBigQueryCostSettings } from "./useBigQueryCostSettings";
import type { Toast } from "../components/Toast";

const logger = createLogger("BigQueryCostWarning");

/**
 * Cost warning dialog state
 */
export interface CostWarningState {
  sql: string;
  cost: number;
  bytes: number;
  cachingPossible: boolean;
}

/**
 * Return type for useBigQueryCostWarning hook
 */
export interface UseCostWarningReturn {
  checkCost: (sql: string, signal?: AbortSignal) => Promise<boolean>;
  costWarning: CostWarningState | null;
  handleConfirm: () => void;
  handleCancel: () => void;
}

/**
 * Hook to manage BigQuery cost warnings
 * Requires showToast to be passed in context
 *
 * Cancellation contract: callers may pass an AbortSignal to checkCost.
 * If the signal aborts (or the hook's component unmounts) while the
 * confirmation dialog is open, the returned Promise rejects with
 * `AbortError` and the dialog state is cleared. This closes a leak
 * where the resolveRef would otherwise sit forever, hanging the
 * outer query-execution chain (loading flag stuck, abort controller
 * never cleared).
 */
export const useBigQueryCostWarning = (
  showToast: (message: string, type: Toast["type"]) => void,
): UseCostWarningReturn => {
  const { enabled, warnThreshold } = useBigQueryCostSettings();
  const [costWarning, setCostWarning] = useState<CostWarningState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const rejectRef = useRef<((err: unknown) => void) | null>(null);
  const cleanupAbortRef = useRef<(() => void) | null>(null);

  // Reject any pending dialog Promise on unmount so the query-execution
  // chain doesn't hang waiting for a resolution that will never come.
  useEffect(() => {
    return () => {
      if (rejectRef.current) {
        rejectRef.current(
          Object.assign(new Error("Cost warning aborted (component unmounted)"), {
            name: "AbortError",
          }),
        );
      }
      cleanupAbortRef.current?.();
      resolveRef.current = null;
      rejectRef.current = null;
      cleanupAbortRef.current = null;
    };
  }, []);

  const checkCost = useCallback(
    async (sql: string, signal?: AbortSignal): Promise<boolean> => {
      try {
        // Check if cost warnings are enabled
        if (!enabled) {
          showToast("Cost warnings disabled - executing query", "info");
          return true;
        }

        // Show estimation in progress
        showToast("Estimating query cost...", "info");

        const estimate = await queryService.estimateBigQueryCost(sql);

        // If free (cached), proceed without warning
        if (estimate.cachingPossible) {
          showToast("Query will use cached results (free)", "success");
          return true;
        }

        // Check if below threshold
        if (estimate.estimatedCostUSD < warnThreshold) {
          showToast(
            `Estimated cost: $${estimate.estimatedCostUSD.toFixed(4)} - proceeding`,
            "success",
          );
          return true;
        }

        // Show warning dialog and wait for user decision (or abort).
        return await new Promise<boolean>((resolve, reject) => {
          if (signal?.aborted) {
            reject(
              Object.assign(new Error("Cost warning aborted before display"), {
                name: "AbortError",
              }),
            );
            return;
          }

          setCostWarning({
            sql,
            cost: estimate.estimatedCostUSD,
            bytes: estimate.estimatedBytes,
            cachingPossible: estimate.cachingPossible,
          });
          resolveRef.current = resolve;
          rejectRef.current = reject;

          // If the caller passed a signal, wire abort to reject the
          // dialog Promise. Detach on settle so we don't leak the
          // listener after a normal confirm/cancel.
          if (signal) {
            const onAbort = () => {
              setCostWarning(null);
              rejectRef.current?.(
                Object.assign(new Error("Cost warning aborted"), {
                  name: "AbortError",
                }),
              );
              resolveRef.current = null;
              rejectRef.current = null;
            };
            signal.addEventListener("abort", onAbort, { once: true });
            cleanupAbortRef.current = () =>
              signal.removeEventListener("abort", onAbort);
          }
        });
      } catch (error) {
        // Bubble explicit aborts so callers can distinguish them from
        // estimation failures.
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        // If cost estimation fails, proceed with query (fail-open)
        logger.warn("Cost estimation failed, proceeding with query", error);
        showToast("Cost estimation failed - proceeding with query", "warning");
        return true;
      }
    },
    [enabled, warnThreshold, showToast],
  );

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setCostWarning(null);
    cleanupAbortRef.current?.();
    resolveRef.current = null;
    rejectRef.current = null;
    cleanupAbortRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    setCostWarning(null);
    cleanupAbortRef.current?.();
    resolveRef.current = null;
    rejectRef.current = null;
    cleanupAbortRef.current = null;
  }, []);

  return {
    checkCost,
    costWarning,
    handleConfirm,
    handleCancel,
  };
};
