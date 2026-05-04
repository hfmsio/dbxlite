/**
 * Export strategy registry + dispatcher.
 *
 * The dispatcher picks the first strategy whose canHandle() returns true.
 * Order matters: most-specific / most-efficient strategies first; the
 * universal fallback last.
 */
import { cloudStreamingStrategy } from "./cloudStreaming";
import { duckdbCopyStrategy } from "./duckdbCopy";
import { preloadedStrategy } from "./preloaded";
import type { ExportContext, ExportStrategy } from "./types";

export type { ExportContext, ExportFormat, ExportResult, ExportStrategy } from "./types";

export const ALL_STRATEGIES: ExportStrategy[] = [
	duckdbCopyStrategy,
	cloudStreamingStrategy,
	preloadedStrategy,
];

export function pickStrategy(ctx: ExportContext): ExportStrategy {
	for (const s of ALL_STRATEGIES) {
		if (s.canHandle(ctx)) return s;
	}
	throw new Error(
		`No export strategy can handle format=${ctx.format} (no SQL, no result, or unsupported connector)`,
	);
}
