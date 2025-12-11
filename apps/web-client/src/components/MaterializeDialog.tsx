/**
 * Materialize Dialog
 *
 * Dialog for saving BigQuery query results to local DuckDB.
 */

import type React from "react";
import { useState } from "react";
import type { QueryExecution } from "../types/materialization";

export interface MaterializeDialogProps {
	execution: QueryExecution;
	onConfirm: (tableName: string, schema: string) => void;
	onCancel: () => void;
}

export const MaterializeDialog: React.FC<MaterializeDialogProps> = ({
	execution,
	onConfirm,
	onCancel,
}) => {
	const [tableName, setTableName] = useState(() => {
		// Generate default table name from query
		const fromMatch = execution.sql.match(/FROM\s+[`"]?(\w+)[`"]?/i);
		const base = fromMatch ? fromMatch[1] : "query_result";
		return `${base}_${Date.now().toString(36)}`;
	});

	const [schema, setSchema] = useState(() => {
		// Default schema based on execution engine
		switch (execution.engine) {
			case "bigquery":
				return "bq_cache";
			case "snowflake":
				return "sf_cache";
			case "databricks":
				return "db_cache";
			default:
				return "cache";
		}
	});

	const [saveSourceQuery, setSaveSourceQuery] = useState(true);

	const handleConfirm = () => {
		if (!tableName.trim()) {
			console.warn("Please enter a table name for the materialized table");
			return;
		}
		onConfirm(tableName.trim(), schema);
	};

	const formatBytes = (bytes: number) => {
		const units = ["B", "KB", "MB", "GB"];
		let i = 0;
		let value = bytes;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(2)} ${units[i]}`;
	};

	const estimateSize = () => {
		if (!execution.results) return 0;
		// Rough estimate: average 100 bytes per row
		return execution.results.rowCount * 100;
	};

	const estimatedSize = estimateSize();

	return (
		<div className="dialog-overlay" onClick={onCancel}>
			<div className="dialog-content" onClick={(e) => e.stopPropagation()}>
				<div className="dialog-header">
					<h2>💾 Save to DuckDB</h2>
				</div>

				<div className="dialog-body">
					<div className="info-card">
						<div className="info-row">
							<span className="info-label">Rows:</span>
							<span className="info-value">
								{execution.results?.rowCount.toLocaleString() || 0}
							</span>
						</div>
						<div className="info-row">
							<span className="info-label">Columns:</span>
							<span className="info-value">
								{execution.results?.columns.length || 0}
							</span>
						</div>
						<div className="info-row">
							<span className="info-label">Estimated size:</span>
							<span className="info-value">{formatBytes(estimatedSize)}</span>
						</div>
						{execution.cost && execution.cost.actualCostUSD !== undefined && (
							<div className="info-row">
								<span className="info-label">Query cost:</span>
								<span className="info-value">
									${execution.cost.actualCostUSD.toFixed(4)}
								</span>
							</div>
						)}
					</div>

					<div className="form-group">
						<label htmlFor="schema">Schema:</label>
						<select
							id="schema"
							value={schema}
							onChange={(e) => setSchema(e.target.value)}
						>
							<option value="bq_cache">bq_cache (BigQuery cache)</option>
							<option value="sf_cache">sf_cache (Snowflake cache)</option>
							<option value="db_cache">db_cache (Databricks cache)</option>
							<option value="cache">cache (General)</option>
							<option value="main">main (Default)</option>
						</select>
						<small>Schema where the table will be created</small>
					</div>

					<div className="form-group">
						<label htmlFor="tableName">Table Name:</label>
						<input
							id="tableName"
							type="text"
							value={tableName}
							onChange={(e) => setTableName(e.target.value)}
							placeholder="my_table"
						/>
						<small>
							Full name:{" "}
							<code>
								{schema}.{tableName || "table_name"}
							</code>
						</small>
					</div>

					<div className="form-group">
						<label className="checkbox-label">
							<input
								type="checkbox"
								checked={saveSourceQuery}
								onChange={(e) => setSaveSourceQuery(e.target.checked)}
							/>
							Save source query for refresh
						</label>
						<small>
							Allows you to refresh the table later by re-running the query
						</small>
					</div>

					{saveSourceQuery && (
						<div className="source-query-preview">
							<strong>Source Query:</strong>
							<pre>{execution.sql}</pre>
						</div>
					)}

					<div className="benefits-card">
						<strong>✨ Benefits of materialization:</strong>
						<ul>
							<li>Query locally without BigQuery costs</li>
							<li>Instant results (no network latency)</li>
							<li>Join with other local tables</li>
							<li>Work offline</li>
							<li>Persist across browser sessions</li>
						</ul>
					</div>
				</div>

				<div className="dialog-footer">
					<button onClick={onCancel} className="button button-secondary">
						Cancel
					</button>
					<button onClick={handleConfirm} className="button button-primary">
						💾 Save to DuckDB
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
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          max-width: 600px;
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

        .info-card {
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
        }

        .info-label {
          font-weight: 500;
          color: var(--text-secondary);
        }

        .info-value {
          font-weight: 600;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .form-group input[type='text'],
        .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .form-group input[type='text']:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .form-group code {
          background: var(--bg-tertiary);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: normal !important;
        }

        .checkbox-label input[type='checkbox'] {
          cursor: pointer;
        }

        .source-query-preview {
          background: var(--bg-secondary);
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .source-query-preview strong {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .source-query-preview pre {
          margin: 0;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 150px;
          overflow-y: auto;
          color: var(--text-primary);
        }

        .benefits-card {
          background: rgba(59, 130, 246, 0.1);
          border-left: 4px solid var(--accent);
          border-radius: 4px;
          padding: 16px;
          font-size: 13px;
          color: var(--accent);
        }

        .benefits-card strong {
          display: block;
          margin-bottom: 8px;
        }

        .benefits-card ul {
          margin: 0;
          padding-left: 20px;
        }

        .benefits-card li {
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
          background: var(--bg-secondary);
        }

        .button-primary {
          background: var(--accent);
          color: white;
        }

        .button-primary:hover {
          background: var(--accent-hover);
        }
      `}</style>
		</div>
	);
};
