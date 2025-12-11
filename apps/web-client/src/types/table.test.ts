/**
 * Table Types Tests
 * Tests for type definitions and type guards
 */

import { describe, expect, it } from "vitest";
import type {
	CellValue,
	TableColumn,
	TableRow,
	TypedQueryResult,
} from "./table";

describe("Table Types", () => {
	describe("CellValue", () => {
		it("accepts primitive values", () => {
			const stringVal: CellValue = "test";
			const numberVal: CellValue = 42;
			const boolVal: CellValue = true;
			const nullVal: CellValue = null;
			const undefinedVal: CellValue = undefined;

			expect(stringVal).toBe("test");
			expect(numberVal).toBe(42);
			expect(boolVal).toBe(true);
			expect(nullVal).toBe(null);
			expect(undefinedVal).toBe(undefined);
		});

		it("accepts bigint values", () => {
			const bigIntVal: CellValue = BigInt(9007199254740991);
			expect(bigIntVal).toBe(BigInt(9007199254740991));
		});

		it("accepts Date values", () => {
			const dateVal: CellValue = new Date("2024-01-01");
			expect(dateVal).toBeInstanceOf(Date);
		});

		it("accepts array values", () => {
			const arrayVal: CellValue = [1, 2, 3];
			expect(Array.isArray(arrayVal)).toBe(true);
		});

		it("accepts nested object values", () => {
			const objVal: CellValue = { foo: "bar", nested: { count: 42 } };
			expect(objVal).toEqual({ foo: "bar", nested: { count: 42 } });
		});
	});

	describe("TableRow", () => {
		it("accepts record of cell values", () => {
			const row: TableRow = {
				id: 1,
				name: "test",
				active: true,
				created_at: new Date(),
				metadata: { key: "value" },
			};

			expect(row.id).toBe(1);
			expect(row.name).toBe("test");
			expect(row.active).toBe(true);
		});

		it("allows accessing by string key", () => {
			const row: TableRow = { col1: "a", col2: "b" };
			const key = "col1";
			expect(row[key]).toBe("a");
		});
	});

	describe("TableColumn", () => {
		it("requires name, allows optional fields", () => {
			const minimalCol: TableColumn = { name: "id" };
			const fullCol: TableColumn = {
				name: "id",
				type: "INTEGER",
				nullable: false,
				comment: "Primary key",
			};

			expect(minimalCol.name).toBe("id");
			expect(fullCol.type).toBe("INTEGER");
			expect(fullCol.nullable).toBe(false);
		});
	});

	describe("TypedQueryResult", () => {
		it("has correct structure", () => {
			const result: TypedQueryResult = {
				rows: [
					{ id: 1, name: "Alice" },
					{ id: 2, name: "Bob" },
				],
				columns: [
					{ name: "id", type: "INTEGER" },
					{ name: "name", type: "VARCHAR" },
				],
				totalRows: 2,
				executionTime: 150,
			};

			expect(result.rows).toHaveLength(2);
			expect(result.columns).toHaveLength(2);
			expect(result.totalRows).toBe(2);
			expect(result.executionTime).toBe(150);
		});

		it("allows omitting executionTime", () => {
			const result: TypedQueryResult = {
				rows: [],
				columns: [],
				totalRows: 0,
			};

			expect(result.executionTime).toBeUndefined();
		});
	});

	describe("Type narrowing", () => {
		it("can narrow CellValue to specific types", () => {
			function processValue(value: CellValue): string {
				if (value === null || value === undefined) return "NULL";
				if (typeof value === "string") return `String: ${value}`;
				if (typeof value === "number") return `Number: ${value}`;
				if (typeof value === "boolean") return `Boolean: ${value}`;
				if (typeof value === "bigint") return `BigInt: ${value.toString()}`;
				if (value instanceof Date) return `Date: ${value.toISOString()}`;
				if (Array.isArray(value)) return `Array: [${value.length} items]`;
				return `Object: ${JSON.stringify(value)}`;
			}

			expect(processValue(null)).toBe("NULL");
			expect(processValue("hello")).toBe("String: hello");
			expect(processValue(42)).toBe("Number: 42");
			expect(processValue(true)).toBe("Boolean: true");
			expect(processValue([1, 2, 3])).toBe("Array: [3 items]");
		});
	});
});
