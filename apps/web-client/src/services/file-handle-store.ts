/**
 * File Handle Store - Persist File System Access API handles in IndexedDB
 * Allows re-loading files without re-upload after page refresh
 */

import { createLogger } from "../utils/logger";

const logger = createLogger("FileHandleStore");
const DB_NAME = "dbxlite-file-handles";
const DB_VERSION = 2;
const STORE_NAME = "handles";
const DIR_STORE_NAME = "directory-handles";

// Extended types for File System Access API with permission methods
interface FileSystemHandlePermissionDescriptor {
	mode: "read" | "readwrite";
}

interface FileSystemHandleWithPermissions extends FileSystemFileHandle {
	queryPermission(
		descriptor: FileSystemHandlePermissionDescriptor,
	): Promise<PermissionState>;
	requestPermission(
		descriptor: FileSystemHandlePermissionDescriptor,
	): Promise<PermissionState>;
}

interface DirectoryHandleWithPermissions extends FileSystemDirectoryHandle {
	queryPermission(
		descriptor: FileSystemHandlePermissionDescriptor,
	): Promise<PermissionState>;
	requestPermission(
		descriptor: FileSystemHandlePermissionDescriptor,
	): Promise<PermissionState>;
}

export interface StoredFileHandle {
	id: string;
	name: string;
	handle: FileSystemFileHandle;
	lastAccessed: Date;
}

export interface StoredDirectoryHandle {
	id: string;
	name: string;
	handle: FileSystemDirectoryHandle;
	lastAccessed: Date;
}

class FileHandleStore {
	private db: IDBDatabase | null = null;

	/**
	 * Check if File System Access API is supported
	 */
	isSupported(): boolean {
		return "showOpenFilePicker" in window;
	}

