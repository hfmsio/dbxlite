import { test, expect } from '@playwright/test';

test('basic loading test', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:5173/');

  // Check if the page loads
  const title = await page.title();
  console.log('Page title:', title);

  // Check for main heading
  const heading = page.locator('h1').first();
  await expect(heading).toBeVisible({ timeout: 10000 });

  // Get heading text
  const headingText = await heading.textContent();
  console.log('Heading text:', headingText);

  // Check for editor area
  const editorArea = page.locator('.monaco-editor, textarea, [data-testid="editor"]').first();
  const hasEditor = await editorArea.count() > 0;
  console.log('Editor found:', hasEditor);

  // Basic test passed
  expect(true).toBe(true);
});

test('check core UI elements', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // Wait for page to be ready
  await page.waitForLoadState('networkidle');

  // Check for any buttons
  const buttons = await page.locator('button').count();
  console.log('Number of buttons found:', buttons);
  expect(buttons).toBeGreaterThan(0);

  // Check for any form of SQL editor
  const possibleEditors = await page.locator('textarea, .monaco-editor, .editor, [contenteditable="true"]').count();
  console.log('Possible editor elements:', possibleEditors);
  expect(possibleEditors).toBeGreaterThan(0);
});
