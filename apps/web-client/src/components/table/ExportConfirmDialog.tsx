/**
 * Pre-export confirmation.
 *
 * Exporting a cloud result is not free and not obvious: it *re-runs* the user's
 * query against BigQuery/Snowflake, scanning the data a second time (the first
 * scan was the on-screen result). BigQuery bills by bytes scanned, so a
 * `SELECT *` export of a large table can cost real money the user never chose
 * to spend. This dialog surfaces that before anything runs.
 *
 * It also warns when the export will be capped, so a truncated file is never a
 * surprise discovered later.
 */

import { useEffect, useRef } from "react";
import type { ConnectorType } from "../../services/streaming-query-service";
import type { ExportFormat } from "./exporters";

export interface ExportPreview {
	format: ExportFormat;
	connectorType: ConnectorType;
	/** True for cloud connectors: the export re-scans and may bill. */
	rerunsRemotely: boolean;
	/** BigQuery dry-run estimate. Undefined for Snowflake / on estimate failure. */
	estimatedBytes?: number;
	estimatedCostUSD?: number;
	cachingPossible?: boolean;
	/** Best-known total rows, for the truncation warning. */
	estimatedRows?: number;
	rowCountIsEstimated?: boolean;
	/** Row ceiling this export will hit, if any (cloud Parquet). */
	rowCap?: number;
}

interface Props {
	preview: ExportPreview;
	onConfirm: () => void;
	onCancel: () => void;
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	let i = 0;
	let v = bytes;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}

const nf = new Intl.NumberFormat();

export function ExportConfirmDialog({ preview, onConfirm, onCancel }: Props) {
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			} else if (e.key === "Enter") {
				e.preventDefault();
				onConfirm();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onConfirm, onCancel]);

	// Focus Cancel, not Confirm: this can spend money, so the safe action is
	// the default.
	const cancelRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		cancelRef.current?.focus();
	}, []);

	const {
		format,
		connectorType,
		rerunsRemotely,
		estimatedBytes,
		estimatedCostUSD,
		cachingPossible,
		estimatedRows,
		rowCountIsEstimated,
		rowCap,
	} = preview;

	const willTruncate =
		rowCap !== undefined &&
		estimatedRows !== undefined &&
		estimatedRows > rowCap;

	const connectorLabel =
		connectorType === "bigquery"
			? "BigQuery"
			: connectorType === "snowflake"
				? "Snowflake"
				: "DuckDB";

	return (
		<div
			style={overlay}
			onClick={onCancel}
			onKeyDown={(e) => e.key === "Escape" && onCancel()}
			role="presentation"
		>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-label="Confirm export"
				style={panel}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div style={header}>
					<h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
						Export as {format.toUpperCase()}
					</h2>
				</div>

				<div style={{ padding: "16px 20px" }}>
					{rerunsRemotely ? (
						<>
							<p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>
								This re-runs your query against <strong>{connectorLabel}</strong>{" "}
								and scans the data again — separately from the result already on
								screen.
								{connectorType === "bigquery" &&
									" BigQuery bills by bytes scanned."}
							</p>

							<div style={statBox}>
								{estimatedCostUSD !== undefined ? (
									<Row
										label="Estimated cost"
										value={
											cachingPossible
												? "Free (cached)"
												: `$${estimatedCostUSD.toFixed(4)}`
										}
										emphasize={estimatedCostUSD > 1}
									/>
								) : connectorType === "bigquery" ? (
									<Row label="Estimated cost" value="Could not estimate" />
								) : null}
								{estimatedBytes !== undefined && (
									<Row label="Data scanned" value={formatBytes(estimatedBytes)} />
								)}
								{estimatedRows !== undefined && estimatedRows >= 0 && (
									<Row
										label="Rows"
										value={`${rowCountIsEstimated ? "~" : ""}${nf.format(estimatedRows)}`}
									/>
								)}
							</div>

							{willTruncate && (
								<div style={warnBox}>
									<strong>⚠️ This export will be truncated.</strong>
									<div style={{ marginTop: 4 }}>
										{connectorLabel} {format.toUpperCase()} export is limited to{" "}
										{nf.format(rowCap as number)} rows in the browser. About{" "}
										{nf.format(
											(estimatedRows as number) - (rowCap as number),
										)}{" "}
										rows will be left out.
									</div>
								</div>
							)}
						</>
					) : (
						<p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
							Runs locally in your browser against DuckDB. No cloud cost, and the
							full result is written.
						</p>
					)}
				</div>

				<div style={footer}>
					<button type="button" ref={cancelRef} onClick={onCancel} style={btnSecondary}>
						Cancel
					</button>
					<button
						type="button"
						ref={confirmRef}
						onClick={onConfirm}
						style={willTruncate ? btnDanger : btnPrimary}
					>
						{willTruncate ? "Export anyway" : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}

function Row({
	label,
	value,
	emphasize,
}: {
	label: string;
	value: string;
	emphasize?: boolean;
}) {
	return (
		<div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
			<span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>
			<span
				style={{
					fontSize: 13,
					fontWeight: 600,
					color: emphasize ? "var(--warning, #d29922)" : "var(--text-primary)",
				}}
			>
				{value}
			</span>
		</div>
	);
}

const overlay: React.CSSProperties = {
	position: "fixed",
	inset: 0,
	background: "rgba(0,0,0,0.6)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	zIndex: 10000,
};
const panel: React.CSSProperties = {
	background: "var(--bg-secondary)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	width: "min(460px, 92vw)",
};
const header: React.CSSProperties = {
	padding: "14px 20px",
	borderBottom: "1px solid var(--border)",
};
const statBox: React.CSSProperties = {
	background: "var(--bg-primary)",
	border: "1px solid var(--border)",
	borderRadius: 6,
	padding: "4px 12px",
};
const warnBox: React.CSSProperties = {
	marginTop: 12,
	padding: "10px 12px",
	background: "var(--bg-primary)",
	borderLeft: "3px solid var(--warning, #d29922)",
	borderRadius: 3,
	fontSize: 12.5,
	lineHeight: 1.5,
	color: "var(--text-primary)",
};
const footer: React.CSSProperties = {
	padding: "14px 20px",
	borderTop: "1px solid var(--border)",
	display: "flex",
	justifyContent: "flex-end",
	gap: 10,
};
const btnBase: React.CSSProperties = {
	padding: "8px 16px",
	borderRadius: 4,
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
	border: "1px solid var(--border)",
};
const btnSecondary: React.CSSProperties = {
	...btnBase,
	background: "transparent",
	color: "var(--text-muted)",
};
const btnPrimary: React.CSSProperties = {
	...btnBase,
	background: "var(--accent)",
	color: "#fff",
	border: "none",
};
const btnDanger: React.CSSProperties = {
	...btnBase,
	background: "var(--error, #d1242f)",
	color: "#fff",
	border: "none",
};
