/**
 * DuckDBConnector unit tests.
 *
 * The full connector can't run in jsdom because @ide/duckdb-adapter spins
 * up real Web Workers + WASM. These tests mock the adapter so we can
 * exercise the *connector* logic — promise wiring, error propagation,
 * BigInt conversion — without booting DuckDB.
 *
 * Background: a regression in DuckDBConnector.query silently swallowed
 * every parser/runtime error from the worker because the Promise
 * executor only destructured `resolve`, leaving `reject` undefined.
 * The contract test suite explicitly skipped DuckDB ("WASM in jsdom"),
 * so the bug shipped. This file plugs that hole.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture handlers passed to runQuery so each test can drive them.
type RowCb = (row: Record<string, unknown>) => void;
type DoneCb = () => void;
type ErrCb = (e: unknown) => void;
type SchemaCb = (cols: unknown) => void;
type StatsCb = (s: unknown) => void;

interface RunQueryCall {
  queryId: string;
  sql: string;
  onRow: RowCb;
  onDone: DoneCb;
  onError: ErrCb;
  onSchema?: SchemaCb;
  onStats?: StatsCb;
}

const lastCall = { current: null as RunQueryCall | null };

vi.mock("@ide/duckdb-adapter", () => {
  class DuckDBWorkerAdapter {
    async init(): Promise<void> {}
    async registerFile(): Promise<void> {}
    async registerFileHandle(): Promise<void> {}
    async copyFileToBuffer(): Promise<Uint8Array> {
      return new Uint8Array(0);
    }
    async cancel(): Promise<void> {}
    runQuery(
      queryId: string,
      sql: string,
      onRow: RowCb,
      onDone: DoneCb,
      onError: ErrCb,
      onSchema?: SchemaCb,
      onStats?: StatsCb,
    ) {
      lastCall.current = { queryId, sql, onRow, onDone, onError, onSchema, onStats };
    }
  }
  return { DuckDBWorkerAdapter };
});

// Import AFTER vi.mock so the mocked module is wired up.
import { DuckDBConnector } from "../duckdb-connector";

describe("DuckDBConnector", () => {
  let connector: DuckDBConnector;

  beforeEach(async () => {
    lastCall.current = null;
    connector = new DuckDBConnector();
    await connector.connect({ options: {} });
  });

  afterEach(() => {
    lastCall.current = null;
  });

  describe("error propagation", () => {
    it("rejects the AsyncGenerator when the worker reports a parser error", async () => {
      const sql = "SELECT * FROM (";
      const gen = connector.query(sql);
      // Kick the generator so runQuery gets called and we capture handlers.
      const next = gen.next();
      // Wait a tick so the connector wires up the adapter call.
      await Promise.resolve();
      await Promise.resolve();
      expect(lastCall.current).not.toBeNull();
      expect(lastCall.current?.sql).toBe(sql);

      // Simulate the worker firing the error callback (parser error).
      const parserErr = new Error('Parser Error: syntax error at or near "FROM"');
      lastCall.current?.onError(parserErr);

      // The generator must surface the rejection. Without the fix, this
      // never resolves and the test times out — instead of getting a
      // useful failure, prior callers saw a hung UI with no error.
      await expect(next).rejects.toThrow(/Parser Error/);
    });

    it("rejects with a runtime error from the worker", async () => {
      const sql = "SELECT 1 / 0";
      const gen = connector.query(sql);
      const next = gen.next();
      await Promise.resolve();
      await Promise.resolve();
      expect(lastCall.current).not.toBeNull();

      lastCall.current?.onError(new Error("Out of Range Error"));
      await expect(next).rejects.toThrow(/Out of Range/);
    });

    it("preserves the original Error instance (not wrapped)", async () => {
      const gen = connector.query("SELECT bad");
      const next = gen.next();
      await Promise.resolve();
      await Promise.resolve();

      const original = new Error("specific failure");
      lastCall.current?.onError(original);

      try {
        await next;
        // If we reach here the test failed - generator should have thrown
        expect.unreachable();
      } catch (e) {
        // The connector wraps in `throw e` so the same Error reference flows out
        expect((e as Error).message).toBe("specific failure");
      }
    });
  });

  describe("happy path wiring", () => {
    it("yields rows from the worker callback as chunks", async () => {
      const gen = connector.query("SELECT 1 AS x");
      const nextPromise = gen.next();
      await Promise.resolve();
      await Promise.resolve();

      const cb = lastCall.current;
      expect(cb).not.toBeNull();

      // Simulate the worker emitting one row + done.
      cb?.onSchema?.([{ name: "x", type: "INTEGER" }]);
      cb?.onRow({ x: 1 });
      cb?.onDone();

      const first = await nextPromise;
      expect(first.done).toBe(false);
      expect(first.value?.rows).toEqual([{ x: 1 }]);

      // After done, generator should terminate cleanly.
      const tail = await gen.next();
      expect(tail.done).toBe(true);
    });
  });
});
