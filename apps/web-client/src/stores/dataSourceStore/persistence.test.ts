/**
 * Persistence Tests
 * Tests for localStorage persistence and multi-tab sync
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadFromStorage,
	saveToStorage,
	setupMultiTabSync,
	STORAGE_KEY,
} from "./persistence";
import type { DataSource } from "../../types/data-source";

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		}),
		_getStore: () => store,
	};
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("persistence", () => {
	beforeEach(() => {
		localStorageMock.clear();
		vi.clearAllMocks();
	});

	describe("loadFromStorage", () => {
		it("returns empty array when nothing stored", () => {
			const result = loadFromStorage();
			expect(result).toEqual([]);
		});

		it("parses stored data sources", () => {
			const stored: Partial<DataSource>[] = [
				{
					id: "ds-1",
					name: "test.parquet",
					type: "parquet",
					uploadedAt: new Date().toISOString() as unknown as Date,
				},
			];
			localStorageMock._getStore()[STORAGE_KEY] = JSON.stringify(stored);

			const result = loadFromStorage();
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("test.parquet");
		});

		it("converts date strings to Date objects", () => {
			const dateStr = "2024-01-15T10:00:00.000Z";
			const stored = [
				{ id: "ds-1", name: "test", type: "parquet", uploadedAt: dateStr },
			];
			localStorageMock._getStore()[STORAGE_KEY] = JSON.stringify(stored);

			const result = loadFromStorage();
			expect(result[0].uploadedAt).toBeInstanceOf(Date);
			expect(result[0].uploadedAt.toISOString()).toBe(dateStr);
		});

		it("resets runtime state (isAttached, restoreFailed, etc.)", () => {
			const stored = [
				{
					id: "ds-1",
					name: "test",
					type: "duckdb",
					uploadedAt: new Date().toISOString(),
					isAttached: true,
					restoreFailed: true,
					restoreError: "some error",
					introspectionError: "another error",
				},
			];
			localStorageMock._getStore()[STORAGE_KEY] = JSON.stringify(stored);

			const result = loadFromStorage();
			expect(result[0].isAttached).toBe(false);
			expect(result[0].restoreFailed).toBe(false);
			expect(result[0].restoreError).toBeUndefined();
			expect(result[0].introspectionError).toBeUndefined();
		});

		it("removes volatile files", () => {
			const stored = [
				{
					id: "ds-1",
					name: "persistent",
					type: "parquet",
					uploadedAt: new Date().toISOString(),
					isVolatile: false,
				},
				{
					id: "ds-2",
					name: "volatile",
					type: "parquet",
					uploadedAt: new Date().toISOString(),
					isVolatile: true,
				},
			];
			localStorageMock._getStore()[STORAGE_KEY] = JSON.stringify(stored);

			const result = loadFromStorage();
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("persistent");
		});

		it("deduplicates by filePath, keeping most recent", () => {
			const older = new Date("2024-01-01").toISOString();
			const newer = new Date("2024-01-15").toISOString();
			const stored = [
				{
					id: "ds-1",
					name: "old",
					type: "parquet",
					filePath: "/test.parquet",
					uploadedAt: older,
				},
				{
					id: "ds-2",
					name: "new",
					type: "parquet",
					filePath: "/test.parquet",
					uploadedAt: newer,
				},
			];
			localStorageMock._getStore()[STORAGE_KEY] = JSON.stringify(stored);

			const result = loadFromStorage();
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("new");
		});

		it("handles corrupt JSON gracefully", () => {
			localStorageMock._getStore()[STORAGE_KEY] = "not valid json";

			const result = loadFromStorage();
			expect(result).toEqual([]);
		});
	});

	describe("saveToStorage", () => {
		it("saves data sources to localStorage", () => {
			const dataSources = [
				{ id: "ds-1", name: "test", type: "parquet", uploadedAt: new Date() },
			] as DataSource[];

			saveToStorage(dataSources);

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				STORAGE_KEY,
				expect.any(String),
			);
		});

		it("serializes data sources as JSON", () => {
			const dataSources = [
				{ id: "ds-1", name: "test", type: "parquet", uploadedAt: new Date() },
			] as DataSource[];

			saveToStorage(dataSources);

			const savedJson = localStorageMock.setItem.mock.calls[0][1];
			const parsed = JSON.parse(savedJson);
			expect(parsed[0].name).toBe("test");
		});
	});

	describe("setupMultiTabSync", () => {
		it("returns cleanup function", () => {
			const cleanup = setupMultiTabSync(() => {});
			expect(typeof cleanup).toBe("function");
			cleanup();
		});

		it("calls onSync when storage event fires with new data", () => {
			const onSync = vi.fn();
			setupMultiTabSync(onSync);

			const newData = [
				{
					id: "ds-1",
					name: "synced",
					type: "parquet",
					uploadedAt: new Date().toISOString(),
				},
			];

			const event = new StorageEvent("storage", {
				key: STORAGE_KEY,
				newValue: JSON.stringify(newData),
			});
			window.dispatchEvent(event);

			expect(onSync).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ name: "synced" })]),
			);
		});

		it("calls onSync with empty array when storage cleared", () => {
			const onSync = vi.fn();
			setupMultiTabSync(onSync);

			const event = new StorageEvent("storage", {
				key: STORAGE_KEY,
				newValue: null,
			});
			window.dispatchEvent(event);

			expect(onSync).toHaveBeenCalledWith([]);
		});

		it("ignores events for other keys", () => {
			const onSync = vi.fn();
			setupMultiTabSync(onSync);

			const event = new StorageEvent("storage", {
				key: "other-key",
				newValue: "some value",
			});
			window.dispatchEvent(event);

			expect(onSync).not.toHaveBeenCalled();
		});
	});
});
