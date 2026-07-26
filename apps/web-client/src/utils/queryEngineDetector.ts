/**
 * Query Engine Detection System
 *
 * A plugin-based architecture for detecting which SQL engine a query is intended for.
 * Engines register their detection patterns, and the system scores queries against
 * all registered patterns to determine the most likely target engine.
 */

/**
 * A single detection pattern with its scoring weight
 */
export interface DetectionPattern {
	regex: RegExp;
	signal: string; // Human-readable description of what was matched
	weight: number; // 1-10, higher = stronger signal
	/**
	 * A pattern only one engine could possibly use — the others can't even
	 * parse it (a backtick project.dataset.table for BigQuery, read_parquet()
	 * or a local file path for DuckDB). When one matches and its engine is the
	 * clear winner, confidence is forced to "high" regardless of raw score, so
	 * auto-switch fires. Weight still feeds scoring for the winner margin.
	 */
	definitive?: boolean;
}

/**
 * Plugin interface for engine detectors.
 * Each engine registers its distinctive SQL patterns.
 */
export interface EngineDetectorPlugin {
	engineId: string; // 'duckdb', 'bigquery', 'snowflake', etc.
	patterns: DetectionPattern[];
}

/**
 * Result of engine detection
 */
export interface EngineDetection {
	engine: string | "unknown"; // Detected engine ID or 'unknown'
	confidence: "high" | "medium" | "low";
	signals: string[]; // Human-readable list of matched signals
	scores: Record<string, number>; // All engine scores for debugging
}

// Registry of all engine detectors
const engineDetectors: EngineDetectorPlugin[] = [];

/**
 * Register an engine detector plugin.
 * Call this to add support for detecting a new engine type.
 */
export function registerEngineDetector(plugin: EngineDetectorPlugin): void {
	// Avoid duplicate registration
	const existing = engineDetectors.findIndex(
		(d) => d.engineId === plugin.engineId,
	);
	if (existing >= 0) {
		engineDetectors[existing] = plugin;
	} else {
		engineDetectors.push(plugin);
	}
}

/**
 * Get all registered engine IDs
 */
export function getRegisteredEngines(): string[] {
	return engineDetectors.map((d) => d.engineId);
}

/**
 * Remove SQL comments while preserving string/identifier literals.
 *
 * Detection matches on the result, so a token inside a comment
 * (`-- read_csv`, `/* @stage *​/`) can never trigger a false detection. Quoted
 * spans ('...', "...", `...`) are copied through untouched — a DuckDB file
 * path lives inside a single-quoted string and must survive, and a `--` or
 * `/*` inside a string is data, not a comment.
 */
export function stripSqlComments(sql: string): string {
	let out = "";
	let quote: string | null = null;
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		const next = sql[i + 1];
		if (quote) {
			out += c;
			if (c === quote) {
				// Doubled quote ('' / "") is an escaped quote, not a close.
				if (next === quote) {
					out += next;
					i++;
				} else {
					quote = null;
				}
			}
			continue;
		}
		if (c === "'" || c === '"' || c === "`") {
			quote = c;
			out += c;
			continue;
		}
		if (c === "-" && next === "-") {
			while (i < sql.length && sql[i] !== "\n") i++;
			out += "\n"; // keep the line break so \b boundaries still hold
			continue;
		}
		if (c === "/" && next === "*") {
			i += 2;
			while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
			i++; // land on the '/', loop's i++ steps past it
			out += " ";
			continue;
		}
		out += c;
	}
	return out;
}

/**
 * Confidence thresholds based on total score
 */
const CONFIDENCE_THRESHOLDS = {
	high: 15, // Multiple strong signals or one very strong + some weak
	medium: 8, // One strong signal or multiple weak signals
	// Below medium threshold = low confidence
};

/**
 * Minimum score difference to prefer one engine over another
 * Prevents ambiguous detection when scores are very close
 */
const MIN_SCORE_DIFFERENCE = 3;

