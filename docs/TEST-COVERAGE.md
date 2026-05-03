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

**Total: 998 passing + 10 documented skips across 45 test files** (last verified 2026-05).

Highlight test suites:

| File | Tests | Notes |
|------|-------|-------|
| `chat-backend.contract.vitest.ts` | 81 | ChatBackend contract — parameterized over 4 BYO + 1 mocked Cortex backend. |
| `formatters.vitest.ts` | 63 | Cell rendering across all type variants. |
| `sortUtils.vitest.ts` | 42 | Column sort comparators. |
| `dataTypes.vitest.ts` | 52 | Vendor-neutral type normalization (DuckDB / BigQuery / Snowflake). |
| `useTabManager.vitest.ts` | 28 | Tab state, persistence, cross-window sync. |
| `urlParams.vitest.ts` | 27 | URL-shareable query parameters. |
| `queryExtractor.vitest.ts` | 27 | SQL extraction from AI chat responses. |
| `BaseConnector contract.test.ts` | 17 | Connector contract — parameterized over BigQuery + Snowflake (DuckDB skipped, jsdom limitation). |
| Others (~38 files) | ~660 | Hooks, components, utilities, state management. |

Documented skips (10 total): BigQuery OAuth event-loop tests that didn't translate cleanly from jest to vitest+jsdom — diagnostic-led un-skip pending.

Run `pnpm --filter @ide/web-client test` from the repo root to verify counts. Vitest 2.1 (since 2026-04-27) runs the full suite in ~6 seconds.

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
