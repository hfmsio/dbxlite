import { describe, test, expect, vi, beforeEach } from 'vitest'
import { EncryptionManager, CredentialStore } from '../index'

// Mock argon2-browser
vi.mock('argon2-browser', () => ({
  default: {
    hash: vi.fn(async ({ pass, salt }) => ({
      hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      encoded: 'encoded-hash'
    }))
  }
}))

// Mock crypto.subtle
const mockCrypto = {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = i
    }
    return arr
  },
  subtle: {
    importKey: vi.fn(async () => ({ type: 'secret' })),
    deriveKey: vi.fn(async () => ({ type: 'secret', algorithm: { name: 'AES-GCM' } })),
    encrypt: vi.fn(async (algorithm, key, data) => {
      // Simple mock encryption - just return the data
      return new Uint8Array([1, 2, 3, 4, 5])
    }),
    decrypt: vi.fn(async (algorithm, key, data) => {
      // Simple mock decryption - return plaintext
      return new TextEncoder().encode('{"created":1}')
    })
  }
}

vi.stubGlobal('crypto', mockCrypto)

describe('EncryptionManager', () => {
  let em: EncryptionManager

  beforeEach(() => {
    em = new EncryptionManager()
    vi.clearAllMocks()
  })

  test('should derive key from passphrase', async () => {
    const { aesKey, salt } = await em.deriveKey('test-passphrase')

    expect(aesKey).toBeDefined()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.length).toBe(16)
    expect(mockCrypto.subtle.importKey).toHaveBeenCalled()
    expect(mockCrypto.subtle.deriveKey).toHaveBeenCalled()
  })

  test('should use provided salt when deriving key', async () => {
    const providedSalt = new Uint8Array(16).fill(42)
    const { salt } = await em.deriveKey('test-passphrase', providedSalt)

    expect(salt).toEqual(providedSalt)
  })

  test('should encrypt data with passphrase', async () => {
    const encrypted = await em.encryptWithPassphrase('test-pass', 'plain text data')

    expect(encrypted).toBeDefined()
    expect(typeof encrypted).toBe('string')
    // Base64 encoded string
    expect(encrypted.length).toBeGreaterThan(0)
    expect(mockCrypto.subtle.encrypt).toHaveBeenCalled()
  })

  test('should decrypt data with correct passphrase', async () => {
    const plaintext = 'test data'
    const encrypted = await em.encryptWithPassphrase('test-pass', plaintext)
    const decrypted = await em.decryptWithPassphrase('test-pass', encrypted)

    expect(decrypted).toBe('{"created":1}')
  })

  test('should include salt and IV in encrypted blob', async () => {
    const encrypted = await em.encryptWithPassphrase('test-pass', 'data')
    const decoded = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))

    // Should have salt (16 bytes) + IV (12 bytes) + ciphertext
    expect(decoded.length).toBeGreaterThanOrEqual(28)
  })

  test('should generate different IVs for each encryption', async () => {
    const plaintext = 'same data'
    const encrypted1 = await em.encryptWithPassphrase('pass', plaintext)

    // Reset crypto mock to generate different random values
    mockCrypto.getRandomValues = (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i + 10
      }
      return arr
    }

    const encrypted2 = await em.encryptWithPassphrase('pass', plaintext)

    // Different IVs should result in different ciphertexts
    expect(encrypted1).not.toBe(encrypted2)
  })
})

interface LocalStorageMock {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
  key: (index: number) => string | null
  readonly length: number
}

describe('CredentialStore', () => {
  let store: CredentialStore
  let localStorageMock: LocalStorageMock

  beforeEach(() => {
    // Create a proper localStorage mock
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
      key: vi.fn((index: number) => Object.keys(storage)[index] || null),
      get length() {
        return Object.keys(storage).length
      }
    }
    vi.stubGlobal('localStorage', localStorageMock)

    store = new CredentialStore()
  })

  test('should save credential payload', async () => {
    const payload = { token: 'abc123', userId: 'user1' }
    await store.save('test-id', payload)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cred:test-id',
      JSON.stringify(payload)
    )
  })

  test('should load credential payload', async () => {
    const payload = { token: 'xyz789', userId: 'user2' }
    await store.save('test-id', payload)

    const loaded = await store.load('test-id')

    expect(loaded).toEqual(payload)
  })

  test('should return null for non-existent credential', async () => {
    const loaded = await store.load('non-existent')

    expect(loaded).toBeNull()
  })

  test('should remove credential when saving null', async () => {
    await store.save('test-id', { token: 'temp' })
    await store.save('test-id', null)

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('cred:test-id')
  })

  test('should list all credential keys', async () => {
    await store.save('cred1', { data: 'test1' })
    await store.save('cred2', { data: 'test2' })
    await store.save('cred3', { data: 'test3' })

    const keys = store.listKeys()

    expect(keys).toContain('cred1')
    expect(keys).toContain('cred2')
    expect(keys).toContain('cred3')
    expect(keys.length).toBe(3)
  })

  test('should only list credential keys, not other localStorage entries', async () => {
    await store.save('cred1', { data: 'test1' })
    localStorageMock.setItem('other:key', 'value')
    localStorageMock.setItem('vault:meta', 'vault-data')

    const keys = store.listKeys()

    expect(keys).toContain('cred1')
    expect(keys).not.toContain('other:key')
    expect(keys).not.toContain('vault:meta')
    expect(keys.length).toBe(1)
  })

  test('should handle corrupted JSON gracefully', async () => {
    localStorageMock.setItem('cred:corrupted', 'invalid-json{')

    const loaded = await store.load('corrupted')

    expect(loaded).toBeNull()
  })

  test('should handle undefined payload', async () => {
    await store.save('test-id', undefined)

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('cred:test-id')
  })
})