/**
 * Detect which SQL engine a query is intended for.
 *
 * Iterates through all registered engine detectors, matching patterns
 * and accumulating scores. Returns the engine with the highest score
 * if it exceeds thresholds and has sufficient margin over alternatives.
 *
 * @param sql - The SQL query to analyze
 * @returns Detection result with engine, confidence, and matched signals
 */
export function detectQueryEngine(sql: string): EngineDetection {
	if (!sql || sql.trim().length === 0) {
		return {
			engine: "unknown",
			confidence: "low",
			signals: [],
			scores: {},
		};
	}

	// Match against SQL with comments removed. A commented-out token
	// (`-- uses read_csv`) or a `/* @stage */` note must not trigger a
	// detection, least of all a definitive one that auto-switches the engine.
	// String literals are preserved: a DuckDB file path (`FROM 'x.parquet'`)
	// deliberately lives inside a single-quoted string.
	const normalizedSql = stripSqlComments(sql.trim());

	// Score each registered engine
	const scores: Record<string, number> = {};
	const signalsByEngine: Record<string, string[]> = {};
	// Engines that matched at least one engine-exclusive pattern.
	const definitiveEngines = new Set<string>();

	for (const detector of engineDetectors) {
		let engineScore = 0;
		const matchedSignals: string[] = [];

		for (const pattern of detector.patterns) {
			if (pattern.regex.test(normalizedSql)) {
				engineScore += pattern.weight;
				matchedSignals.push(pattern.signal);
				if (pattern.definitive) definitiveEngines.add(detector.engineId);
			}
		}

		scores[detector.engineId] = engineScore;
		signalsByEngine[detector.engineId] = matchedSignals;
	}

	// Find the highest scoring engine
	let topEngine = "unknown";
	let topScore = 0;
	let secondScore = 0;

	for (const [engineId, score] of Object.entries(scores)) {
		if (score > topScore) {
			secondScore = topScore;
			topScore = score;
			topEngine = engineId;
		} else if (score > secondScore) {
			secondScore = score;
		}
	}

	// Determine if we have a clear winner
	const scoreDifference = topScore - secondScore;

	// If no engine scored, or the top score is too low, return unknown
	if (topScore === 0) {
		return {
			engine: "unknown",
			confidence: "low",
			signals: [],
			scores,
		};
	}

	// If scores are too close, we can't confidently pick one
	if (secondScore > 0 && scoreDifference < MIN_SCORE_DIFFERENCE) {
		return {
			engine: "unknown",
			confidence: "low",
			signals: [
				...signalsByEngine[topEngine],
				...(Object.entries(signalsByEngine).find(
					([id]) => id !== topEngine && scores[id] === secondScore,
				)?.[1] || []),
			],
			scores,
		};
	}

	// Determine confidence level based on top score
	let confidence: "high" | "medium" | "low";
	if (topScore >= CONFIDENCE_THRESHOLDS.high) {
		confidence = "high";
	} else if (topScore >= CONFIDENCE_THRESHOLDS.medium) {
		confidence = "medium";
	} else {
		confidence = "low";
	}

	// A definitive signal for the winning engine (one the others can't parse)
	// forces high confidence — a backtick project.dataset.table is unambiguous
	// even though it alone scores only "medium". We reach here only after the
	// clear-winner margin check, so this can't fire on an ambiguous tie.
	if (definitiveEngines.has(topEngine)) {
		confidence = "high";
	}

	return {
		engine: topEngine,
		confidence,
		signals: signalsByEngine[topEngine] || [],
		scores,
	};
}

/**
 * Check if a specific engine is detected in the query.
 * Useful for quick checks without full detection logic.
 */
export function hasEngineSignals(sql: string, engineId: string): boolean {
	const detector = engineDetectors.find((d) => d.engineId === engineId);
	if (!detector) return false;

	return detector.patterns.some((p) => p.regex.test(sql));
}
