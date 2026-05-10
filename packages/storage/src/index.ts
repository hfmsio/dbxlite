// Encryption helpers using AES-GCM with keys derived from Argon2id.
//
// Parameters: t=3, m=65536 (64 MiB), p=1 — OWASP minimum for Argon2id
// password hashing as of 2024. The Argon2 output is imported directly
// as the AES-GCM key (32 bytes); no PBKDF2 chain. The previous
// double-derivation produced a key no stronger than the weaker
// primitive while adding cost.
export class EncryptionManager {
  async deriveKey(passphrase: string, salt?: Uint8Array){
    // Dynamic import to avoid bundling issues with argon2-browser's WASM
    const argon2 = (await import('argon2-browser')).default
    salt = salt || crypto.getRandomValues(new Uint8Array(16))
    const res = await argon2.hash({
      pass: passphrase,
      salt,
      time: 3,        // OWASP min t for Argon2id
      mem: 65536,     // 64 MiB - OWASP min m
      parallelism: 1, // explicit p=1
      hashLen: 32,    // AES-256 key length
    })
    // argon2-browser returns a hex string; convert to raw bytes.
    const hex = res.hash
    const keyBytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(h=>parseInt(h,16)))
    // Import the Argon2 output directly as an AES-GCM key. WebCrypto
    // accepts raw bytes for AES-GCM via importKey; the prior PBKDF2
    // re-derivation comment ("WebCrypto can't import raw AES key") was
    // wrong and the round-trip wasted ~100 ms with no security benefit.
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
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

// Public credential-store contract is re-exported from ./types.
export type { CredentialStoreLike } from "./types"
import type { CredentialStoreLike } from "./types"

// Plaintext localStorage adapter intentionally NOT exported from the
// package surface. It lives in ./_credential-store-internal and is
// used as EncryptedCredentialStore's byte-level backing store only.
// App code uses EncryptedCredentialStore exclusively.
import { CredentialStore } from "./_credential-store-internal"

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
    } catch (err) {
      // Fallback: if crypto isn't available (very old browser, no IndexedDB),
      // fall through to plaintext rather than block the save entirely.
      // The warning is essential — without it, a programming mistake or
      // device-key corruption silently downgrades security.
      try {
        // Use the dev-time console rather than the project's logger so
        // this warning surfaces even in environments where the logger
        // module isn't initialized yet (early-startup credential reads).
        console.warn(
          "[@ide/storage] EncryptedCredentialStore.save fell back to plaintext;",
          "value will be stored unencrypted. Cause:",
          err,
        )
      } catch {
        // logging failure is itself non-critical
      }
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
      } catch (err) {
        // Most common case: legacy plaintext value from before this wrapper
        // existed (heuristic length > 24 happens to also accept long
        // plaintext strings). The warn fires for genuine decrypt failures
        // — device-key corruption / rotation / data tampering — which
        // would otherwise be silent.
        try {
          console.warn(
            "[@ide/storage] EncryptedCredentialStore.load decrypt failed;",
            "returning raw value (likely legacy plaintext, possibly key loss):",
            id,
            err,
          )
        } catch {
          // non-critical
        }
        return raw
      }
    }

    return raw
  }

  listKeys(): string[] {
    return this.store.listKeys()
  }
}
