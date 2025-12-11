import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getCachedSchema, setCachedSchema, makeCacheKey } from '../index'

interface LocalStorageMock {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
  readonly length: number
}

describe('Schema Cache', () => {
  let localStorageMock: LocalStorageMock

  beforeEach(() => {
    const storage: { [key: string]: string } = {}
    localStorageMock = {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key]
      }),
      clear: vi.fn(() => {
        Object.keys(storage).forEach(key => delete storage[key])
      }),
      get length() {
        return Object.keys(storage).length
      }
    }
    vi.stubGlobal('localStorage', localStorageMock)
  })

  describe('makeCacheKey', () => {
    test('should create cache key with connector id only', () => {
      const key = makeCacheKey('duckdb')
      expect(key).toBe('schema:duckdb::')
    })

    test('should create cache key with connector id and database', () => {
      const key = makeCacheKey('bigquery', 'my-project')
      expect(key).toBe('schema:bigquery:my-project:')
    })

    test('should create cache key with connector id, database, and schema', () => {
      const key = makeCacheKey('bigquery', 'my-project', 'public')
      expect(key).toBe('schema:bigquery:my-project:public')
    })

    test('should handle empty strings', () => {
      const key = makeCacheKey('', '', '')
      expect(key).toBe('schema:::')
    })
  })

  describe('setCachedSchema', () => {
    test('should cache schema with TTL', async () => {
      const schema = {
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER' }] }
        ],
        database: 'main'
      }
      const key = 'test-key'
      const ttlMs = 60000

      await setCachedSchema(key, schema, ttlMs)

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedValue = localStorageMock.setItem.mock.calls[0][1]
      const parsed = JSON.parse(savedValue)

      expect(parsed.schema).toEqual(schema)
      expect(parsed.expiresAt).toBeGreaterThan(Date.now())
    })

    test('should set expiration time correctly', async () => {
      const schema = { tables: [], database: 'test' }
      const ttlMs = 5000
      const beforeTime = Date.now()

      await setCachedSchema('key', schema, ttlMs)

      const savedValue = localStorageMock.setItem.mock.calls[0][1]
      const parsed = JSON.parse(savedValue)
      const afterTime = Date.now()

      expect(parsed.expiresAt).toBeGreaterThanOrEqual(beforeTime + ttlMs)
      expect(parsed.expiresAt).toBeLessThanOrEqual(afterTime + ttlMs + 100)
    })
  })

  describe('getCachedSchema', () => {
    test('should return cached schema if not expired', async () => {
      const schema = {
        tables: [{ name: 'orders', columns: [{ name: 'id', type: 'INTEGER' }] }],
        database: 'main'
      }
      const expiresAt = Date.now() + 60000 // Expires in 1 minute

      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({ schema, expiresAt })
      )

      const result = await getCachedSchema('test-key')

      expect(result).toEqual(schema)
    })

    test('should return null if schema is expired', async () => {
      const schema = { tables: [], database: 'test' }
      const expiresAt = Date.now() - 1000 // Expired 1 second ago

      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({ schema, expiresAt })
      )

      const result = await getCachedSchema('test-key')

      expect(result).toBeNull()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key')
    })

    test('should return null if cache entry does not exist', async () => {
      localStorageMock.getItem.mockReturnValue(null)

      const result = await getCachedSchema('non-existent')

      expect(result).toBeNull()
    })

    test('should return null and remove entry if JSON is corrupted', async () => {
      localStorageMock.getItem.mockReturnValue('invalid-json{')

      const result = await getCachedSchema('corrupted-key')

      expect(result).toBeNull()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('corrupted-key')
    })

    test('should handle missing schema field gracefully', async () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({ expiresAt: Date.now() + 60000 })
      )

      const result = await getCachedSchema('test-key')

      expect(result).toBeNull()
    })

    test('should handle missing expiresAt field gracefully', async () => {
      const schema = { tables: [], database: 'test' }
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({ schema })
      )

      const result = await getCachedSchema('test-key')

      // Without expiresAt, it should be treated as expired
      expect(result).toBeNull()
    })
  })

  describe('Integration', () => {
    test('should cache and retrieve schema correctly', async () => {
      const schema = {
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER' }, { name: 'email', type: 'VARCHAR' }] },
          { name: 'posts', columns: [{ name: 'id', type: 'INTEGER' }, { name: 'title', type: 'TEXT' }] }
        ],
        database: 'my_database'
      }
      const key = makeCacheKey('duckdb', 'my_database')

      await setCachedSchema(key, schema, 60000)
      const retrieved = await getCachedSchema(key)

      expect(retrieved).toEqual(schema)
    })

    test('should not return schema after TTL expires', async () => {
      const schema = { tables: [], database: 'test' }
      const key = 'test-key'

      await setCachedSchema(key, schema, -1000) // Set to already expired

      const retrieved = await getCachedSchema(key)

      expect(retrieved).toBeNull()
    })
  })
})
