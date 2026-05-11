/**
 * Suggestion ranking pipeline (Phase 2, Axis 6).
 *
 * Scores each completion item across five axes (kind, context relevance,
 * dialect relevance, frequency, alphabetical tiebreak) and produces a
 * `sortText` Monaco can use to order the dropdown. Tests assert score
 * values directly so they survive Monaco-version sort-direction changes.
 *
 * Budget per axis is bounded; the MAX_SCORE constant guards against
 * accidental overflow when new axes or items are added.
 */

import type { SQLContext } from "./context-detector";

/**
 * Per-axis point budget.
 *   - Kind weight: 0-1000 (highest signal: within a context, kind ordering matters most)
 *   - Context relevance: 0-500 (items registered for the active context get a bonus)
 *   - Dialect relevance: 0-200 (active-dialect items rank above ANSI-only)
 *   - Frequency: 0-100 (common keywords rank above rare ones)
 *   - Tiebreak: 0-10 (deterministic alphabetical fallback)
 */
export const SCORE_BUDGET = {
	KIND: 1000,
	CONTEXT: 500,
	DIALECT: 200,
	FREQUENCY: 100,
	TIEBREAK: 10,
} as const;

export const MAX_SCORE =
	SCORE_BUDGET.KIND +
	SCORE_BUDGET.CONTEXT +
	SCORE_BUDGET.DIALECT +
	SCORE_BUDGET.FREQUENCY +
	SCORE_BUDGET.TIEBREAK; // 1810

/**
 * Monaco's CompletionItemKind values that we care about. These are
 * Monaco enum values, not our own kind taxonomy. We map them to
 * abstract kinds for ranking.
 *
 * Reference (Monaco's enum):
 *   1  = Function (our: "function")
 *   4  = Field    (our: "column")
 *   5  = Class    (our: "table")
 *   14 = Keyword  (our: "keyword")
 *   18 = Module   (our: "schema" / "database")
 *   27 = Snippet  (our: "snippet")
 */
type AbstractKind =
	| "keyword"
	| "function"
	| "table"
	| "column"
	| "schema"
	| "snippet"
	| "other";

function abstractKind(monacoKind: number): AbstractKind {
	switch (monacoKind) {
		case 1:
			return "function";
		case 4:
			return "column";
		case 5:
			return "table";
		case 14:
			return "keyword";
		case 18:
			return "schema";
		case 27:
			return "snippet";
		default:
			return "other";
	}
}

/**
 * Kind weights per SQL context. Within a given context, the kind
 * ordering is fixed; the absolute values matter less than their order.
 */
const KIND_WEIGHTS: Record<SQLContext, Record<AbstractKind, number>> = {
	keyword: {
		keyword: 1000,
		function: 700,
		snippet: 400,
		schema: 200,
		table: 100,
		column: 50,
		other: 0,
	},
	column: {
		column: 1000,
		function: 700,
		schema: 300,
		table: 200,
		keyword: 100,
		snippet: 50,
		other: 0,
	},
	table: {
		table: 1000,
		schema: 700,
		// In table context, suggest tables / schemas heavily; keywords
		// and functions don't help here (FROM expects a table name).
		column: 0,
		function: 0,
		keyword: 0,
		snippet: 0,
		other: 0,
	},
	all: {
		keyword: 700,
		function: 600,
		table: 500,
		schema: 400,
		column: 300,
		snippet: 200,
		other: 0,
	},
};

/**
 * A small hand-curated frequency table for the most common SQL tokens.
 * Items not in the table get a frequency score of 0 (treated as "rare").
 * The table is dialect-agnostic for now; per-dialect frequency tables
 * are a future refinement.
 */
const FREQUENCY_TABLE: Record<string, number> = {
	SELECT: 100,
	FROM: 100,
	WHERE: 95,
	JOIN: 90,
	GROUP: 85, // "GROUP BY" labelled as "GROUP BY" so this won't always hit; ok
	ORDER: 85,
	AS: 80,
	AND: 80,
	OR: 75,
	WITH: 70,
	"INNER JOIN": 70,
	"LEFT JOIN": 70,
	"GROUP BY": 90,
	"ORDER BY": 90,
	LIMIT: 75,
	DISTINCT: 60,
	HAVING: 55,
	COUNT: 90,
	SUM: 85,
	AVG: 80,
	MIN: 75,
	MAX: 75,
	COALESCE: 65,
	CAST: 60,
	CASE: 60,
	WHEN: 55,
	THEN: 55,
	ELSE: 50,
	END: 50,
};

function frequencyScore(label: string): number {
	const upper = label.toUpperCase();
	return FREQUENCY_TABLE[upper] ?? 0;
}

/**
 * Alphabetical tiebreak: invert the first character so 'A' ranks
 * highest and 'Z' ranks lowest within the same score bucket. Compress
 * into the 0..TIEBREAK range.
 */
function alphabeticalTiebreak(label: string): number {
	if (!label) return 0;
	const first = label.toUpperCase().charCodeAt(0);
	// Inverse: 'A' (65) -> 9, 'Z' (90) -> 0; cap at 10.
	const inv = Math.max(0, Math.min(9, 9 - (first - 65)));
	return inv;
}

export interface Rankable {
	label: string;
	kind: number; // Monaco CompletionItemKind value
}

export interface RankingContext {
	sqlContext: SQLContext;
	dialectOnlyLabels: Set<string>;
}

/**
 * Score a single item across all axes. Returns a number in [0, MAX_SCORE].
 */
export function scoreItem(item: Rankable, ctx: RankingContext): number {
	const kindWeight =
		KIND_WEIGHTS[ctx.sqlContext][abstractKind(item.kind)] ?? 0;
	// Context relevance currently == kind weight for the active context.
	// A future refinement: per-label context tags. For now, share signal.
	const contextRelevance = 0; // reserved budget; not used in v1
	const dialectRelevance = ctx.dialectOnlyLabels.has(item.label.toUpperCase())
		? SCORE_BUDGET.DIALECT
		: 0;
	const freq = Math.min(SCORE_BUDGET.FREQUENCY, frequencyScore(item.label));
	const tie = Math.min(SCORE_BUDGET.TIEBREAK, alphabeticalTiebreak(item.label));

	const total = kindWeight + contextRelevance + dialectRelevance + freq + tie;
	// Sanity guard: scores must stay within the documented budget.
	if (total > MAX_SCORE) {
		throw new Error(
			`Ranking score ${total} exceeds MAX_SCORE ${MAX_SCORE} for item "${item.label}". A per-axis budget is being violated.`,
		);
	}
	return total;
}

/**
 * Encode a score as a Monaco `sortText`. Monaco sorts sortText
 * lexicographically ascending, so we emit `(MAX_SCORE - score)` zero-
 * padded to 4 digits — the highest-scoring item produces the
 * lowest sortText string. Append the uppercased label for stable
 * within-bucket alphabetical ordering.
 */
export function encodeSortText(score: number, label: string): string {
	const inv = String(MAX_SCORE - score).padStart(4, "0");
	return `${inv}_${label.toUpperCase()}`;
}

/**
 * Apply ranking to a list of items, returning each with a `sortText`
 * field Monaco will use to order the dropdown.
 */
export function applyRanking<T extends Rankable>(
	items: T[],
	ctx: RankingContext,
): (T & { sortText: string; score: number })[] {
	return items.map((item) => {
		const score = scoreItem(item, ctx);
		return { ...item, score, sortText: encodeSortText(score, item.label) };
	});
}
