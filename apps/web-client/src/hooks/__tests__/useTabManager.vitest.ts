import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTabManager } from "../useTabManager";

// Mock localStorage
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
		get length() {
			return Object.keys(store).length;
		},
		key: vi.fn((i: number) => Object.keys(store)[i] || null),
	};
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("useTabManager", () => {
	beforeEach(() => {
		localStorageMock.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("initialization", () => {
		test("should initialize with default tab when localStorage is empty", () => {
			const { result } = renderHook(() => useTabManager());

			expect(result.current.tabs).toHaveLength(1);
			expect(result.current.tabs[0].id).toBe("1");
			expect(result.current.tabs[0].name).toBe("Query 1");
			expect(result.current.activeTabId).toBe("1");
		});

		test("should load tabs from localStorage", () => {
			const savedTabs = [
				{ id: "1", name: "Saved Query", query: "SELECT 1", isDirty: false },
				{ id: "2", name: "Second Query", query: "SELECT 2", isDirty: true },
			];
			localStorageMock.setItem(
				"dbxlite-editor-tabs",
				JSON.stringify(savedTabs),
			);

			const { result } = renderHook(() => useTabManager());

			expect(result.current.tabs).toHaveLength(2);
			expect(result.current.tabs[0].name).toBe("Saved Query");
			expect(result.current.tabs[1].name).toBe("Second Query");
		});

		test("should reset loading, error, and result when loading from localStorage", () => {
			const savedTabs = [
				{
					id: "1",
					name: "Query",
					query: "SELECT 1",
					loading: true,
					error: "old error",
					result: { rows: [] },
				},
			];
			localStorageMock.setItem(
				"dbxlite-editor-tabs",
				JSON.stringify(savedTabs),
			);

			const { result } = renderHook(() => useTabManager());

			expect(result.current.tabs[0].loading).toBe(false);
			expect(result.current.tabs[0].error).toBe(null);
			expect(result.current.tabs[0].result).toBe(null);
		});

		test("should load active tab from localStorage", () => {
			const savedTabs = [
				{ id: "1", name: "First", query: "" },
				{ id: "2", name: "Second", query: "" },
			];
			localStorageMock.setItem(
				"dbxlite-editor-tabs",
				JSON.stringify(savedTabs),
			);
			localStorageMock.setItem("dbxlite-active-tab", "2");

			const { result } = renderHook(() => useTabManager());

			expect(result.current.activeTabId).toBe("2");
		});

		test("should use custom default template", () => {
			const customTemplate = "-- Custom default query";
			const { result } = renderHook(() =>
				useTabManager({
					defaultTabTemplate: customTemplate,
				}),
			);

			expect(result.current.tabs[0].query).toBe(customTemplate);
		});
	});

	describe("addTab", () => {
		test("should add a new tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.tabs).toHaveLength(2);
			expect(result.current.activeTabId).toBe("2");
		});

		test("should use new tab template for added tabs", () => {
			const newTemplate = "-- New tab custom query";
			const { result } = renderHook(() =>
				useTabManager({
					newTabTemplate: newTemplate,
				}),
			);

			act(() => {
				result.current.addTab();
			});

			expect(result.current.tabs[1].query).toBe(newTemplate);
		});

		test("should not add more than 3 tabs", () => {
			const showToast = vi.fn();
			const { result } = renderHook(() => useTabManager({ showToast }));

			// Add 2 more tabs (3 total)
			act(() => {
				result.current.addTab();
				result.current.addTab();
			});

			expect(result.current.tabs).toHaveLength(3);

			// Try to add 4th tab
			act(() => {
				result.current.addTab();
			});

			expect(result.current.tabs).toHaveLength(3);
			expect(showToast).toHaveBeenCalledWith(
				expect.stringContaining("Maximum 3 tabs"),
				"warning",
				4000,
			);
		});

		test("should set new tab as active", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.activeTabId).toBe("2");
			expect(result.current.activeTab?.id).toBe("2");
		});

		test("should increment tab names correctly", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.tabs[1].name).toBe("Query 2");
		});
	});

	describe("closeTab", () => {
		test("should close a tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.tabs).toHaveLength(2);

			act(() => {
				result.current.closeTab("2");
			});

			expect(result.current.tabs).toHaveLength(1);
			expect(result.current.tabs.find((t) => t.id === "2")).toBeUndefined();
		});

		test("should switch to first tab when closing active tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.activeTabId).toBe("2");

			act(() => {
				result.current.closeTab("2");
			});

			expect(result.current.activeTabId).toBe("1");
		});

		test("should keep active tab when closing non-active tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
				result.current.setActiveTabId("1");
			});

			act(() => {
				result.current.closeTab("2");
			});

			expect(result.current.activeTabId).toBe("1");
		});
	});

	describe("renameTab", () => {
		test("should rename a tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.renameTab("1", "My Custom Query");
			});

			expect(result.current.tabs[0].name).toBe("My Custom Query");
		});
	});

	describe("updateTab", () => {
		test("should update tab properties", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.updateTab("1", {
					query: "SELECT * FROM users",
					isDirty: true,
				});
			});

			expect(result.current.tabs[0].query).toBe("SELECT * FROM users");
			expect(result.current.tabs[0].isDirty).toBe(true);
		});

		test("should update loading state", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.updateTab("1", { loading: true });
			});

			expect(result.current.tabs[0].loading).toBe(true);
		});

		test("should update error state", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.updateTab("1", { error: "Query failed" });
			});

			expect(result.current.tabs[0].error).toBe("Query failed");
		});

		test("should only update specified tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
				result.current.updateTab("1", { query: "Updated" });
			});

			expect(result.current.tabs[0].query).toBe("Updated");
			expect(result.current.tabs[1].query).not.toBe("Updated");
		});
	});

	describe("setActiveTabId", () => {
		test("should change active tab", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
				result.current.setActiveTabId("1");
			});

			expect(result.current.activeTabId).toBe("1");
			expect(result.current.activeTab?.id).toBe("1");
		});
	});

	describe("canAddTab", () => {
		test("should return true when under limit", () => {
			const { result } = renderHook(() => useTabManager());

			expect(result.current.canAddTab).toBe(true);
		});

		test("should return false at limit", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
				result.current.addTab();
			});

			expect(result.current.tabs).toHaveLength(3);
			expect(result.current.canAddTab).toBe(false);
		});
	});

	describe("activeTab", () => {
		test("should return the active tab", () => {
			const { result } = renderHook(() => useTabManager());

			expect(result.current.activeTab).toBeDefined();
			expect(result.current.activeTab?.id).toBe("1");
		});

		test("should return undefined if active tab not found", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.setActiveTabId("nonexistent");
			});

			expect(result.current.activeTab).toBeUndefined();
		});
	});

	describe("persistence", () => {
		test("should save tabs to localStorage on change", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"dbxlite-editor-tabs",
				expect.any(String),
			);
		});

		test("should save active tab to localStorage", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
				result.current.setActiveTabId("2");
			});

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"dbxlite-active-tab",
				"2",
			);
		});

		test("should not save transient state to localStorage", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.updateTab("1", {
					loading: true,
					error: "some error",
					result: {
						rows: [],
						columns: [],
						totalRows: 0,
						executionTime: 0,
					},
				});
			});

			const savedData = localStorageMock.setItem.mock.calls.find(
				(call) => call[0] === "dbxlite-editor-tabs",
			)?.[1];

			if (savedData) {
				const parsed = JSON.parse(savedData);
				expect(parsed[0].loading).toBeUndefined();
				expect(parsed[0].error).toBeUndefined();
				expect(parsed[0].result).toBeUndefined();
			}
		});
	});

	describe("nextTabId", () => {
		test("should provide ref for next tab ID", () => {
			const { result } = renderHook(() => useTabManager());

			expect(result.current.nextTabId.current).toBe(2);
		});

		test("should increment after adding tabs", () => {
			const { result } = renderHook(() => useTabManager());

			act(() => {
				result.current.addTab();
			});

			expect(result.current.nextTabId.current).toBe(3);
		});
	});
});
