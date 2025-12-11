/**
 * Minimal XLSX sheet extraction utilities
 * Uses fflate (2KB gzipped) for ZIP parsing
 *
 * XLSX files are ZIP archives containing XML files.
 * Sheet names are stored in xl/workbook.xml
 */
import { unzipSync } from "fflate";
import { createLogger } from "./logger";

const logger = createLogger("XlsxUtils");

export interface SheetInfo {
	name: string;
	index: number;
}

/**
 * Extract sheet names from XLSX file buffer
 *
 * Phase 1: Only extracts sheet names (no column introspection)
 * Phase 2: Can be extended to introspect columns per sheet lazily
 *
 * @param buffer - ArrayBuffer or Uint8Array of XLSX file
 * @returns Array of sheet info, or empty array on error
 */
export async function extractSheetNames(
	buffer: ArrayBuffer | Uint8Array,
): Promise<SheetInfo[]> {
	const uint8Array =
		buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

	try {
		// Unzip XLSX (which is a ZIP file)
		const unzipped = unzipSync(uint8Array);

		// Read xl/workbook.xml which contains sheet definitions
		const workbookXml = unzipped["xl/workbook.xml"];
		if (!workbookXml) {
			// Not a valid XLSX or corrupted - treat as single-sheet
			return [];
		}

		// Convert to string
		const xmlString = new TextDecoder().decode(workbookXml);

		// Parse sheet names using regex (faster than XML parser)
		// XML format: <sheet name="Sales" sheetId="1" r:id="rId1"/>
		const sheetRegex = /<sheet[^>]*name="([^"]+)"[^>]*sheetId="(\d+)"/g;
		const sheets: SheetInfo[] = [];
		let match;

		while ((match = sheetRegex.exec(xmlString)) !== null) {
			sheets.push({
				name: match[1],
				index: parseInt(match[2], 10) - 1, // sheetId is 1-indexed
			});
		}

		return sheets;
	} catch (err) {
		// Graceful degradation: treat as single-sheet file
		logger.warn("Failed to extract XLSX sheets", err);
		return [];
	}
}

/**
 * Extract sheet names from File object
 * Convenience wrapper for browser File API
 */
export async function extractSheetNamesFromFile(
	file: File,
): Promise<SheetInfo[]> {
	const buffer = await file.arrayBuffer();
	return extractSheetNames(buffer);
}
