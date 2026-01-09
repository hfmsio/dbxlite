/**
 * useServerInfo Hook Tests
 *
 * Tests for fetching server information (extensions, secrets, settings, variables)
 * and performing extension actions (load, install).
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServerInfo } from "../useServerInfo";
import {
	mockExtensionsResponse,
	mockSecretsResponse,
	mockSettingsResponse,
	mockVariablesResponse,
	emptyExtensionsResponse,
	emptySecretsResponse,
	emptySettingsResponse,
	emptyVariablesResponse,
} from "../../test/fixtures/duckdb-system-functions";

// Mock streaming-query-service
vi.mock("../../services/streaming-query-service", () => ({
	queryService: {
		executeQuery: vi.fn(),
		isConnectorReady: vi.fn().mockReturnValue(true),
	},
}));

import { queryService, type QueryResult } from "../../services/streaming-query-service";

describe("useServerInfo", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("initialization", () => {
		it("should initialize with null data and not loading", () => {
			const { result } = renderHook(() => useServerInfo(true));

			expect(result.current.data).toBeNull();
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBeNull();
			expect(result.current.lastRefreshed).toBeNull();
		});

		it("should return fetchServerInfo and performExtensionAction functions", () => {
			const { result } = renderHook(() => useServerInfo(true));

			expect(typeof result.current.fetchServerInfo).toBe("function");
			expect(typeof result.current.performExtensionAction).toBe("function");
		});
	});

	describe("fetchServerInfo", () => {
		it("should not fetch when not in HTTP mode", async () => {
			const { result } = renderHook(() => useServerInfo(false));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
			expect(result.current.data).toBeNull();
		});

		it("should not fetch when connector is not ready", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(false);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			expect(queryService.executeQuery).not.toHaveBeenCalled();
		});

		it("should fetch all server info when in HTTP mode", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockResolvedValueOnce(mockSecretsResponse)
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockResolvedValueOnce(mockVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data).not.toBeNull();
			});

			// Verify 4 queries were made (extensions, secrets, settings, variables)
			expect(queryService.executeQuery).toHaveBeenCalledTimes(4);

			// Verify data structure
			expect(result.current.data?.extensions).toHaveLength(6);
			expect(result.current.data?.secrets).toHaveLength(2);
			expect(result.current.data?.settings).toHaveLength(9);
			expect(result.current.data?.variables).toHaveLength(3);
		});

		it("should set loading state during fetch", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);

			// Make query take some time
			vi.mocked(queryService.executeQuery).mockImplementation(
				() =>
					new Promise<QueryResult>((resolve) =>
						setTimeout(() => resolve(mockExtensionsResponse as QueryResult), 100),
					),
			);

			const { result } = renderHook(() => useServerInfo(true));

			// Start fetch
			act(() => {
				result.current.fetchServerInfo();
			});

			// Should be loading immediately
			expect(result.current.isLoading).toBe(true);
		});

		it("should handle partial failures gracefully (secrets query fails)", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockRejectedValueOnce(new Error("Permission denied"))
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockResolvedValueOnce(mockVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data).not.toBeNull();
			});

			// Should have data but empty secrets
			expect(result.current.data?.extensions).toHaveLength(6);
			expect(result.current.data?.secrets).toHaveLength(0); // Failed
			expect(result.current.data?.settings).toHaveLength(9);
		});

		it("should handle partial failures gracefully (variables query fails)", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockResolvedValueOnce(mockSecretsResponse)
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockRejectedValueOnce(new Error("No variables"));

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data).not.toBeNull();
			});

			expect(result.current.data?.variables).toHaveLength(0); // Failed
			expect(result.current.data?.settings).toHaveLength(9); // Succeeded
		});

		it("should set error state when extensions query fails", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery).mockRejectedValueOnce(
				new Error("Connection timeout"),
			);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.error).toBe("Connection timeout");
			});

			expect(result.current.isLoading).toBe(false);
			expect(result.current.data).toBeNull();
		});

		it("should update lastRefreshed on successful fetch", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockResolvedValueOnce(emptySecretsResponse)
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockResolvedValueOnce(emptyVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));
			const beforeFetch = new Date();

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.lastRefreshed).not.toBeNull();
			});

			expect(result.current.lastRefreshed!.getTime()).toBeGreaterThanOrEqual(
				beforeFetch.getTime(),
			);
		});
	});

	describe("performExtensionAction", () => {
		it("should return error when not in HTTP mode", async () => {
			const { result } = renderHook(() => useServerInfo(false));

			const response = await result.current.performExtensionAction(
				"httpfs",
				"load",
			);

			expect(response.success).toBe(false);
			expect(response.error).toBe("Only available in Server mode");
		});

		it("should execute LOAD extension command", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 5,
			});

			const { result } = renderHook(() => useServerInfo(true));

			let response: { success: boolean; error?: string } = { success: false };
			await act(async () => {
				response = await result.current.performExtensionAction("excel", "load");
			});

			expect(response.success).toBe(true);
			expect(queryService.executeQuery).toHaveBeenCalledWith("LOAD excel");
		});

		it("should execute INSTALL extension command", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 5,
			});

			const { result } = renderHook(() => useServerInfo(true));

			let response: { success: boolean; error?: string } = { success: false };
			await act(async () => {
				response = await result.current.performExtensionAction(
					"postgres_scanner",
					"install",
				);
			});

			expect(response.success).toBe(true);
			expect(queryService.executeQuery).toHaveBeenCalledWith(
				"INSTALL postgres_scanner",
			);
		});

		it("should handle action errors", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery).mockRejectedValue(
				new Error("Extension not found"),
			);

			const { result } = renderHook(() => useServerInfo(true));

			let response: { success: boolean; error?: string } = { success: false };
			await act(async () => {
				response = await result.current.performExtensionAction(
					"nonexistent",
					"load",
				);
			});

			expect(response.success).toBe(false);
			expect(response.error).toBe("Extension not found");
		});

		it("should set actionInProgress during action", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);

			// Make action take some time
			vi.mocked(queryService.executeQuery).mockImplementation(
				() =>
					new Promise<QueryResult>((resolve) =>
						setTimeout(
							() =>
								resolve({ rows: [], columns: [], totalRows: 0, executionTime: 5 }),
							100,
						),
					),
			);

			const { result } = renderHook(() => useServerInfo(true));

			// Start action
			act(() => {
				result.current.performExtensionAction("httpfs", "load");
			});

			// Should have action in progress
			expect(result.current.actionInProgress).toBe("load:httpfs");
		});

		it("should clear actionInProgress after action completes", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery).mockResolvedValue({
				rows: [],
				columns: [],
				totalRows: 0,
				executionTime: 5,
			});

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.performExtensionAction("httpfs", "load");
			});

			expect(result.current.actionInProgress).toBeNull();
		});

		it("should refresh data after successful action", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);

			// First call is for action, subsequent calls are for refresh
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce({ rows: [], columns: [], totalRows: 0, executionTime: 1 }) // LOAD command
				.mockResolvedValueOnce(mockExtensionsResponse) // refresh extensions
				.mockResolvedValueOnce(mockSecretsResponse)
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockResolvedValueOnce(mockVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.performExtensionAction("httpfs", "load");
			});

			await waitFor(() => {
				expect(result.current.data).not.toBeNull();
			});

			// Should have called refresh after action
			expect(queryService.executeQuery).toHaveBeenCalledTimes(5);
		});
	});

	describe("data transformation", () => {
		it("should correctly transform extension data", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockResolvedValueOnce(emptySecretsResponse)
				.mockResolvedValueOnce(emptySettingsResponse)
				.mockResolvedValueOnce(emptyVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data?.extensions).not.toBeUndefined();
			});

			const httpfs = result.current.data?.extensions.find(
				(e) => e.extension_name === "httpfs",
			);
			expect(httpfs).toBeDefined();
			expect(httpfs?.loaded).toBe(true);
			expect(httpfs?.installed).toBe(true);
			expect(httpfs?.description).toBe("HTTP and S3 file system support");
		});

		it("should correctly transform secrets data", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(emptyExtensionsResponse)
				.mockResolvedValueOnce(mockSecretsResponse)
				.mockResolvedValueOnce(emptySettingsResponse)
				.mockResolvedValueOnce(emptyVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data?.secrets).not.toBeUndefined();
			});

			expect(result.current.data?.secrets).toHaveLength(2);
			const s3Secret = result.current.data?.secrets.find(
				(s) => s.name === "s3_default",
			);
			expect(s3Secret?.type).toBe("s3");
			expect(s3Secret?.scope).toBe("s3://my-bucket");
		});

		it("should correctly transform settings data", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(emptyExtensionsResponse)
				.mockResolvedValueOnce(emptySecretsResponse)
				.mockResolvedValueOnce(mockSettingsResponse)
				.mockResolvedValueOnce(emptyVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data?.settings).not.toBeUndefined();
			});

			const threads = result.current.data?.settings.find(
				(s) => s.name === "threads",
			);
			expect(threads?.value).toBe("8");
		});

		it("should correctly transform variables data", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(emptyExtensionsResponse)
				.mockResolvedValueOnce(emptySecretsResponse)
				.mockResolvedValueOnce(emptySettingsResponse)
				.mockResolvedValueOnce(mockVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.data?.variables).not.toBeUndefined();
			});

			const batchSize = result.current.data?.variables.find(
				(v) => v.name === "batch_size",
			);
			expect(batchSize?.value).toBe(1000);
			expect(batchSize?.type).toBe("INTEGER");
		});
	});

	describe("hasContent", () => {
		it("should be false when data is null", () => {
			const { result } = renderHook(() => useServerInfo(true));

			expect(result.current.hasContent).toBe(false);
		});

		it("should be true when data is loaded", async () => {
			vi.mocked(queryService.isConnectorReady).mockReturnValue(true);
			vi.mocked(queryService.executeQuery)
				.mockResolvedValueOnce(mockExtensionsResponse)
				.mockResolvedValueOnce(emptySecretsResponse)
				.mockResolvedValueOnce(emptySettingsResponse)
				.mockResolvedValueOnce(emptyVariablesResponse);

			const { result } = renderHook(() => useServerInfo(true));

			await act(async () => {
				await result.current.fetchServerInfo();
			});

			await waitFor(() => {
				expect(result.current.hasContent).toBe(true);
			});
		});
	});
});
