import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/node_modules/**', '**/__tests__/**', '**/dist/**'],

  // Test timeout
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for expect assertions
  },

  // Run tests in parallel
  fullyParallel: true,
  workers: process.env.CI ? 1 : 4,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],

  // Global setup and teardown
  globalSetup: undefined,
  globalTeardown: undefined,

  // Output folder for test artifacts
  outputDir: 'test-results/artifacts',

  // Shared settings for all projects
  use: {
    // Base URL for the application
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Headless mode
    headless: process.env.HEADLESS !== 'false',

    // Capture screenshots on failure
    screenshot: 'only-on-failure',

    // Capture video on failure
    video: process.env.CI ? 'retain-on-failure' : 'off',

    // Capture trace on failure
    trace: 'on-first-retry',

    // Accept downloads
    acceptDownloads: true,

    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,

    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Permissions
    permissions: ['clipboard-read', 'clipboard-write'],

    // Storage state
    storageState: undefined,

    // Action timeout
    actionTimeout: 15000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Configure projects for different browsers
  /* Temporarily simplified to single browser for debugging */

  // Run local dev server before starting tests
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120000,
  },

  // Folder for test results
  preserveOutput: 'always',

  // Quiet mode
  quiet: false,

  // Global test annotations
  metadata: {
    app: 'dbxlite',
    environment: process.env.TEST_ENV || 'local',
  },
});
