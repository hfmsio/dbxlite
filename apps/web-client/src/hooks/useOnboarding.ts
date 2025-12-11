/**
 * useOnboarding - Coordinator hook for first-time user experience
 * Manages welcome modal state and sample query execution
 */

import { useCallback } from "react";
import { queryService } from "../services/streaming-query-service";
import { useOnboardingStore } from "../stores/onboardingStore";
import type { TabDefinition } from "./useTabManager";
import type { TabState } from "./useTabManager";

// Sample queries for the 3 welcome tabs
// Tab 1: Remote Data - Query remote CSV/Parquet files
const REMOTE_DATA_QUERY = `-- Query Remote Data: Diamonds Dataset (CSV from GitHub)
-- DuckDB can query files directly from URLs!

SELECT
  cut,
  color,
  COUNT(*) as count,
  ROUND(AVG(price), 2) as avg_price,
  ROUND(AVG(carat), 2) as avg_carat,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM 'https://raw.githubusercontent.com/tidyverse/ggplot2/main/data-raw/diamonds.csv'
GROUP BY cut, color
ORDER BY avg_price DESC
LIMIT 20;`;

// Tab 2: DuckDB Intro - Core features
const DUCKDB_INTRO_QUERY = `-- DuckDB Feature Showcase
-- CTEs, Window Functions, and Aggregations

WITH employee_data AS (
  SELECT
    row_number() OVER () as id,
    ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry'][1 + (random() * 7)::int] as name,
    ['Engineering', 'Design', 'Marketing', 'Sales', 'Analytics'][1 + (random() * 4)::int] as department,
    round(50000 + random() * 100000, 2) as salary
  FROM generate_series(1, 50)
)
SELECT
  department,
  COUNT(*) as headcount,
  ROUND(AVG(salary), 2) as avg_salary,
  ROUND(MIN(salary), 2) as min_salary,
  ROUND(MAX(salary), 2) as max_salary,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary), 2) as median_salary
FROM employee_data
GROUP BY department
ORDER BY avg_salary DESC;`;

// Tab 3: Advanced Analytics - Window functions, LAG, rankings
const ADVANCED_QUERY = `-- Advanced Analytics: Year-over-Year Analysis
-- Using Gapminder world development data

WITH country_stats AS (
  SELECT
    country,
    continent,
    year,
    lifeExp as life_expectancy,
    gdpPercap as gdp_per_capita,
    LAG(lifeExp) OVER (PARTITION BY country ORDER BY year) as prev_life_exp
  FROM 'https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv'
  WHERE year >= 1990
),
with_growth AS (
  SELECT
    *,
    ROUND(life_expectancy - COALESCE(prev_life_exp, life_expectancy), 2) as life_exp_change,
    RANK() OVER (PARTITION BY year ORDER BY gdp_per_capita DESC) as gdp_rank
  FROM country_stats
)
SELECT
  year,
  country,
  continent,
  ROUND(life_expectancy, 1) as life_exp,
  ROUND(gdp_per_capita, 0) as gdp_pc,
  life_exp_change as change,
  '#' || gdp_rank as rank
FROM with_growth
WHERE gdp_rank <= 10
ORDER BY year DESC, gdp_rank
LIMIT 30;`;

export const WELCOME_TAB_DEFINITIONS: TabDefinition[] = [
	{ name: "Remote Data", query: REMOTE_DATA_QUERY },
	{ name: "DuckDB Intro", query: DUCKDB_INTRO_QUERY },
	{ name: "Analytics", query: ADVANCED_QUERY },
];

interface UseOnboardingProps {
	hasDataSources: boolean;
	isBigQueryConnected: boolean;
	createTabsWithQueries: (definitions: TabDefinition[]) => string[];
	/** Update tab state - used for setting loading/results */
	updateTab: (tabId: string, updates: Partial<TabState>) => void;
	setActiveTabId: (tabId: string) => void;
}

