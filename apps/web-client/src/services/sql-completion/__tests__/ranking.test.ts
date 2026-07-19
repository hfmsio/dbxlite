import { describe, expect, test } from "vitest";
import {
	MAX_SCORE,
	SCORE_BUDGET,
	applyRanking,
	encodeSortText,
	scoreItem,
	type Rankable,
} from "../ranking";

describe("ranking budget", () => {
	test("MAX_SCORE equals the sum of per-axis budgets", () => {
		const expected =
			SCORE_BUDGET.KIND +
			SCORE_BUDGET.CONTEXT +
			SCORE_BUDGET.DIALECT +
			SCORE_BUDGET.FREQUENCY +
			SCORE_BUDGET.TIEBREAK;
		expect(MAX_SCORE).toBe(expected);
		expect(MAX_SCORE).toBe(1810);
	});
});

describe("scoreItem", () => {
	const noDialect = new Set<string>();

	test("keyword in 'keyword' context outranks function in same context", () => {
		const kw = scoreItem(
			{ label: "SELECT", kind: 14 },
			{ sqlContext: "keyword", dialectOnlyLabels: noDialect },
		);
		const fn = scoreItem(
			{ label: "COUNT", kind: 1 },
			{ sqlContext: "keyword", dialectOnlyLabels: noDialect },
		);
		expect(kw).toBeGreaterThan(fn);
	});

	test("column in 'column' context outranks keyword in same context", () => {
		const col = scoreItem(
			{ label: "user_id", kind: 4 },
			{ sqlContext: "column", dialectOnlyLabels: noDialect },
		);
		const kw = scoreItem(
			{ label: "SELECT", kind: 14 },
			{ sqlContext: "column", dialectOnlyLabels: noDialect },
		);
		expect(col).toBeGreaterThan(kw);
	});

	test("dialect-only label gets +200 bonus (DIALECT budget)", () => {
		const ansi = scoreItem(
			{ label: "FOO", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: new Set() },
		);
		const dialectOnly = scoreItem(
			{ label: "FOO", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: new Set(["FOO"]) },
		);
		expect(dialectOnly - ansi).toBe(SCORE_BUDGET.DIALECT);
	});

	test("common keywords (SELECT, FROM) outrank rare ones at same kind/context", () => {
		const select = scoreItem(
			{ label: "SELECT", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: noDialect },
		);
		const matchRecognize = scoreItem(
			{ label: "MATCH_RECOGNIZE", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: noDialect },
		);
		expect(select).toBeGreaterThan(matchRecognize);
	});

	test("score is bounded by MAX_SCORE", () => {
		// Synthetic best-case: dialect-only common keyword in matching context.
		const top = scoreItem(
			{ label: "SELECT", kind: 14 },
			{ sqlContext: "keyword", dialectOnlyLabels: new Set(["SELECT"]) },
		);
		expect(top).toBeLessThanOrEqual(MAX_SCORE);
	});
});

describe("encodeSortText", () => {
	test("higher score produces lexicographically smaller sortText", () => {
		const high = encodeSortText(1500, "A");
		const low = encodeSortText(500, "A");
		expect(high.localeCompare(low)).toBeLessThan(0);
	});

	test("equal scores tiebreak alphabetically by label", () => {
		const a = encodeSortText(1000, "AAA");
		const b = encodeSortText(1000, "ZZZ");
		expect(a.localeCompare(b)).toBeLessThan(0);
	});

	test("sortText is fixed-width zero-padded", () => {
		const s = encodeSortText(0, "X");
		expect(s.startsWith("1810_")).toBe(true);
		expect(s.length).toBe("1810".length + 1 + "X".length);
	});
});

describe("applyRanking", () => {
	test("returns items with score and sortText fields, original fields preserved", () => {
		const items: Rankable[] = [
			{ label: "SELECT", kind: 14 },
			{ label: "COUNT", kind: 1 },
		];
		const ranked = applyRanking(items, {
			sqlContext: "all",
			dialectOnlyLabels: new Set(),
		});
		expect(ranked.length).toBe(2);
		expect(ranked[0].label).toBe("SELECT");
		expect(typeof ranked[0].score).toBe("number");
		expect(typeof ranked[0].sortText).toBe("string");
	});

	test("Snowflake user typing 'S' ranks SELECT above SAFE_CAST (which is BigQuery-only)", () => {
		// Snowflake's dialect-only set does NOT include SAFE_CAST (that's BQ).
		// SELECT is ANSI and gets the frequency bonus; SAFE_CAST is a function
		// without a Snowflake dialect bonus from Snowflake's set.
		const sfDialectLabels = new Set(["QUALIFY", "IFF", "LATERAL FLATTEN"]);
		const select = scoreItem(
			{ label: "SELECT", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: sfDialectLabels },
		);
		const safeCast = scoreItem(
			{ label: "SAFE_CAST", kind: 1 },
			{ sqlContext: "all", dialectOnlyLabels: sfDialectLabels },
		);
		expect(select).toBeGreaterThan(safeCast);
	});

	test("dialect-only label outranks an equally-shaped non-dialect label", () => {
		// QUALIFY (dialect-only on Snowflake) should outrank a generic keyword
		// of the same kind that isn't in the dialect set.
		const sfDialectLabels = new Set(["QUALIFY"]);
		const qualify = scoreItem(
			{ label: "QUALIFY", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: sfDialectLabels },
		);
		const ansiOnly = scoreItem(
			{ label: "QUALIFY", kind: 14 },
			{ sqlContext: "all", dialectOnlyLabels: new Set() },
		);
		expect(qualify).toBeGreaterThan(ansiOnly);
	});
});
