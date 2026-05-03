import { describe, expect, it } from "vitest"
import {
	highlightSpans,
	matchSpan,
	searchTree,
	type CatalogTreeNode,
} from "./searchTree"

const makeTree = (): CatalogTreeNode[] => [
	{
		info: { id: "DB1", name: "DB1", type: "database" },
		expanded: false,
		schemas: {
			status: "loaded",
			data: [
				{
					info: { id: "PUBLIC", name: "PUBLIC", catalog: "DB1" },
					expanded: false,
					tables: {
						status: "loaded",
						data: [
							{
								id: "ORDERS",
								name: "ORDERS",
								catalog: "DB1",
								schema: "PUBLIC",
								type: "table",
							},
							{
								id: "USERS",
								name: "USERS",
								catalog: "DB1",
								schema: "PUBLIC",
								type: "table",
							},
						],
					},
				},
				{
					info: { id: "ANALYTICS", name: "ANALYTICS", catalog: "DB1" },
					expanded: false,
					tables: { status: "idle" },
				},
			],
		},
	},
	{
		info: { id: "DB2", name: "OTHER_DB", type: "database" },
		expanded: false,
		schemas: { status: "idle" },
	},
]

describe("matchSpan", () => {
	it("finds case-insensitive substring", () => {
		expect(matchSpan("Hello World", "world")).toEqual({ start: 6, end: 11 })
	})
	it("returns null when no match", () => {
		expect(matchSpan("Hello", "xyz")).toBeNull()
	})
	it("matches at start of string", () => {
		expect(matchSpan("USERS", "use")).toEqual({ start: 0, end: 3 })
	})
})

describe("highlightSpans", () => {
	it("returns single segment when no span", () => {
		expect(highlightSpans("Hello", undefined)).toEqual([
			{ text: "Hello", highlight: false },
		])
	})
	it("splits into 3 segments around the match", () => {
		expect(highlightSpans("Hello World", { start: 6, end: 11 })).toEqual([
			{ text: "Hello ", highlight: false },
			{ text: "World", highlight: true },
			{ text: "", highlight: false },
		])
	})
})

describe("searchTree", () => {
	it("returns full tree on empty query", () => {
		const tree = makeTree()
		expect(searchTree(tree, "")).toBe(tree)
		expect(searchTree(tree, "   ")).toBe(tree)
	})

	it("filters to a single matching catalog when query matches catalog name", () => {
		const result = searchTree(makeTree(), "OTHER")
		expect(result).toHaveLength(1)
		expect(result[0].info.name).toBe("OTHER_DB")
	})

	it("filters to schema match within a catalog", () => {
		const result = searchTree(makeTree(), "ANALYTICS")
		expect(result).toHaveLength(1)
		const schemas = result[0].schemas
		expect(schemas.status).toBe("loaded")
		if (schemas.status === "loaded") {
			expect(schemas.data).toHaveLength(1)
			expect(schemas.data[0].info.name).toBe("ANALYTICS")
		}
	})

	it("filters to table match deep in tree, preserving ancestors", () => {
		const result = searchTree(makeTree(), "ORDERS")
		expect(result).toHaveLength(1)
		expect(result[0].info.name).toBe("DB1")
		expect(result[0].expanded).toBe(true)
		const schemas = result[0].schemas
		if (schemas.status === "loaded") {
			expect(schemas.data).toHaveLength(1)
			expect(schemas.data[0].info.name).toBe("PUBLIC")
			expect(schemas.data[0].expanded).toBe(true)
			const tables = schemas.data[0].tables
			if (tables.status === "loaded") {
				expect(tables.data).toHaveLength(1)
				expect(tables.data[0].name).toBe("ORDERS")
			}
		}
	})

	it("matches case-insensitively", () => {
		const result = searchTree(makeTree(), "users")
		expect(result).toHaveLength(1)
	})

	it("returns empty array when no matches", () => {
		const result = searchTree(makeTree(), "nonexistent_xyz")
		expect(result).toHaveLength(0)
	})

	it("attaches match span to matched nodes for highlighting", () => {
		const result = searchTree(makeTree(), "OR")
		const cat = result[0]
		// Catalog DB1 has table ORDERS matching "OR"
		const schemas = cat.schemas
		if (schemas.status === "loaded") {
			const tables = schemas.data[0].tables
			if (tables.status === "loaded") {
				const orders = tables.data.find((t) => t.name === "ORDERS") as
					| (typeof tables.data)[number]
					| undefined
				expect(orders).toBeDefined()
				expect(
					(orders as { _matchSpan?: { start: number; end: number } })
						._matchSpan,
				).toEqual({
					start: 0,
					end: 2,
				})
			}
		}
	})

	it("when catalog name matches, includes all its loaded schemas", () => {
		const result = searchTree(makeTree(), "DB1")
		expect(result).toHaveLength(1)
		const schemas = result[0].schemas
		if (schemas.status === "loaded") {
			// Both PUBLIC and ANALYTICS preserved when catalog itself matches
			expect(schemas.data).toHaveLength(2)
		}
	})
})
