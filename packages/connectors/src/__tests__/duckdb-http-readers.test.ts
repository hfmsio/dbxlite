import { describe, expect, it } from 'vitest'
import { deserializeQueryResult } from '../duckdb-http/readers'

// DuckDB 2.0 /ddb/run responses for VALUES containing Unicode, NULL and empty values.
const stringsV2 = '64000165006400010176650001640019ffffffff660001640004650001640001650008fdffffffffffffff6b00106c00100c0000000000000000000000040000006d0010d0bfd180d0b8d0b2d196d182f09f8d80ffffffffffff'
const blobsV2 = '6400016500640001017665000164001affffffff660001640003650001640001650008fdffffffffffffff6b00026c000c0200000000000000000000006d000200ffffffffffffff'
// DuckDB 1.x uses field 102 for the list of strings.
const stringsV1 = '64000165006400010576616c7565650001640019ffffffff6600016400016500016400006600010568656c6c6fffffffffffff'

function result(hex: string) {
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
  return deserializeQueryResult(bytes.buffer)
}

describe('DuckDB HTTP result deserialization', () => {
  it('reads the legacy DuckDB 1.x string vector', () => {
    const query = result(stringsV1)
    expect(query.success).toBe(true)
    if (!query.success) throw new Error(query.error)
    expect(query.chunks[0].vectors[0]).toMatchObject({ kind: 'string', data: ['hello'] })
  })

  it('reads DuckDB 2.0 UTF-8 strings with nulls and empty values', () => {
    const query = result(stringsV2)
    expect(query.success).toBe(true)
    if (!query.success) throw new Error(query.error)
    const vector = query.chunks[0].vectors[0]
    expect(vector).toMatchObject({ kind: 'string', data: ['привіт', '', '', '🍀'] })
    expect((vector.validity?.getUint8(0) ?? 0) & 15).toBe(13)
  })

  it('reads DuckDB 2.0 binary values without decoding them as text', () => {
    const query = result(blobsV2)
    expect(query.success).toBe(true)
    if (!query.success) throw new Error(query.error)
    const vector = query.chunks[0].vectors[0]
    if (vector.kind !== 'datalist') throw new Error('Expected binary vector')
    expect(vector.data.map((value) => Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))))
      .toEqual([[0, 255], [], []])
    expect((vector.validity?.getUint8(0) ?? 0) & 7).toBe(5)
  })
})
