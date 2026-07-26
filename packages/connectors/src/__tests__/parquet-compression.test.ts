/**
 * Tests for the Parquet compression clause builder.
 */
import { describe, expect, it } from 'vitest'
import { parquetCompressionClause } from '../base'

describe('parquetCompressionClause', () => {
  it('emits a zstd clause', () => {
    expect(parquetCompressionClause('zstd')).toBe(", COMPRESSION 'zstd'")
  })
  it('emits a gzip clause', () => {
    expect(parquetCompressionClause('gzip')).toBe(", COMPRESSION 'gzip'")
  })
  it('maps none to uncompressed', () => {
    expect(parquetCompressionClause('none')).toBe(", COMPRESSION 'uncompressed'")
  })
  it('emits nothing for snappy (DuckDB default) — byte-identical to before', () => {
    expect(parquetCompressionClause('snappy')).toBe('')
  })
  it('emits nothing when unspecified', () => {
    expect(parquetCompressionClause(undefined)).toBe('')
  })
})
