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

	// Normalize SQL for matching (but keep original for regex matching)
	const normalizedSql = sql.trim();

	// Score each registered engine
	const scores: Record<string, number> = {};
	const signalsByEngine: Record<string, string[]> = {};

	for (const detector of engineDetectors) {
		let engineScore = 0;
		const matchedSignals: string[] = [];

		for (const pattern of detector.patterns) {
			if (pattern.regex.test(normalizedSql)) {
				engineScore += pattern.weight;
				matchedSignals.push(pattern.signal);
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
