/**
 * Unified Tree Types
 *
 * Common data structure for representing hierarchical data from different sources
 * (BigQuery, local databases, files) in a consistent tree view.
 */

import type React from "react";

export type TreeNodeType =
	| "section" // Top-level section (Cloud, Databases, Files)
	| "connection" // BigQuery connection
	| "project" // BigQuery project
	| "dataset" // BigQuery dataset
	| "database" // DuckDB database/catalog
	| "schema" // Schema within database
	| "table" // Table or view
	| "file" // Local file (CSV, Parquet, JSON, DuckDB)
	| "column"; // Column within table/file

export interface TreeNodeMetadata {
	// File/database metadata
	size?: number;
	sizeFormatted?: string;
	rowCount?: number;
	columnCount?: number;
	sheetCount?: number; // For XLSX files with multiple sheets
	location?: string;
	created?: Date;
	modified?: Date;
	description?: string; // Optional description text

	// Type information
	dataType?: string;
	nullable?: boolean;
	isPrimaryKey?: boolean;

	// File-specific
	isRemote?: boolean;
	hasFileHandle?: boolean;

	// Database-specific
	isAttached?: boolean;
	attachedAs?: string;
	isReadOnly?: boolean;

	// Table-specific
	tableType?: "table" | "view" | "external";
	sheetIndex?: number;

	// Introspection state
	isIntrospecting?: boolean;
}

export interface TreeNodeAction {
	id: string;
	label: string;
	icon?: string | React.ReactElement;
	onClick: () => void;
	separator?: boolean;
	className?: string;
	style?: React.CSSProperties;
	tooltip?: string; // Optional tooltip text for the action
}

export interface BadgeSuffix {
	icon: string;
	label: string;
	tooltip: string;
	priority: number; // Higher = more important, collapses last (0=first, 1=middle, 2=last)
}

export interface UnifiedTreeNode {
	// Identity
	id: string;
	name: string;
	type: TreeNodeType;

	// Display
	icon: string | React.ReactElement;
	iconColor?: string;
	badge?: string;
	badgeColor?: string;
	badgeSuffixes?: BadgeSuffix[];

	// Hierarchy
	children?: UnifiedTreeNode[];
	isExpanded?: boolean;
	level?: number;

	// Metadata
	metadata?: TreeNodeMetadata;

	// Actions (context menu)
	actions?: TreeNodeAction[];

	// Source tracking
	source: "bigquery" | "duckdb" | "file";
	sourceData?: unknown; // Original data for reference
}

export interface TreeSection {
	id: string;
	title: string;
	icon: string | React.ReactElement;
	iconColor?: string; // Custom icon color
	isCollapsed: boolean;
	nodes: UnifiedTreeNode[];
	totalSize?: number; // Total size in bytes for all items in this section
	actions?: TreeNodeAction[]; // Section-level actions (e.g., Refresh for Local Database)
	badge?: string; // Badge text (e.g., "Session Only")
	badgeColor?: string; // Badge color
	hint?: string; // Subtle hint text shown after title
	className?: string; // Custom CSS class for styling (e.g., background tint)
}
