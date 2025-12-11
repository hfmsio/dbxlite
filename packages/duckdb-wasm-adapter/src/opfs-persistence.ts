/**
 * OPFS (Origin Private File System) Persistence Layer
 *
 * Provides utilities for storing DuckDB data files in OPFS for persistence
 * across browser sessions.
 *
 * Browser Support:
 * - Chrome/Edge 102+
 * - Safari 15.2+
 * - Firefox 111+
 */

// ==========================================================================
// Types
// ==========================================================================

export interface OPFSFile {
  path: string
  sizeBytes: number
  createdAt: Date
  lastModified: Date
}

export interface StorageQuota {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  percentUsed: number
  isPersisted: boolean
}

export interface WriteOptions {
  /**
   * Chunk size for writing large files (bytes)
   * Default: 10MB
   */
  chunkSize?: number

  /**
   * Progress callback
   */
  onProgress?: (bytesWritten: number, totalBytes: number) => void

  /**
   * Whether to overwrite existing file
   */
  overwrite?: boolean
}

export interface ReadOptions {
  /**
   * Start offset (bytes)
   */
  offset?: number

  /**
   * Number of bytes to read
   */
  length?: number
}

// ==========================================================================
// OPFS Persistence Manager
// ==========================================================================

export class OPFSPersistence {
  private root: FileSystemDirectoryHandle | null = null
  private isSupported = false
  private isInitialized = false

  constructor() {
    this.checkSupport()
  }

  /**
   * Check if OPFS is supported in current browser
   */
  private checkSupport(): void {
    this.isSupported = typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
  }

  /**
   * Get OPFS support status
   */
  get supported(): boolean {
    return this.isSupported
  }

  /**
   * Initialize OPFS access
   */
  async initialize(): Promise<boolean> {
    if (!this.isSupported) {
      // OPFS not supported in this browser
      return false
    }

    if (this.isInitialized) {
      return true
    }

    try {
      this.root = await navigator.storage.getDirectory()
      this.isInitialized = true

      // Request persistent storage (silently handle if not persisted)
      if ('persist' in navigator.storage) {
        await navigator.storage.persist()
      }

      return true
    } catch {
      // OPFS initialization failed
      return false
    }
  }

