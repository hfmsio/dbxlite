/**
 * Tests for the CSV/JSON cloud-streaming export strategy.
 *
 * The point of this strategy is unbounded, buffer-free export, so the tests
 * assert it writes across multiple chunks with no cap and produces valid
 * output — and that it abandons a partial file on abort.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getActiveConnectorType: vi.fn(() => "bigquery"),
	getConnector: vi.fn(),
	showExportFilePicker: vi.fn(),
}));

vi.mock("../../../../services/streaming-query-service", () => ({
	queryService: {
		getActiveConnectorType: mocks.getActiveConnectorType,
		getConnector: mocks.getConnector,
	},
}));

vi.mock("../../exportUtils", () => ({
	showExportFilePicker: mocks.showExportFilePicker,
}));

import { cloudStreamingTextStrategy as strat } from "../cloudStreamingText";
import { pickStrategy } from "../index";
import type { ExportContext } from "../types";

/** A writable that records everything written, like a file stream would receive. */
function fakeWritable() {
	const chunks: string[] = [];
	return {
		chunks,
		aborted: false,
		closed: false,
		handle: {
			name: "out",
			createWritable: async () => ({
				write: async (s: string) => {
					chunks.push(s);
				},
				close: async () => {},
				abort: async () => {},
			}),
		},
	};
}

/** A connector whose query() yields the given chunks. */
function connectorYielding(chunkList: Array<Record<string, unknown>[]>) {
	return {
		query: vi.fn(async function* () {
			for (const rows of chunkList) yield { rows };
		}),
	};
}

function ctx(over: Partial<ExportContext> = {}): ExportContext {
	return {
		format: "csv",
		fileName: "out.csv",
		sql: "SELECT * FROM `p.d.t`",
		columns: [
			{ name: "a", type: "STRING", width: 100 },
			{ name: "b", type: "INT", width: 100 },
		],
		signal: new AbortController().signal,
		onProgress: () => {},
		...over,
	} as ExportContext;
}

describe("cloudStreamingText canHandle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
	});

	it("handles cloud CSV", () => {
		expect(strat.canHandle(ctx({ format: "csv" }))).toBe(true);
	});
	it("handles cloud JSON", () => {
		expect(strat.canHandle(ctx({ format: "json" }))).toBe(true);
	});
	it("declines Parquet (the other strategy owns it)", () => {
		expect(strat.canHandle(ctx({ format: "parquet" }))).toBe(false);
	});
	it("declines DuckDB", () => {
		mocks.getActiveConnectorType.mockReturnValue("duckdb");
		expect(strat.canHandle(ctx({ format: "csv" }))).toBe(false);
	});
	it("declines when there is no SQL", () => {
		expect(strat.canHandle(ctx({ sql: undefined }))).toBe(false);
	});
});

describe("dispatcher closes the cloud CSV/JSON gap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
	});

	it("picks cloud-streaming-text for a large (virtual) cloud CSV export", () => {
		// result is undefined for a virtual result — the exact case that used to
		// match no strategy and throw.
		expect(pickStrategy(ctx({ format: "csv" })).name).toBe(
			"cloud-streaming-text",
		);
	});

	it("picks cloud-streaming-text for cloud JSON", () => {
		expect(pickStrategy(ctx({ format: "json" })).name).toBe(
			"cloud-streaming-text",
		);
	});
});

describe("cloudStreamingText execute", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActiveConnectorType.mockReturnValue("bigquery");
	});

	it("streams CSV across chunks with no cap", async () => {
		const w = fakeWritable();
		mocks.showExportFilePicker.mockResolvedValue(w.handle);
		mocks.getConnector.mockReturnValue(
			connectorYielding([
				[{ a: "1", b: "x" }],
				[{ a: "2", b: "y" }],
				[{ a: "3", b: "z" }],
			]),
		);

		const result = await strat.execute(ctx({ format: "csv" }));

		expect(result.rowsExported).toBe(3);
		const out = w.chunks.join("");
		expect(out).toBe("a,b\n1,x\n2,y\n3,z\n");
	});

	it("requests every page (maxRows not capped at 10k)", async () => {
		const w = fakeWritable();
		mocks.showExportFilePicker.mockResolvedValue(w.handle);
		const connector = connectorYielding([[{ a: "1", b: "2" }]]);
		mocks.getConnector.mockReturnValue(connector);

		await strat.execute(ctx({ format: "csv" }));

		const firstCallArgs = connector.query.mock.calls[0] as unknown[];
		const opts = firstCallArgs?.[1] as { maxRows?: number } | undefined;
		expect(opts?.maxRows ?? 0).toBeGreaterThan(10_000_000);
	});

	it("escapes CSV cells that contain commas or quotes", async () => {
		const w = fakeWritable();
		mocks.showExportFilePicker.mockResolvedValue(w.handle);
		mocks.getConnector.mockReturnValue(
			connectorYielding([[{ a: "has,comma", b: 'has"quote' }]]),
		);

		await strat.execute(ctx({ format: "csv" }));

		expect(w.chunks.join("")).toContain('"has,comma","has""quote"');
	});

	it("streams a valid JSON array across chunks", async () => {
		const w = fakeWritable();
		mocks.showExportFilePicker.mockResolvedValue(w.handle);
		mocks.getConnector.mockReturnValue(
			connectorYielding([[{ a: 1 }], [{ a: 2 }]]),
		);

		const result = await strat.execute(ctx({ format: "json", fileName: "o.json" }));

		expect(result.rowsExported).toBe(2);
		const parsed = JSON.parse(w.chunks.join(""));
		expect(parsed).toEqual([{ a: 1 }, { a: 2 }]);
	});

	it("serializes BigInt rather than throwing", async () => {
		const w = fakeWritable();
		mocks.showExportFilePicker.mockResolvedValue(w.handle);
		mocks.getConnector.mockReturnValue(
			connectorYielding([[{ a: 9007199254740993n }]]),
		);

		await strat.execute(ctx({ format: "json", fileName: "o.json" }));

		expect(JSON.parse(w.chunks.join(""))).toEqual([{ a: "9007199254740993" }]);
	});

	it("throws when the file picker is dismissed", async () => {
		mocks.showExportFilePicker.mockResolvedValue(null);

		await expect(strat.execute(ctx())).rejects.toThrow(
			/File System Access/,
		);
	});

	it("abandons the partial file on abort", async () => {
		const controller = new AbortController();
		const aborts: boolean[] = [];
		const handle = {
			name: "out",
			createWritable: async () => ({
				write: async () => {
					controller.abort(); // abort mid-stream
				},
				close: async () => {},
				abort: async () => {
					aborts.push(true);
				},
			}),
		};
		mocks.showExportFilePicker.mockResolvedValue(handle);
		mocks.getConnector.mockReturnValue(
			connectorYielding([[{ a: "1", b: "2" }], [{ a: "3", b: "4" }]]),
		);

		await expect(
			strat.execute(ctx({ signal: controller.signal })),
		).rejects.toThrow(/cancelled/i);
		expect(aborts).toContain(true);
	});
});
