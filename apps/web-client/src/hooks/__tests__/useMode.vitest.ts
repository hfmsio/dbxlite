/**
 * Tests for useMode hook
 *
 * Tests mode detection, feature flags, and server availability checking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMode, getModeTooltip, getModeSwitchUrl } from "../useMode";

// Mock the connectors module
vi.mock("@ide/connectors", () => ({
	getModeFeatures: vi.fn((mode: string) => ({
		supportsFileHandles: mode === "wasm",
		supportsBigQuery: mode === "wasm",
		supportsAllExtensions: mode === "http",
		supportsFilesystem: mode === "http",
		isWasmBased: mode === "wasm",
	})),
	isHttpModeAvailable: vi.fn(),
}));

// Mock the query service
vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		getMode: vi.fn(() => "wasm"),
	},
}));

import { isHttpModeAvailable, getModeFeatures } from "@ide/connectors";
import { queryService } from "../../services/streaming-query-service";

describe("useMode", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default to WASM mode
		vi.mocked(queryService.getMode).mockReturnValue("wasm");
		vi.mocked(isHttpModeAvailable).mockResolvedValue(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("mode detection", () => {
		it("returns wasm mode by default", () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");

			const { result } = renderHook(() => useMode());

			expect(result.current.mode).toBe("wasm");
			expect(result.current.isWasmMode).toBe(true);
			expect(result.current.isHttpMode).toBe(false);
		});

		it("returns http mode when queryService reports http", () => {
			vi.mocked(queryService.getMode).mockReturnValue("http");

			const { result } = renderHook(() => useMode());

			expect(result.current.mode).toBe("http");
			expect(result.current.isHttpMode).toBe(true);
			expect(result.current.isWasmMode).toBe(false);
		});

		it('returns "Server" label for http mode', () => {
			vi.mocked(queryService.getMode).mockReturnValue("http");

			const { result } = renderHook(() => useMode());

			expect(result.current.label).toBe("Server");
		});

		it('returns "WASM" label for wasm mode', () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");

			const { result } = renderHook(() => useMode());

			expect(result.current.label).toBe("WASM");
		});
	});

	describe("feature flags", () => {
		it("returns correct features for wasm mode", () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");

			const { result } = renderHook(() => useMode());

			expect(result.current.features.supportsFileHandles).toBe(true);
			expect(result.current.features.supportsBigQuery).toBe(true);
			expect(result.current.features.supportsAllExtensions).toBe(false);
			expect(result.current.features.supportsFilesystem).toBe(false);
			expect(result.current.features.isWasmBased).toBe(true);
		});

		it("returns correct features for http mode", () => {
			vi.mocked(queryService.getMode).mockReturnValue("http");

			const { result } = renderHook(() => useMode());

			expect(result.current.features.supportsFileHandles).toBe(false);
			expect(result.current.features.supportsBigQuery).toBe(false);
			expect(result.current.features.supportsAllExtensions).toBe(true);
			expect(result.current.features.supportsFilesystem).toBe(true);
			expect(result.current.features.isWasmBased).toBe(false);
		});

		it("calls getModeFeatures with current mode", () => {
			vi.mocked(queryService.getMode).mockReturnValue("http");

			renderHook(() => useMode());

			expect(getModeFeatures).toHaveBeenCalledWith("http");
		});
	});

	describe("server availability", () => {
		it("checks server availability on mount in wasm mode", async () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");
			vi.mocked(isHttpModeAvailable).mockResolvedValue(true);

			const { result } = renderHook(() => useMode());

			await waitFor(() => {
				expect(result.current.serverAvailable).toBe(true);
			});

			expect(isHttpModeAvailable).toHaveBeenCalled();
		});

		it("sets serverAvailable=false when server unreachable", async () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");
			vi.mocked(isHttpModeAvailable).mockResolvedValue(false);

			const { result } = renderHook(() => useMode());

			await waitFor(() => {
				expect(result.current.serverAvailable).toBe(false);
			});
		});

		it("sets serverAvailable=true immediately in http mode", async () => {
			vi.mocked(queryService.getMode).mockReturnValue("http");

			const { result } = renderHook(() => useMode());

			await waitFor(() => {
				expect(result.current.serverAvailable).toBe(true);
			});

			// Should not call isHttpModeAvailable in http mode
			expect(isHttpModeAvailable).not.toHaveBeenCalled();
		});

		it("checkServerAvailability updates state", async () => {
			vi.mocked(queryService.getMode).mockReturnValue("wasm");
			vi.mocked(isHttpModeAvailable)
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);

			const { result } = renderHook(() => useMode());

			// Initial check returns false
			await waitFor(() => {
				expect(result.current.serverAvailable).toBe(false);
			});

			// Manual check returns true
			let available: boolean = false;
			await act(async () => {
				available = await result.current.checkServerAvailability();
			});

			expect(available).toBe(true);
			expect(result.current.serverAvailable).toBe(true);
		});
	});
});

describe("getModeTooltip", () => {
	it("returns server mode tooltip for http", () => {
		const tooltip = getModeTooltip("http");

		expect(tooltip).toContain("Server Mode");
		expect(tooltip).toContain("DuckDB server");
		expect(tooltip).toContain("All extensions available");
		expect(tooltip).toContain("Direct filesystem access");
	});

	it("returns wasm mode tooltip for wasm", () => {
		const tooltip = getModeTooltip("wasm");

		expect(tooltip).toContain("WASM Mode");
		expect(tooltip).toContain("WebAssembly");
		expect(tooltip).toContain("Zero-copy file handles");
		expect(tooltip).toContain("memory limit");
	});

	it("includes capabilities section for http mode", () => {
		const tooltip = getModeTooltip("http");

		expect(tooltip).toContain("Capabilities:");
		expect(tooltip).toContain("No memory limits");
	});

	it("includes limitations section for wasm mode", () => {
		const tooltip = getModeTooltip("wasm");

		expect(tooltip).toContain("Limitations:");
		expect(tooltip).toContain("Limited extensions");
	});
});

describe("getModeSwitchUrl", () => {
	const originalLocation = window.location;

	beforeEach(() => {
		// Mock window.location
		Object.defineProperty(window, "location", {
			value: {
				href: "http://localhost:5173/",
				origin: "http://localhost:5173",
				port: "5173",
			},
			writable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(window, "location", {
			value: originalLocation,
			writable: true,
		});
	});

	it("returns localhost:4213 for http mode switch", () => {
		const url = getModeSwitchUrl("http");

		expect(url).toBe("http://localhost:4213");
	});

	it("adds mode=wasm param for wasm mode switch", () => {
		const url = getModeSwitchUrl("wasm");

		expect(url).toContain("mode=wasm");
	});

	it("preserves existing URL structure for wasm switch", () => {
		Object.defineProperty(window, "location", {
			value: {
				href: "http://localhost:4213/?foo=bar",
				origin: "http://localhost:4213",
				port: "4213",
			},
			writable: true,
		});

		const url = getModeSwitchUrl("wasm");

		expect(url).toContain("foo=bar");
		expect(url).toContain("mode=wasm");
	});
});
