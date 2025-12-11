import type React from "react";
import { useBigQueryCostSettings } from "../../hooks/useBigQueryCostSettings";

/**
 * BigQuery Cost Warning Settings Component
 * Allows users to configure cost warnings for BigQuery queries
 */
export const BigQueryCostSettings: React.FC = () => {
  const { enabled, warnThreshold, setEnabled, setWarnThreshold } =
    useBigQueryCostSettings();

  const handleEnabledChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnabled(e.target.checked);
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 1.0;
    setWarnThreshold(value);
  };

  return (
    <div
      style={{
        marginTop: "24px",
        paddingTop: "24px",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <h4
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "var(--text-primary)",
        }}
      >
        Query Cost Warnings
      </h4>

      {/* Enable/Disable Toggle */}
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleEnabledChange}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
            Show cost warnings before executing expensive queries
          </span>
        </label>
        <p
          style={{
            fontSize: "12px",
            color: "#6b7280",
            marginTop: "4px",
            marginLeft: "24px",
          }}
        >
          Prevents accidental execution of queries that may incur significant
          BigQuery charges
        </p>
      </div>

      {/* Warn Threshold Input */}
      {enabled && (
        <div style={{ marginLeft: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              marginBottom: "4px",
              color: "var(--text-primary)",
            }}
          >
            Show warning when query cost exceeds:
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              $
            </span>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.50"
              value={warnThreshold}
              onChange={handleThresholdChange}
              style={{
                width: "80px",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "13px",
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: "13px", color: "#6b7280" }}>USD</span>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "#6b7280",
              marginTop: "4px",
            }}
          >
            Recommended: $1.00 for development, $5-10 for production
          </p>
        </div>
      )}
    </div>
  );
};
