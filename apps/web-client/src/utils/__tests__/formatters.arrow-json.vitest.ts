import { describe, it, expect } from "vitest";
import { formatValue } from "../formatters";
import { DataType } from "../dataTypes";

// Minimal Arrow JSON-like blob for LIST<STRUCT<key:VARCHAR, value:VARCHAR>>
const arrowListStructBlob = {
	_offsets: [0, 2],
	data: [
		{
			type: {
				children: [
					{ name: "key" },
					{ name: "value" },
				],
			},
			children: [
				{
					// "action" (6), "click" (5)
					valueOffsets: { 0: 0, 1: 6, 2: 11 },
					values: Array.from(new TextEncoder().encode("actionclick")),
				},
				{
					// "page" (4), "button" (6)
					valueOffsets: { 0: 0, 1: 4, 2: 10 },
					values: Array.from(new TextEncoder().encode("pagebutton")),
				},
			],
		},
	],
};

describe("formatValue - Arrow JSON LIST<STRUCT> fallback", () => {
	it("decodes Arrow JSON blobs into readable objects", () => {
		const result = formatValue(arrowListStructBlob as unknown, DataType.LIST);
		expect(result).not.toContain("_offsets");
		expect(result).toContain("action");
		expect(result).toContain("click");
		expect(result).toContain("page");
		expect(result).toContain("button");
	});
});