  /**
   * Ensure initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.root) {
      throw new Error('OPFS not initialized. Call initialize() first.')
    }
  }

  // ========================================================================
  // Directory Operations
  // ========================================================================

  /**
   * Get or create a directory
   */
  async getDirectory(path: string, create = true): Promise<FileSystemDirectoryHandle> {
    this.ensureInitialized()

    const parts = path.split('/').filter(Boolean)
    let current = this.root!

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create })
    }

    return current
  }

  /**
   * Create directory structure
   */
  async createDirectory(path: string): Promise<void> {
    await this.getDirectory(path, true)
  }

  /**
   * Check if directory exists
   */
  async directoryExists(path: string): Promise<boolean> {
    try {
      await this.getDirectory(path, false)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove directory and all contents
   */
  async removeDirectory(path: string): Promise<void> {
    this.ensureInitialized()

    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) {
      throw new Error('Cannot remove root directory')
    }

    const dirName = parts.pop()!
    const parentPath = parts.join('/')

    const parent = parentPath
      ? await this.getDirectory(parentPath, false)
      : this.root!

    await parent.removeEntry(dirName, { recursive: true })
  }

  // ========================================================================
  // File Operations
  // ========================================================================

  /**
   * Write data to a file
   */
  async writeFile(
    filePath: string,
    data: ArrayBuffer | Uint8Array | Blob,
    options: WriteOptions = {}
  ): Promise<void> {
    this.ensureInitialized()

    const {
      chunkSize = 10 * 1024 * 1024, // 10MB default
      onProgress,
      overwrite = true
    } = options

    // Parse file path
    const { dir, filename } = this.parsePath(filePath)

    // Get or create directory
    const directory = await this.getDirectory(dir, true)

    // Check if file exists
    if (!overwrite) {
      const exists = await this.fileExists(filePath)
      if (exists) {
        throw new Error(`File already exists: ${filePath}`)
      }
    }

    // Get file handle
    const fileHandle = await directory.getFileHandle(filename, { create: true })

    // Create writable stream
    const writable = await fileHandle.createWritable()

    try {
      // Convert data to array buffer
      const buffer = data instanceof Blob
        ? await data.arrayBuffer()
        : data instanceof Uint8Array
          ? data.buffer
          : data

      const totalBytes = buffer.byteLength
      let bytesWritten = 0

      // Write in chunks
      while (bytesWritten < totalBytes) {
        const chunk = buffer.slice(
          bytesWritten,
          Math.min(bytesWritten + chunkSize, totalBytes)
        )

        await writable.write(chunk)
        bytesWritten += chunk.byteLength

        onProgress?.(bytesWritten, totalBytes)
      }

      await writable.close()
    } catch (error) {
      // Clean up on error
      await writable.abort()
      throw error
    }
  }

  /**
   * Read data from a file
   */
  async readFile(filePath: string, options: ReadOptions = {}): Promise<ArrayBuffer> {
    this.ensureInitialized()

    const { offset = 0, length } = options

    // Parse file path
    const { dir, filename } = this.parsePath(filePath)

    // Get directory and file
    const directory = await this.getDirectory(dir, false)
    const fileHandle = await directory.getFileHandle(filename)
    const file = await fileHandle.getFile()

    // Read slice or full file
    if (length !== undefined) {
      const blob = file.slice(offset, offset + length)
      return await blob.arrayBuffer()
    } else if (offset > 0) {
      const blob = file.slice(offset)
      return await blob.arrayBuffer()
    } else {
      return await file.arrayBuffer()
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const { dir, filename } = this.parsePath(filePath)
      const directory = await this.getDirectory(dir, false)
      await directory.getFileHandle(filename)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get file metadata
   */
  async getFileInfo(filePath: string): Promise<OPFSFile> {
    this.ensureInitialized()

    const { dir, filename } = this.parsePath(filePath)
    const directory = await this.getDirectory(dir, false)
    const fileHandle = await directory.getFileHandle(filename)
    const file = await fileHandle.getFile()

    return {
      path: filePath,
      sizeBytes: file.size,
      createdAt: new Date(file.lastModified), // Note: OPFS doesn't track creation time
      lastModified: new Date(file.lastModified)
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized()

    const { dir, filename } = this.parsePath(filePath)
    const directory = await this.getDirectory(dir, false)
    await directory.removeEntry(filename)
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath: string): Promise<OPFSFile[]> {
    this.ensureInitialized()

    const directory = await this.getDirectory(dirPath, false)
    const files: OPFSFile[] = []

    // @ts-ignore - entries() is available but TS types may not recognize it
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()

        files.push({
          path: `${dirPath}/${name}`,
          sizeBytes: file.size,
          createdAt: new Date(file.lastModified),
          lastModified: new Date(file.lastModified)
        })
      }
    }

    return files
  }

  /**
   * Get total size of all files in a directory
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    const files = await this.listFiles(dirPath)
    return files.reduce((total, file) => total + file.sizeBytes, 0)
  }

  // ========================================================================
  // Storage Quota Management
  // ========================================================================

  /**
   * Get storage quota information
   */
  async getQuota(): Promise<StorageQuota> {
    this.ensureInitialized()

    if (!('estimate' in navigator.storage)) {
      throw new Error('Storage estimation not supported')
    }

    const estimate = await navigator.storage.estimate()
    const totalBytes = estimate.quota || 0
    const usedBytes = estimate.usage || 0
    const availableBytes = totalBytes - usedBytes
    const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0

    const isPersisted = 'persisted' in navigator.storage
      ? await navigator.storage.persisted()
      : false

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      percentUsed,
      isPersisted
    }
  }

  /**
   * Request persistent storage
   */
  async requestPersistence(): Promise<boolean> {
    if ('persist' in navigator.storage) {
      return await navigator.storage.persist()
    }
    return false
  }

  /**
   * Check if enough space is available
   */
  async hasSpace(requiredBytes: number): Promise<boolean> {
    const quota = await this.getQuota()
    return quota.availableBytes >= requiredBytes
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Parse file path into directory and filename
   */
  private parsePath(filePath: string): { dir: string; filename: string } {
    const normalized = filePath.startsWith('/')
      ? filePath.slice(1)
      : filePath

    const parts = normalized.split('/')
    const filename = parts.pop() || ''
    const dir = parts.join('/')

    return { dir, filename }
  }

  /**
   * Format bytes to human-readable size
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  /**
   * Clean up old files based on criteria
   */
  async cleanup(options: {
    directory: string
    olderThanDays?: number
    maxSize?: number
  }): Promise<number> {
    const { directory, olderThanDays, maxSize } = options

    const files = await this.listFiles(directory)
    let deletedCount = 0

    // Filter files based on criteria
    const now = Date.now()
    const filesToDelete = files.filter(file => {
      if (olderThanDays) {
        const age = (now - file.lastModified.getTime()) / (1000 * 60 * 60 * 24)
        if (age < olderThanDays) return false
      }

      if (maxSize) {
        if (file.sizeBytes < maxSize) return false
      }

      return true
    })

    // Delete files
    for (const file of filesToDelete) {
      try {
        await this.deleteFile(file.path)
        deletedCount++
      } catch {
        // Delete failed - continue with other files
      }
    }

    return deletedCount
  }
}

// ==========================================================================
// Singleton Instance
// ==========================================================================

export const opfsPersistence = new OPFSPersistence()
