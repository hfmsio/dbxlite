// Encryption helpers using AES-GCM with keys derived from Argon2id
export class EncryptionManager {
  async deriveKey(passphrase: string, salt?: Uint8Array){
    // Dynamic import to avoid bundling issues with argon2-browser's WASM
    const argon2 = (await import('argon2-browser')).default
    salt = salt || crypto.getRandomValues(new Uint8Array(16))
    const res = await argon2.hash({ pass: passphrase, salt, time: 2, mem: 1024 })
    // argon2-browser returns a hex string; convert to raw bytes
    const hex = res.hash
    const keyBytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(h=>parseInt(h,16)))
    const key = await crypto.subtle.importKey('raw', keyBytes, 'PBKDF2', false, ['deriveKey'])
    // Derive AES-GCM key using PBKDF2 (we reuse this path since WebCrypto can't import raw AES key easily from arbitrary bytes)
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt','decrypt']
    )
    return { aesKey, salt }
  }

  async encryptWithPassphrase(passphrase: string, plain: string){
    const { aesKey, salt } = await this.deriveKey(passphrase)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, aesKey, new TextEncoder().encode(plain))
    const blob = new Uint8Array(salt.byteLength + iv.byteLength + ct.byteLength)
    blob.set(salt, 0)
    blob.set(iv, salt.byteLength)
    blob.set(new Uint8Array(ct), salt.byteLength + iv.byteLength)
    return btoa(String.fromCharCode(...blob))
  }

  async decryptWithPassphrase(passphrase: string, blobB64: string){
    const blob = Uint8Array.from(atob(blobB64), c=>c.charCodeAt(0))
    const salt = blob.slice(0,16)
    const iv = blob.slice(16,28)
    const ct = blob.slice(28)
    const { aesKey } = await this.deriveKey(passphrase, salt)
    const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, aesKey, ct.buffer)
    return new TextDecoder().decode(pt)
  }
}

/**
 * Common interface for credential persistence. Both `CredentialStore`
 * (plaintext) and `EncryptedCredentialStore` (AES-GCM device-bound) implement
 * this. Connectors take this interface so callers can choose the storage
 * mode appropriate to their environment.
 */
export interface CredentialStoreLike {
  save(id: string, payload: unknown): Promise<void>
  load(id: string): Promise<unknown>
  listKeys(): string[]
}

export class CredentialStore implements CredentialStoreLike {
  constructor() {}

  async save(id: string, payload: unknown): Promise<void> {
    if (payload == null) {
      localStorage.removeItem('cred:' + id)
      return
    }
    localStorage.setItem('cred:' + id, JSON.stringify(payload))
  }

  async load(id: string): Promise<unknown> {
    const x = localStorage.getItem('cred:' + id)
    if (!x) return null
    try {
      return JSON.parse(x)
    } catch (e) {
      return null
    }
  }

  // helper to list cred ids
  listKeys(): string[] {
    const res: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('cred:')) res.push(k.slice('cred:'.length))
    }
    return res
  }
}

/**
 * EncryptedCredentialStore — wraps `CredentialStore` with AES-GCM encryption
 * using a device-bound key (256-bit, persisted in IndexedDB at
 * `dbxlite-keys/dbxlite-device-key`).
 *
 * Threat model:
 *   - Protects against casual reading of localStorage (devtools paste,
 *     malicious browser extension lacking IndexedDB access, log captures
 *     of localStorage exports).
 *   - Does NOT protect against XSS — any code in the same origin can read
 *     the device key from IndexedDB.
 *   - Does NOT protect against full filesystem access on the user's machine.
 *
 * On read, transparently decrypts. If a value fails to decrypt (legacy
 * plaintext from before this wrapper existed), it's returned as-is so
 * existing users aren't logged out on first run after upgrade.
 *
 * Used for: AI API keys, OAuth refresh tokens, OAuth client secrets — any
 * secret-shaped value worth even modest at-rest protection.
 */
export class EncryptedCredentialStore implements CredentialStoreLike {
  private store = new CredentialStore()
  private keyPromise: Promise<CryptoKey> | null = null

  private async getDeviceKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = this.loadOrCreateKey()
    }
    return this.keyPromise
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const stored = await this.idbGet('dbxlite-device-key')
    if (stored) {
      return crypto.subtle.importKey('raw', stored, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ])
    }
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )
    const exported = await crypto.subtle.exportKey('raw', key)
    await this.idbSet('dbxlite-device-key', new Uint8Array(exported))
    return key
  }

  private idbGet(key: string): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('dbxlite-keys', 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore('keys')
        }
        req.onsuccess = () => {
          const tx = req.result.transaction('keys', 'readonly')
          const get = tx.objectStore('keys').get(key)
          get.onsuccess = () => resolve(get.result || null)
          get.onerror = () => resolve(null)
        }
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  private idbSet(key: string, value: Uint8Array): Promise<void> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('dbxlite-keys', 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore('keys')
        }
        req.onsuccess = () => {
          const tx = req.result.transaction('keys', 'readwrite')
          tx.objectStore('keys').put(value, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        }
        req.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async save(id: string, payload: unknown): Promise<void> {
    if (payload == null) {
      return this.store.save(id, null)
    }
    try {
      const key = await this.getDeviceKey()
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encoded = new TextEncoder().encode(JSON.stringify(payload))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded,
      )
      const combined = new Uint8Array(iv.length + encrypted.byteLength)
      combined.set(iv)
      combined.set(new Uint8Array(encrypted), iv.length)
      return this.store.save(id, btoa(String.fromCharCode(...combined)))
    } catch {
      // Fallback: if crypto isn't available (very old browser, no IndexedDB),
      // fall through to plaintext rather than block the save entirely.
      return this.store.save(id, payload)
    }
  }

  async load(id: string): Promise<unknown> {
    const raw = await this.store.load(id)
    if (!raw) return null

    // Encrypted entries are base64 strings of length > 24 (12-byte IV +
    // ciphertext). Anything else is a legacy plaintext value from before
    // this wrapper existed — pass through unchanged so existing sessions
    // don't break on upgrade.
    if (typeof raw === 'string' && raw.length > 24) {
      try {
        const key = await this.getDeviceKey()
        const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
        const iv = combined.slice(0, 12)
        const ciphertext = combined.slice(12)
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ciphertext,
        )
        return JSON.parse(new TextDecoder().decode(decrypted))
      } catch {
        return raw
      }
    }

    return raw
  }

  listKeys(): string[] {
    return this.store.listKeys()
  }
}
