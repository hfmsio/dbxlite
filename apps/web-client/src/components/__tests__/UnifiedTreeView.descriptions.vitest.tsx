import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UnifiedTreeView from "../UnifiedTreeView";
import type { TreeSection } from "../../types/tree";

describe("explorer descriptions", () => {
	it("shows table and column descriptions and keeps the full text available", () => {
		const sections: TreeSection[] = [{
			id: "db", title: "Database", icon: "", isCollapsed: false,
			nodes: [{
				id: "table", name: "sample", type: "table", icon: "", source: "duckdb",
				isExpanded: true, metadata: { description: "Table description" },
				children: [{
					id: "col", name: "value", type: "column", icon: "", source: "duckdb",
					metadata: { dataType: "VARCHAR", description: "Column description" },
				}],
			}],
		}];
		render(<UnifiedTreeView sections={sections} onSectionToggle={vi.fn()} />);
		expect(screen.getByText("Table description").getAttribute("title")).toBe("Table description");
		expect(screen.getByText("Column description").getAttribute("title")).toBe("Column description");
	});
});
