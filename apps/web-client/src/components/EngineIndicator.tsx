/**
 * Engine Indicator Component
 *
 * Shows which engine will execute the current query (BigQuery or DuckDB)
 * with cost estimates for BigQuery queries.
 */

import type React from "react";
import type { QueryAnalysis } from "../types/materialization";

export interface EngineIndicatorProps {
	analysis: QueryAnalysis | null;
	isExecuting?: boolean;
}

export const EngineIndicator: React.FC<EngineIndicatorProps> = ({
	analysis,
	isExecuting,
}) => {
	if (!analysis) {
		return null;
	}

	const getEngineIcon = () => {
		switch (analysis.suggestedEngine) {
			case "bigquery":
				return "🔵";
			case "snowflake":
				return "❄️";
			case "databricks":
				return "🧱";
			case "duckdb":
				return "🦆";
			default:
				return "⚡";
		}
	};

	const getEngineName = () => {
		switch (analysis.suggestedEngine) {
			case "bigquery":
				return "BigQuery (Remote)";
			case "snowflake":
				return "Snowflake (Remote)";
			case "databricks":
				return "Databricks (Remote)";
			case "duckdb":
				return "DuckDB (Local)";
			default:
				return "Unknown";
		}
	};

	const getEngineDescription = () => {
		switch (analysis.suggestedEngine) {
			case "bigquery":
			case "snowflake":
			case "databricks":
				return "Cloud execution - incurs costs";
			case "duckdb":
				return "Local execution - free & fast";
			default:
				return "";
		}
	};

	const formatCost = (usd: number) => `$${usd.toFixed(4)}`;

	const isRemote = analysis.suggestedEngine !== "duckdb";
	const hasWarnings = analysis.warnings.length > 0;
	const hasCost =
		analysis.costEstimate &&
		analysis.costEstimate.estimatedCostUSD !== undefined;

	return (
		<div
			className={`engine-indicator ${isRemote ? "remote" : "local"} ${hasWarnings ? "warning" : ""}`}
		>
			<div className="indicator-main">
				<span className="engine-icon">{getEngineIcon()}</span>
				<div className="engine-info">
					<div className="engine-name">
						{getEngineName()}
						{isExecuting && <span className="executing-badge">Running...</span>}
					</div>
					<div className="engine-description">{getEngineDescription()}</div>
				</div>
				{hasCost && analysis.costEstimate && (
					<div className="cost-badge">
						{formatCost(analysis.costEstimate.estimatedCostUSD || 0)}
					</div>
				)}
			</div>

			{hasWarnings && (
				<div className="warnings">
					{analysis.warnings.map((warning, i) => (
						<div key={i} className="warning-message">
							⚠️ {warning}
						</div>
					))}
				</div>
			)}

			<style>{`
        .engine-indicator {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .engine-indicator.remote {
          border-left: 4px solid #2196f3;
          background: #f5f9ff;
        }

        .engine-indicator.local {
          border-left: 4px solid #4caf50;
          background: #f5fff5;
        }

        .engine-indicator.warning {
          border-color: #ff9800;
          background: #fff8f0;
        }

        .indicator-main {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .engine-icon {
          font-size: 24px;
        }

        .engine-info {
          flex: 1;
        }

        .engine-name {
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .executing-badge {
          display: inline-block;
          padding: 2px 8px;
          background: #2196f3;
          color: white;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 500;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        .engine-description {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }

        .cost-badge {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 4px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          color: #f57c00;
        }

        .warnings {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
        }

        .warning-message {
          font-size: 12px;
          color: #e65100;
          padding: 6px 0;
        }
      `}</style>
		</div>
	);
};
