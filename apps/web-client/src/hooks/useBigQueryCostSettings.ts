import { useState } from "react";

/**
 * BigQuery cost warning settings
 */
export interface BigQueryCostSettings {
  enabled: boolean;
  warnThreshold: number;
  setEnabled: (enabled: boolean) => void;
  setWarnThreshold: (threshold: number) => void;
}

const STORAGE_KEY_ENABLED = "bigquery-cost-warnings-enabled";
const STORAGE_KEY_THRESHOLD = "bigquery-warn-threshold";
const DEFAULT_THRESHOLD = 1.0;

/**
 * Hook to manage BigQuery cost warning settings
 * Persists to localStorage
 */
export const useBigQueryCostSettings = (): BigQueryCostSettings => {
  const [enabled, setEnabledState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_ENABLED);
    return stored !== "false"; // Default: enabled
  });

  const [warnThreshold, setWarnThresholdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_THRESHOLD);
    return parseFloat(stored || DEFAULT_THRESHOLD.toString());
  });

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    localStorage.setItem(STORAGE_KEY_ENABLED, value.toString());
  };

  const setWarnThreshold = (value: number) => {
    setWarnThresholdState(value);
    localStorage.setItem(STORAGE_KEY_THRESHOLD, value.toString());
  };

  return {
    enabled,
    warnThreshold,
    setEnabled,
    setWarnThreshold,
  };
};
