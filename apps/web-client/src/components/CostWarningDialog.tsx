/**
 * Cost Warning Dialog
 *
 * Shows BigQuery query cost estimates and warnings before execution.
 */

import { useEffect, useRef } from "react";
import type React from "react";

export interface CostWarningDialogProps {
	isOpen: boolean;
	estimatedCost: number;
	estimatedBytes: number;
	cachingPossible: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export const CostWarningDialog: React.FC<CostWarningDialogProps> = ({
	isOpen,
	estimatedCost,
	estimatedBytes,
	cachingPossible: _cachingPossible,
	onConfirm,
	onCancel,
}) => {
	const cancelButtonRef = useRef<HTMLButtonElement>(null);

	// Handle keyboard shortcuts
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			} else if (e.key === "Enter") {
				e.preventDefault();
				onConfirm();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onCancel, onConfirm]);

	// Auto-focus cancel button on open (safer default)
	useEffect(() => {
		if (isOpen && cancelButtonRef.current) {
			cancelButtonRef.current.focus();
		}
	}, [isOpen]);

	if (!isOpen) return null;
	const formatBytes = (bytes: number) => {
		const units = ["B", "KB", "MB", "GB", "TB"];
		let i = 0;
		let value = bytes;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(2)} ${units[i]}`;
	};

	const formatCost = (usd: number) => `$${usd.toFixed(4)}`;

	const isHighCost = estimatedCost > 5;
	const isMediumCost = estimatedCost > 1;

	return (
		<div className="dialog-overlay" onClick={onCancel}>
			<div
				className="dialog-content"
				onClick={(e) => e.stopPropagation()}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="cost-warning-title"
				aria-describedby="cost-warning-details"
			>
				<div className="dialog-header">
					<h2 id="cost-warning-title">
						{isHighCost
							? "⚠️ High Cost Warning"
							: isMediumCost
								? "⚠️ Cost Warning"
								: "💰 Cost Estimate"}
					</h2>
				</div>

				<div className="dialog-body" id="cost-warning-details">
					<div className="cost-summary">
						<div
							className={`cost-amount ${isHighCost ? "high" : isMediumCost ? "medium" : "low"}`}
						>
							{formatCost(estimatedCost)}
						</div>
						<div className="cost-label">Estimated query cost</div>
					</div>

					<div className="cost-details">
						{estimatedBytes !== undefined && (
							<div className="detail-row">
								<span className="detail-label">Data to process:</span>
								<span className="detail-value">
									{formatBytes(estimatedBytes)}
								</span>
							</div>
						)}
					</div>

					{isHighCost && (
						<div className="warning-message high">
							<strong>⚠️ High cost query</strong>
							<p>
								This query will process a large amount of data and incur
								significant costs.
							</p>
							<p>Consider:</p>
							<ul>
								<li>Adding WHERE clauses to filter data</li>
								<li>Using partitioned tables</li>
								<li>Selecting only needed columns</li>
								<li>Using materialized views</li>
							</ul>
						</div>
					)}

					{isMediumCost && !isHighCost && (
						<div className="warning-message medium">
							<strong>💡 Tip:</strong> You can reduce costs by:
							<ul>
								<li>Limiting the data range with WHERE clauses</li>
								<li>Selecting only the columns you need</li>
								<li>Using table partitions effectively</li>
							</ul>
						</div>
					)}

					<div className="info-message">
						<p>
							<strong>BigQuery pricing:</strong> $6.25 per TB processed (first 1 TB
							free per month)
						</p>
						<p>
							After execution, you can save results locally to avoid future
							query costs.
						</p>
					</div>
				</div>

				<div className="dialog-footer">
					<button
						ref={cancelButtonRef}
						onClick={onCancel}
						className="button button-secondary"
						autoFocus
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className={`button button-primary ${isHighCost ? "dangerous" : ""}`}
					>
						{isHighCost ? "Execute Anyway" : "Execute Query"}
					</button>
				</div>
			</div>

			<style>{`
        .dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--overlay-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .dialog-content {
          background: var(--bg-primary);
          color: var(--text-primary);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          max-width: 500px;
          width: 90vw;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .dialog-header {
          padding: 20px;
          border-bottom: 1px solid var(--border);
        }

        .dialog-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }

        .dialog-body {
          padding: 20px;
          overflow-y: auto;
        }

        .cost-summary {
          text-align: center;
          padding: 24px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .cost-amount {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .cost-amount.low {
          color: var(--success);
        }

        .cost-amount.medium {
          color: var(--warning);
        }

        .cost-amount.high {
          color: var(--error);
        }

        .cost-label {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .cost-details {
          margin-bottom: 16px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-light);
        }

        .detail-label {
          font-weight: 500;
          color: var(--text-secondary);
        }

        .detail-value {
          font-weight: 600;
        }

        .warning-message {
          padding: 16px;
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .warning-message.high {
          background: rgba(239, 68, 68, 0.15);
          border-left: 4px solid var(--error);
          color: var(--error);
        }

        .warning-message.medium {
          background: rgba(245, 158, 11, 0.15);
          border-left: 4px solid var(--warning);
          color: var(--warning);
        }

        .warning-message ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
        }

        .warning-message li {
          margin: 4px 0;
        }

        .info-message {
          padding: 12px;
          background: rgba(59, 130, 246, 0.15);
          border-left: 4px solid var(--accent);
          border-radius: 4px;
          font-size: 13px;
          color: var(--accent);
        }

        .info-message p {
          margin: 4px 0;
        }

        .dialog-footer {
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .button-secondary {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .button-secondary:hover {
          background: var(--bg-hover);
        }

        .button-primary {
          background: var(--accent);
          color: white;
        }

        .button-primary:hover {
          background: var(--accent-hover);
        }

        .button-primary.dangerous {
          background: var(--error);
        }

        .button-primary.dangerous:hover {
          background: var(--error);
          filter: brightness(0.9);
        }
      `}</style>
		</div>
	);
};
