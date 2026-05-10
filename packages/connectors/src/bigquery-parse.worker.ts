/**
 * BigQuery JSON-parse worker.
 *
 * Mirrors snowflake-parse.worker.ts. Offloads CPU-heavy STRUCT/ARRAY
 * traversal off the main thread for large result sets so the UI
 * (executing-query timer, pagination, exports) stays responsive.
 */

import {
	parseBigQueryRows,
	type BigQueryRowLite,
	type BigQuerySchemaLite,
} from "./bigquery-parse-shared";

interface ParseRequest {
	id: string;
	type: "parseRows";
	rows: BigQueryRowLite[];
	schema: BigQuerySchemaLite;
}

interface ParseResponse {
	id: string;
	rows: Record<string, unknown>[];
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
	const msg = e.data;
	if (msg && msg.type === "parseRows") {
		const rows = parseBigQueryRows(msg.rows, msg.schema);
		const response: ParseResponse = { id: msg.id, rows };
		(self as unknown as Worker).postMessage(response);
	}
};