interface UseOnboardingReturn {
	showWelcomeModal: boolean;
	isRunningQueries: boolean;
	handleGetStarted: () => Promise<void>;
	handleSkip: () => void;
}

export function useOnboarding({
	hasDataSources,
	isBigQueryConnected,
	createTabsWithQueries,
	updateTab,
	setActiveTabId,
}: UseOnboardingProps): UseOnboardingReturn {
	const hasSeenWelcomeThisSession = useOnboardingStore(
		(s) => s.hasSeenWelcomeThisSession,
	);
	const hasCompletedOnboarding = useOnboardingStore(
		(s) => s.hasCompletedOnboarding,
	);
	const isRunningQueries = useOnboardingStore((s) => s.isRunningWelcomeQueries);
	const markWelcomeSeenThisSession = useOnboardingStore(
		(s) => s.markWelcomeSeenThisSession,
	);
	const markOnboardingComplete = useOnboardingStore(
		(s) => s.markOnboardingComplete,
	);
	const markQueriesRun = useOnboardingStore((s) => s.markQueriesRun);
	const setIsRunningQueries = useOnboardingStore((s) => s.setIsRunningQueries);

	// Show welcome modal when:
	// - Explorer is empty (no data sources, no BigQuery)
	// - User hasn't seen it this session
	// - User hasn't completed onboarding before (persisted across windows/sessions)
	// - Not currently running queries
	const showWelcomeModal =
		!hasDataSources &&
		!isBigQueryConnected &&
		!hasSeenWelcomeThisSession &&
		!hasCompletedOnboarding &&
		!isRunningQueries;

	const handleGetStarted = useCallback(async () => {
		// Guard: prevent double execution
		if (isRunningQueries || hasSeenWelcomeThisSession) {
			return;
		}

		// Mark as seen IMMEDIATELY to prevent re-triggers during async execution
		markWelcomeSeenThisSession();
		setIsRunningQueries(true);

		try {
			// 1. Create the 3 tabs with sample queries
			const tabIds = createTabsWithQueries(WELCOME_TAB_DEFINITIONS);

			// 2. Run queries for each tab with small delays
			for (let i = 0; i < tabIds.length; i++) {
				const tabId = tabIds[i];
				const query = WELCOME_TAB_DEFINITIONS[i].query;

				// Switch to the tab before running (so user sees progress)
				setActiveTabId(tabId);

				// Small delay to let UI settle
				await new Promise((resolve) => setTimeout(resolve, 100));

				// Execute query directly - bypasses closure issues with handleRunQuery
				try {
					// Mark tab as loading
					updateTab(tabId, {
						loading: true,
						error: null,
						result: null,
						useVirtualTable: false,
						executedSql: query,
					});

					// Execute query via queryService
					const result = await queryService.executeQuery(query);

					// Update the correct tab with results
					updateTab(tabId, {
						result,
						loading: false,
						error: null,
					});
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : String(err);
					updateTab(tabId, {
						error: errorMessage,
						loading: false,
						result: null,
					});
					console.warn(`Onboarding query failed for tab ${tabId}:`, errorMessage);
				}

				// Small delay between queries
				if (i < tabIds.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			}

			// 3. Switch back to first tab to show the cheat sheet
			if (tabIds.length > 0) {
				setActiveTabId(tabIds[0]);
			}

			// 4. Mark as complete
			markQueriesRun();
			markOnboardingComplete();
		} finally {
			setIsRunningQueries(false);
		}
	}, [
		createTabsWithQueries,
		updateTab,
		setActiveTabId,
		markQueriesRun,
		markOnboardingComplete,
		markWelcomeSeenThisSession,
		setIsRunningQueries,
		isRunningQueries,
		hasSeenWelcomeThisSession,
	]);

	const handleSkip = useCallback(() => {
		markWelcomeSeenThisSession();
	}, [markWelcomeSeenThisSession]);

	return {
		showWelcomeModal,
		isRunningQueries,
		handleGetStarted,
		handleSkip,
	};
}
