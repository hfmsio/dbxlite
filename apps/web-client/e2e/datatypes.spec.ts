import { test, expect } from '@playwright/test';

/**
 * Data Type E2E Tests
 *
 * Tests for correct display of all DuckDB data types, focusing on:
 * - Large integer precision (BIGINT, HUGEINT)
 * - Aggregation functions (SUM, AVG) - critical NaN bug fix
 * - Interval formatting
 * - Array/List types
 * - Decimal precision
 * - Special values (infinity, NaN)
 */

// Mark onboarding as complete before each test
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dbxlite-onboarding-storage', JSON.stringify({
      state: { hasCompletedOnboarding: true, lastSeenVersion: 1 },
      version: 0
    }));
  });
});

// Helper: wait for app ready
async function waitForAppReady(page) {
  await page.waitForLoadState('networkidle');
  const skipButton = page.locator('button:has-text("Skip")');
  if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('button:has-text("Run")')).toBeEnabled({ timeout: 30000 });
}

// Helper: set editor content
async function setEditorContent(page, content: string) {
  await page.locator('.monaco-editor').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.type(content, { delay: 5 });
  await page.waitForTimeout(100);
}

// Helper: run query
async function runQuery(page) {
  const runButton = page.locator('button').filter({ hasText: /Run/ }).first();
  await runButton.click();
  await page.waitForTimeout(200);
}

// Helper: wait for results
async function waitForResults(page, timeout = 15000) {
  await expect(page.locator('text=/Time:.*ms/')).toBeVisible({ timeout });
}

// Helper: get cell text by column name
async function getCellValue(page, columnName: string): Promise<string> {
  // Find the column header to get the column index
  const headers = page.locator('[data-testid="column-header"]');
  const headerCount = await headers.count();
  let colIndex = -1;

  for (let i = 0; i < headerCount; i++) {
    const text = await headers.nth(i).getAttribute('data-column');
    if (text === columnName) {
      colIndex = i;
      break;
    }
  }

  if (colIndex === -1) {
    throw new Error(`Column "${columnName}" not found`);
  }

  // Get the first row's cell at that column index
  const cells = page.locator('[data-testid="table-cell"]');
  const cell = cells.nth(colIndex);
  return await cell.textContent() || '';
}

test.describe('Data Types: Large Integers', () => {
  test('should display BIGINT with full precision', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT 9223372036854775807::BIGINT AS bigint_max');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'bigint_max');
    // Should have commas and all digits preserved
    expect(value).toBe('9,223,372,036,854,775,807');
  });

  test('should display HUGEINT with full precision', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT 170141183460469231731687303715884105727::HUGEINT AS hugeint_val');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'hugeint_val');
    // Should have commas and all digits preserved (39 digits)
    expect(value).toBe('170,141,183,460,469,231,731,687,303,715,884,105,727');
  });

  test('should display negative BIGINT correctly', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT (-9223372036854775808)::BIGINT AS bigint_min');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'bigint_min');
    expect(value).toBe('-9,223,372,036,854,775,808');
  });

  test('should display small integers as numbers', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT 12345::INTEGER AS small_int');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'small_int');
    expect(value).toBe('12,345');
  });
});

test.describe('Data Types: Aggregation Functions (NaN Bug Fix)', () => {
  // CRITICAL: This tests the fix for SUM() returning NaN
  // Root cause: Arrow IPC returns HUGEINT as Uint32Array(4) which wasn't handled
  test('should return numeric value for SUM, not NaN', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT SUM(amount) AS total FROM (VALUES (100), (200), (55)) AS t(amount)');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'total');
    // MUST be 355, NOT NaN
    expect(value).toBe('355');
  });

  test('should return numeric value for AVG, not NaN', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT AVG(amount) AS average FROM (VALUES (100), (200), (55)) AS t(amount)');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'average');
    // Should be ~118.33, not NaN
    expect(value).toMatch(/118/);
  });

  test('should handle SUM with negative values', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT SUM(x) AS total FROM (VALUES (100), (-50), (25)) AS t(x)');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'total');
    expect(value).toBe('75');
  });

  test('should handle COUNT aggregation', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT COUNT(*) AS cnt FROM (VALUES (1), (2), (3), (4), (5)) AS t(x)');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'cnt');
    expect(value).toBe('5');
  });

  test('should handle multiple aggregations in one query', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, `SELECT
      SUM(x) AS sum_val,
      AVG(x) AS avg_val,
      MIN(x) AS min_val,
      MAX(x) AS max_val,
      COUNT(*) AS cnt
    FROM (VALUES (10), (20), (30), (40), (50)) AS t(x)`);
    await runQuery(page);
    await waitForResults(page);

    const sumVal = await getCellValue(page, 'sum_val');
    const minVal = await getCellValue(page, 'min_val');
    const maxVal = await getCellValue(page, 'max_val');
    const cntVal = await getCellValue(page, 'cnt');

    expect(sumVal).toBe('150');
    expect(minVal).toBe('10');
    expect(maxVal).toBe('50');
    expect(cntVal).toBe('5');
  });

  test('should handle SUM on decimal values', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT SUM(price) AS total FROM (VALUES (19.99), (29.99), (9.99)) AS t(price)');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'total');
    // Should be 59.97, not NaN
    expect(value).toMatch(/59\.97/);
  });
});

test.describe('Data Types: Intervals', () => {
  test('should display year-month interval', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT INTERVAL '1 year 2 months' AS interval_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'interval_val');
    expect(value).toMatch(/1y\s*2mo/);
  });

  test('should display day-time interval', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT INTERVAL '3 days 4 hours 30 minutes' AS interval_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'interval_val');
    expect(value).toMatch(/3d\s*4h\s*30m/);
  });

  test('should display complex interval', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT INTERVAL '2 years 3 months 10 days 5 hours' AS interval_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'interval_val');
    expect(value).toMatch(/2y\s*3mo\s*10d\s*5h/);
  });
});

