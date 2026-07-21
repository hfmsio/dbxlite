/**
 * Snowflake JSON-parse worker.
 *
 * For large result sets (Snowflake LIMIT 500k or unconstrained) the
 * connector receives multi-MB JSON partitions. Parsing them on the main
 * thread blocked rendering — the executing-query timer froze, the
 * progress bar stuttered, and exports felt unresponsive even when they
 * were progressing.
 *
 * This worker offloads the row-typing pass. The main thread still:
 *   - issues the HTTP request
 *   - parses the response body (browser-internal, off main thread)
 *   - posts the raw `data` array + `rowType` here
 *   - awaits the typed rows back
 *
 * Vite bundles this via the `new Worker(new URL(...), {type:'module'})`
 * pattern at the call site (WorkerParsePool factory in the connector).
 */

import {
	parseSnowflakeRows,
	type SnowflakeColumnLite,
} from "./snowflake-parse-shared"

interface ParseRequest {
	id: string
	type: "parseRows"
	data: unknown[][]
	rowType: SnowflakeColumnLite[]
}

interface ParseResponse {
	id: string
	rows: Record<string, unknown>[]
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
	const msg = e.data
	if (msg && msg.type === "parseRows") {
		const rows = parseSnowflakeRows(msg.data, msg.rowType)
		const response: ParseResponse = { id: msg.id, rows }
		;(self as unknown as Worker).postMessage(response)
	}
}
