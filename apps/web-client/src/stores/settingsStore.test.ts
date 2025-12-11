/**
 * Settings Store Tests
 * Tests for the Zustand settings store
 */

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "./settingsStore";

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
	};
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("settingsStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		const store = useSettingsStore.getState();
		act(() => {
			store.setEditorTheme("vs-dark");
			store.setEditorFontSize(14);
			store.setEditorFontFamily('Menlo, Monaco, "Courier New", monospace');
			store.setGridFontSize(12);
			store.setGridRowHeight(32);
			store.setPageSize(100);
			store.setCacheThreshold(10000);
			store.setExplorerSortOrder("none");
			store.setSaveStrategy("auto");
			store.setShowExamplesButton(true);
		});
		localStorageMock.clear();
		vi.clearAllMocks();
	});

	describe("editor settings", () => {
		it("sets editor theme", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setEditorTheme("vs-light");
			});

			expect(useSettingsStore.getState().editorTheme).toBe("vs-light");
			expect(document.documentElement.setAttribute).toHaveBeenCalledWith(
				"data-theme",
				"vs-light",
			);
		});

		it("sets editor font size", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setEditorFontSize(16);
			});

			expect(useSettingsStore.getState().editorFontSize).toBe(16);
		});

		it("sets editor font family", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setEditorFontFamily("Fira Code");
			});

			expect(useSettingsStore.getState().editorFontFamily).toBe("Fira Code");
		});
	});

	describe("examples button preference", () => {
		it("defaults to shown and can be toggled", () => {
			const store = useSettingsStore.getState();
			expect(store.showExamplesButton).toBe(true);

			act(() => {
				store.setShowExamplesButton(false);
			});
			expect(useSettingsStore.getState().showExamplesButton).toBe(false);
		});
	});

	describe("grid settings", () => {
		it("sets grid font size", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setGridFontSize(14);
			});

			expect(useSettingsStore.getState().gridFontSize).toBe(14);
		});

		it("sets grid row height", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setGridRowHeight(40);
			});

			expect(useSettingsStore.getState().gridRowHeight).toBe(40);
		});
	});

	describe("data settings", () => {
		it("sets page size", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setPageSize(200);
			});

			expect(useSettingsStore.getState().pageSize).toBe(200);
		});

		it("sets cache threshold", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setCacheThreshold(5000);
			});

			expect(useSettingsStore.getState().cacheThreshold).toBe(5000);
		});
	});

	describe("explorer settings", () => {
		it("sets explorer sort order", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setExplorerSortOrder("name");
			});

			expect(useSettingsStore.getState().explorerSortOrder).toBe("name");
		});

		it("sets save strategy", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.setSaveStrategy("manual");
			});

			expect(useSettingsStore.getState().saveStrategy).toBe("manual");
		});
	});

	describe("hydrate", () => {
		it("bulk updates state", () => {
			const store = useSettingsStore.getState();
			act(() => {
				store.hydrate({
					editorTheme: "hc-black",
					editorFontSize: 18,
					pageSize: 500,
				});
			});

			const state = useSettingsStore.getState();
			expect(state.editorTheme).toBe("hc-black");
			expect(state.editorFontSize).toBe(18);
			expect(state.pageSize).toBe(500);
			// Other values should remain default
			expect(state.gridFontSize).toBe(12);
		});
	});

	describe("selector hooks", () => {
		it("provides individual selectors", async () => {
			// Import the selector hooks
			const { useEditorTheme, useEditorFontSize, usePageSize } = await import(
				"./settingsStore"
			);

			// These would normally be used in React components
			// Here we just verify they exist and are functions
			expect(typeof useEditorTheme).toBe("function");
			expect(typeof useEditorFontSize).toBe("function");
			expect(typeof usePageSize).toBe("function");
		});
	});
});
