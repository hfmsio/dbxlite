/**
 * Table Data Types
 * Strict type definitions for table/grid data handling
 */

/**
 * A single cell value in a table row
 * More specific than `any` but still flexible for database values
 */
export type CellValue =
	| string
	| number
	| bigint
	| boolean
	| null
	| undefined
	| Date
	| CellValue[]
	| { [key: string]: CellValue };

/**
 * A row of data from a query result
 * Keys are column names, values are cell values
 */
export type TableRow = Record<string, CellValue>;

/**
 * Column metadata with database type information
 */
export interface TableColumn {
	name: string;
	type?: string;
	nullable?: boolean;
	comment?: string;
}

/**
 * Query result with properly typed rows
 */
export interface TypedQueryResult {
	rows: TableRow[];
	columns: TableColumn[];
	totalRows: number;
	executionTime?: number;
}

/**
 * Data chunk for streaming queries
 */
export interface TypedDataChunk {
	rows: TableRow[];
	startIndex: number;
	endIndex: number;
	done: boolean;
	columns?: TableColumn[];
	totalRows?: number;
}

/**
 * Compare function type for sorting
 */
export type CompareFunction = (a: CellValue, b: CellValue) => number;

/**
 * Export options for table data
 */
export interface TableExportOptions {
	filename?: string;
	columns?: string[];
	includeHeaders?: boolean;
	delimiter?: string;
}

/**
 * Cell formatting options
 */
export interface CellFormatOptions {
	maxLength?: number;
	dateFormat?: string;
	numberFormat?: string;
	booleanFormat?: { true: string; false: string };
}

/**
 * File System Access API types (not in lib.dom.d.ts)
 * These are the actual types for the File System Access API
 */
export interface FileSystemFileHandle {
	kind: "file";
	name: string;
	getFile(): Promise<File>;
	createWritable(): Promise<FileSystemWritableFileStream>;
	isSameEntry(other: FileSystemFileHandle): Promise<boolean>;
}

export interface FileSystemDirectoryHandle {
	kind: "directory";
	name: string;
}

export interface FileSystemWritableFileStream extends WritableStream {
	write(data: BufferSource | Blob | string): Promise<void>;
	seek(position: number): Promise<void>;
	truncate(size: number): Promise<void>;
}

export interface FilePickerOptions {
	types?: Array<{
		description?: string;
		accept: Record<string, string[]>;
	}>;
	excludeAcceptAllOption?: boolean;
	multiple?: boolean;
	suggestedName?: string;
	startIn?:
		| "desktop"
		| "documents"
		| "downloads"
		| "music"
		| "pictures"
		| "videos";
}

/**
 * Augment the global Window interface with File System Access API
 */
declare global {
	interface Window {
		showOpenFilePicker?: (
			options?: FilePickerOptions,
		) => Promise<FileSystemFileHandle[]>;
		showSaveFilePicker?: (
			options?: FilePickerOptions,
		) => Promise<FileSystemFileHandle>;
		showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
	}
}
