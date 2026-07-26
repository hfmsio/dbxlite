/**
 * FileVfs — register/drop/copy files in DuckDB's virtual filesystem.
 *
 * Extracted from StreamingQueryService (WS-A / A3 in docs/REFACTOR-PLAN.md).
 * DuckDB-only and isolated from query execution, so it moves out behind a
 * single port: "give me whatever currently occupies the duckdb slot".
 *
 * The capability probes are deliberately preserved. In HTTP mode the duckdb
 * slot holds a `DuckDBHttpConnector`, which has no file operations at all,
 * and each method's behavior in that case is load-bearing and asymmetric:
 * the two register methods no-op, copy and drop throw — with two distinct
 * messages. Callers depend on exactly that.
 */

import type { BaseConnector } from "@ide/connectors";

/** The file-op surface a WASM DuckDB connector provides. */
interface FileCapableConnector {
	registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void>;
	registerFileHandle(fileName: string, file: File): Promise<void>;
	copyFileToBuffer(fileName: string): Promise<Uint8Array>;
	dropFile(fileName: string): Promise<void>;
}

/** Resolves the connector currently in the duckdb slot, or null if none. */
export type DuckDBConnectorPort = () => BaseConnector | null;

export interface FileVfs {
	registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void>;
	registerFileHandle(fileName: string, file: File): Promise<void>;
	copyFileToBuffer(fileName: string): Promise<Uint8Array>;
	dropFile(fileName: string): Promise<void>;
}

function supports<K extends keyof FileCapableConnector>(
	connector: BaseConnector,
	method: K,
): connector is BaseConnector & Pick<FileCapableConnector, K> {
	return (
		method in connector &&
		typeof (connector as unknown as Record<string, unknown>)[method] ===
			"function"
	);
}

export class DuckDBFileVfs implements FileVfs {
	constructor(private readonly getDuckDB: DuckDBConnectorPort) {}

	private require(): BaseConnector {
		const connector = this.getDuckDB();
		if (!connector) {
			throw new Error("DuckDB connector not initialized");
		}
		return connector;
	}

	async registerFile(fileName: string, fileBuffer: ArrayBuffer): Promise<void> {
		const connector = this.require();
		if (supports(connector, "registerFile")) {
			await connector.registerFile(fileName, fileBuffer);
		}
	}

	async registerFileHandle(fileName: string, file: File): Promise<void> {
		const connector = this.require();
		if (supports(connector, "registerFileHandle")) {
			await connector.registerFileHandle(fileName, file);
		}
	}

	async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
		const connector = this.require();
		if (supports(connector, "copyFileToBuffer")) {
			return await connector.copyFileToBuffer(fileName);
		}
		throw new Error("File copy not supported");
	}

	async dropFile(fileName: string): Promise<void> {
		const connector = this.require();
		if (supports(connector, "dropFile")) {
			await connector.dropFile(fileName);
			return;
		}
		throw new Error("File drop not supported by this connector");
	}
}
