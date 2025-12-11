import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { parseURLParams, clearURLParams } from '../utils/urlParams';
import { getExampleById } from '../examples/sampleQueries';
import { loadShared } from '../utils/sharingProviders';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useTabContext } from '../contexts';
import { queryService } from '../services/streaming-query-service';
import { createLogger } from '../utils/logger';
import { useSettingsStore } from '../stores/settingsStore';
import { getThemeById } from '../themes';

const logger = createLogger('URLExampleLoader');

/**
 * Auto-load SQL from URL parameters on mount
 * Supports: ?example=id, ?sql=..., ?share=provider:id
 * Optionally auto-executes queries with ?run=true
 *
 * @param initializing - App initialization flag from useAppInitialization
 * @param setShowExplorer - Function to control explorer visibility
 */
export function useURLExampleLoader(initializing: boolean, setShowExplorer?: (show: boolean) => void) {
  const { createTabsWithQueries, updateTab } = useTabContext();
  const { showToast } = useToast();
  const hasLoaded = useRef(false); // Prevent double-load in strict mode
  const markOnboardingComplete = useOnboardingStore(
    (s) => s.markOnboardingComplete,
  );
  const setEditorTheme = useSettingsStore((s) => s.setEditorTheme);

  // Helper to execute query after loading from URL (memoized to prevent effect re-runs)
  const executeLoadedQuery = useCallback(async (tabIds: string[], query: string) => {
    if (tabIds.length === 0) return;

    const tabId = tabIds[0];
    logger.info(`Auto-executing query from URL (tab: ${tabId})`);

    try {
      // Mark as loading
      updateTab(tabId, {
        loading: true,
        error: null,
        result: null,
        executedSql: query,
      });

      // Execute query
      const result = await queryService.executeQuery(query);

      // Update with results
      updateTab(tabId, {
        result,
        loading: false,
        error: null,
      });

      logger.info('Query executed successfully');
      showToast('Query executed successfully', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Query execution failed', err);

      updateTab(tabId, {
        error: errorMessage,
        loading: false,
        result: null,
      });

      showToast(`Query failed: ${errorMessage}`, 'error', 5000);
    }
  }, [updateTab, showToast]);

  // Store pending auto-run state for when connector becomes available
  const pendingAutoRunRef = useRef<{
    tabIds: string[];
    query: string;
  } | null>(null);

  useEffect(() => {
    if (hasLoaded.current) return;

    const params = parseURLParams();

    // Debug: log all URL parameters
    if (params.example || params.sql || params.share) {
      logger.info('URL params detected', { params });
    }

    // If URL parameters are present, skip welcome modal (user has explicit intent)
    const hasURLParams = params.example || params.sql || params.share;
    if (hasURLParams) {
      logger.info('URL parameters detected, skipping welcome modal');
      markOnboardingComplete(); // Skip welcome modal

      // Debug: log store state after marking complete
      const currentState = useOnboardingStore.getState();
      logger.info('Onboarding store after markComplete', {
        hasCompletedOnboarding: currentState.hasCompletedOnboarding,
        hasSeenWelcomeThisSession: currentState.hasSeenWelcomeThisSession,
      });

      // Apply theme if specified and valid
      if (params.theme) {
        if (getThemeById(params.theme)) {
          logger.info(`Applying theme from URL: ${params.theme}`);
          setEditorTheme(params.theme);
        } else {
          logger.warn(`Invalid theme from URL: ${params.theme}`);
        }
      }

      // Control explorer visibility (default: false, unless explorer=true specified)
      const showExplorer = params.explorer === 'true';
      if (setShowExplorer) {
        setShowExplorer(showExplorer);
        logger.info(`Explorer visibility: ${showExplorer}`);
      }
    }

    hasLoaded.current = true;
    const shouldAutoRun = params.run === 'true';

    // Priority 1: Shared query
    if (params.share) {
      logger.info(`Loading shared query: ${params.share}`);

      loadShared(params.share)
        .then((sql) => {
          logger.info('Shared query loaded successfully');

          const tabIds = createTabsWithQueries([
            {
              name: params.tab || 'Shared Query',
              query: sql,
            },
          ]);

          const provider = params.share.split(':')[0];
          showToast(`Loaded shared query from ${provider}`, 'success');
          clearURLParams();

          if (shouldAutoRun) {
            logger.info('Storing query for auto-execution');
            // Store for later execution if connector not ready yet
            pendingAutoRunRef.current = { tabIds, query: sql };
          }
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error('Failed to load shared query', err);
          showToast(
            `Failed to load shared query: ${errorMsg}`,
            'error',
          );
          clearURLParams();
        });
      return;
    }

    // Priority 2: Example ID
    if (params.example) {
      logger.info(`Loading example: ${params.example}`);

      const example = getExampleById(params.example);
      if (example) {
        logger.info(`Example found: ${example.label}`);

        const tabIds = createTabsWithQueries([
          {
            name: params.tab || example.label,
            query: example.sql,
          },
        ]);
        showToast(`Loaded example: ${example.label}`, 'success');

        if (shouldAutoRun) {
          logger.info('Storing example query for auto-execution');
          // Store for later execution if connector not ready yet
          pendingAutoRunRef.current = { tabIds, query: example.sql };
        }
      } else {
        logger.warn(`Example not found: ${params.example}`);
        showToast(`Example not found: ${params.example}`, 'error');
      }
      clearURLParams();
      return;
    }

    // Priority 3: Direct SQL
    if (params.sql) {
      const sql = decodeURIComponent(params.sql);
      logger.info('Loading custom SQL from URL');

      const tabIds = createTabsWithQueries([
        {
          name: params.tab || 'Custom Query',
          query: sql,
        },
      ]);
      showToast('Loaded custom SQL from URL', 'success');

      if (shouldAutoRun) {
        logger.info('Storing custom SQL for auto-execution');
        // Store for later execution if connector not ready yet
        pendingAutoRunRef.current = { tabIds, query: sql };
      }

      clearURLParams();
      return;
    }

    // No URL parameters to process
  }, [createTabsWithQueries, updateTab, showToast, markOnboardingComplete, setEditorTheme, setShowExplorer]);

  // Execute pending auto-run query once app initialization is complete
  useEffect(() => {
    if (!pendingAutoRunRef.current) {
      return;
    }

    if (initializing) {
      return;
    }

    const { tabIds, query } = pendingAutoRunRef.current;
    pendingAutoRunRef.current = null; // Clear to prevent re-execution

    logger.info('App initialization complete, triggering auto-run');

    // Execute with small delay to ensure UI is settled
    const timer = setTimeout(() => {
      executeLoadedQuery(tabIds, query);
    }, 100);

    return () => clearTimeout(timer);
  }, [initializing, executeLoadedQuery]);
}