	/**
	 * Initialize the IndexedDB database
	 */
	async init(): Promise<void> {
		if (this.db) return;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: "id" });
				}
				if (!db.objectStoreNames.contains(DIR_STORE_NAME)) {
					db.createObjectStore(DIR_STORE_NAME, { keyPath: "id" });
				}
			};
		});
	}

	/**
	 * Store a file handle
	 */
	async storeHandle(
		id: string,
		name: string,
		handle: FileSystemFileHandle,
	): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([STORE_NAME], "readwrite");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(STORE_NAME);

			const data: StoredFileHandle = {
				id,
				name,
				handle,
				lastAccessed: new Date(),
			};

			const request = store.put(data);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get a file handle by ID
	 */
	async getHandle(id: string): Promise<StoredFileHandle | null> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([STORE_NAME], "readonly");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(id);

			request.onsuccess = () => {
				const result = request.result;
				if (result) {
					// Convert date string back to Date object
					result.lastAccessed = new Date(result.lastAccessed);
				}
				resolve(result || null);
			};
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get all stored file handles
	 */
	async getAllHandles(): Promise<StoredFileHandle[]> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([STORE_NAME], "readonly");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const results = request.result || [];
				// Convert date strings back to Date objects
				results.forEach((r: StoredFileHandle) => {
					r.lastAccessed = new Date(r.lastAccessed);
				});
				resolve(results);
			};
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Remove a file handle
	 */
	async removeHandle(id: string): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([STORE_NAME], "readwrite");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Clear all file handles
	 */
	async clearAll(): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([STORE_NAME], "readwrite");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(STORE_NAME);
			const request = store.clear();

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Query permission status without requesting
	 * Returns true if permission already granted, false otherwise
	 */
	async queryPermission(handle: FileSystemFileHandle): Promise<boolean> {
		try {
			const options = { mode: "read" as const };
			const handleWithPerms = handle as FileSystemHandleWithPermissions;
			return (await handleWithPerms.queryPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to query permission:", error);
			return false;
		}
	}

	/**
	 * Request permission to access a file handle
	 * Returns true if permission granted, false otherwise
	 * Note: This must be called from a user interaction (e.g., button click)
	 */
	async requestPermission(handle: FileSystemFileHandle): Promise<boolean> {
		try {
			const options = { mode: "read" as const };
			const handleWithPerms = handle as FileSystemHandleWithPermissions;

			// Check if we already have permission
			if ((await handleWithPerms.queryPermission(options)) === "granted") {
				return true;
			}

			// Request permission (requires user interaction)
			return (await handleWithPerms.requestPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to request permission:", error);
			return false;
		}
	}

	/**
	 * Read a file from a handle
	 */
	async readFile(handle: FileSystemFileHandle): Promise<ArrayBuffer> {
		const file = await handle.getFile();
		return await file.arrayBuffer();
	}

	/**
	 * Query write permission status without requesting
	 * Returns true if write permission already granted, false otherwise
	 */
	async queryWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
		try {
			const options = { mode: "readwrite" as const };
			const handleWithPerms = handle as FileSystemHandleWithPermissions;
			return (await handleWithPerms.queryPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to query write permission:", error);
			return false;
		}
	}

	/**
	 * Request write permission to access a file handle
	 * Returns true if permission granted, false otherwise
	 * Note: This must be called from a user interaction (e.g., button click)
	 */
	async requestWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
		try {
			const options = { mode: "readwrite" as const };
			const handleWithPerms = handle as FileSystemHandleWithPermissions;

			// Check if we already have permission
			if ((await handleWithPerms.queryPermission(options)) === "granted") {
				return true;
			}

			// Request permission (requires user interaction)
			return (await handleWithPerms.requestPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to request write permission:", error);
			return false;
		}
	}

	/**
	 * Write content to a file using stored file handle ID
	 * Returns true if successful, false otherwise
	 */
	async writeFile(fileHandleId: string, content: string): Promise<boolean> {
		try {
			// Get the stored file handle
			const stored = await this.getHandle(fileHandleId);
			if (!stored) {
				logger.error("File handle not found:", fileHandleId);
				return false;
			}

			const handle = stored.handle;

			// Request write permission if needed
			const hasPermission = await this.requestWritePermission(handle);
			if (!hasPermission) {
				logger.warn("Write permission denied for:", stored.name);
				return false;
			}

			// Create a writable stream
			const writable = await handle.createWritable();

			// Write the content
			await writable.write(content);

			// Close the file
			await writable.close();

			// Update last accessed timestamp
			await this.storeHandle(fileHandleId, stored.name, handle);

			return true;
		} catch (error) {
			logger.error("Failed to write file:", error);
			return false;
		}
	}

	/**
	 * Store a directory handle
	 */
	async storeDirectoryHandle(
		id: string,
		name: string,
		handle: FileSystemDirectoryHandle,
	): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([DIR_STORE_NAME], "readwrite");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(DIR_STORE_NAME);

			const data: StoredDirectoryHandle = {
				id,
				name,
				handle,
				lastAccessed: new Date(),
			};

			const request = store.put(data);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get a directory handle by ID
	 */
	async getDirectoryHandle(id: string): Promise<StoredDirectoryHandle | null> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([DIR_STORE_NAME], "readonly");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(DIR_STORE_NAME);
			const request = store.get(id);

			request.onsuccess = () => {
				const result = request.result;
				if (result) {
					// Convert date string back to Date object
					result.lastAccessed = new Date(result.lastAccessed);
				}
				resolve(result || null);
			};
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Remove a directory handle
	 */
	async removeDirectoryHandle(id: string): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const transaction = this.db?.transaction([DIR_STORE_NAME], "readwrite");
			if (!transaction) {
				reject(new Error("Failed to create transaction"));
				return;
			}
			const store = transaction.objectStore(DIR_STORE_NAME);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Query permission status for a directory handle without requesting
	 * Returns true if permission already granted, false otherwise
	 */
	async queryDirectoryPermission(
		handle: FileSystemDirectoryHandle,
	): Promise<boolean> {
		try {
			const options = { mode: "read" as const };
			const dirHandleWithPerms = handle as DirectoryHandleWithPermissions;
			return (await dirHandleWithPerms.queryPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to query directory permission:", error);
			return false;
		}
	}

	/**
	 * Request permission to access a directory handle
	 * Returns true if permission granted, false otherwise
	 * Note: This must be called from a user interaction (e.g., button click)
	 */
	async requestDirectoryPermission(
		handle: FileSystemDirectoryHandle,
	): Promise<boolean> {
		try {
			const options = { mode: "read" as const };
			const dirHandleWithPerms = handle as DirectoryHandleWithPermissions;

			// Check if we already have permission
			if ((await dirHandleWithPerms.queryPermission(options)) === "granted") {
				return true;
			}

			// Request permission (requires user interaction)
			return (await dirHandleWithPerms.requestPermission(options)) === "granted";
		} catch (error) {
			logger.error("Failed to request directory permission:", error);
			return false;
		}
	}
}

export const fileHandleStore = new FileHandleStore();