test.describe('Data Types: Arrays', () => {
  test('should display integer array', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT [1, 2, 3, 4, 5] AS int_array');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'int_array');
    expect(value).toBe('[1, 2, 3, 4, 5]');
  });

  test('should display string array', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT ['apple', 'banana', 'cherry'] AS str_array");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'str_array');
    expect(value).toBe('[apple, banana, cherry]');
  });

  test('should display empty array', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT []::INTEGER[] AS empty_array');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'empty_array');
    expect(value).toBe('[]');
  });
});

test.describe('Data Types: Decimals', () => {
  test('should display decimal with precision', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT 123.456789::DECIMAL(10,6) AS decimal_val');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'decimal_val');
    // Formatter may round decimals based on settings
    expect(value).toMatch(/123\.4/);
  });
});

test.describe('Data Types: Special Values', () => {
  // Note: Infinity and NaN tests are skipped in DuckDB-WASM due to Arrow type conversion limitations
  // These values convert to NULL in DuckDB-WASM's Arrow implementation
  test.skip('should display infinity', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Cast string to float for infinity values
    await setEditorContent(page, "SELECT 'inf'::FLOAT AS pos_inf, '-inf'::FLOAT AS neg_inf");
    await runQuery(page);
    await waitForResults(page);

    const posInf = await getCellValue(page, 'pos_inf');
    const negInf = await getCellValue(page, 'neg_inf');
    expect(posInf).toBe('∞');
    expect(negInf).toBe('-∞');
  });

  test.skip('should display NaN', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Cast string to float for NaN
    await setEditorContent(page, "SELECT 'nan'::FLOAT AS nan_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'nan_val');
    expect(value).toBe('NaN');
  });

  test('should display NULL', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT NULL::INTEGER AS null_val');
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'null_val');
    expect(value.toLowerCase()).toContain('null');
  });
});

test.describe('Data Types: Dates and Times', () => {
  test('should display date', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT DATE '2024-06-15' AS date_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'date_val');
    // Use a mid-month date to avoid timezone edge cases
    expect(value).toMatch(/2024-06-1[45]/);
  });

  test('should display timestamp', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT TIMESTAMP '2024-06-15 14:30:00' AS ts_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'ts_val');
    // Check date and time parts exist (time may be adjusted for timezone)
    expect(value).toMatch(/2024-06-15/);
    expect(value).toMatch(/\d{2}:\d{2}/);
  });
});

test.describe('Data Types: Structs and Maps', () => {
  test('should display struct', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT {'name': 'Alice', 'age': 30} AS struct_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'struct_val');
    expect(value).toMatch(/name.*Alice/);
    expect(value).toMatch(/age.*30/);
  });

  test('should display map', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT MAP {'a': 1, 'b': 2} AS map_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'map_val');
    expect(value).toMatch(/a.*1/);
    expect(value).toMatch(/b.*2/);
  });
});

test.describe('Data Types: Boolean', () => {
  test('should display boolean values', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, 'SELECT TRUE AS bool_true, FALSE AS bool_false');
    await runQuery(page);
    await waitForResults(page);

    const trueVal = await getCellValue(page, 'bool_true');
    const falseVal = await getCellValue(page, 'bool_false');

    // Could be "true"/"false", "✓"/"✗", or "1"/"0" depending on settings
    expect(trueVal.toLowerCase()).toMatch(/true|1|✓/);
    expect(falseVal.toLowerCase()).toMatch(/false|0|✗/);
  });
});

test.describe('Data Types: TIME', () => {
  test('should display TIME values formatted as HH:MM:SS', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT TIME '14:30:00' AS time_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'time_val');
    expect(value).toBe('14:30:00');
  });

  test('should display TIME midnight correctly', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT TIME '00:00:00' AS time_midnight");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'time_midnight');
    expect(value).toBe('00:00:00');
  });

  test('should display TIME with microsecond precision', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await setEditorContent(page, "SELECT TIME '14:30:45.123456' AS time_precise");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'time_precise');
    // Should show microsecond precision with trailing zeros trimmed
    expect(value).toMatch(/14:30:45\.123456/);
  });
});

test.describe('Data Types: ENUM', () => {
  test('should display ENUM values as strings', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // First create the ENUM type
    await setEditorContent(page, "CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy')");
    await runQuery(page);
    await page.waitForTimeout(1000); // Wait for CREATE TYPE to complete

    // Then query the ENUM value
    await setEditorContent(page, "SELECT 'happy'::mood AS enum_val");
    await runQuery(page);
    await waitForResults(page);

    const value = await getCellValue(page, 'enum_val');
    expect(value).toBe('happy');
  });

  test('should display multiple ENUM values', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // First create the ENUM type
    await setEditorContent(page, "CREATE TYPE status AS ENUM ('pending', 'active', 'completed')");
    await runQuery(page);
    await page.waitForTimeout(1000); // Wait for CREATE TYPE to complete

    // Then query the ENUM values
    await setEditorContent(page, "SELECT 'pending'::status AS s1, 'active'::status AS s2, 'completed'::status AS s3");
    await runQuery(page);
    await waitForResults(page);

    const s1 = await getCellValue(page, 's1');
    const s2 = await getCellValue(page, 's2');
    const s3 = await getCellValue(page, 's3');

    expect(s1).toBe('pending');
    expect(s2).toBe('active');
    expect(s3).toBe('completed');
  });
});
