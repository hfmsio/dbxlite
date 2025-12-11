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

export class CredentialStore {
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
