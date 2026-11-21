import { afterEach, describe, expect, it, vi } from 'vitest'
import { DuckDBHttpConnector } from '../duckdb-http-connector'

// DuckDB /ddb/run response for SELECT 1 AS id.
const bytes = Uint8Array.from(
  '640001650064000102696465000164000dffffffff66000164000165000164000066000401000000ffffffffffff'.match(/../g)!,
  (byte) => Number.parseInt(byte, 16)
)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function okResponse() {
  return { ok: true, arrayBuffer: async () => bytes.buffer }
}

async function consume(connector: DuckDBHttpConnector, sql: string, signal?: AbortSignal) {
  const rows = []
  for await (const chunk of connector.query(sql, { signal })) rows.push(...chunk.rows)
  return rows
}

afterEach(() => vi.unstubAllGlobals())

describe('DuckDB HTTP connection queue', () => {
  it('waits until the previous response body is consumed', async () => {
    const body = deferred<ArrayBuffer>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // /info
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => body.promise })
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const connector = new DuckDBHttpConnector('http://localhost:4213')
    await connector.connect({ options: {} })

    const first = consume(connector, 'SELECT 1')
    const second = consume(connector, 'SELECT 2')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    body.resolve(bytes.buffer)
    await expect(first).resolves.toHaveLength(1)
    await expect(second).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('continues after a request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const connector = new DuckDBHttpConnector('http://localhost:4213')
    await connector.connect({ options: {} })

    const first = consume(connector, 'SELECT 1')
    const second = consume(connector, 'SELECT 2')
    await expect(first).rejects.toThrow('network failure')
    await expect(second).resolves.toHaveLength(1)
  })

  it('does not send an aborted queued query and continues with the next one', async () => {
    const body = deferred<ArrayBuffer>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => body.promise })
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const connector = new DuckDBHttpConnector('http://localhost:4213')
    await connector.connect({ options: {} })
    const controller = new AbortController()

    const first = consume(connector, 'SELECT 1')
    const cancelled = consume(connector, 'SELECT 2', controller.signal)
    const third = consume(connector, 'SELECT 3')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    body.resolve(bytes.buffer)
    await expect(first).resolves.toHaveLength(1)
    await expect(third).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1].body).toBe('SELECT 3')
  })

  it('keeps an aborted in-flight request in the queue until its response is consumed', async () => {
    const body = deferred<ArrayBuffer>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => body.promise })
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const connector = new DuckDBHttpConnector('http://localhost:4213')
    await connector.connect({ options: {} })
    const controller = new AbortController()

    const first = consume(connector, 'SELECT 1', controller.signal)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const second = consume(connector, 'SELECT 2')
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    body.resolve(bytes.buffer)
    await expect(second).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
