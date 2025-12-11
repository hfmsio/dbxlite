# Test Coverage

## Overview

| Layer | Framework | Purpose |
|-------|-----------|---------|
| Unit Tests | Vitest | Individual functions and modules |
| E2E Tests | Playwright | Complete user flows in browser |

## Running Tests

```bash
pnpm test        # Unit tests
pnpm e2e         # E2E tests
pnpm e2e:ui      # E2E with interactive UI
```

## Test Locations

```
apps/web-client/
├── e2e/                    # Playwright E2E tests
├── src/
│   ├── hooks/__tests__/    # React hook tests
│   ├── utils/__tests__/    # Utility function tests
│   └── components/table/__tests__/
packages/
├── duckdb-wasm-adapter/src/*.test.ts
└── connectors/src/__tests__/
```

## Coverage Summary

**Total: 615 unit tests across 30 test files**

| File | Tests |
|------|-------|
| formatters.vitest.ts | 63 |
| sqlSanitizer.test.ts | 55 |
| dataTypes.vitest.ts | 52 |
| sortUtils.vitest.ts | 42 |
| useTabManager.vitest.ts | 28 |
| urlParams.vitest.ts | 27 |
| queryExtractor.vitest.ts | 27 |
| Others (20+ files) | 321 |

## Writing Tests

**Unit test:**
```typescript
import { describe, it, expect } from 'vitest';

describe('functionName', () => {
  it('should handle normal input', () => {
    expect(functionName('input')).toBe('expected');
  });
});
```

**E2E test:**
```typescript
import { test, expect } from '@playwright/test';

test('should execute query', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  // ... test actions
});
```

## Guidelines

- Add unit tests for new utilities and hooks
- Add E2E tests for user-visible features
- Include regression tests when fixing bugs
