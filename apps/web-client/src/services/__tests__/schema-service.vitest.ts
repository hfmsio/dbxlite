import * as schemaCache from "@ide/schema-cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getSchemaStub } from "../schema-service";

// Mock the schema-cache module
vi.mock("@ide/schema-cache", () => ({
	getCachedSchema: vi.fn(),
	setCachedSchema: vi.fn(),
	makeCacheKey: vi.fn((connId: string, db?: string, schema?: string) => {
		return `${connId}:${db || ""}:${schema || ""}`;
	}),
}));

describe("SchemaService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("should return cached schema if available", async () => {
		const cachedSchema = {
			tables: [
				{ name: "cached_users", columns: ["id", "name"] },
				{ name: "cached_orders", columns: ["id", "total"] },
			],
		};

		vi.mocked(schemaCache.getCachedSchema).mockResolvedValue(cachedSchema);

		const result = await getSchemaStub("test-conn");

		expect(schemaCache.makeCacheKey).toHaveBeenCalledWith("test-conn");
		expect(schemaCache.getCachedSchema).toHaveBeenCalled();
		expect(result).toEqual(cachedSchema);
		expect(schemaCache.setCachedSchema).not.toHaveBeenCalled();
	});

	test("should fetch and cache schema if not cached", async () => {
		vi.mocked(schemaCache.getCachedSchema).mockResolvedValue(null);

		const result = await getSchemaStub("test-conn");

		expect(schemaCache.getCachedSchema).toHaveBeenCalled();
		expect(schemaCache.setCachedSchema).toHaveBeenCalledWith(
			"test-conn::",
			{
				tables: [
					{ name: "users", columns: ["id", "email", "created_at"] },
					{
						name: "orders",
						columns: ["id", "user_id", "amount", "created_at"],
					},
				],
				topLevelSources: [{ name: "local", sourceType: "duckdb" }],
			},
			1000 * 60 * 60,
		);
		expect(result.tables).toHaveLength(2);
		expect(result.tables[0].name).toBe("users");
		expect(result.tables[1].name).toBe("orders");
	});

	test("should use default connector id if not provided", async () => {
		vi.mocked(schemaCache.getCachedSchema).mockResolvedValue(null);

		await getSchemaStub();

		expect(schemaCache.makeCacheKey).toHaveBeenCalledWith("local");
	});

	test("should cache schema for 1 hour", async () => {
		vi.mocked(schemaCache.getCachedSchema).mockResolvedValue(null);

		await getSchemaStub("test-conn");

		expect(schemaCache.setCachedSchema).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			1000 * 60 * 60, // 1 hour in milliseconds
		);
	});

	test("should return schema with correct structure", async () => {
		vi.mocked(schemaCache.getCachedSchema).mockResolvedValue(null);

		const result = await getSchemaStub("test-conn");

		expect(result).toHaveProperty("tables");
		expect(Array.isArray(result.tables)).toBe(true);
		expect(result.tables[0]).toHaveProperty("name");
		expect(result.tables[0]).toHaveProperty("columns");
		expect(Array.isArray(result.tables[0].columns)).toBe(true);
	});
});
