import { useRef, useState } from "react";
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
  checkCost: (sql: string) => Promise<boolean>;
  costWarning: CostWarningState | null;
  handleConfirm: () => void;
  handleCancel: () => void;
}

/**
 * Hook to manage BigQuery cost warnings
 * Requires showToast to be passed in context
 */
export const useBigQueryCostWarning = (
  showToast: (message: string, type: Toast["type"]) => void,
): UseCostWarningReturn => {
  const { enabled, warnThreshold } = useBigQueryCostSettings();
  const [costWarning, setCostWarning] = useState<CostWarningState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const checkCost = async (sql: string): Promise<boolean> => {
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

      // Show warning dialog and wait for user decision
      return new Promise((resolve) => {
        setCostWarning({
          sql,
          cost: estimate.estimatedCostUSD,
          bytes: estimate.estimatedBytes,
          cachingPossible: estimate.cachingPossible,
        });

        // Store resolve function to be called when user clicks button
        resolveRef.current = resolve;
      });
    } catch (error) {
      // If cost estimation fails, proceed with query (fail-open)
      logger.warn("Cost estimation failed, proceeding with query", error);
      showToast("Cost estimation failed - proceeding with query", "warning");
      return true;
    }
  };

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setCostWarning(null);
    resolveRef.current = null;
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setCostWarning(null);
    resolveRef.current = null;
  };

  return {
    checkCost,
    costWarning,
    handleConfirm,
    handleCancel,
  };
};
